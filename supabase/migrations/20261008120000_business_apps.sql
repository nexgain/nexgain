-- =====================================================================
-- NexGain: app connections (More > Integrations and owner sign-up)
--   - email app can now be 'mail' (the Apple Mail app on iPhone)
--   - business_apps: apps the business uses or has asked for (nothing is
--     connected yet; this is the list of connections to build)
-- Run once, after the earlier files:
--   Supabase > SQL Editor > New query > paste this whole file > Run.
-- Safe to run again.
-- =====================================================================

-- Email app: allow 'mail' as well as gmail / outlook / other.
alter table public.businesses drop constraint if exists businesses_email_app_check;
alter table public.businesses add constraint businesses_email_app_check
  check (email_app in ('gmail', 'outlook', 'mail', 'other'));

-- Apps the business uses ("added") or asked us to support ("requested").
create table if not exists public.business_apps (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  category text not null default 'other',
  status text not null default 'added' check (status in ('added', 'requested')),
  created_at timestamptz not null default now(),
  unique (business_id, name)
);

create index if not exists business_apps_business_idx on public.business_apps (business_id);

-- Only the business owner can see or change the list.
alter table public.business_apps enable row level security;
drop policy if exists "owner manages business apps" on public.business_apps;
create policy "owner manages business apps" on public.business_apps for all to authenticated
  using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));
