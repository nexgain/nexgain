-- =====================================================================
-- NexGain Hospitality (System 4): invoices for catering, functions and
-- business customers, matching payments to them, and GST on recorded sales.
--
--   * Hospitality invoices live in the same table as System 1's invoices
--     (sales_docs), with a few extra columns that only hospitality uses:
--     a deposit, whether it's been paid, and how the invoice was paid.
--     Every column is optional, so System 1 invoices are unchanged.
--     "Cancelled" is a new invoice status (status is free text).
--   * hospitality_match_payment(): the owner says "yes, this payment is for
--     INV-0004" (or its deposit). The invoice is marked paid and the bank
--     payment is linked to it, filed as "Catering & functions", so the money
--     is never counted twice. NexGain never does this without the owner.
--   * Overdue invoices: every morning the owner gets ONE notification per
--     invoice that went past its due date. The customer is never emailed
--     automatically: the owner presses "Send reminder email" in the app.
--   * GST: sales recorded in NexGain Hospitality (Record sale, End of day)
--     now count as GST collected (1/11 of the GST-inclusive price), as
--     NexGain Bookings and NexGain Retail sales already do.
--
-- Doesn't change which business types are allowed (businesses_system_type_check).
--
-- Run once, after 20261128000000_hospitality.sql:
--   Supabase > SQL Editor > New query > paste this whole file > Run.
-- Safe to run again.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Invoice columns (NexGain Hospitality only; empty for everyone else)
-- ---------------------------------------------------------------------
alter table public.sales_docs add column if not exists deposit numeric(12, 2);
alter table public.sales_docs add column if not exists deposit_paid boolean not null default false;
alter table public.sales_docs add column if not exists deposit_paid_at timestamptz;
alter table public.sales_docs add column if not exists paid_method text;
alter table public.sales_docs add column if not exists overdue_notified_at timestamptz;

-- Which part of an invoice a bank payment paid: 'full' or 'deposit' (NexGain Hospitality).
alter table public.bank_transactions add column if not exists invoice_part text;
alter table public.bank_transactions drop constraint if exists bank_transactions_invoice_part_check;
alter table public.bank_transactions add constraint bank_transactions_invoice_part_check
  check (invoice_part is null or invoice_part in ('full', 'deposit'));

alter table public.sales_docs drop constraint if exists sales_docs_deposit_check;
alter table public.sales_docs add constraint sales_docs_deposit_check check (deposit is null or deposit >= 0);
alter table public.sales_docs drop constraint if exists sales_docs_paid_method_check;
alter table public.sales_docs add constraint sales_docs_paid_method_check
  check (paid_method is null or paid_method in ('Bank transfer', 'Card', 'Cash', 'Other'));

-- Marking an invoice unpaid again (or cancelling it) clears when it was
-- "noticed overdue", so a new due date gets its own reminder.
create or replace function private.sales_docs_overdue_reset()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.due_date is distinct from old.due_date or (new.status in ('Pending', 'Draft') and old.status in ('Paid', 'Cancelled')) then
    new.overdue_notified_at := null;
  end if;
  return new;
end;
$$;
drop trigger if exists sales_docs_overdue_reset on public.sales_docs;
create trigger sales_docs_overdue_reset before update on public.sales_docs
  for each row execute function private.sales_docs_overdue_reset();

-- ---------------------------------------------------------------------
-- "Yes, this payment is for that invoice" (the owner always confirms)
-- ---------------------------------------------------------------------
-- p_part: 'full' (marks the invoice Paid) or 'deposit' (marks its deposit paid).
create or replace function public.hospitality_match_payment(p_transaction uuid, p_invoice uuid, p_part text default 'full')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t public.bank_transactions;
  d public.sales_docs;
  paid_moment timestamptz;
begin
  if p_part not in ('full', 'deposit') then raise exception 'Unknown payment part.'; end if;
  select * into t from public.bank_transactions where id = p_transaction and public.is_business_owner(business_id);
  if t.id is null then raise exception 'Not allowed.'; end if;
  if t.amount <= 0 then raise exception 'Only money coming in can pay an invoice.'; end if;
  if t.invoice_id is not null then raise exception 'This payment is already linked to an invoice.'; end if;
  if not exists (select 1 from public.businesses b where b.id = t.business_id and b.system_type = 'hospitality') then
    raise exception 'Only NexGain Hospitality uses this.';
  end if;
  select * into d from public.sales_docs where id = p_invoice and business_id = t.business_id and kind = 'invoice';
  if d.id is null then raise exception 'That invoice wasn''t found.'; end if;
  if d.status in ('Paid', 'Cancelled') then raise exception 'That invoice is already %.', lower(d.status); end if;
  if p_part = 'deposit' and d.deposit_paid then raise exception 'That deposit is already paid.'; end if;

  -- The bank's date, at midday in the business's time zone.
  select (t.date::timestamp + interval '12 hours') at time zone coalesce(nullif(b.timezone, ''), 'Australia/Brisbane')
    into paid_moment from public.businesses b where b.id = t.business_id;

  update public.bank_transactions set
    invoice_id = d.id,
    invoice_matched_by = 'owner',
    invoice_prev_status = d.status,
    invoice_review_done = true,
    invoice_part = p_part,
    category = 'Catering & functions',
    category_source = 'owner',
    category_method = 'owner',
    confidence = 1,
    category_review_done = true
  where id = t.id;

  if p_part = 'full' then
    update public.sales_docs set status = 'Paid', paid_at = paid_moment, paid_method = 'Bank transfer', receipt_status = 'not_sent'
    where id = d.id;
  else
    update public.sales_docs set deposit_paid = true, deposit_paid_at = paid_moment where id = d.id;
  end if;
  return jsonb_build_object('invoice', d.id, 'part', p_part, 'paid_at', paid_moment);
