-- NexGain Bookings, staff side:
--   * staff mark their own appointments Completed or No-show
--   * staff ask for days off or new weekly hours; nothing changes for
--     customers until the owner approves
--   * in-app notifications: staff hear about bookings made, moved or cancelled
--     for them; the owner hears about online bookings, customer changes and
--     staff requests; staff hear the owner's answer.
-- Safe to run again. Needs 20261117000000_bookings.sql first.

-- ---------------------------------------------------------------------
-- Weekly hours a staff member has asked for (waiting for the owner)
-- ---------------------------------------------------------------------
alter table public.booking_staff add column if not exists requested_hours jsonb
  check (requested_hours is null or (jsonb_typeof(requested_hours) = 'array' and jsonb_array_length(requested_hours) = 7));
-- Set while a request is waiting (requested_hours null then = "my hours = opening hours").
alter table public.booking_staff add column if not exists hours_requested_at timestamptz;

-- ---------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------

-- "Tuesday 18 November, 10:00 am" in the business's time zone.
create or replace function private.booking_when(p_start timestamptz, p_tz text)
returns text language sql stable set search_path = '' as $$
  select to_char(p_start at time zone p_tz, 'FMDay FMDD FMMonth, FMHH12:MI') || lower(to_char(p_start at time zone p_tz, ' AM'));
$$;

create or replace function private.booking_notify(
  p_business uuid, p_recipient uuid, p_audience text, p_type text, p_title text, p_summary text, p_body text default ''
)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (business_id, recipient_id, audience, type, title, summary, body)
  select p_business, p_recipient, p_audience, p_type, left(p_title, 200), left(p_summary, 500), left(p_body, 4000)
  where p_recipient is not null;
$$;

