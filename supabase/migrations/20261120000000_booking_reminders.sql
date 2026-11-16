-- NexGain Bookings: automatic reminder emails to customers before their
-- appointment (default 24 hours before; the owner can change it or turn them
-- off). Sent from the owner's connected Gmail or Outlook, like job reminders.
--
-- How: every 15 minutes the timer calls the "booking-reminders" Edge Function,
-- which asks claim_due_booking_reminders() for the reminders due now. Each one
-- is marked "sending" first, so a customer can never get the same reminder twice.
-- Uses the same Vault secrets as job reminders (project_url, reminders_cron_secret,
-- set up by 20261101000100_job_reminders_schedule.sql).
-- Safe to run again. Needs 20261117000000_bookings.sql first.

alter table public.booking_settings add column if not exists reminders_enabled boolean not null default true;

-- Where each booking's reminder is up to: null (not yet), sending, sent, failed or skipped.
alter table public.bookings add column if not exists reminder_status text
  check (reminder_status is null or reminder_status in ('sending', 'sent', 'failed', 'skipped'));
alter table public.bookings add column if not exists reminder_reason text not null default '';
alter table public.bookings add column if not exists reminder_attempts int not null default 0;
alter table public.bookings add column if not exists reminder_updated_at timestamptz;

-- A booking moved to a new time gets a fresh reminder.
create or replace function private.bookings_reset_reminder()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.starts_at is distinct from old.starts_at then
    new.reminder_sent_at := null;
    new.reminder_status := null;
    new.reminder_reason := '';
    new.reminder_attempts := 0;
    new.reminder_updated_at := null;
  end if;
  return new;
end;
$$;
drop trigger if exists bookings_reset_reminder on public.bookings;
create trigger bookings_reset_reminder before update of starts_at on public.bookings
  for each row execute function private.bookings_reset_reminder();

-- The reminders due now, each marked "sending". Called only by the server.
--   Due from reminder_hours before the appointment until it starts.
--   Skipped (with the reason) when the customer has no email, or booked after
--   the reminder time (they've just had their confirmation).
--   A failed one is tried again every 30 minutes, at most 5 times.
create or replace function public.claim_due_booking_reminders(p_limit int default 50)
returns table (
  booking_id uuid,
  token text,
  business_id uuid,
  customer_name text,
  customer_email text,
  service_name text,
  duration_minutes int,
  price numeric,
  staff_name text,
  starts_at timestamptz,
  cancel_notice_hours int,
  cancellation_policy text,
  business_name text,
  business_email text,
  business_phone text,
  timezone text,
  currency text,
  email_app text,
  reminder_provider text
)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  -- A send that never reported back may or may not have gone out: never risk a second email.
  update public.bookings set reminder_status = 'failed', reminder_attempts = 99, reminder_updated_at = now(),
    reminder_reason = 'Sending was interrupted. Check your Sent folder to see if it went out.'
  where reminder_status = 'sending' and reminder_updated_at < now() - interval '15 minutes';

  -- Booked after the reminder time, or no email address: nothing to send.
  update public.bookings k set reminder_status = 'skipped', reminder_updated_at = now(),
    reminder_reason = case
      when k.created_at > k.starts_at - make_interval(hours => s.reminder_hours) then 'Booked after the reminder time, so the confirmation email was enough.'
      else 'The customer has no email address.' end
  from public.booking_settings s
  where s.business_id = k.business_id and s.reminders_enabled
    and k.status = 'confirmed' and k.reminder_status is null
    and now() >= k.starts_at - make_interval(hours => s.reminder_hours) and now() < k.starts_at
    and (k.created_at > k.starts_at - make_interval(hours => s.reminder_hours) or btrim(k.customer_email) = '');

  return query
  with due as (
    select k.id from public.bookings k
    join public.booking_settings s on s.business_id = k.business_id
    join public.businesses b on b.id = k.business_id and b.system_type = 'bookings'
    where s.reminders_enabled and k.status = 'confirmed' and k.reminder_sent_at is null
      and btrim(k.customer_email) <> ''
      and now() >= k.starts_at - make_interval(hours => s.reminder_hours) and now() < k.starts_at
      and (k.reminder_status is null
        or (k.reminder_status = 'failed' and k.reminder_attempts < 5 and k.reminder_updated_at < now() - interval '30 minutes'))
    order by k.starts_at
    limit p_limit
    for update of k skip locked
  ),
  claimed as (
    update public.bookings k set reminder_status = 'sending', reminder_attempts = k.reminder_attempts + 1,
      reminder_reason = '', reminder_updated_at = now()
    from due where k.id = due.id
    returning k.*
  )
  select c.id, c.manage_token, c.business_id, c.customer_name, btrim(c.customer_email), c.service_name, c.duration_minutes, c.price,
    st.name, c.starts_at, s.cancel_notice_hours, s.cancellation_policy,
    b.name, coalesce(nullif(btrim(b.business_email), ''), b.owner_email), b.phone, b.timezone,
    upper(left(coalesce(nullif(b.currency, ''), 'AUD'), 3)), b.email_app, b.reminder_provider
  from claimed c
  join public.booking_staff st on st.id = c.staff_id
  join public.booking_settings s on s.business_id = c.business_id
  join public.businesses b on b.id = c.business_id;
end;
$$;
revoke execute on function public.claim_due_booking_reminders(int) from public, anon, authenticated;

-- Every 15 minutes, like job reminders (same Vault secrets). Scheduling again replaces it.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
select cron.schedule(
  'send-booking-reminders',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/booking-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
-- To stop it:  select cron.unschedule('send-booking-reminders');
