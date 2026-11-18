-- NexGain Retail (System 3), step 1: the retail system, the shop's business
-- type and its product categories.
--   * businesses.system_type can now be 'retail' (shops and brands that sell
--     products and track stock). Existing businesses are unchanged.
--   * retail_settings: one row per retail business. business_type is the type
--     picked at sign-up (an id from src/systems/retail/constants/retail-business-types.ts),
--     which decides the preset categories and everything the shop sees.
--   * product_categories: the shop's own categories (Tops, Vitamins...). The
--     owner can add, rename, reorder and delete them; staff can see them.
-- Row Level Security: each business only ever sees its own rows. Safe to run again.

alter table public.businesses drop constraint if exists businesses_system_type_check;
alter table public.businesses add constraint businesses_system_type_check
  check (system_type in ('service', 'bookings', 'retail'));

create table if not exists public.retail_settings (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  business_type text not null default 'other-retail' check (business_type ~ '^[a-z0-9-]{1,60}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 60),
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- No two categories with the same name in one shop (ignoring capitals).
create unique index if not exists product_categories_unique_name on public.product_categories (business_id, lower(btrim(name)));

alter table public.retail_settings enable row level security;
alter table public.product_categories enable row level security;

drop policy if exists "owner manages retail settings" on public.retail_settings;
create policy "owner manages retail settings" on public.retail_settings for all to authenticated
  using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));
drop policy if exists "staff see retail settings" on public.retail_settings;
create policy "staff see retail settings" on public.retail_settings for select to authenticated
  using (business_id = public.my_employee_business_id());

drop policy if exists "owner manages product categories" on public.product_categories;
create policy "owner manages product categories" on public.product_categories for all to authenticated
  using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));
drop policy if exists "staff see product categories" on public.product_categories;
create policy "staff see product categories" on public.product_categories for select to authenticated
  using (business_id = public.my_employee_business_id());
