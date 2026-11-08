-- =====================================================================
-- NexGain: automatic job reminders for clients.
--   Each job gets two reminder emails, both at 9:00 am in the business's
--   timezone: one a week before the job and one the day before. They're sent
--   from the owner's connected Gmail or Outlook by the "send-reminders" Edge
--   Function, which a timer (pg_cron, set up in the next file) runs every
--   15 minutes, so they go out even when the app is closed.
--
--   - businesses: reminder settings (off until the owner turns them on),
--     wording, and a business phone number for the message.
--   - jobs.reminders_enabled: the owner can turn reminders off for one job.
--   - job_reminders: one row per reminder: sent, failed or skipped, why, and when.
--     A reminder belongs to the job's start time, so it can never be sent twice
--     for the same time, and moving a job gives it fresh reminders.
--
-- Run after the earlier files:
--   Supabase > SQL Editor > New query > paste this whole file > Run.
-- Safe to run again.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------

alter table public.businesses add column if not exists phone text not null default '';
alter table public.businesses add column if not exists reminders_enabled boolean not null default false;
alter table public.businesses add column if not exists reminder_week_before boolean not null default true;
alter table public.businesses add column if not exists reminder_day_before boolean not null default true;
-- Blank = the default wording (written in the app and the send-reminders function).
alter table public.businesses add column if not exists reminder_subject text not null default '';
alter table public.businesses add column if not exists reminder_message text not null default '';
-- Which connected account sends reminders when both Gmail and Outlook are connected (null = automatic).
alter table public.businesses add column if not exists reminder_provider text;
do $$
begin
  alter table public.businesses add constraint businesses_reminder_provider_check
    check (reminder_provider is null or reminder_provider in ('google', 'microsoft'));
exception when duplicate_object then null;
end;
$$;

alter table public.jobs add column if not exists reminders_enabled boolean not null default true;

-- ---------------------------------------------------------------------
-- What was sent
-- ---------------------------------------------------------------------

create table if not exists public.job_reminders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  kind text not null check (kind in ('week', 'day')),
  -- The job start time this reminder was for. A moved job gets new rows.
  job_start timestamptz not null,
  -- sending: being sent right now. sent: done. failed / skipped: see reason
  -- (tried again later, a few times, in case the owner fixes the problem).
  status text not null check (status in ('sending', 'sent', 'failed', 'skipped')),
  reason text not null default '',
  sent_to text not null default '',
  sent_at timestamptz,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The rule that stops the same reminder ever going twice.
  unique (job_id, kind, job_start)
);
create index if not exists job_reminders_business_idx on public.job_reminders (business_id, job_start);

-- The owner can see their reminders; only the server (service role) writes them.
alter table public.job_reminders enable row level security;
revoke insert, update, delete on public.job_reminders from anon, authenticated;
drop policy if exists "owner sees reminders" on public.job_reminders;
create policy "owner sees reminders" on public.job_reminders for select to authenticated
  using (public.is_business_owner(business_id));

-- ---------------------------------------------------------------------
-- Which reminders are due (used by the send-reminders function)
-- ---------------------------------------------------------------------

-- 9:00 am local time, a number of days before the job's local date.
create or replace function public.reminder_due_at(p_start timestamptz, p_timezone text, p_days int)
returns timestamptz language sql immutable set search_path = '' as $$
  select ((((p_start at time zone p_timezone)::date - p_days) + time '09:00') at time zone p_timezone);
$$;