-- The login of the employee behind a bookable person (null for the owner or someone who left).
create or replace function private.booking_staff_user(p_staff uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select e.user_id from public.booking_staff st join public.employees e on e.id = st.employee_id where st.id = p_staff;
$$;

create or replace function private.bookings_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  tz text;
  currency text;
  owner uuid;
  staff_name text;
  whenx text;
  details text;
  by_customer boolean := auth.uid() is null; -- the booking page (server) has no login
begin
  select b.timezone, b.owner_id, upper(left(coalesce(nullif(b.currency, ''), 'AUD'), 3)) into tz, owner, currency
  from public.businesses b where b.id = new.business_id;
  select name into staff_name from public.booking_staff where id = new.staff_id;
  whenx := private.booking_when(new.starts_at, tz);
  details := new.service_name || ' (' || new.duration_minutes || ' min)'
    || coalesce(E'\nPrice: ' || to_char(new.price, 'FM999,990.00') || ' ' || currency, '')
    || E'\nCustomer: ' || new.customer_name
    || case when new.notes <> '' then E'\nNotes: ' || new.notes else '' end;

  if tg_op = 'INSERT' then
    if new.status <> 'confirmed' then return new; end if;
    perform private.booking_notify(new.business_id, private.booking_staff_user(new.staff_id), 'employee', 'booking_new',
      'New booking: ' || new.service_name, new.customer_name || ' · ' || whenx, whenx || E'\n' || details);
    if new.source = 'online' then
      perform private.booking_notify(new.business_id, owner, 'owner', 'booking_new',
        'New online booking', new.customer_name || ' booked ' || new.service_name || ' with ' || staff_name || ', ' || whenx,
        whenx || E'\nWith: ' || staff_name || E'\n' || details);
    end if;
    return new;
  end if;

  -- Cancelled.
  if old.status <> 'cancelled' and new.status = 'cancelled' then
    perform private.booking_notify(new.business_id, private.booking_staff_user(new.staff_id), 'employee', 'booking_cancelled',
      'Booking cancelled', new.customer_name || ' · ' || new.service_name || ' · ' || private.booking_when(old.starts_at, tz));
    if new.cancelled_by = 'customer' then
      perform private.booking_notify(new.business_id, owner, 'owner', 'booking_cancelled',
        'Booking cancelled by customer', new.customer_name || ' cancelled ' || new.service_name || ' with ' || staff_name || ', '
        || private.booking_when(old.starts_at, tz));
    end if;
    return new;
  end if;

  -- Moved to another time or person.
  if new.status = 'confirmed' and (new.starts_at <> old.starts_at or new.staff_id <> old.staff_id) then
    perform private.booking_notify(new.business_id, private.booking_staff_user(new.staff_id), 'employee', 'booking_changed',
      case when new.staff_id <> old.staff_id then 'New booking: ' || new.service_name else 'Booking moved' end,
      new.customer_name || ' · now ' || whenx, 'Now: ' || whenx || E'\n' || details);
    if new.staff_id <> old.staff_id then
      perform private.booking_notify(new.business_id, private.booking_staff_user(old.staff_id), 'employee', 'booking_cancelled',
        'Booking moved to someone else', new.customer_name || ' · ' || new.service_name || ' · ' || private.booking_when(old.starts_at, tz));
    end if;
    if by_customer then
      perform private.booking_notify(new.business_id, owner, 'owner', 'booking_changed',
        'Booking moved by customer', new.customer_name || ' moved ' || new.service_name || ' to ' || whenx || ' with ' || staff_name);
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists bookings_notify on public.bookings;
create trigger bookings_notify after insert or update of status, starts_at, staff_id on public.bookings
  for each row execute function private.bookings_notify();

-- The owner's answer to a time off request.
create or replace function private.time_off_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  tz text := (select timezone from public.businesses where id = new.business_id);
begin
  if old.status = 'pending' and new.status in ('approved', 'declined') and new.staff_id is not null then
    perform private.booking_notify(new.business_id, private.booking_staff_user(new.staff_id), 'employee', 'booking_request_answer',
      'Time off ' || new.status,
      'Your time off from ' || to_char(new.starts_at at time zone tz, 'FMDay FMDD FMMonth') || ' was ' || new.status || '.');
  end if;
  return new;
end;
$$;
drop trigger if exists booking_time_off_notify on public.booking_time_off;
create trigger booking_time_off_notify after update of status on public.booking_time_off
  for each row execute function private.time_off_notify();

-- The owner's answer to a request for new hours (approved = hours changed to the request).
create or replace function private.staff_hours_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Not when the staff member withdrew the request themselves.
  if old.hours_requested_at is not null and new.hours_requested_at is null and new.employee_id is not null
     and auth.uid() is distinct from private.booking_staff_user(new.id) then
    perform private.booking_notify(new.business_id, private.booking_staff_user(new.id), 'employee', 'booking_request_answer',
      case when new.hours is not distinct from old.requested_hours then 'New hours approved' else 'New hours declined' end,
      case when new.hours is not distinct from old.requested_hours
        then 'Customers can now book you in your new hours.'
        else 'Your hours stay as they were. Talk to your manager about it.' end);
  end if;
  return new;
end;
$$;
drop trigger if exists booking_staff_hours_notify on public.booking_staff;
create trigger booking_staff_hours_notify after update of hours_requested_at on public.booking_staff
  for each row execute function private.staff_hours_notify();

-- ---------------------------------------------------------------------
-- What staff can do (their own bookings and requests only)
-- ---------------------------------------------------------------------

-- Completed / No-show (or back to booked), once the appointment has started.
create or replace function public.booking_staff_set_status(p_booking uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  bk public.bookings;
begin
  if p_status not in ('completed', 'no_show', 'confirmed') then raise exception 'Unknown status.'; end if;
  select b.* into bk from public.bookings b join public.booking_staff st on st.id = b.staff_id
  where b.id = p_booking and st.employee_id = public.my_employee_id() for update of b;
  if bk.id is null then raise exception 'This isn''t one of your bookings.'; end if;
  if bk.status = 'cancelled' then raise exception 'This booking was cancelled.'; end if;
  if p_status <> 'confirmed' and bk.starts_at > now() then
    raise exception 'You can mark this once the appointment has started.';
  end if;
  update public.bookings set status = p_status, updated_at = now() where id = bk.id;
end;
$$;

-- Ask for time off (whole days, or part of a day).
create or replace function public.booking_request_time_off(p_starts timestamptz, p_ends timestamptz, p_note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  st public.booking_staff;
  tz text;
  new_id uuid;
begin
  select * into st from public.booking_staff where employee_id = public.my_employee_id();
  if st.id is null then raise exception 'Only staff who can be booked can ask for time off.'; end if;
  if p_ends <= p_starts then raise exception 'The end must be after the start.'; end if;
  if p_ends - p_starts > interval '366 days' then raise exception 'That''s too long. Ask for up to a year at a time.'; end if;
  if p_ends < now() then raise exception 'Those days have already passed.'; end if;
  insert into public.booking_time_off (business_id, staff_id, starts_at, ends_at, status, note, created_by)
  values (st.business_id, st.id, p_starts, p_ends, 'pending', left(btrim(coalesce(p_note, '')), 500), auth.uid())
  returning id into new_id;
  select timezone into tz from public.businesses where id = st.business_id;
  perform private.booking_notify(st.business_id, (select owner_id from public.businesses where id = st.business_id), 'owner',
    'booking_request', 'Time off request', st.name || ' asked for time off from '
    || to_char(p_starts at time zone tz, 'FMDay FMDD FMMonth') || '. Approve it in Bookings Settings › Staff.');
  return new_id;
end;
$$;

-- Take back a request that hasn't been answered yet.
create or replace function public.booking_withdraw_time_off(p_id uuid)
returns void language sql security definer set search_path = '' as $$
  delete from public.booking_time_off t using public.booking_staff st
  where t.id = p_id and t.status = 'pending' and st.id = t.staff_id and st.employee_id = public.my_employee_id();
$$;

-- Ask for new weekly hours (null = "the opening hours"), or withdraw the request (p_withdraw).
create or replace function public.booking_request_hours(p_hours jsonb, p_withdraw boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare
  st public.booking_staff;
begin
  select * into st from public.booking_staff where employee_id = public.my_employee_id();
  if st.id is null then raise exception 'Only staff who can be booked can change their hours.'; end if;
  if p_withdraw then
    update public.booking_staff set requested_hours = null, hours_requested_at = null where id = st.id;
    return;
  end if;
  if p_hours is not null and (jsonb_typeof(p_hours) <> 'array' or jsonb_array_length(p_hours) <> 7) then
    raise exception 'Hours must list all 7 days.';
  end if;
  update public.booking_staff set requested_hours = p_hours, hours_requested_at = now() where id = st.id;
  perform private.booking_notify(st.business_id, (select owner_id from public.businesses where id = st.business_id), 'owner',
    'booking_request', 'New hours request', st.name || ' asked to change their working hours. Approve it in Bookings Settings › Staff.');
end;
$$;

revoke execute on function public.booking_staff_set_status(uuid, text) from public, anon;
revoke execute on function public.booking_request_time_off(timestamptz, timestamptz, text) from public, anon;
revoke execute on function public.booking_withdraw_time_off(uuid) from public, anon;
revoke execute on function public.booking_request_hours(jsonb, boolean) from public, anon;
grant execute on function public.booking_staff_set_status(uuid, text) to authenticated;
grant execute on function public.booking_request_time_off(timestamptz, timestamptz, text) to authenticated;
grant execute on function public.booking_withdraw_time_off(uuid) to authenticated;
grant execute on function public.booking_request_hours(jsonb, boolean) to authenticated;
revoke execute on function private.booking_notify(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function private.booking_staff_user(uuid) from public, anon, authenticated;
