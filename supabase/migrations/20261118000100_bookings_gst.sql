-- NexGain Bookings: GST collected on bookings. The GST page, the dashboard tile
-- and the GST reminders all use private.gst_items, so this is the same function
-- as in 20261112000000_gst.sql with one more part ("booked"): appointments that
-- have happened, at 1/11 of the price (GST-inclusive), dated by the appointment.
-- Service (System 1) businesses have no bookings, so their GST is unchanged.
-- Safe to run again.

create or replace function private.gst_items(bid uuid, q date)
returns table (
  kind text,        -- 'sale' (GST collected) or 'expense' (GST credit)
  source text,      -- 'invoice', 'receipt', 'bank', 'expense', 'booking'
  ref_id uuid,
  day date,
  description text,
  amount numeric,   -- the full amount (incl. GST)
  gst numeric,      -- the GST counted (0 when not claimable yet)
  note text         -- '', 'estimated' or 'needs receipt'
)
language sql stable set search_path = '' as $$
  with bounds as (select q as s, (q + interval '3 months')::date as e),
  no_gst as (select unnest(array['Income', 'Transfers', 'Wages & super', 'Tax', 'Bank fees']) as category),
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
  )
  select * from sales
  union all select r.* from receipts r, bounds b where r.day >= b.s and r.day < b.e
  union all select * from bank
  union all select * from typed
  union all select * from booked;
$$;
