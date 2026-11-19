-- NexGain Retail (System 3), step 4: ordering from suppliers, product SKUs,
-- and the Scanner for staff.
--   * products.sku: the product's own SKU (e.g. HOOD-001); each size / colour
--     can still have its own.
--   * suppliers.lead_time_days: how long their deliveries take (for the AI's
--     "time to reorder" suggestions).
--   * purchase_orders / purchase_order_lines: orders to a supplier or
--     manufacturer (Draft, Sent, Pending, Delivered, Cancelled). Marking one
--     Delivered adds its items to stock automatically (as a delivery, logged in
--     the stock history), once only.
--   * Staff can look products up (Scanner tab): names, photos, sizes, colours,
--     barcodes, sell prices and stock. Never cost prices or suppliers.
--   * Staff can tell the owner about a barcode that isn't in NexGain.
-- Row Level Security: each business only ever sees its own rows. Safe to run again.
-- Needs 20261127000200_retail_stock.sql first.

alter table public.products add column if not exists sku text not null default '' check (length(sku) <= 60);
alter table public.suppliers add column if not exists lead_time_days int not null default 7 check (lead_time_days between 0 and 365);

-- ---------------------------------------------------------------------
-- Orders to suppliers
-- ---------------------------------------------------------------------
create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- PO-0001, PO-0002... per business (set automatically).
  number text not null default '',
  supplier_id uuid references public.suppliers (id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'pending', 'delivered', 'cancelled')),
  -- The store the stock goes into when it arrives (several stores only).
  store_id uuid references public.store_locations (id) on delete set null,
  delivery_address text not null default '' check (length(delivery_address) <= 300),
  requested_date date,
  notes text not null default '' check (length(notes) <= 1000),
  sent_at timestamptz,
  delivered_at timestamptz,
  delivery_id uuid references public.deliveries (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists purchase_orders_business on public.purchase_orders (business_id, created_at desc);

create table if not exists public.purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.purchase_orders (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  quantity int not null check (quantity between 1 and 100000),
  unit_cost numeric(10, 2) check (unit_cost is null or unit_cost >= 0),
  unique (order_id, variant_id)
);

-- Order numbers: PO-0001 and up, per business.
create or replace function private.purchase_order_number()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.number = '' then
    perform pg_advisory_xact_lock(hashtext('purchase_orders:' || new.business_id::text));
    select 'PO-' || lpad((coalesce(max(nullif(regexp_replace(number, '\D', '', 'g'), '')::int), 0) + 1)::text, 4, '0')
    into new.number from public.purchase_orders where business_id = new.business_id;
  end if;
  return new;
end;
$$;
drop trigger if exists purchase_orders_number on public.purchase_orders;
create trigger purchase_orders_number before insert on public.purchase_orders
  for each row execute function private.purchase_order_number();

-- Delivered orders can't be edited (their stock is already added).
create or replace function private.purchase_order_locked()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_order uuid;
begin
  if tg_table_name = 'purchase_orders' then
    if old.status = 'delivered' and current_setting('nexgain.delivering', true) is distinct from 'on' then
      raise exception 'This order has been delivered, so it can''t be changed.';
    end if;
    if new.status = 'delivered' and old.status <> 'delivered' and current_setting('nexgain.delivering', true) is distinct from 'on' then
      raise exception 'Use "Mark as delivered" so the stock is added.';
    end if;
    return new;
  end if;
  -- Order lines: the order they belong to (a deleted line has no new row).
  if tg_op = 'DELETE' then v_order := old.order_id; else v_order := new.order_id; end if;
  if exists (select 1 from public.purchase_orders o where o.id = v_order and o.status = 'delivered') then
    raise exception 'This order has been delivered, so it can''t be changed.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists purchase_orders_locked on public.purchase_orders;
create trigger purchase_orders_locked before update on public.purchase_orders
  for each row execute function private.purchase_order_locked();
drop trigger if exists purchase_order_lines_locked on public.purchase_order_lines;
create trigger purchase_order_lines_locked before insert or update or delete on public.purchase_order_lines
  for each row execute function private.purchase_order_locked();

alter table public.purchase_orders enable row level security;
alter table public.purchase_order_lines enable row level security;
drop policy if exists "owner manages purchase orders" on public.purchase_orders;
create policy "owner manages purchase orders" on public.purchase_orders for all to authenticated
  using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));
drop policy if exists "owner manages purchase order lines" on public.purchase_order_lines;
create policy "owner manages purchase order lines" on public.purchase_order_lines for all to authenticated
  using (public.is_business_owner(business_id))
  with check (
    public.is_business_owner(business_id)
    and exists (select 1 from public.purchase_orders o where o.id = order_id and o.business_id = purchase_order_lines.business_id)
    and exists (select 1 from public.product_variants v where v.id = variant_id and v.business_id = purchase_order_lines.business_id)
  );

/**
 * Marks an order delivered and adds every line to stock (a delivery from the
 * order's supplier, in the stock history). Only once: a delivered order can't
 * be delivered again. Returns the delivery's id.
 */
