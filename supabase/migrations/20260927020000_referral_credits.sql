-- Referral credits: invite a friend, both get a free redesign.
--
-- Each profile gets a short referral_code, shareable as
-- thinkdecor.app/signup?ref=<code>. Signup.tsx reads ?ref from the URL and
-- passes it through as auth signup metadata; handle_new_user (below) reads
-- that metadata, resolves it to the referring user, and grants both sides a
-- credit_ledger bonus. Recorded in a `referrals` table (unique on referee)
-- so a person can only ever be referred once, and so referrers can see who
-- they've brought in.

alter table public.profiles
  add column if not exists referral_code text;

create unique index if not exists profiles_referral_code_uniq
  on public.profiles (referral_code) where referral_code is not null;

-- Backfill existing profiles with a code (new ones get one from the trigger below).
update public.profiles
   set referral_code = substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)
 where referral_code is null;

create table if not exists public.referrals (
  referee_id  uuid primary key references auth.users(id) on delete cascade,
  referrer_id uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  check (referee_id <> referrer_id)
);

create index if not exists referrals_referrer_idx on public.referrals (referrer_id, created_at desc);

alter table public.referrals enable row level security;

drop policy if exists "read own referrals" on public.referrals;
create policy "read own referrals"
  on public.referrals for select to authenticated
  using (auth.uid() = referrer_id or auth.uid() = referee_id);

-- Same 'ai' settings row used for free_credits — one place to tune both.
update public.app_settings
   set value = value || '{"referral_bonus":1}'::jsonb
 where key = 'ai' and not (value ? 'referral_bonus');

create or replace function public.handle_new_user()
returns trigger as $$
declare
  free_n     integer := coalesce((select (value->>'free_credits')::integer from public.app_settings where key = 'ai'), 2);
  ref_bonus  integer := coalesce((select (value->>'referral_bonus')::integer from public.app_settings where key = 'ai'), 1);
  ref_code   text := nullif(trim(new.raw_user_meta_data->>'ref'), '');
  referrer   uuid;
  my_code    text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
begin
    insert into public.profiles (user_id, name, email, phone, referral_code)
    values (new.id, new.raw_user_meta_data->>'name', new.email, new.raw_user_meta_data->>'phone', my_code);

    insert into public.user_roles (user_id, role) values (new.id, 'user');

    if free_n > 0 then
      insert into public.credit_ledger (user_id, delta, reason, reference)
      values (new.id, free_n, 'signup_bonus', 'signup:' || new.id::text)
      on conflict (reference) where reference is not null do nothing;
    end if;

    if ref_code is not null then
      select user_id into referrer from public.profiles where referral_code = ref_code;
      if referrer is not null and referrer <> new.id then
        insert into public.referrals (referee_id, referrer_id)
        values (new.id, referrer)
        on conflict (referee_id) do nothing;

        if ref_bonus > 0 then
          insert into public.credit_ledger (user_id, delta, reason, reference)
          values (referrer, ref_bonus, 'referral_bonus', 'referral:' || new.id::text)
          on conflict (reference) where reference is not null do nothing;

          insert into public.credit_ledger (user_id, delta, reason, reference)
          values (new.id, ref_bonus, 'referred_bonus', 'referred:' || new.id::text)
          on conflict (reference) where reference is not null do nothing;
        end if;
      end if;
    end if;

    return new;
end;
$$ language plpgsql security definer set search_path = public;
