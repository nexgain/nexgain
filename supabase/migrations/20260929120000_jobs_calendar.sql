-- =====================================================================
-- NexGain: quotes online, clients, jobs and the owner calendar.
-- Run after schema.sql and stage4.sql:
--   Supabase > SQL Editor > New query > paste this whole file > Run.
-- Safe to run again.
--
-- How things stay in sync (the database does it, so the app can't get it wrong):
--   quote (Accepted) --book_job()--> job (+ client) and quote becomes "Booked"
--   job created / changed  --> its calendar event is created / updated to match
--   job date or time moved --> any shift linked to the job moves too
--   shift linked to a job saved / deleted --> job becomes Assigned / back to Scheduled
-- =====================================================================

-- Times are stored with their timezone and shown in the business's timezone.
alter table public.businesses add column if not exists timezone text not null default 'Australia/Brisbane';

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null default '',
  email text not null default '',
  phone text not null default '',
  address text not null default '',
  created_at timestamptz not null default now()
);

-- Quotes and invoices (previously kept only on the phone).
create table if not exists public.sales_docs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind text not null check (kind in ('invoice', 'quote')),
  number text not null,
  status text not null,
  -- The client as typed on the quote: {name, phone, email, address}.
  client jsonb not null default '{}',
  client_id uuid references public.clients (id) on delete set null,
  job_type text,
  job_date date,
  description text not null default '',
  items jsonb not null default '[]',
  due_date date,
  payment_reference text not null default '',
  gst_rate numeric(5, 4) not null default 0.1,
  paid_at timestamptz,
  receipt_status text,
  created_at timestamptz not null default now()
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- unique: a quote can only ever be booked once.
  quote_id uuid unique references public.sales_docs (id) on delete set null,
  client_id uuid references public.clients (id) on delete set null,
  title text not null,
  description text not null default '',
  address text not null default '',
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'assigned', 'in_progress', 'completed', 'cancelled')),
  assigned_employee_id uuid references public.employees (id) on delete set null,
  -- Everyone rostered on the job (a shift can have several people).
  assigned_employee_ids uuid[] not null default '{}',
  completed_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  constraint jobs_end_after_start check (scheduled_end > scheduled_start)
);

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  type text not null check (type in ('job', 'delivery', 'other')),
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  job_id uuid references public.jobs (id) on delete set null,
  client_id uuid references public.clients (id) on delete set null,
  address text not null default '',
  notes text not null default '',
  status text not null default 'scheduled',
  -- Material deliveries
  supplier text not null default '',
  delivery_items text not null default '',
  created_at timestamptz not null default now(),
  constraint calendar_events_end_after_start check (ends_at >= starts_at)
);
-- Each job has exactly one "job" event on the calendar.
create unique index if not exists calendar_events_one_per_job on public.calendar_events (job_id) where type = 'job';

alter table public.shifts add column if not exists job_id uuid references public.jobs (id) on delete set null;

create index if not exists clients_business_idx on public.clients (business_id);
create index if not exists sales_docs_business_idx on public.sales_docs (business_id, created_at desc);
create index if not exists jobs_business_start_idx on public.jobs (business_id, scheduled_start);
create index if not exists calendar_events_business_start_idx on public.calendar_events (business_id, starts_at);
create index if not exists shifts_job_idx on public.shifts (job_id);

-- ---------------------------------------------------------------------
-- Security: only the business owner can see or change any of this.
-- Employees get their assigned jobs through my_assigned_jobs() (no prices).
-- ---------------------------------------------------------------------

alter table public.clients enable row level security;
alter table public.sales_docs enable row level security;
alter table public.jobs enable row level security;
alter table public.calendar_events enable row level security;

drop policy if exists "owner manages clients" on public.clients;
create policy "owner manages clients" on public.clients for all to authenticated
  using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));

drop policy if exists "owner manages quotes and invoices" on public.sales_docs;
create policy "owner manages quotes and invoices" on public.sales_docs for all to authenticated
  using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));

