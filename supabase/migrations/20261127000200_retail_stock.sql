-- NexGain Retail (System 3), step 3: stock.
--   * suppliers: who the shop buys from (contact details).
--   * products: name, photos, category, brand, description, supplier, cost and
--     sell price, GST included, low stock alert level, and the store it's at.
--   * product_variants: each size / colour combination, with its own barcode
--     (unique within the business; made automatically when there isn't one)
--     and an optional SKU.
--   * stock_levels: how many of each variant are in stock (per store, when the
--     shop has more than one; store_id is empty with one store).
--   * stock_movements: every stock change, with who did it, when and how many:
--     starting stock, received, sold, returned, damaged / lost, stocktake
--     adjustment, transferred between stores.
--   * deliveries: a delivery received (its lines are stock movements).
--   * stocktakes / stocktake_counts: count everything, then approve the differences.
-- Stock only ever changes through the functions below, so every change is in
-- the history. A variant dropping to its low stock level (or running out) tells
-- the owner (notification type stock_low).
-- Row Level Security: each business only ever sees its own rows. Staff access
-- (the Scanner) is added in the next step. Safe to run again.
-- Needs 20261127000100_retail_owner.sql first.

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 100),
  contact_name text not null default '' check (length(contact_name) <= 100),
  phone text not null default '' check (length(phone) <= 40),
  email text not null default '' check (length(email) <= 200),
  website text not null default '' check (length(website) <= 200),
  notes text not null default '' check (length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists suppliers_unique_name on public.suppliers (business_id, lower(btrim(name)));

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  category_id uuid references public.product_categories (id) on delete set null,
  brand text not null default '' check (length(brand) <= 100),
  description text not null default '' check (length(description) <= 2000),
  supplier_id uuid references public.suppliers (id) on delete set null,
  cost_price numeric(10, 2) check (cost_price is null or cost_price >= 0),
  sell_price numeric(10, 2) check (sell_price is null or sell_price >= 0),
  gst_included boolean not null default true,
  low_stock_level int not null default 5 check (low_stock_level between 0 and 100000),
  -- The store it's sold at (with more than one store; empty = every store).
  store_id uuid references public.store_locations (id) on delete set null,
  -- Photos in the private business-files bucket: <business id>/products/...
  photos text[] not null default '{}' check (cardinality(photos) <= 6),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists products_business on public.products (business_id);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  size text not null default '' check (length(size) <= 40),
  colour text not null default '' check (length(colour) <= 40),
  sku text not null default '' check (length(sku) <= 60),
  -- Printable characters only (what Code 128 and supplier barcodes use).
  barcode text not null check (barcode ~ '^[ -~]{1,64}$'),
  -- true = NexGain made it (no barcode from the supplier).
  barcode_generated boolean not null default false,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
-- Barcodes are unique within each business: each one opens exactly one variant.
create unique index if not exists product_variants_unique_barcode on public.product_variants (business_id, barcode);
create unique index if not exists product_variants_unique_option on public.product_variants (product_id, lower(size), lower(colour));
create index if not exists product_variants_product on public.product_variants (product_id);

create table if not exists public.stock_levels (
  business_id uuid not null references public.businesses (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  store_id uuid references public.store_locations (id) on delete cascade,
  quantity int not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now()
);
create unique index if not exists stock_levels_unique on public.stock_levels (variant_id, coalesce(store_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  supplier_id uuid references public.suppliers (id) on delete set null,
  store_id uuid references public.store_locations (id) on delete set null,
  note text not null default '' check (length(note) <= 500),
  received_by text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.stocktakes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  store_id uuid references public.store_locations (id) on delete set null,
  status text not null default 'counting' check (status in ('counting', 'approved', 'cancelled')),
  started_by text not null default '',
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

create table if not exists public.stocktake_counts (
  stocktake_id uuid not null references public.stocktakes (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  counted int not null check (counted >= 0),
  -- What the records said, saved when the stocktake is approved.
  expected int,
  updated_at timestamptz not null default now(),
  primary key (stocktake_id, variant_id)
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  store_id uuid references public.store_locations (id) on delete set null,
  kind text not null check (kind in ('starting', 'received', 'sold', 'returned', 'damaged', 'stocktake', 'transfer_in', 'transfer_out', 'adjusted')),
  change int not null,
  quantity_after int not null,
  -- Sales: the price it sold for. Deliveries: what it cost.
  unit_price numeric(10, 2),
  unit_cost numeric(10, 2),
  note text not null default '' check (length(note) <= 500),
  delivery_id uuid references public.deliveries (id) on delete set null,
  stocktake_id uuid references public.stocktakes (id) on delete set null,
  actor_id uuid,
  actor_name text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists stock_movements_business_time on public.stock_movements (business_id, created_at desc);
create index if not exists stock_movements_variant_time on public.stock_movements (variant_id, created_at desc);

-- ---------------------------------------------------------------------
-- Barcodes made automatically: "NX" and 10 digits, never used before in the business
-- ---------------------------------------------------------------------
create or replace function private.product_variant_barcode()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  candidate text;
begin
  new.barcode := btrim(coalesce(new.barcode, ''));
  if new.barcode <> '' then return new; end if;
  loop
    candidate := 'NX' || lpad((floor(random() * 10000000000))::bigint::text, 10, '0');
    exit when not exists (select 1 from public.product_variants where business_id = new.business_id and barcode = candidate);
  end loop;
  new.barcode := candidate;
  new.barcode_generated := true;
  return new;
end;
$$;
drop trigger if exists product_variants_barcode on public.product_variants;
create trigger product_variants_barcode before insert or update of barcode on public.product_variants
  for each row execute function private.product_variant_barcode();

-- A variant always belongs to its product's business.
create or replace function private.check_variant_business()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.products p where p.id = new.product_id and p.business_id = new.business_id) then
    raise exception 'That product isn''t in this business.';
  end if;
  return new;
end;
$$;
drop trigger if exists product_variants_business on public.product_variants;
create trigger product_variants_business before insert or update on public.product_variants
  for each row execute function private.check_variant_business();

-- ---------------------------------------------------------------------
-- Who can see and change what
-- ---------------------------------------------------------------------
alter table public.suppliers enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.stock_levels enable row level security;
alter table public.stock_movements enable row level security;
alter table public.deliveries enable row level security;
alter table public.stocktakes enable row level security;
alter table public.stocktake_counts enable row level security;

-- The owner manages suppliers, products, variants and stocktake counts.
drop policy if exists "owner manages suppliers" on public.suppliers;
create policy "owner manages suppliers" on public.suppliers for all to authenticated
  using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));
drop policy if exists "owner manages products" on public.products;
create policy "owner manages products" on public.products for all to authenticated
  using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));
drop policy if exists "owner manages product variants" on public.product_variants;
create policy "owner manages product variants" on public.product_variants for all to authenticated
  using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));
