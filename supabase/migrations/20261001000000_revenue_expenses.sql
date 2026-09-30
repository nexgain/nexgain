-- =====================================================================
-- NexGain: invoices saved online, and business expenses
-- Run once, after the earlier files:
--   Supabase > SQL Editor > New query > paste this whole file > Run.
-- Safe to run again.
--
-- Revenue = invoices marked Paid. Expenses = approved payroll (payslips table)
-- plus expenses the owner enters here. Only the business owner can see any of it.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Invoices & quotes (previously only kept on the phone)
-- ---------------------------------------------------------------------

create table if not exists public.sales_docs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind text not null check (kind in ('invoice', 'quote')),
  number text not null,
  status text not null,
  client jsonb not null default '{}',
  job_type text,
  job_date date,
  description text not null default '',
  -- Line items: [{id, description, qty, rate}]
  items jsonb not null default '[]',
  due_date date,
  payment_reference text not null default '',
  gst_rate numeric(5, 4) not null default 0.1,
  paid_at timestamptz,
  receipt_status text check (receipt_status in ('not_sent', 'sent')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sales_docs_business_idx on public.sales_docs (business_id, created_at desc);
create index if not exists sales_docs_paid_idx on public.sales_docs (business_id, paid_at) where paid_at is not null;

alter table public.sales_docs enable row level security;
drop policy if exists "owner manages invoices" on public.sales_docs;
create policy "owner manages invoices" on public.sales_docs for all to authenticated
  using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));

-- ---------------------------------------------------------------------
-- Expenses the owner records (fuel, materials, rent...)
-- ---------------------------------------------------------------------

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  date date not null default current_date,
  amount numeric(12, 2) not null check (amount > 0),
  category text not null,
  description text not null default '',
  receipt_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists expenses_business_date_idx on public.expenses (business_id, date desc);

alter table public.expenses enable row level security;
drop policy if exists "owner manages expenses" on public.expenses;
create policy "owner manages expenses" on public.expenses for all to authenticated
  using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));

-- ---------------------------------------------------------------------
-- Private storage for receipt photos: <business id>/receipts/<file>
-- Only the business owner can upload, open or delete them.
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('business-files', 'business-files', false)
on conflict (id) do nothing;

-- (Uses owns_business_folder() from stage4.sql: inside a lookup on businesses,
-- a plain "name" would mean the business's name instead of the file path.)
drop policy if exists "owner reads business files" on storage.objects;
create policy "owner reads business files" on storage.objects for select to authenticated
  using (bucket_id = 'business-files' and public.owns_business_folder((storage.foldername(name))[1]));
drop policy if exists "owner uploads business files" on storage.objects;
create policy "owner uploads business files" on storage.objects for insert to authenticated
  with check (bucket_id = 'business-files' and public.owns_business_folder((storage.foldername(name))[1]));
drop policy if exists "owner deletes business files" on storage.objects;
create policy "owner deletes business files" on storage.objects for delete to authenticated
  using (bucket_id = 'business-files' and public.owns_business_folder((storage.foldername(name))[1]));