drop policy if exists "owner manages jobs" on public.jobs;
create policy "owner manages jobs" on public.jobs for all to authenticated
  using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));

drop policy if exists "owner manages calendar" on public.calendar_events;
create policy "owner manages calendar" on public.calendar_events for all to authenticated
  using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));

-- ---------------------------------------------------------------------
-- Keeping jobs, the calendar and shifts in sync
-- ---------------------------------------------------------------------

create or replace function public.business_timezone(bid uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select timezone from public.businesses where id = bid), 'Australia/Brisbane');
$$;

-- Job created or changed -> its calendar event matches it.
create or replace function public.sync_job_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.calendar_events (business_id, type, title, starts_at, ends_at, job_id, client_id, address, status)
  values (new.business_id, 'job', new.title, new.scheduled_start, new.scheduled_end, new.id, new.client_id, new.address, new.status)
  on conflict (job_id) where type = 'job' do update set
    title = excluded.title,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    client_id = excluded.client_id,
    address = excluded.address,
    status = excluded.status;
  return new;
end;
$$;
drop trigger if exists jobs_sync_event on public.jobs;
create trigger jobs_sync_event after insert or update on public.jobs
  for each row execute function public.sync_job_event();

-- Job deleted -> remove its calendar event (deliveries linked to it are kept).
create or replace function public.remove_job_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.calendar_events where job_id = old.id and type = 'job';
  return old;
end;
$$;
drop trigger if exists jobs_remove_event on public.jobs;
create trigger jobs_remove_event before delete on public.jobs
  for each row execute function public.remove_job_event();

-- Job date or time changed -> linked shifts move with it (employees are told by the shift trigger).
create or replace function public.move_job_shifts()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  tz text := public.business_timezone(new.business_id);
  d date := (new.scheduled_start at time zone tz)::date;
  s text := to_char(new.scheduled_start at time zone tz, 'HH24:MI');
  e text := to_char(new.scheduled_end at time zone tz, 'HH24:MI');
begin
  if (old.scheduled_start, old.scheduled_end) is distinct from (new.scheduled_start, new.scheduled_end) then
    update public.shifts set date = d, start_time = s, end_time = e, updated_at = now()
    where job_id = new.id and (date, start_time, end_time) is distinct from (d, s, e);
  end if;
  return new;
end;
$$;
drop trigger if exists jobs_move_shifts on public.jobs;
create trigger jobs_move_shifts after update on public.jobs
  for each row execute function public.move_job_shifts();

-- Who is rostered on a job, from the shifts linked to it. Scheduled <-> Assigned follows.
create or replace function public.refresh_job_assignment(p_job uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  ids uuid[];
begin
  if p_job is null then return; end if;
  select coalesce(array_agg(distinct emp), '{}') into ids
  from public.shifts s, unnest(s.employee_ids) emp
  where s.job_id = p_job;

  update public.jobs j set
    assigned_employee_ids = ids,
    assigned_employee_id = ids[1],
    status = case
      when j.status in ('scheduled', 'assigned') then (case when cardinality(ids) > 0 then 'assigned' else 'scheduled' end)
      else j.status end
  where j.id = p_job
    and (j.assigned_employee_ids is distinct from ids
      or (j.status in ('scheduled', 'assigned')
        and j.status is distinct from (case when cardinality(ids) > 0 then 'assigned' else 'scheduled' end)));
end;
$$;

create or replace function public.sync_shift_job()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then perform public.refresh_job_assignment(old.job_id); end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.job_id is distinct from old.job_id or new.employee_ids is distinct from old.employee_ids) then
    perform public.refresh_job_assignment(new.job_id);
  end if;
  return null;
end;
$$;
drop trigger if exists shifts_sync_job on public.shifts;
create trigger shifts_sync_job after insert or update or delete on public.shifts
  for each row execute function public.sync_shift_job();

-- ---------------------------------------------------------------------
-- App functions
-- ---------------------------------------------------------------------

