-- =====================================================================
-- NexGain: GST for Australian GST-registered businesses.
--
--   sales_docs.gst_amount   the GST dollar amount on every quote and invoice,
--                           kept up to date automatically (so it can be added up).
--   gst_quarter_items()     THE GST maths, used by the GST page, the dashboard
--                           tile and the reminders (so they always agree):
--                             - GST collected: GST on invoices PAID in the
--                               quarter (cash basis).
--                             - GST credits: GST printed on receipts; for
--                               purchases without a receipt, an estimate of
--                               1/11 when $82.50 or less (no tax invoice is
--                               needed under that). Over $82.50 without a
--                               receipt: listed as "needs receipt", not counted.
--                               Wages, tax, transfers, income and bank fees
--                               have no GST and are left out.
--   gst_quarters            quarters the owner has marked "Lodged / Paid".
--   gst_reminders           which reminders were sent (never twice).
--   send_gst_reminders()    run every morning by the timer: adds an in-app
--                           notification 2 weeks before a quarter ends and 2
--                           weeks before its BAS is due, unless marked lodged.
--
-- Australian quarters: Jul-Sep (BAS due 28 Oct), Oct-Dec (28 Feb),
-- Jan-Mar (28 Apr), Apr-Jun (28 Jul).
--
-- Run once: Supabase > SQL Editor > New query > paste this whole file > Run.
-- Safe to run again.
-- =====================================================================

-- ---------------------------------------------------------------------
-- GST amount on each quote / invoice
-- ---------------------------------------------------------------------

-- Same as the app's docTotals(): each line rounded to cents, then GST on the subtotal.
create or replace function private.doc_gst(items jsonb, rate numeric)
returns numeric language sql immutable set search_path = '' as $$
  select round(
    coalesce((
      -- Anything that isn't a number counts as 0, so saving a quote can never fail here.
      select round(sum(round(
        (case when i ->> 'qty' ~ '^-?[0-9]+([.][0-9]+)?$' then (i ->> 'qty')::numeric else 0 end) *
        (case when i ->> 'rate' ~ '^-?[0-9]+([.][0-9]+)?$' then (i ->> 'rate')::numeric else 0 end), 2)), 2)
      from jsonb_array_elements(coalesce(items, '[]'::jsonb)) i
    ), 0) * coalesce(rate, 0), 2);
$$;

alter table public.sales_docs add column if not exists gst_amount numeric(12, 2) not null default 0;

create or replace function private.set_doc_gst()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.gst_amount := private.doc_gst(new.items, new.gst_rate);
  return new;
end;
$$;
drop trigger if exists sales_docs_gst on public.sales_docs;
create trigger sales_docs_gst before insert or update of items, gst_rate on public.sales_docs
  for each row execute function private.set_doc_gst();

-- Fill it in for quotes and invoices made before today.
update public.sales_docs set gst_amount = private.doc_gst(items, gst_rate)
where gst_amount is distinct from private.doc_gst(items, gst_rate);

-- ---------------------------------------------------------------------
-- Quarters
-- ---------------------------------------------------------------------

create or replace function private.today_au()
returns date language sql stable set search_path = '' as $$
  select (now() at time zone 'Australia/Brisbane')::date;
$$;

/** The 28th of the month after the quarter ends; Oct-Dec is due 28 Feb. */
create or replace function private.bas_due(q date)
returns date language sql immutable set search_path = '' as $$
  select case when extract(month from q) = 10
    then make_date(extract(year from q)::int + 1, 2, 28)
    else (q + interval '3 months')::date + 27 end;
$$;

create table if not exists public.gst_quarters (
  business_id uuid not null references public.businesses (id) on delete cascade,
  quarter_start date not null,
  lodged_at timestamptz,
  primary key (business_id, quarter_start)
);
alter table public.gst_quarters enable row level security;
drop policy if exists "owner reads gst quarters" on public.gst_quarters;
create policy "owner reads gst quarters" on public.gst_quarters for select to authenticated
  using (public.is_business_owner(business_id));
revoke all on public.gst_quarters from anon;
revoke insert, update, delete on public.gst_quarters from authenticated;

create table if not exists public.gst_reminders (
  business_id uuid not null references public.businesses (id) on delete cascade,
  quarter_start date not null,
  kind text not null check (kind in ('quarter_end', 'bas_due')),
  sent_at timestamptz not null default now(),
  primary key (business_id, quarter_start, kind)
);
alter table public.gst_reminders enable row level security;
revoke all on public.gst_reminders from anon, authenticated;

-- ---------------------------------------------------------------------
-- THE GST maths: every sale and expense that makes up a quarter
-- ---------------------------------------------------------------------

create or replace function private.gst_items(bid uuid, q date)
returns table (
  kind text,        -- 'sale' (GST collected) or 'expense' (GST credit)
  source text,      -- 'invoice', 'receipt', 'bank', 'expense'
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
  )
  select * from sales
  union all select r.* from receipts r, bounds b where r.day >= b.s and r.day < b.e
  union all select * from bank
  union all select * from typed;
