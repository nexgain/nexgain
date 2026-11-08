-- =====================================================================
-- NexGain: real account connections (Gmail and Outlook to start with)
--   - connected_accounts: the owner's connected email accounts. Login tokens
--     are encrypted by the Edge Functions before they're saved, and the app
--     can never read this table. Owners see only a safe view of their own
--     rows (provider, email address, when it was connected).
--   - oauth_states: one-time codes that link a Google / Microsoft login back
--     to the business that started it. Expire after 10 minutes.
-- Only the Edge Functions (service role) can read or change either table.
-- Run once, after the earlier files:
--   Supabase > SQL Editor > New query > paste this whole file > Run.
-- Safe to run again.
-- =====================================================================

create table if not exists public.connected_accounts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  provider text not null check (provider in ('google', 'microsoft')),
  account_email text not null,
  -- Encrypted with TOKEN_ENCRYPTION_KEY (AES-GCM) by the Edge Functions.
  refresh_token_encrypted text not null,
  access_token_encrypted text,
  access_token_expires_at timestamptz,
  connected_at timestamptz not null default now(),
  -- One connection per provider per business; connecting again replaces it.
  unique (business_id, provider)
);

create table if not exists public.oauth_states (
  state text primary key,
  business_id uuid not null references public.businesses (id) on delete cascade,
  provider text not null,
  -- PKCE secret sent with the login code, so a stolen code is useless on its own.
  code_verifier text not null,
  -- Where to send the owner back to in the app (checked by oauth-start).
  app_redirect text not null,
  expires_at timestamptz not null default now() + interval '10 minutes'
);

-- Row level security on, with no policies: the app (anon / signed-in users)
-- can't read or change a single row. The service role skips these rules.
alter table public.connected_accounts enable row level security;
alter table public.oauth_states enable row level security;
revoke all on public.connected_accounts from anon, authenticated;
revoke all on public.oauth_states from anon, authenticated;

-- The safe view the app reads: no tokens, and only the signed-in owner's own
-- business. (A view runs as its owner, so it can read the locked table, and the
-- where clause limits it to the owner's rows.)
drop view if exists public.my_connected_accounts;
create view public.my_connected_accounts as
  select provider, account_email, connected_at
  from public.connected_accounts
  where public.is_business_owner(business_id);

revoke all on public.my_connected_accounts from anon, authenticated;
grant select on public.my_connected_accounts to authenticated;
