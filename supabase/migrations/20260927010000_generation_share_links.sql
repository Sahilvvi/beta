-- Public share links: an owner can turn one of their designs into a public
-- page (thinkdecor.app/r/<slug>) showing the before/after, with no sign-in
-- needed to view it. generations itself stays fully private (RLS below is
-- unchanged for select/insert/delete) — the public read path is the
-- `public-share` edge function, which looks a row up by slug with the
-- service role and hands back only signed image URLs + a few safe fields,
-- never the row itself or the owner's user_id.
alter table public.generations
  add column if not exists share_slug text,
  add column if not exists shared_at  timestamptz;

create unique index if not exists generations_share_slug_uniq
  on public.generations (share_slug) where share_slug is not null;

-- Needed so a signed-in owner can set/clear their own generation's share_slug.
-- Scoped identically to the existing select/insert/delete policies (own rows
-- only) — this does not open the table to anon or to other users' rows.
drop policy if exists "update own generations" on public.generations;
create policy "update own generations"
  on public.generations for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