$$;

-- The owner's quarter, for the GST page and dashboard tile. q = any day in the quarter.
create or replace function public.gst_quarter_items(p_quarter date)
returns table (kind text, source text, ref_id uuid, day date, description text, amount numeric, gst numeric, note text)
language plpgsql stable security definer set search_path = '' as $$
declare
  bid uuid := (select id from public.businesses where owner_id = auth.uid());
begin
  if bid is null then raise exception 'Only the business owner can see GST.'; end if;
  return query select * from private.gst_items(bid, date_trunc('quarter', p_quarter)::date);
end;
$$;

-- Lodged / Paid (or undo it).
create or replace function public.mark_gst_quarter(p_quarter date, p_lodged boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  bid uuid := (select id from public.businesses where owner_id = auth.uid());
  q date := date_trunc('quarter', p_quarter)::date;
begin
  if bid is null then raise exception 'Only the business owner can do this.'; end if;
  insert into public.gst_quarters (business_id, quarter_start, lodged_at)
  values (bid, q, case when p_lodged then now() end)
  on conflict (business_id, quarter_start) do update set lodged_at = excluded.lodged_at;
end;
$$;

revoke execute on function public.gst_quarter_items(date) from public, anon;
revoke execute on function public.mark_gst_quarter(date, boolean) from public, anon;
grant execute on function public.gst_quarter_items(date) to authenticated;
grant execute on function public.mark_gst_quarter(date, boolean) to authenticated;
revoke all on function private.gst_items(uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Reminders (in-app notifications), every morning
-- ---------------------------------------------------------------------

create or replace function private.money(x numeric)
returns text language sql immutable set search_path = '' as $$
  select '$' || to_char(coalesce(x, 0), 'FM999,999,990.00');
$$;

create or replace function private.gst_to_pay(bid uuid, q date)
returns numeric language sql stable set search_path = '' as $$
  select coalesce(sum(case when kind = 'sale' then gst else -gst end), 0) from private.gst_items(bid, q);
$$;

create or replace function private.send_gst_reminders()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  today date := private.today_au();
  this_q date := date_trunc('quarter', today)::date;
  last_q date := (date_trunc('quarter', today) - interval '3 months')::date;
  b record;
  due date;
  sent integer := 0;
begin
  for b in
    select id, owner_id from public.businesses
    where gst_registered and (country is null or country = 'AU')
  loop
    -- 1. Two weeks before this quarter ends.
    if today >= (this_q + interval '3 months')::date - 14
      and not exists (select 1 from public.gst_quarters g where g.business_id = b.id and g.quarter_start = this_q and g.lodged_at is not null)
      and not exists (select 1 from public.gst_reminders r where r.business_id = b.id and r.quarter_start = this_q and r.kind = 'quarter_end')
    then
      insert into public.gst_reminders (business_id, quarter_start, kind) values (b.id, this_q, 'quarter_end');
      insert into public.notifications (business_id, recipient_id, audience, type, title, summary)
      values (b.id, b.owner_id, 'owner', 'gst_reminder', 'GST quarter ends in 2 weeks',
        'Your GST quarter ends in 2 weeks. Estimated GST so far: ' || private.money(private.gst_to_pay(b.id, this_q)) || '.');
      sent := sent + 1;
    end if;

    -- 2. Two weeks before the last quarter's BAS is due.
    due := private.bas_due(last_q);
    if today >= due - 14 and today <= due
      and not exists (select 1 from public.gst_quarters g where g.business_id = b.id and g.quarter_start = last_q and g.lodged_at is not null)
      and not exists (select 1 from public.gst_reminders r where r.business_id = b.id and r.quarter_start = last_q and r.kind = 'bas_due')
    then
      insert into public.gst_reminders (business_id, quarter_start, kind) values (b.id, last_q, 'bas_due');
      insert into public.notifications (business_id, recipient_id, audience, type, title, summary)
      values (b.id, b.owner_id, 'owner', 'gst_reminder', 'BAS due ' || to_char(due, 'FMDD Mon'),
        'Your BAS is due on ' || to_char(due, 'FMDD Mon') || '. Estimated GST to pay: ' || private.money(private.gst_to_pay(b.id, last_q)) || '.');
      sent := sent + 1;
    end if;
  end loop;
  return sent;
end;
$$;
revoke all on function private.send_gst_reminders() from public, anon, authenticated;

-- Every day at 9:00 am Brisbane time (23:00 UTC). Runs inside the database,
-- so it works with the app closed and needs no password.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'gst-reminders') then
    perform cron.unschedule('gst-reminders');
  end if;
  perform cron.schedule('gst-reminders', '0 23 * * *', 'select private.send_gst_reminders()');
end;
$$;