-- Confirm a job from an accepted quote: creates (or reuses) the client, creates
-- the job (its calendar event follows automatically) and marks the quote Booked.
-- All in one step: if anything fails, nothing is saved.
create or replace function public.book_job(p_quote_id uuid, p jsonb)
returns public.jobs language plpgsql security definer set search_path = '' as $$
declare
  q public.sales_docs;
  c uuid;
  j public.jobs;
  c_name text := trim(coalesce(p ->> 'client_name', ''));
  c_email text := lower(trim(coalesce(p ->> 'client_email', '')));
begin
  select * into q from public.sales_docs where id = p_quote_id for update;
  if q.id is null or not public.is_business_owner(q.business_id) then raise exception 'Quote not found.'; end if;
  if q.kind <> 'quote' then raise exception 'Only quotes can be booked as jobs.'; end if;
  if q.status = 'Booked' then raise exception 'This quote has already been booked as a job.'; end if;
  if q.status <> 'Accepted' then raise exception 'Only accepted quotes can be booked as jobs.'; end if;

  select id into c from public.clients
  where business_id = q.business_id
    and ((c_email <> '' and lower(email) = c_email) or (c_email = '' and email = '' and lower(name) = lower(c_name)))
  limit 1;
  if c is null then
    insert into public.clients (business_id, name, email, phone, address)
    values (q.business_id, c_name, c_email, coalesce(p ->> 'client_phone', ''), coalesce(p ->> 'address', ''))
    returning id into c;
  else
    update public.clients set name = c_name, phone = coalesce(p ->> 'client_phone', phone),
      address = coalesce(nullif(p ->> 'address', ''), address)
    where id = c;
  end if;

  insert into public.jobs (business_id, quote_id, client_id, title, description, address, scheduled_start, scheduled_end, status, notes)
  values (q.business_id, q.id, c, coalesce(nullif(trim(p ->> 'title'), ''), 'Job'), coalesce(p ->> 'description', ''),
    coalesce(p ->> 'address', ''), (p ->> 'start')::timestamptz, (p ->> 'end')::timestamptz, 'scheduled', coalesce(p ->> 'notes', ''))
  returning * into j;

  update public.sales_docs set status = 'Booked', client_id = c where id = q.id;
  return j;
end;
$$;

-- Undo book_job (used when the confirmation email couldn't be sent).
create or replace function public.unbook_job(p_job_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  j public.jobs;
begin
  select * into j from public.jobs where id = p_job_id;
  if j.id is null or not public.is_business_owner(j.business_id) then raise exception 'Job not found.'; end if;
  delete from public.jobs where id = j.id;
  update public.sales_docs set status = 'Accepted' where id = j.quote_id and status = 'Booked';
end;
$$;

-- An employee's own jobs: only what they need on site (no prices, no owner notes).
create or replace function public.my_assigned_jobs()
returns table (id uuid, title text, description text, address text, scheduled_start timestamptz,
  scheduled_end timestamptz, status text)
language sql stable security definer set search_path = '' as $$
  select j.id, j.title, j.description, j.address, j.scheduled_start, j.scheduled_end, j.status
  from public.jobs j
  where public.my_employee_id() = any (j.assigned_employee_ids)
    and j.business_id = public.my_employee_business_id();
$$;

revoke execute on function public.book_job(uuid, jsonb) from public, anon;
revoke execute on function public.unbook_job(uuid) from public, anon;
revoke execute on function public.my_assigned_jobs() from public, anon;
revoke execute on function public.refresh_job_assignment(uuid) from public, anon, authenticated;
revoke execute on function public.business_timezone(uuid) from public, anon;
grant execute on function public.book_job(uuid, jsonb) to authenticated;
grant execute on function public.unbook_job(uuid) to authenticated;
grant execute on function public.my_assigned_jobs() to authenticated;

-- ---------------------------------------------------------------------
-- Live updates (e.g. a job becomes Assigned when a shift is saved)
-- ---------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['jobs', 'calendar_events', 'sales_docs'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end;
$$;