create or replace function public.purchase_order_deliver(p_order uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  o public.purchase_orders;
  line record;
  new_id uuid;
begin
  select * into o from public.purchase_orders where id = p_order for update;
  if o.id is null or not public.is_business_owner(o.business_id) then raise exception 'Only the owner can receive this order.' using errcode = 'NXS00'; end if;
  if o.status = 'delivered' then raise exception 'This order is already delivered.'; end if;
  if o.status = 'cancelled' then raise exception 'This order was cancelled.'; end if;
  if not exists (select 1 from public.purchase_order_lines where order_id = o.id) then raise exception 'This order has no items.'; end if;
  perform private.check_store(o.business_id, o.store_id);

  insert into public.deliveries (business_id, supplier_id, store_id, note, received_by)
  values (o.business_id, o.supplier_id, o.store_id, 'Order ' || o.number, private.stock_actor_name(o.business_id))
  returning id into new_id;
  for line in select * from public.purchase_order_lines where order_id = o.id loop
    perform private.apply_stock_change(o.business_id, line.variant_id, o.store_id, 'received', line.quantity, 'Order ' || o.number, null, line.unit_cost, new_id);
  end loop;

  perform set_config('nexgain.delivering', 'on', true);
  update public.purchase_orders set status = 'delivered', delivered_at = now(), delivery_id = new_id, updated_at = now() where id = o.id;
  perform set_config('nexgain.delivering', 'off', true);
  return new_id;
end;
$$;
revoke execute on function public.purchase_order_deliver(uuid) from public, anon;
grant execute on function public.purchase_order_deliver(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Staff: look products up (Scanner tab). No cost prices or suppliers.
-- ---------------------------------------------------------------------

/**
 * Every product in the signed-in staff member's shop, for the Scanner:
 * [{ id, name, sku, brand, category, sellPrice, gstIncluded, lowStockLevel,
 *    photo, variants: [{ id, size, colour, sku, barcode, stock: { "<store id or ''>": n } }] }]
 */
create or replace function public.retail_staff_catalogue()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'name', p.name, 'sku', p.sku, 'brand', p.brand,
    'category', coalesce(c.name, ''), 'sellPrice', p.sell_price, 'gstIncluded', p.gst_included,
    'lowStockLevel', p.low_stock_level, 'photo', p.photos[1],
    'variants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id, 'size', v.size, 'colour', v.colour, 'sku', v.sku, 'barcode', v.barcode,
        'stock', coalesce((select jsonb_object_agg(coalesce(l.store_id::text, ''), l.quantity) from public.stock_levels l where l.variant_id = v.id), '{}')
      ) order by v.sort)
      from public.product_variants v where v.product_id = p.id
    ), '[]')
  ) order by p.name), '[]')
  from public.products p
  left join public.product_categories c on c.id = p.category_id
  where p.business_id = public.my_employee_business_id() and not p.archived;
$$;
revoke execute on function public.retail_staff_catalogue() from public, anon;
grant execute on function public.retail_staff_catalogue() to authenticated;

/** A staff member scanned a barcode that isn't in NexGain: tell the owner so they can add it. */
create or replace function public.retail_report_missing_barcode(p_barcode text, p_note text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare
  biz uuid := public.my_employee_business_id();
  who text;
  code text := left(btrim(coalesce(p_barcode, '')), 64);
begin
  if biz is null then raise exception 'Only staff can send this.'; end if;
  if code = '' then raise exception 'Which barcode?'; end if;
  who := coalesce(private.stock_actor_name(biz), 'A staff member');
  insert into public.notifications (business_id, recipient_id, audience, type, title, summary, body, details)
  select biz, b.owner_id, 'owner', 'stock_low', 'Product not found',
    'Barcode ' || code || ' · from ' || who,
    who || ' scanned barcode ' || code || ', which isn''t in NexGain. Add it as a product so it can be sold and counted.'
      || coalesce(nullif(' Note: ' || left(btrim(coalesce(p_note, '')), 300), ' Note: '), ''),
    jsonb_build_array(jsonb_build_object('label', 'Barcode', 'value', code))
  from public.businesses b where b.id = biz;
end;
$$;
revoke execute on function public.retail_report_missing_barcode(text, text) from public, anon;
grant execute on function public.retail_report_missing_barcode(text, text) to authenticated;

-- Staff can see product photos (<business id>/products/...), not other business files.
drop policy if exists "staff see product photos" on storage.objects;
create policy "staff see product photos" on storage.objects for select to authenticated
  using (
    bucket_id = 'business-files'
    and (storage.foldername(name))[2] = 'products'
    and (storage.foldername(name))[1] = public.my_employee_business_id()::text
  );

-- Orders show straight away on the owner's other devices.
do $$
begin
  begin
    alter publication supabase_realtime add table public.purchase_orders;
  exception when duplicate_object then null;
  end;
end;
$$;
