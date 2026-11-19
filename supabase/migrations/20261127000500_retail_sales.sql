-- NexGain Retail (System 3), step 6: sales and revenue.
--   * sales: one row for every sale and every return, made automatically when
--     stock is marked Sold or Returned (by the owner or on the staff Scanner),
--     so it can't be missed: product, size / colour, price, quantity, who sold
--     it (and which employee), the store, when, and the GST in it.
--     A return is a negative row (it reverses the sale; the stock goes back).
--   * GST: worked out on each sale when the business is registered for GST in
--     Australia. A GST-inclusive price has 1/11 GST; a price "plus GST" has 10%
--     added. Retail sales are now in GST collected on the GST page, the
--     dashboard tile and the reminders (private.gst_items).
--   * Also fixes GST credits for retail: bank payments sorted as "Wages" are
--     wages, so they never have a GST credit (the same as "Wages & super").
-- Existing sales and returns (from step 3 on) are added now. Systems 1 and 2
-- have no sales, so their revenue and GST are unchanged. Safe to run again.
-- Needs 20261127000400_retail_staff.sql first.

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- The stock change it came from (one sale per change).
  movement_id uuid unique references public.stock_movements (id) on delete set null,
  variant_id uuid references public.product_variants (id) on delete set null,
  product_id uuid references public.products (id) on delete set null,
  -- Kept so old sales still read well if the product changes: "Classic Hoodie · M".
  item_name text not null default '',
  -- Items sold; negative for a return.
  quantity int not null,
  -- The price each, as set on the product.
  unit_price numeric(10, 2) not null,
  gst_included boolean not null default true,
  -- What the customer paid (incl. GST); negative for a return.
  total numeric(12, 2) not null,
  -- The GST in the total (0 when the business isn't registered for GST).
  gst numeric(12, 2) not null default 0,
  store_id uuid references public.store_locations (id) on delete set null,
  employee_id uuid references public.employees (id) on delete set null,
  sold_by text not null default '',
  sold_at timestamptz not null default now()
);
create index if not exists sales_business_time on public.sales (business_id, sold_at desc);
create index if not exists sales_product on public.sales (product_id);