drop policy if exists "owner manages stocktake counts" on public.stocktake_counts;
create policy "owner manages stocktake counts" on public.stocktake_counts for all to authenticated
  using (public.is_business_owner(business_id)) with check (
    public.is_business_owner(business_id)
    and exists (select 1 from public.stocktakes s where s.id = stocktake_id and s.business_id = stocktake_counts.business_id and s.status = 'counting')
  );

-- Stock levels, history, deliveries and stocktakes: the owner can read them;
-- they only change through the functions below.
drop policy if exists "owner sees stock levels" on public.stock_levels;
create policy "owner sees stock levels" on public.stock_levels for select to authenticated using (public.is_business_owner(business_id));
drop policy if exists "owner sees stock movements" on public.stock_movements;
create policy "owner sees stock movements" on public.stock_movements for select to authenticated using (public.is_business_owner(business_id));
drop policy if exists "owner sees deliveries" on public.deliveries;
create policy "owner sees deliveries" on public.deliveries for select to authenticated using (public.is_business_owner(business_id));
drop policy if exists "owner sees stocktakes" on public.stocktakes;
create policy "owner sees stocktakes" on public.stocktakes for select to authenticated using (public.is_business_owner(business_id));

-- ---------------------------------------------------------------------
-- Changing stock (every change is logged)
-- ---------------------------------------------------------------------

