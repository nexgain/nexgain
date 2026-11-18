-- NexGain Retail (System 3), step 2: the owner side.
--   * retail_settings.link_expenses_to_stock: the Transactions page's "Link
--     expenses to products / stock orders" (off by default; replaces System 1's
--     "Link expenses to jobs" for retail).
--   * store_locations: the shop's stores. With more than one, the roster asks
--     which store a shift is at (the shift's location is the store's name).
-- Row Level Security: each business only ever sees its own rows. Safe to run again.
-- Needs 20261127000000_retail.sql first.

alter table public.retail_settings add column if not exists link_expenses_to_stock boolean not null default false;

create table if not exists public.store_locations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  address text not null default '' check (length(address) <= 200),
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- No two stores with the same name in one business (ignoring capitals).
create unique index if not exists store_locations_unique_name on public.store_locations (business_id, lower(btrim(name)));

alter table public.store_locations enable row level security;

drop policy if exists "owner manages store locations" on public.store_locations;
create policy "owner manages store locations" on public.store_locations for all to authenticated
  using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));
drop policy if exists "staff see store locations" on public.store_locations;
create policy "staff see store locations" on public.store_locations for select to authenticated
  using (business_id = public.my_employee_business_id());