alter table public.sales enable row level security;
drop policy if exists "owner sees sales" on public.sales;
create policy "owner sees sales" on public.sales for select to authenticated using (public.is_business_owner(business_id));
-- Staff see their own sales (not other people's).
drop policy if exists "staff see own sales" on public.sales;
create policy "staff see own sales" on public.sales for select to authenticated using (employee_id is not null and employee_id = public.my_employee_id());

/** The sale for one stock change (Sold or Returned with a price). Does nothing for anything else. */
create or replace function private.record_sale(m public.stock_movements)
returns void language plpgsql security definer set search_path = '' as $$
declare
  p record;
  b record;
  qty int;
  gross numeric;
  tax numeric := 0;
begin
  if m.kind not in ('sold', 'returned') or m.unit_price is null or m.change = 0 then return; end if;
  select pr.id, pr.name, pr.gst_included, pv.size, pv.colour into p
  from public.product_variants pv join public.products pr on pr.id = pv.product_id where pv.id = m.variant_id;
  select gst_registered, country into b from public.businesses where id = m.business_id;
  qty := -m.change; -- sold: change is negative, so qty is positive; returned: negative
  if coalesce(b.gst_registered, false) and b.country = 'AU' then
    if coalesce(p.gst_included, true) then
      gross := qty * m.unit_price;
      tax := round(gross / 11, 2);
    else
      gross := round(qty * m.unit_price * 1.1, 2);
      tax := round(qty * m.unit_price * 0.1, 2);
    end if;
  else
    gross := qty * m.unit_price;
  end if;
  insert into public.sales (business_id, movement_id, variant_id, product_id, item_name, quantity, unit_price, gst_included, total, gst, store_id, employee_id, sold_by, sold_at)
  values (
    m.business_id, m.id, m.variant_id, p.id,
    coalesce(p.name, 'Product') || coalesce(nullif(' · ' || concat_ws(' / ', nullif(p.size, ''), nullif(p.colour, '')), ' · '), ''),
    qty, m.unit_price, coalesce(p.gst_included, true), round(gross, 2), tax, m.store_id,
    (select e.id from public.employees e where e.user_id = m.actor_id and e.business_id = m.business_id limit 1),
    m.actor_name, m.created_at
  )
  on conflict (movement_id) do nothing;
end;
$$;
revoke execute on function private.record_sale(public.stock_movements) from public, anon, authenticated;

create or replace function private.stock_movement_sale()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.record_sale(new);
  return new;
end;
$$;
drop trigger if exists stock_movements_sale on public.stock_movements;
create trigger stock_movements_sale after insert on public.stock_movements
  for each row execute function private.stock_movement_sale();

-- Sales and returns made before this update.
select private.record_sale(m) from public.stock_movements m
where m.kind in ('sold', 'returned') and m.unit_price is not null
  and not exists (select 1 from public.sales s where s.movement_id = m.id);

-- Live: a sale on the Scanner shows on the owner's dashboard straight away.
do $$
begin
  begin
    alter publication supabase_realtime add table public.sales;
  exception when duplicate_object then null;
  end;
end;
$$;

-- ---------------------------------------------------------------------
-- GST: the same as 20261118000100_bookings_gst.sql, plus retail sales
-- ("sold") and "Wages" in the categories with no GST.
-- ---------------------------------------------------------------------
create or replace function private.gst_items(bid uuid, q date)
returns table (
  kind text,        -- 'sale' (GST collected) or 'expense' (GST credit)
  source text,      -- 'invoice', 'receipt', 'bank', 'expense', 'booking', 'sale'
  ref_id uuid,
  day date,
  description text,
  amount numeric,   -- the full amount (incl. GST)
  gst numeric,      -- the GST counted (0 when not claimable yet)
  note text         -- '', 'estimated' or 'needs receipt'
)
language sql stable set search_path = '' as $$
  with bounds as (select q as s, (q + interval '3 months')::date as e),
  no_gst as (select unnest(array['Income', 'Transfers', 'Wages & super', 'Wages', 'Tax', 'Bank fees']) as category),
  -- GST collected: invoices paid in the quarter.
  sales(kind, source, ref_id, day, description, amount, gst, note) as (
    select 'sale'::text, 'invoice'::text, d.id, (d.paid_at at time zone 'Australia/Brisbane')::date,
      coalesce(nullif(d.number, ''), 'Invoice') || coalesce(' · ' || nullif(d.client ->> 'name', ''), ''),
      private.doc_gst(d.items, 1) + d.gst_amount, -- subtotal + GST
      d.gst_amount, ''::text
    from public.sales_docs d, bounds b
    where d.business_id = bid and d.kind = 'invoice' and d.status = 'Paid' and d.paid_at is not null
      and (d.paid_at at time zone 'Australia/Brisbane')::date >= b.s
      and (d.paid_at at time zone 'Australia/Brisbane')::date < b.e
      and d.gst_amount > 0
  ),
  -- Receipts: the GST printed on them, dated by what they're linked to.
  receipts(kind, source, ref_id, day, description, amount, gst, note) as (
    select 'expense'::text, 'receipt'::text, r.id,
      coalesce(t.date, x.date, r.receipt_date, (r.created_at at time zone 'Australia/Brisbane')::date),
      coalesce(nullif(r.supplier, ''), 'Receipt'), coalesce(r.total, 0), coalesce(r.gst, 0), ''::text
    from public.receipts r
    left join public.bank_transactions t on t.id = r.bank_transaction_id
    left join public.expenses x on x.id = r.expense_id
    where r.business_id = bid and r.status = 'ready' and coalesce(r.gst, 0) > 0
  ),
  -- Bank purchases with no receipt.
  bank(kind, source, ref_id, day, description, amount, gst, note) as (
    select 'expense'::text, 'bank'::text, t.id, t.date, coalesce(nullif(t.merchant, ''), t.description), -t.amount,
      case when -t.amount <= 82.50 then round(-t.amount / 11, 2) else 0 end,
      case when -t.amount <= 82.50 then 'estimated' else 'needs receipt' end
    from public.bank_transactions t, bounds b
    where t.business_id = bid and t.amount < 0 and t.date >= b.s and t.date < b.e
      and t.category not in (select category from no_gst)
      and not exists (select 1 from public.receipts r where r.bank_transaction_id = t.id and r.status = 'ready' and coalesce(r.gst, 0) > 0)
  ),
  -- Expenses typed in by the owner, with no receipt.
  typed(kind, source, ref_id, day, description, amount, gst, note) as (
    select 'expense'::text, 'expense'::text, x.id, x.date, coalesce(nullif(x.description, ''), x.category), x.amount,
      case when x.amount <= 82.50 then round(x.amount / 11, 2) else 0 end,
      case when x.amount <= 82.50 then 'estimated' else 'needs receipt' end
    from public.expenses x, bounds b
    where x.business_id = bid and x.date >= b.s and x.date < b.e
      and x.category not in (select category from no_gst)
      and not exists (select 1 from public.receipts r where r.expense_id = x.id and r.status = 'ready' and coalesce(r.gst, 0) > 0)
  ),
  -- NexGain Bookings: appointments that have happened (or were marked Completed),
  -- dated by the appointment in the business's own time zone. Prices include GST.
  -- Only booking businesses have bookings, so this adds nothing for anyone else.
  booked(kind, source, ref_id, day, description, amount, gst, note) as (
    select 'sale'::text, 'booking'::text, k.id, (k.starts_at at time zone z.timezone)::date,
      k.service_name || ' · ' || k.customer_name, k.price, round(k.price / 11, 2), ''::text
    from public.bookings k, bounds b, public.businesses z
    where k.business_id = bid and z.id = bid and k.price > 0
      and (k.status = 'completed' or (k.status = 'confirmed' and k.ends_at <= now()))
      and (k.starts_at at time zone z.timezone)::date >= b.s
      and (k.starts_at at time zone z.timezone)::date < b.e
  ),
  -- NexGain Retail: sales (and returns, as negatives) in the quarter, dated in the
  -- business's own time zone, with the GST worked out when each was made.
  -- Only retail businesses have sales, so this adds nothing for anyone else.
  sold(kind, source, ref_id, day, description, amount, gst, note) as (
    select 'sale'::text, 'sale'::text, sl.id, (sl.sold_at at time zone z.timezone)::date,
      case when sl.quantity < 0 then 'Return · ' else '' end || sl.item_name || ' × ' || abs(sl.quantity),
      sl.total, sl.gst, ''::text
    from public.sales sl, bounds b, public.businesses z
    where sl.business_id = bid and z.id = bid and sl.gst <> 0
      and (sl.sold_at at time zone z.timezone)::date >= b.s
      and (sl.sold_at at time zone z.timezone)::date < b.e
  )
  select * from sales
  union all select r.* from receipts r, bounds b where r.day >= b.s and r.day < b.e
  union all select * from bank
  union all select * from typed
  union all select * from booked
  union all select * from sold;
$$;
