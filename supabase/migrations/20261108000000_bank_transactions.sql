-- =====================================================================
-- NexGain: bank connection and transactions (Basiq for Australia; built so
-- Salt Edge can be added later for overseas banks).
--   - bank_connections: one per business. Which bank-data company is used
--     (Basiq...) and our customer id with them. The app can't read this table
--     directly, only the safe view my_bank_connection.
--   - bank_accounts: the linked bank accounts (name, bank, masked number, balance).
--   - bank_transactions: money in and out of those accounts, with a NexGain
--     category (Fuel, Materials & supplies...). The owner can change the category.
-- Accounts and transactions are saved by the Edge Functions (bank-sync); the
-- owner can only read them (and change a transaction's category).
-- Disconnecting the bank removes its accounts and transactions from NexGain.
--
-- Run once, after the earlier files:
--   Supabase > SQL Editor > New query > paste this whole file > Run.
-- Safe to run again.
-- =====================================================================

create table if not exists public.bank_connections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses (id) on delete cascade,
  provider text not null check (provider in ('basiq', 'saltedge')),
  -- Our customer id at the bank-data company (Basiq user id).
  external_user_id text not null,
  -- pending: created, bank login not finished yet. active: connected.
  status text not null default 'pending' check (status in ('pending', 'active')),
  -- Bank-data jobs still fetching the first lot of data after a login.
  pending_job_ids text[] not null default '{}',
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.bank_connections enable row level security;
revoke all on public.bank_connections from anon, authenticated;

-- The safe view the app reads: no customer ids, only the signed-in owner's business.
drop view if exists public.my_bank_connection;
create view public.my_bank_connection as
  select provider, status, last_synced_at, created_at
  from public.bank_connections
  where public.is_business_owner(business_id);

revoke all on public.my_bank_connection from anon, authenticated;
grant select on public.my_bank_connection to authenticated;

create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  connection_id uuid not null references public.bank_connections (id) on delete cascade,
  external_id text not null,
  name text not null default '',
  institution text not null default '',
  -- Last few digits only, e.g. "•••• 4321".
  masked_number text not null default '',
  balance numeric(14, 2),
  currency text not null default 'AUD',
  updated_at timestamptz not null default now(),
  unique (connection_id, external_id)
);
create index if not exists bank_accounts_business_idx on public.bank_accounts (business_id);

create table if not exists public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  account_id uuid not null references public.bank_accounts (id) on delete cascade,
  external_id text not null,
  date date not null,
  description text not null default '',
  -- Money in is positive, money out is negative.
  amount numeric(14, 2) not null,
  merchant text,
  -- What the bank / Basiq called it (kept to help improve categories later).
  bank_category text,
  -- NexGain's category: Fuel, Materials & supplies... or Income, Transfers.
  category text not null default 'Other',
  -- auto: worked out by NexGain. owner: chosen by the owner (never overwritten).
  category_source text not null default 'auto' check (category_source in ('auto', 'owner')),
  created_at timestamptz not null default now(),
  unique (account_id, external_id)
);
create index if not exists bank_transactions_business_date_idx on public.bank_transactions (business_id, date desc);

alter table public.bank_accounts enable row level security;
alter table public.bank_transactions enable row level security;

revoke all on public.bank_accounts from anon, authenticated;
revoke all on public.bank_transactions from anon, authenticated;
grant select on public.bank_accounts to authenticated;
grant select on public.bank_transactions to authenticated;
-- The owner can only change a transaction's category.
grant update (category, category_source) on public.bank_transactions to authenticated;

drop policy if exists "owner reads bank accounts" on public.bank_accounts;
create policy "owner reads bank accounts" on public.bank_accounts for select to authenticated
  using (public.is_business_owner(business_id));

drop policy if exists "owner reads bank transactions" on public.bank_transactions;
create policy "owner reads bank transactions" on public.bank_transactions for select to authenticated
  using (public.is_business_owner(business_id));

drop policy if exists "owner sets transaction category" on public.bank_transactions;
create policy "owner sets transaction category" on public.bank_transactions for update to authenticated
  using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));
