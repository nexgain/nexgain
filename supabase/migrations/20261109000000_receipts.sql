-- =====================================================================
-- NexGain: receipts
--   - receipts: a photo or PDF of a receipt, what the AI read from it
--     (supplier, ABN, date, total, GST, line items, category) and the
--     transaction it belongs to: a bank transaction, or an expense the owner
--     typed in.
--   The files live in the private "business-files" storage bucket under
--   <business id>/receipts/..., which only the business owner can open.
--
-- Matching: NexGain links a receipt to the bank transaction with the same
-- amount and a close date (match_status "matched"). When more than one could
-- fit, it saves the best few (match_status "suggested") for the owner to pick.
-- When none fit yet (e.g. the bank hasn't sent it), it stays "unmatched" and
-- NexGain tries again each time new bank transactions come in.
--
-- Run once, after the earlier files:
--   Supabase > SQL Editor > New query > paste this whole file > Run.
-- Safe to run again.
-- =====================================================================

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  file_path text not null,
  file_type text not null default 'image' check (file_type in ('image', 'pdf')),
  -- reading: the AI is reading it. ready: read. failed: couldn't be read (the owner can type the details).
  status text not null default 'reading' check (status in ('reading', 'ready', 'failed')),
  supplier text,
  abn text,
  receipt_date date,
  total numeric(14, 2),
  gst numeric(14, 2),
  -- [{ "description": "...", "quantity": 2, "amount": 12.50 }]
  line_items jsonb not null default '[]',
  category text,
  bank_transaction_id uuid references public.bank_transactions (id) on delete set null,
  expense_id uuid references public.expenses (id) on delete set null,
  match_status text not null default 'unmatched' check (match_status in ('unmatched', 'suggested', 'matched')),
  -- auto: matched by NexGain. owner: picked by the owner (never changed by NexGain).
  matched_by text check (matched_by in ('auto', 'owner')),
  -- Bank transactions that might be this receipt, best first (when match_status is "suggested").
  suggestions uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists receipts_business_idx on public.receipts (business_id, created_at desc);
create index if not exists receipts_bank_transaction_idx on public.receipts (bank_transaction_id);
create index if not exists receipts_expense_idx on public.receipts (expense_id);

-- Checks a receipt is only linked to the same business's transactions, and
-- puts it back in the Unmatched list when its linked transaction disappears
-- (bank disconnected, expense deleted) instead of losing it.
create or replace function public.receipts_keep_match_status()
returns trigger
language plpgsql
as $$
begin
  if new.bank_transaction_id is not null and new.bank_transaction_id is distinct from old.bank_transaction_id
     and not exists (select 1 from public.bank_transactions t where t.id = new.bank_transaction_id and t.business_id = new.business_id) then
    raise exception 'That transaction belongs to another business.';
  end if;
  if new.expense_id is not null and new.expense_id is distinct from old.expense_id
     and not exists (select 1 from public.expenses e where e.id = new.expense_id and e.business_id = new.business_id) then
    raise exception 'That expense belongs to another business.';
  end if;
  if new.bank_transaction_id is null and new.expense_id is null and new.match_status = 'matched' then
    new.match_status := 'unmatched';
    new.matched_by := null;
  end if;
  return new;
end;
$$;

drop trigger if exists receipts_keep_match_status on public.receipts;
create trigger receipts_keep_match_status
  before insert or update on public.receipts
  for each row execute function public.receipts_keep_match_status();

alter table public.receipts enable row level security;
drop policy if exists "owner manages receipts" on public.receipts;
create policy "owner manages receipts" on public.receipts for all to authenticated
  using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));
