-- =====================================================================
-- NexGain: AI sorting for bank transactions.
--   - each transaction gets: direction (in/out), a confidence score, how it was
--     sorted (rule / learned / ai / owner), an optional linked job and an
--     optional linked invoice
--   - merchant_category_rules: the owner's category choices, remembered per
--     merchant so future transactions from them are sorted the same way
--   - businesses.link_expenses_to_jobs: the "Link expenses to jobs" setting (off)
--   - match_payment_to_invoice / undo_payment_match: money coming in is linked
--     to an unpaid invoice, which is marked Paid (and the owner is told)
-- Run once, after the bank transactions file (20261108000000_bank_transactions.sql):
--   Supabase > SQL Editor > New query > paste this whole file > Run.
-- Safe to run again.
-- =====================================================================

alter table public.bank_transactions
  -- How sure NexGain is about the category (0 to 1). Low ones go to "Needs review".
  add column if not exists confidence numeric(3, 2),
  -- How it was sorted: rule (known merchant), learned (the owner's earlier choice
  -- for this merchant), ai (best guess), owner (chosen by the owner).
  add column if not exists category_method text,
  add column if not exists job_id uuid references public.jobs (id) on delete set null,
  add column if not exists invoice_id uuid references public.sales_docs (id) on delete set null,
  -- auto: matched by NexGain. owner: linked by the owner.
  add column if not exists invoice_matched_by text,
  -- The invoice's status before it was marked Paid (so a match can be undone).
  add column if not exists invoice_prev_status text,
  -- The owner has answered (or skipped) the "Needs review" question.
  add column if not exists category_review_done boolean not null default false,
  add column if not exists job_review_done boolean not null default false,
  add column if not exists invoice_review_done boolean not null default false;

do $$
begin
  alter table public.bank_transactions add column direction text
    generated always as (case when amount >= 0 then 'in' else 'out' end) stored;
exception when duplicate_column then null;
end;
$$;
do $$
begin
  alter table public.bank_transactions add constraint bank_transactions_method_check
    check (category_method is null or category_method in ('rule', 'learned', 'ai', 'owner'));
exception when duplicate_object then null;
end;
$$;
do $$
begin
  alter table public.bank_transactions add constraint bank_transactions_matched_by_check
    check (invoice_matched_by is null or invoice_matched_by in ('auto', 'owner'));
exception when duplicate_object then null;
end;
$$;
create index if not exists bank_transactions_invoice_idx on public.bank_transactions (invoice_id) where invoice_id is not null;

-- The owner can change the category, the linked job and their review answers.
-- (Invoice links only change through the functions below.)
grant update (category, category_source, confidence, category_method, job_id, category_review_done, job_review_done, invoice_review_done)
  on public.bank_transactions to authenticated;

-- ---------------------------------------------------------------------
-- Remembered choices: "<merchant>" is always "<category>".
-- ---------------------------------------------------------------------

create table if not exists public.merchant_category_rules (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- The merchant's name in lowercase, e.g. "bunnings".
  merchant_key text not null,
  category text not null,
  created_at timestamptz not null default now(),
  unique (business_id, merchant_key)
);
alter table public.merchant_category_rules enable row level security;
drop policy if exists "owner manages merchant rules" on public.merchant_category_rules;
create policy "owner manages merchant rules" on public.merchant_category_rules for all to authenticated
  using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));
revoke all on public.merchant_category_rules from anon;

-- ---------------------------------------------------------------------
-- The "Link expenses to jobs" setting (off by default).
-- ---------------------------------------------------------------------

alter table public.businesses add column if not exists link_expenses_to_jobs boolean not null default false;

-- ---------------------------------------------------------------------
-- Saving NexGain's sorting for many transactions at once.
-- p = [{"id": "...", "category": "Fuel", "confidence": 0.95, "method": "rule"}, ...]
-- Never changes a category the owner chose.
-- ---------------------------------------------------------------------