end;
$$;

-- Undo: the payment is unlinked and the invoice goes back to how it was.
create or replace function public.hospitality_undo_payment(p_transaction uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  t public.bank_transactions;
  d public.sales_docs;
begin
  select * into t from public.bank_transactions where id = p_transaction and public.is_business_owner(business_id);
  if t.id is null then raise exception 'Not allowed.'; end if;
  if t.invoice_id is null then return; end if;
  select * into d from public.sales_docs where id = t.invoice_id;
  if d.id is not null then
    if coalesce(t.invoice_part, 'full') = 'deposit' then
      update public.sales_docs set deposit_paid = false, deposit_paid_at = null where id = d.id;
    elsif d.status = 'Paid' then
      update public.sales_docs set status = coalesce(nullif(t.invoice_prev_status, 'Paid'), 'Pending'), paid_at = null, paid_method = null, receipt_status = null
      where id = d.id;
    end if;
  end if;
  update public.bank_transactions set invoice_id = null, invoice_matched_by = null, invoice_prev_status = null, invoice_part = null, invoice_review_done = false
  where id = t.id;
end;
$$;

revoke execute on function public.hospitality_match_payment(uuid, uuid, text) from public, anon;
revoke execute on function public.hospitality_undo_payment(uuid) from public, anon;
grant execute on function public.hospitality_match_payment(uuid, uuid, text) to authenticated;
grant execute on function public.hospitality_undo_payment(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Overdue invoices: one notification each, every morning (NexGain Hospitality)
-- ---------------------------------------------------------------------
create or replace function private.notify_hospitality_overdue()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  d record;
  sent integer := 0;
  owing numeric;
begin
  for d in
    select s.id, s.business_id, s.number, s.client, s.due_date, s.deposit, s.deposit_paid,
      private.doc_gst(s.items, 1) + s.gst_amount as total, b.owner_id
    from public.sales_docs s
    join public.businesses b on b.id = s.business_id and b.system_type = 'hospitality'
    where s.kind = 'invoice' and s.status in ('Pending', 'Overdue') and s.due_date is not null
      and s.due_date < (now() at time zone coalesce(nullif(b.timezone, ''), 'Australia/Brisbane'))::date
      and s.overdue_notified_at is null
  loop
    owing := d.total - case when d.deposit_paid then coalesce(d.deposit, 0) else 0 end;
    insert into public.notifications (business_id, recipient_id, audience, type, title, summary, body, related_doc_id)
    values (d.business_id, d.owner_id, 'owner', 'invoice_overdue',
      'Invoice ' || d.number || ' is overdue',
      coalesce(nullif(d.client ->> 'name', ''), 'The customer') || ' owes ' || private.money(owing) || ', due ' || to_char(d.due_date, 'FMDD Mon') || '.',
      'Invoice ' || d.number || ' for ' || coalesce(nullif(d.client ->> 'name', ''), 'your customer') || ' was due on ' || to_char(d.due_date, 'FMDD Mon YYYY')
        || ' and hasn''t been paid yet. Open it to send a reminder email (NexGain never emails your customer without you), or mark it as paid.',
      d.id);
    update public.sales_docs set overdue_notified_at = now() where id = d.id;
    sent := sent + 1;
  end loop;
  return sent;
end;
$$;
revoke all on function private.notify_hospitality_overdue() from public, anon, authenticated;

-- Every day at 8:00 am Brisbane time (22:00 UTC). Runs inside the database,
-- so it works with the app closed and needs no password.
create extension if not exists pg_cron with schema pg_catalog;
do $$
begin
  if exists (select 1 from cron.job where jobname = 'hospitality-overdue-invoices') then
    perform cron.unschedule('hospitality-overdue-invoices');
  end if;
  perform cron.schedule('hospitality-overdue-invoices', '0 22 * * *', 'select private.notify_hospitality_overdue()');
end;
$$;

-- ---------------------------------------------------------------------
-- GST: everything as before (from 20261127000500_retail_sales.sql), plus
-- NexGain Hospitality's recorded sales.
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
  ),
  -- NexGain Hospitality: sales recorded in the app (Record sale, End of day),
  -- dated in the business's own time zone. Menu prices include GST, so the
  -- GST is 1/11 of each sale. Only GST-registered hospitality businesses, so
  -- this adds nothing for anyone else. (Invoices are counted above, once.)
  menu(kind, source, ref_id, day, description, amount, gst, note) as (
    select 'sale'::text, 'sale'::text, ms.id, (ms.sold_at at time zone z.timezone)::date,
      case ms.source when 'day' then 'End of day sales' when 'import' then 'Imported sales' else 'Sale' end
        || coalesce(' · ' || nullif(ms.note, ''), ''),
      ms.total, round(ms.total / 11, 2), ''::text
    from public.menu_sales ms, bounds b, public.businesses z
    where ms.business_id = bid and z.id = bid and z.system_type = 'hospitality' and z.gst_registered and ms.total > 0
      and (ms.sold_at at time zone z.timezone)::date >= b.s
      and (ms.sold_at at time zone z.timezone)::date < b.e
  )
  select * from sales
  union all select r.* from receipts r, bounds b where r.day >= b.s and r.day < b.e
  union all select * from bank
  union all select * from typed
  union all select * from booked
  union all select * from sold
  union all select * from menu;
$$;
revoke all on function private.gst_items(uuid, date) from public, anon, authenticated;
