-- =====================================================================
-- NexGain: job times on quotes, and sent quotes on the calendar.
--   - sales_docs.job_start / job_end: the quote's job start time and estimated
--     finish ("HH:MM", business time). Both optional.
--   - A quote that's been sent (or accepted) and has a job date appears on the
--     calendar by itself as a "quote" event: at its time, or all day if it has
--     none. The database keeps it in step, so the app can't get it wrong:
--       quote date / time changed        -> its calendar entry moves
--       accepted                         -> stays, marked accepted
--       booked as a job (Confirm Job)    -> removed (the job's own entry replaces it)
--       declined, back to draft, deleted -> removed
--     ("Expired" is worked out in the app from the valid-until date, as before.)
--   - businesses.hide_no_time_warning: the owner ticked "Don't show this again"
--     on the "no time selected" pop-up.
--
-- Run after the earlier files:
--   Supabase > SQL Editor > New query > paste this whole file > Run.
-- Safe to run again.
-- =====================================================================

alter table public.sales_docs add column if not exists job_start text;
alter table public.sales_docs add column if not exists job_end text;
do $$
begin
  alter table public.sales_docs add constraint sales_docs_job_times_check check (
    (job_start is null or job_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
    and (job_end is null or job_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
  );
exception when duplicate_object then null;
end;
$$;

alter table public.businesses add column if not exists hide_no_time_warning boolean not null default false;

-- ---------------------------------------------------------------------
-- Quote events on the calendar
-- ---------------------------------------------------------------------

alter table public.calendar_events add column if not exists quote_id uuid references public.sales_docs (id) on delete cascade;
-- All-day entries (a quote with a date but no time).
alter table public.calendar_events add column if not exists all_day boolean not null default false;
alter table public.calendar_events drop constraint if exists calendar_events_type_check;
alter table public.calendar_events add constraint calendar_events_type_check
  check (type in ('job', 'delivery', 'other', 'quote'));
-- Each quote has at most one entry on the calendar.
create unique index if not exists calendar_events_one_per_quote on public.calendar_events (quote_id) where type = 'quote';

create or replace function public.sync_quote_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  tz text;
  s timestamptz;
  e timestamptz;
begin
  if new.kind <> 'quote' or new.status not in ('Sent', 'Accepted') or new.job_date is null then
    delete from public.calendar_events where quote_id = new.id and type = 'quote';
    return new;
  end if;

  tz := public.business_timezone(new.business_id);
  if new.job_start is null then
    s := (new.job_date + time '00:00') at time zone tz;
    e := (new.job_date + time '23:59') at time zone tz;
  else
    s := (new.job_date + new.job_start::time) at time zone tz;
    -- No finish (or one before the start): show it as an hour long.
    e := case when new.job_end > new.job_start then (new.job_date + new.job_end::time) at time zone tz
              else s + interval '1 hour' end;
  end if;

  insert into public.calendar_events (business_id, type, title, starts_at, ends_at, quote_id, client_id, address, status, all_day)
  values (
    new.business_id, 'quote',
    'Quote ' || regexp_replace(new.number, '^[A-Za-z]+-', '#') || coalesce(' · ' || nullif(trim(new.job_type), ''), ''),
    s, e, new.id, new.client_id, coalesce(new.client ->> 'address', ''), lower(new.status), new.job_start is null
  )
  on conflict (quote_id) where type = 'quote' do update set
    title = excluded.title,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    client_id = excluded.client_id,
    address = excluded.address,
    status = excluded.status,
    all_day = excluded.all_day;
  return new;
end;
$$;
drop trigger if exists sales_docs_sync_quote_event on public.sales_docs;
create trigger sales_docs_sync_quote_event after insert or update on public.sales_docs
  for each row execute function public.sync_quote_event();

-- Quotes already sent before this: put them on the calendar now.
update public.sales_docs set status = status
where kind = 'quote' and status in ('Sent', 'Accepted') and job_date is not null;

-- ---------------------------------------------------------------------
-- The customer's quote page also shows the job date and time
-- ---------------------------------------------------------------------

create or replace function public.quote_public_view(p_token text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'number', q.number,
    'state', case when q.status in ('Accepted', 'Booked') then 'accepted' when q.status = 'Declined' then 'declined' else 'open' end,
    'createdAt', q.created_at,
    'validUntil', q.due_date,
    'respondedAt', q.responded_at,
    'customerName', coalesce(q.client ->> 'name', ''),
    'description', q.description,
    'jobDate', q.job_date,
    'jobStart', q.job_start,
    'jobEnd', q.job_end,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'description', coalesce(i ->> 'description', ''),
        'qty', coalesce((i ->> 'qty')::numeric, 0),
        'rate', coalesce((i ->> 'rate')::numeric, 0)
      ) order by n)
      from jsonb_array_elements(q.items) with ordinality as t (i, n)
    ), '[]'::jsonb),
    'gstRate', q.gst_rate,
    'business', jsonb_build_object(
      'name', b.name,
      'logo', b.logo,
      'abn', coalesce(b.abn, ''),
      'email', coalesce(nullif(b.business_email, ''), b.owner_email)
    )
  )
  from public.sales_docs q
  join public.businesses b on b.id = q.business_id
  where q.public_token = p_token and q.kind = 'quote';
$$;

revoke execute on function public.quote_public_view(text) from public, anon, authenticated;
grant execute on function public.quote_public_view(text) to service_role;

-- Tell the Supabase API about the new columns straight away (fixes "not in the schema cache").
notify pgrst, 'reload schema';