create or replace function public.set_transaction_sorting(p jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare
  bid uuid;
  changed int;
begin
  select id into bid from public.businesses where owner_id = auth.uid();
  if bid is null then raise exception 'Only the business owner can sort transactions.'; end if;
  update public.bank_transactions t set
    category = x.category,
    confidence = x.confidence,
    category_method = x.method
  from jsonb_to_recordset(p) as x(id uuid, category text, confidence numeric, method text)
  where t.id = x.id and t.business_id = bid and t.category_source = 'auto'
    and x.method in ('rule', 'learned', 'ai');
  get diagnostics changed = row_count;
  return changed;
end;
$$;

-- ---------------------------------------------------------------------
-- Money in -> invoice. Marks the invoice Paid (on the day the money came in),
-- links the transaction and tells the owner. p_auto: matched by NexGain.
-- ---------------------------------------------------------------------

create or replace function public.match_payment_to_invoice(p_transaction uuid, p_invoice uuid, p_auto boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t public.bank_transactions;
  d public.sales_docs;
  owner_user uuid;
begin
  select * into t from public.bank_transactions where id = p_transaction and public.is_business_owner(business_id);
  if t.id is null then raise exception 'Not allowed.'; end if;
  if t.amount <= 0 then raise exception 'Only money coming in can pay an invoice.'; end if;
  if t.invoice_id is not null then raise exception 'This payment is already linked to an invoice.'; end if;
  select * into d from public.sales_docs where id = p_invoice and business_id = t.business_id and kind = 'invoice';
  if d.id is null then raise exception 'That invoice wasn''t found.'; end if;
  if d.status = 'Paid' then raise exception 'That invoice is already paid.'; end if;

  update public.bank_transactions set
    invoice_id = d.id,
    invoice_matched_by = case when p_auto then 'auto' else 'owner' end,
    invoice_prev_status = d.status,
    invoice_review_done = true,
    category = 'Income',
    -- Marks it as looked at, so NexGain never auto-matches it again after an undo.
    category_method = coalesce(category_method, 'rule')
  where id = t.id;
  update public.sales_docs set status = 'Paid', paid_at = (t.date::timestamp + interval '12 hours') at time zone 'Australia/Brisbane',
    receipt_status = 'not_sent'
  where id = d.id;

  select owner_id into owner_user from public.businesses where id = t.business_id;
  insert into public.notifications (business_id, recipient_id, audience, type, title, summary, body, details, related_id, related_doc_id)
  values (t.business_id, owner_user, 'owner', 'payment_matched',
    'Invoice ' || d.number || ' marked as paid',
    '$' || to_char(t.amount, 'FM999,999,990.00') || ' came in on ' || to_char(t.date, 'DD Mon') || '. Tap to undo if it''s wrong.',
    case when p_auto then 'NexGain matched a payment of $' || to_char(t.amount, 'FM999,999,990.00') || ' (' || t.description || ') to invoice ' || d.number || ' and marked it as paid. If that''s wrong, open the transaction and tap Undo.'
      else 'You linked a payment of $' || to_char(t.amount, 'FM999,999,990.00') || ' to invoice ' || d.number || ', so it''s marked as paid.' end,
    jsonb_build_array(
      jsonb_build_object('label', 'Invoice', 'value', d.number),
      jsonb_build_object('label', 'Amount', 'value', '$' || to_char(t.amount, 'FM999,999,990.00')),
      jsonb_build_object('label', 'Paid on', 'value', to_char(t.date, 'DD Mon YYYY')),
      jsonb_build_object('label', 'Matched by', 'value', case when p_auto then 'NexGain (automatic)' else 'You' end)
    ),
    t.id, d.id);

  return jsonb_build_object('invoice_id', d.id, 'number', d.number);
end;
$$;

-- Undo: the invoice goes back to how it was and the payment is unlinked.
create or replace function public.undo_payment_match(p_transaction uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  t public.bank_transactions;
begin
  select * into t from public.bank_transactions where id = p_transaction and public.is_business_owner(business_id);
  if t.id is null then raise exception 'Not allowed.'; end if;
  if t.invoice_id is null then return; end if;
  update public.sales_docs set status = coalesce(t.invoice_prev_status, 'Pending'), paid_at = null, receipt_status = null
  where id = t.invoice_id and status = 'Paid';
  -- Back to the "Needs review" list, so it isn't matched again automatically.
  update public.bank_transactions set invoice_id = null, invoice_matched_by = null, invoice_prev_status = null,
    invoice_review_done = false
  where id = t.id;
end;
$$;

revoke execute on function public.set_transaction_sorting(jsonb) from public, anon;
revoke execute on function public.match_payment_to_invoice(uuid, uuid, boolean) from public, anon;
revoke execute on function public.undo_payment_match(uuid) from public, anon;
grant execute on function public.set_transaction_sorting(jsonb) to authenticated;
grant execute on function public.match_payment_to_invoice(uuid, uuid, boolean) to authenticated;
grant execute on function public.undo_payment_match(uuid) to authenticated;
