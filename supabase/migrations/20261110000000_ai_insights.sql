-- =====================================================================
-- AI Assistant: the business health check's findings ("insights").
-- One row per problem / opportunity the AI found for a business. Filled in
-- by the "ai-insights" Edge Function (daily, or when the owner taps Refresh);
-- read by the Dashboard, Analytics page and AI Assistant screen.
-- Run once, after the earlier files:
--   Supabase > SQL Editor > New query > paste this whole file > Run.
-- Safe to run again.
-- =====================================================================

create table if not exists public.ai_insights (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- Stays the same while the same problem exists (e.g. "unassigned:<job id>"), so it's never duplicated.
  key text not null,
  -- Which check found it, e.g. "overdue_invoices".
  check_name text not null,
  area text not null check (area in ('finance', 'jobs', 'team', 'spending')),
  severity text not null check (severity in ('high', 'medium', 'low')),
  -- Where it's shown: attention (Dashboard "AI Insights & Recommendations" + AI Assistant),
  -- other (Dashboard "Other Insights"), analytics (Analytics "AI Insights"), notification.
  placements text[] not null default '{}',
  title text not null,
  summary text not null,
  suggestion text not null default '',
  estimated_saving numeric(12, 2),
  -- Things it's about, e.g. [{"type": "invoice", "id": "..."}].
  related jsonb not null default '[]',
  -- The numbers behind it.
  metrics jsonb not null default '{}',
  -- active: showing. dismissed: the owner hid it. resolved: the problem has gone.
  status text not null default 'active' check (status in ('active', 'dismissed', 'resolved')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  notified_at timestamptz,
  unique (business_id, key)
);
create index if not exists ai_insights_business_idx on public.ai_insights (business_id, status);

-- Only the business owner can see their insights, and the only thing they can
-- change is the status (to hide or un-hide one). Employees can't see them.
alter table public.ai_insights enable row level security;
drop policy if exists "owner sees ai insights" on public.ai_insights;
create policy "owner sees ai insights" on public.ai_insights for select to authenticated
  using (public.is_business_owner(business_id));
drop policy if exists "owner hides ai insights" on public.ai_insights;
create policy "owner hides ai insights" on public.ai_insights for update to authenticated
  using (public.is_business_owner(business_id))
  with check (public.is_business_owner(business_id) and status in ('active', 'dismissed'));
revoke all on public.ai_insights from anon;
revoke insert, update, delete on public.ai_insights from authenticated;
grant select on public.ai_insights to authenticated;
grant update (status) on public.ai_insights to authenticated;

-- Live updates (new insights appear without reopening the app).
do $$
begin
  begin
    alter publication supabase_realtime add table public.ai_insights;
  exception when duplicate_object then null;
  end;
end;
$$;
