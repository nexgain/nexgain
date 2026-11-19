-- =====================================================================
-- NexGain Hospitality (System 3): cafes, restaurants and other food
-- businesses. Phase 1: the menu and sales.
--
--   menu_categories   the menu's sections, e.g. Coffee, Breakfast, Cakes
--   menu_items        what's sold: name, price, optional cost to make,
--                     photo, description, hidden (86'd) and specials dates
--   menu_sales        one sale (tapped in "Record sale"), or one day's
--                     totals ("End of day"), or a POS import (later)
--   menu_sale_items   the items in a sale, with the price AT THE TIME, so
--                     changing a price later never changes old sales
--
-- No stock, no ingredient counts: "cost to make" is just a number the owner
-- types, used to show profit per item.
--
-- Who can see what: only the business owner (row level security).
-- Staff recording sales comes later, behind the owner's "Staff can record
-- sales" switch.
--
-- Run once, after the earlier files:
--   Supabase > SQL Editor > New query > paste this whole file > Run.
-- Safe to run again.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A third system: 'hospitality'. Every existing business stays as it is.
-- ---------------------------------------------------------------------
alter table public.businesses drop constraint if exists businesses_system_type_check;
alter table public.businesses add constraint businesses_system_type_check
  check (system_type in ('service', 'bookings', 'hospitality'));

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table if not exists public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 60),
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists menu_categories_business on public.menu_categories (business_id, sort);

create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- Deleting a category keeps its items (they show under "No category").
  category_id uuid references public.menu_categories (id) on delete set null,
  name text not null check (length(btrim(name)) between 1 and 100),
  description text not null default '' check (length(description) <= 500),
  price numeric(10, 2) not null default 0 check (price >= 0),
  -- Optional: what it costs to make one (for profit and margin). Not stock.
  cost numeric(10, 2) check (cost is null or cost >= 0),
  -- Photo in the private "business-files" bucket: <business id>/menu/...
  photo_path text,
  -- Off = hidden (86'd, seasonal): can't be picked in Record sale.
  active boolean not null default true,
  -- A special / limited-time item: shown as a special between these dates.
  is_special boolean not null default false,
  special_start date,
  special_end date check (special_end is null or special_start is null or special_end >= special_start),
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists menu_items_business on public.menu_items (business_id, category_id, sort);

create table if not exists public.menu_sales (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- When the sale happened (end-of-day totals use the end of that day).
  sold_at timestamptz not null default now(),
  -- sale: tapped in Record sale. day: an end-of-day total. import: from a POS file (later).
  source text not null default 'sale' check (source in ('sale', 'day', 'import')),
  -- Who recorded it (the owner, or later a staff member).
  recorded_by uuid default auth.uid(),
  note text not null default '' check (length(note) <= 500),
  total numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists menu_sales_business on public.menu_sales (business_id, sold_at desc);

create table if not exists public.menu_sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.menu_sales (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- The menu item (kept as text below too, in case the item is deleted later).
  menu_item_id uuid references public.menu_items (id) on delete set null,
  item_name text not null check (length(btrim(item_name)) between 1 and 100),
  category_name text not null default '',
  quantity numeric(10, 2) not null check (quantity > 0),
  -- Sell price and cost to make at the time of the sale.
  unit_price numeric(10, 2) not null check (unit_price >= 0),
  unit_cost numeric(10, 2) check (unit_cost is null or unit_cost >= 0)
);
create index if not exists menu_sale_items_sale on public.menu_sale_items (sale_id);
create index if not exists menu_sale_items_business on public.menu_sale_items (business_id, menu_item_id);

-- A sale's total always matches its items.
create or replace function private.menu_sale_total()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  sid uuid := coalesce(new.sale_id, old.sale_id);
begin
  update public.menu_sales s
    set total = coalesce((select sum(round(i.quantity * i.unit_price, 2)) from public.menu_sale_items i where i.sale_id = sid), 0)
    where s.id = sid;
  return null;
end;
$$;
drop trigger if exists menu_sale_items_total on public.menu_sale_items;
create trigger menu_sale_items_total after insert or update or delete on public.menu_sale_items
  for each row execute function private.menu_sale_total();

-- An item can only be in a sale of the same business.
create or replace function private.menu_sale_item_business()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.menu_sales s where s.id = new.sale_id and s.business_id = new.business_id) then
    raise exception 'That sale belongs to another business.';
  end if;
  return new;
end;
$$;
drop trigger if exists menu_sale_items_business on public.menu_sale_items;
create trigger menu_sale_items_business before insert or update on public.menu_sale_items
  for each row execute function private.menu_sale_item_business();

create or replace function private.menu_item_touched()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists menu_items_touched on public.menu_items;
create trigger menu_items_touched before update on public.menu_items
  for each row execute function private.menu_item_touched();

-- ---------------------------------------------------------------------
-- Who can see and change what: the business owner only (for now).
-- ---------------------------------------------------------------------
alter table public.menu_categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.menu_sales enable row level security;
alter table public.menu_sale_items enable row level security;

drop policy if exists "owner manages menu categories" on public.menu_categories;
create policy "owner manages menu categories" on public.menu_categories for all to authenticated
  using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));

drop policy if exists "owner manages menu items" on public.menu_items;
create policy "owner manages menu items" on public.menu_items for all to authenticated
  using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));

drop policy if exists "owner manages menu sales" on public.menu_sales;
create policy "owner manages menu sales" on public.menu_sales for all to authenticated
  using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));

drop policy if exists "owner manages menu sale items" on public.menu_sale_items;
create policy "owner manages menu sale items" on public.menu_sale_items for all to authenticated
  using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));
