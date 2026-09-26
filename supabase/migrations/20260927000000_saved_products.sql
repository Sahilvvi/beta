-- "My picks": real catalog products a signed-in user has hearted, so they can
-- come back and buy them later (every pick still routes through product-link).
create table if not exists public.saved_products (
  user_id    uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create index if not exists saved_products_user_idx on public.saved_products (user_id, created_at desc);

alter table public.saved_products enable row level security;

drop policy if exists "read own saved products" on public.saved_products;
create policy "read own saved products"
  on public.saved_products for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "save own products" on public.saved_products;
create policy "save own products"
  on public.saved_products for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "unsave own products" on public.saved_products;
create policy "unsave own products"
  on public.saved_products for delete to authenticated
  using (auth.uid() = user_id);