-- Finds reminders that are due and marks each as "sending" before handing it
-- over, so two runs at once can never send the same one. Clients with no
-- email address are recorded as skipped. Called only by the server.
--   week: sent from 9:00 am a week before, up to 12 hours late (a job booked
--         less than a week ahead skips it; the day-before one still goes).
--   day:  sent from 9:00 am the day before, or straight away if the job was
--         booked after that, as long as the job hasn't started.
create or replace function public.claim_due_reminders(p_limit int default 50)
returns table (
  reminder_id uuid,
  kind text,
  job_id uuid,
  job_title text,
  job_start timestamptz,
  address text,
  client_name text,
  client_email text,
  business_id uuid,
  business_name text,
  business_email text,
  business_phone text,
  timezone text,
  reminder_subject text,
  reminder_message text,
  email_app text,
  reminder_provider text
)
language plpgsql security definer set search_path = '' as $$
-- The names in "returns table" above are also column names; mean the columns.
#variable_conflict use_column
begin
  -- A send that never reported back (the function stopped part way) may or may
  -- not have gone out. Never risk a second email: record it as failed for good.
  update public.job_reminders r set status = 'failed', attempts = 99, updated_at = now(),
    reason = 'Sending was interrupted. Check your Sent folder to see if it went out.'
  where r.status = 'sending' and r.updated_at < now() - interval '15 minutes';

  return query
  with due as (
    select j.id as d_job, j.business_id as d_business, j.scheduled_start as d_start, k.kind as d_kind,
      trim(coalesce(c.email, '')) as d_email
    from public.jobs j
    join public.businesses b on b.id = j.business_id
    left join public.clients c on c.id = j.client_id
    cross join lateral (values ('week', 7), ('day', 1)) as k (kind, days)
    cross join lateral (select public.reminder_due_at(j.scheduled_start, b.timezone, k.days) as due_at) t
    where b.reminders_enabled
      and j.reminders_enabled
      and j.status in ('scheduled', 'assigned')
      and ((k.kind = 'week' and b.reminder_week_before) or (k.kind = 'day' and b.reminder_day_before))
      and now() >= t.due_at
      and now() < j.scheduled_start
      and (k.kind = 'day' or now() < t.due_at + interval '12 hours')
  ),
  -- No email address: record why (looked at again later, in case one is added).
  skipped as (
    insert into public.job_reminders as r (business_id, job_id, kind, job_start, status, reason)
    select d_business, d_job, d_kind, d_start, 'skipped', 'The client has no email address.'
    from due where d_email = ''
    on conflict (job_id, kind, job_start) do nothing
    returning r.id
  ),
  claimed as (
    insert into public.job_reminders as r (business_id, job_id, kind, job_start, status, attempts)
    select d_business, d_job, d_kind, d_start, 'sending', 1
    from due where d_email <> ''
    limit p_limit
    on conflict (job_id, kind, job_start) do update
      set status = 'sending', reason = '', attempts = r.attempts + 1, updated_at = now()
      -- Try a failed or skipped one again every 30 minutes, at most 5 times. Never a sent one.
      where r.status in ('failed', 'skipped') and r.attempts < 5 and r.updated_at < now() - interval '30 minutes'
    returning r.id, r.kind, r.job_id
  )
  select cl.id, cl.kind, j.id, j.title, j.scheduled_start, j.address,
    coalesce(c.name, ''), trim(coalesce(c.email, '')),
    b.id, b.name, coalesce(nullif(trim(b.business_email), ''), b.owner_email), b.phone, b.timezone,
    b.reminder_subject, b.reminder_message, b.email_app, b.reminder_provider
  from claimed cl
  join public.jobs j on j.id = cl.job_id
  join public.businesses b on b.id = j.business_id
  left join public.clients c on c.id = j.client_id;
end;
$$;

-- Only the server may call these.
revoke execute on function public.claim_due_reminders(int) from public, anon, authenticated;
revoke execute on function public.reminder_due_at(timestamptz, text, int) from public, anon;

-- The job screen shows a reminder going from Scheduled to Sent straight away.
do $$
begin
  alter publication supabase_realtime add table public.job_reminders;
exception when duplicate_object then null;
end;
$$;

-- Tell the Supabase API about the new columns straight away (fixes "not in the schema cache").
notify pgrst, 'reload schema';