-- The signed-in person's name, for the history ("who did it").
create or replace function private.stock_actor_name(p_business uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select nullif(btrim(e.full_name), '') from public.employees e where e.user_id = auth.uid() and e.business_id = p_business limit 1),
    (select coalesce(nullif(btrim(b.owner_name), ''), 'Owner') from public.businesses b where b.id = p_business and b.owner_id = auth.uid()),
    ''
  );
$$;

-- The store to use: must be one of the business's stores (or empty).
create or replace function private.check_store(p_business uuid, p_store uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if p_store is not null and not exists (select 1 from public.store_locations s where s.id = p_store and s.business_id = p_business) then
    raise exception 'That store isn''t in this business.' using errcode = 'NXS02';
  end if;
end;
$$;

-- Applies one change to one variant at one store, logs it, and tells the owner
-- when it drops to its low stock level or runs out. Returns how many are left there.
create or replace function private.apply_stock_change(
  p_business uuid, p_variant uuid, p_store uuid, p_kind text, p_change int, p_note text,
  p_unit_price numeric default null, p_unit_cost numeric default null,
  p_delivery uuid default null, p_stocktake uuid default null
)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v record;
  before_total int;
  after_total int;
  new_qty int;
  zero constant uuid := '00000000-0000-0000-0000-000000000000';
  label text;
begin
  select pv.id, pv.size, pv.colour, p.name, p.low_stock_level into v
  from public.product_variants pv join public.products p on p.id = pv.product_id
  where pv.id = p_variant and pv.business_id = p_business;
  if v.id is null then raise exception 'That product isn''t in this business.' using errcode = 'NXS01'; end if;
  perform private.check_store(p_business, p_store);
  if p_change = 0 and p_kind <> 'stocktake' then return coalesce((select quantity from public.stock_levels where variant_id = p_variant and coalesce(store_id, zero) = coalesce(p_store, zero)), 0); end if;

  select coalesce(sum(quantity), 0) into before_total from public.stock_levels where variant_id = p_variant;

  insert into public.stock_levels as l (business_id, variant_id, store_id, quantity)
  values (p_business, p_variant, p_store, 0)
  on conflict (variant_id, coalesce(store_id, '00000000-0000-0000-0000-000000000000'::uuid)) do nothing;
  -- Locked while it changes, so two changes at once (e.g. two phones scanning) can't both use the same stock.
  select quantity into new_qty from public.stock_levels
  where variant_id = p_variant and coalesce(store_id, zero) = coalesce(p_store, zero)
  for update;
  if new_qty + p_change < 0 then
    raise exception 'Not enough in stock: only % left.', new_qty using errcode = 'NXS03';
  end if;
  update public.stock_levels set quantity = quantity + p_change, updated_at = now()
  where variant_id = p_variant and coalesce(store_id, zero) = coalesce(p_store, zero)
  returning quantity into new_qty;

  insert into public.stock_movements (business_id, variant_id, store_id, kind, change, quantity_after, unit_price, unit_cost, note, delivery_id, stocktake_id, actor_id, actor_name)
  values (p_business, p_variant, p_store, p_kind, p_change, new_qty, p_unit_price, p_unit_cost, left(btrim(coalesce(p_note, '')), 500),
    p_delivery, p_stocktake, auth.uid(), private.stock_actor_name(p_business));

  -- Low stock: once, when it drops to the alert level; out of stock: when it reaches 0 (all stores together).
  after_total := before_total + p_change;
  if after_total < before_total and ((after_total <= v.low_stock_level and before_total > v.low_stock_level) or (after_total = 0 and before_total > 0)) then
    label := v.name || coalesce(nullif(' · ' || concat_ws(' / ', nullif(v.size, ''), nullif(v.colour, '')), ' · '), '');
    insert into public.notifications (business_id, recipient_id, audience, type, title, summary, body, related_id)
    select p_business, b.owner_id, 'owner', 'stock_low',
      case when after_total = 0 then 'Out of stock' else 'Low stock' end,
      label || ' · ' || after_total || ' left',
      case when after_total = 0
        then label || ' has sold out. Reorder it so you don''t miss sales.'
        else label || ' is down to ' || after_total || ' (your alert level is ' || v.low_stock_level || '). Time to reorder.' end,
      p_variant
    from public.businesses b where b.id = p_business;
  end if;
  return new_qty;
end;
$$;
revoke execute on function private.apply_stock_change(uuid, uuid, uuid, text, int, text, numeric, numeric, uuid, uuid) from public, anon, authenticated;

-- The business a variant belongs to, if the signed-in person owns it.
create or replace function private.owned_variant_business(p_variant uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select pv.business_id from public.product_variants pv where pv.id = p_variant and public.is_business_owner(pv.business_id);
$$;

/**
 * One stock change by the owner: starting stock, received, sold, returned,
 * damaged / lost, or adjusted (a signed number). Quantities are positive; the
 * kind decides the direction. Returns how many are left at that store.
 */
create or replace function public.stock_change(p_variant uuid, p_store uuid, p_kind text, p_quantity int, p_note text default '', p_unit_price numeric default null)
returns int language plpgsql security definer set search_path = '' as $$
declare
  biz uuid := private.owned_variant_business(p_variant);
  delta int;
begin
  if biz is null then raise exception 'Only the owner can change stock here.' using errcode = 'NXS00'; end if;
  if p_kind not in ('starting', 'received', 'sold', 'returned', 'damaged', 'adjusted') then raise exception 'Unknown stock change.'; end if;
  if p_kind <> 'adjusted' and (p_quantity is null or p_quantity < 0 or p_quantity > 100000) then raise exception 'Enter a quantity from 0 to 100000.'; end if;
  delta := case when p_kind in ('sold', 'damaged') then -p_quantity else p_quantity end;
  return private.apply_stock_change(biz, p_variant, p_store, p_kind, delta, p_note, p_unit_price);
end;
$$;

/** Moves stock from one store to another (two history lines: out and in). */
create or replace function public.stock_transfer(p_variant uuid, p_from uuid, p_to uuid, p_quantity int, p_note text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare
  biz uuid := private.owned_variant_business(p_variant);
  from_name text;
  to_name text;
begin
  if biz is null then raise exception 'Only the owner can move stock.' using errcode = 'NXS00'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Enter how many to move.'; end if;
  if p_from is not distinct from p_to then raise exception 'Choose two different stores.'; end if;
  select name into from_name from public.store_locations where id = p_from;
  select name into to_name from public.store_locations where id = p_to;
  perform private.apply_stock_change(biz, p_variant, p_from, 'transfer_out', -p_quantity, coalesce(nullif(btrim(p_note), ''), 'To ' || coalesce(to_name, 'no store')));
  perform private.apply_stock_change(biz, p_variant, p_to, 'transfer_in', p_quantity, coalesce(nullif(btrim(p_note), ''), 'From ' || coalesce(from_name, 'no store')));
end;
$$;

/**
 * Receives a delivery: [{ "variant": id, "quantity": 5, "unit_cost": 12.5 }].
 * All lines are added together (or none, if one fails). Returns the delivery's id.
 */
create or replace function public.stock_receive(p_store uuid, p_supplier uuid, p_note text, p_lines jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  biz uuid;
  line record;
  new_id uuid;
begin
  select pv.business_id into biz
  from jsonb_to_recordset(p_lines) as x(variant uuid, quantity int, unit_cost numeric)
  join public.product_variants pv on pv.id = x.variant
  limit 1;
  if biz is null or not public.is_business_owner(biz) then raise exception 'Only the owner can receive deliveries here.' using errcode = 'NXS00'; end if;
  if p_supplier is not null and not exists (select 1 from public.suppliers where id = p_supplier and business_id = biz) then
    raise exception 'That supplier isn''t in this business.';
  end if;
  perform private.check_store(biz, p_store);
  insert into public.deliveries (business_id, supplier_id, store_id, note, received_by)
  values (biz, p_supplier, p_store, left(btrim(coalesce(p_note, '')), 500), private.stock_actor_name(biz))
  returning id into new_id;
  for line in select * from jsonb_to_recordset(p_lines) as x(variant uuid, quantity int, unit_cost numeric) loop
    if line.quantity is null or line.quantity <= 0 or line.quantity > 100000 then raise exception 'Each line needs a quantity from 1 to 100000.'; end if;
    perform private.apply_stock_change(biz, line.variant, p_store, 'received', line.quantity, 'Delivery', null, line.unit_cost, new_id);
  end loop;
  return new_id;
end;
$$;

/** Starts a stocktake (one open at a time per store). Returns its id. */
create or replace function public.stocktake_start(p_store uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  biz uuid;
  existing uuid;
  new_id uuid;
begin
  select id into biz from public.businesses where owner_id = auth.uid() limit 1;
  if biz is null then raise exception 'Only the owner can start a stocktake.' using errcode = 'NXS00'; end if;
  perform private.check_store(biz, p_store);
  select id into existing from public.stocktakes
  where business_id = biz and status = 'counting' and store_id is not distinct from p_store limit 1;
  if existing is not null then return existing; end if;
  insert into public.stocktakes (business_id, store_id, started_by) values (biz, p_store, private.stock_actor_name(biz))
  returning id into new_id;
  return new_id;
end;
$$;

/**
 * Approves a stocktake: every counted variant is set to its count (the
 * difference is logged as a stocktake adjustment). Variants not counted are
 * left as they were. Returns how many changed.
 */
create or replace function public.stocktake_approve(p_stocktake uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare
  st public.stocktakes;
  c record;
  current_qty int;
  changed int := 0;
  zero constant uuid := '00000000-0000-0000-0000-000000000000';
begin
  select * into st from public.stocktakes where id = p_stocktake for update;
  if st.id is null or not public.is_business_owner(st.business_id) then raise exception 'Only the owner can approve a stocktake.' using errcode = 'NXS00'; end if;
  if st.status <> 'counting' then raise exception 'This stocktake is already finished.'; end if;
  for c in select * from public.stocktake_counts where stocktake_id = st.id loop
    select coalesce((select quantity from public.stock_levels where variant_id = c.variant_id and coalesce(store_id, zero) = coalesce(st.store_id, zero)), 0)
    into current_qty;
    update public.stocktake_counts set expected = current_qty where stocktake_id = st.id and variant_id = c.variant_id;
    if c.counted <> current_qty then
      perform private.apply_stock_change(st.business_id, c.variant_id, st.store_id, 'stocktake', c.counted - current_qty, 'Stocktake', null, null, null, st.id);
      changed := changed + 1;
    end if;
  end loop;
  update public.stocktakes set status = 'approved', approved_at = now() where id = st.id;
  return changed;
end;
$$;

/** Cancels a stocktake without changing any stock. */
create or replace function public.stocktake_cancel(p_stocktake uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.stocktakes set status = 'cancelled'
  where id = p_stocktake and status = 'counting' and public.is_business_owner(business_id);
end;
$$;

revoke execute on function public.stock_change(uuid, uuid, text, int, text, numeric) from public, anon;
revoke execute on function public.stock_transfer(uuid, uuid, uuid, int, text) from public, anon;
revoke execute on function public.stock_receive(uuid, uuid, text, jsonb) from public, anon;
revoke execute on function public.stocktake_start(uuid) from public, anon;
revoke execute on function public.stocktake_approve(uuid) from public, anon;
revoke execute on function public.stocktake_cancel(uuid) from public, anon;
grant execute on function public.stock_change(uuid, uuid, text, int, text, numeric) to authenticated;
grant execute on function public.stock_transfer(uuid, uuid, uuid, int, text) to authenticated;
grant execute on function public.stock_receive(uuid, uuid, text, jsonb) to authenticated;
grant execute on function public.stocktake_start(uuid) to authenticated;
grant execute on function public.stocktake_approve(uuid) to authenticated;
grant execute on function public.stocktake_cancel(uuid) to authenticated;
revoke execute on function private.stock_actor_name(uuid) from public, anon, authenticated;
revoke execute on function private.check_store(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.owned_variant_business(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Live updates: a stock change anywhere shows straight away on the owner's phone
-- ---------------------------------------------------------------------
do $$
begin
  begin
    alter publication supabase_realtime add table public.stock_movements;
  exception when duplicate_object then null;
  end;
end;
$$;
