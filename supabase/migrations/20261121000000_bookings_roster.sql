-- NexGain Bookings: the roster decides when staff can be booked.
--   * Staff can only be booked inside their rostered shifts (the Roster,
--     public.shifts) for that day. Not rostered = not bookable. A shift that
--     goes past midnight carries on into the next day.
--   * The owner (not on the roster) can be booked in the business's opening hours.
--   * As before: the whole service has to fit, plus the gap after it; no
--     overlapping bookings; approved days off and closed days are never bookable;
--     minimum notice and how far ahead still apply.
-- Staff "own working hours" (booking_staff.hours) are no longer used.
-- Same function name and inputs as before, so nothing else needs changing.
-- Safe to run again. Needs 20261117000000_bookings.sql first.

create or replace function private.free_slots(p_business uuid, p_service uuid, p_staff uuid, p_day date, p_ignore uuid default null)
returns table (starts_at timestamptz, staff_id uuid)
language sql stable security definer set search_path = '' as $$
  with s as (
    select bs.*, b.timezone as tz
    from public.booking_settings bs join public.businesses b on b.id = bs.business_id
    where bs.business_id = p_business and bs.accepting and b.system_type = 'bookings'
  ),
  svc as (
    select * from public.booking_services where id = p_service and business_id = p_business and active
  ),
  staff as (
    select st.* from public.booking_staff st, svc
    where st.business_id = p_business and st.active
      and (p_staff is null or st.id = p_staff)
      and (cardinality(svc.staff_ids) = 0 or st.id = any (svc.staff_ids))
  ),
  opening as (
    select s.opening_hours -> (extract(isodow from p_day)::int - 1) as o from s
  ),
  -- Rostered shifts with proper "HH:MM" times, for this day and the day before
  -- (a shift past midnight carries on into this day).
  shifts as (
    select sh.date, sh.start_time::time as t_start, sh.end_time::time as t_end, sh.employee_ids
    from public.shifts sh
    where sh.business_id = p_business and sh.date between p_day - 1 and p_day
      and sh.start_time ~ '^[0-9]{1,2}:[0-9]{2}$' and sh.end_time ~ '^[0-9]{1,2}:[0-9]{2}$'
  ),
  -- When each person can be booked today, in local business time.
  windows as (
    -- The owner: the opening hours.
    select st.id as staff_id, p_day + (o.o ->> 'start')::time as w_start, p_day + (o.o ->> 'end')::time as w_end
    from staff st, opening o
    where st.is_owner and coalesce((o.o ->> 'open')::boolean, false)
    union all
    -- Staff: today's shifts (one past midnight runs to the end of today).
    select st.id, p_day + sh.t_start, case when sh.t_end > sh.t_start then p_day + sh.t_end else (p_day + 1)::timestamp end
    from staff st join shifts sh on sh.date = p_day and st.employee_id = any (sh.employee_ids)
    where not st.is_owner
    union all
    -- Staff: the rest of last night's shift, after midnight.
    select st.id, p_day::timestamp, p_day + sh.t_end
    from staff st join shifts sh on sh.date = p_day - 1 and st.employee_id = any (sh.employee_ids)
    where not st.is_owner and sh.t_end <= sh.t_start and sh.t_end > time '00:00'
  ),
  candidates as (
    select distinct w.staff_id, (g.local_start at time zone s.tz) as starts_at,
      make_interval(mins => svc.duration_minutes) as length,
      make_interval(mins => svc.duration_minutes + s.buffer_minutes) as busy
    from windows w, s, svc,
      generate_series(w.w_start, w.w_end - make_interval(mins => svc.duration_minutes), make_interval(mins => s.slot_minutes)) as g (local_start)
    where p_day between (now() at time zone s.tz)::date and (now() at time zone s.tz)::date + s.max_days_ahead
  )
  select c.starts_at, c.staff_id
  from candidates c, s
  where c.starts_at >= now() + make_interval(mins => s.min_notice_minutes)
    and not exists (
      select 1 from public.bookings b
      where b.staff_id = c.staff_id and b.status in ('confirmed', 'completed', 'no_show') and b.id is distinct from p_ignore
        and tstzrange(b.starts_at, b.blocked_until) && tstzrange(c.starts_at, c.starts_at + c.busy)
    )
    and not exists (
      select 1 from public.booking_time_off t
      where t.business_id = p_business and t.status = 'approved' and (t.staff_id is null or t.staff_id = c.staff_id)
        and tstzrange(t.starts_at, t.ends_at) && tstzrange(c.starts_at, c.starts_at + c.length)
    )
  order by c.starts_at, c.staff_id;
$$;
revoke execute on function private.free_slots(uuid, uuid, uuid, date, uuid) from public, anon, authenticated;
