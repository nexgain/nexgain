-- NexGain Bookings v3: staff choose their own services and prices, the owner
-- says whether they do the work themselves, services have categories, and free
-- times start straight after each booking ends.
--
--   * booking_settings.owner_works: "Do you do the work yourself?" Yes = the
--     owner can be booked (and has a schedule); No = the owner isn't on the
--     booking page. business_types: the booking business types chosen at sign-up.
--   * booking_services.category: the group shown to customers (e.g. "Barber").
--   * booking_staff_prices: a row = this person does this service, at this
--     price (blank = the service's usual price). Staff tick and price their own
--     in My Services & Prices; the owner can see and change them. New services
--     and new staff get a row each automatically (at the usual price), so
--     nothing has to be set up before people can be booked.
--   * Free times: every 15 minutes (slot_minutes) in open gaps, and straight
--     after each booking (and its gap) ends; the whole service must fit before
--     the next booking or the end of the shift. Double bookings stay impossible
--     (bookings_no_overlap).
-- free_slots and booking_page are the latest versions (20261121000000_bookings_roster.sql,
-- 20261123000000_booking_payments.sql) with these changes. Safe to run again.

alter table public.booking_settings add column if not exists owner_works boolean not null default true;
alter table public.booking_settings add column if not exists business_types text[] not null default '{}';
alter table public.booking_services add column if not exists category text not null default '' check (length(category) <= 100);
alter table public.booking_staff_prices alter column price drop not null;

-- Who does what today (from services.staff_ids, empty = everyone), at their own or the usual price.
insert into public.booking_staff_prices (staff_id, service_id, business_id, price)
select st.id, sv.id, sv.business_id, sv.price
from public.booking_services sv
join public.booking_staff st on st.business_id = sv.business_id and (st.employee_id is not null or st.is_owner)
where cardinality(sv.staff_ids) = 0 or st.id = any (sv.staff_ids)
on conflict (staff_id, service_id) do nothing;

-- A new service: everyone gets it at the usual price (they untick it if they don't do it).
create or replace function private.service_added_to_staff()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.booking_staff_prices (staff_id, service_id, business_id, price)
  select st.id, new.id, new.business_id, new.price from public.booking_staff st
  where st.business_id = new.business_id and (st.employee_id is not null or st.is_owner)
  on conflict (staff_id, service_id) do nothing;
  return new;
end;
$$;
drop trigger if exists booking_services_to_staff on public.booking_services;
create trigger booking_services_to_staff after insert on public.booking_services
  for each row execute function private.service_added_to_staff();

-- A new staff member: every service at the usual price (they untick what they don't do).
create or replace function private.staff_gets_services()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.booking_staff_prices (staff_id, service_id, business_id, price)
  select new.id, sv.id, new.business_id, sv.price from public.booking_services sv
  where sv.business_id = new.business_id
  on conflict (staff_id, service_id) do nothing;
  return new;
end;
$$;
drop trigger if exists booking_staff_gets_services on public.booking_staff;
create trigger booking_staff_gets_services after insert on public.booking_staff
  for each row execute function private.staff_gets_services();

-- "Do you do the work yourself?" decides whether the owner can be booked.
create or replace function private.owner_works_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.booking_staff set active = new.owner_works where business_id = new.business_id and is_owner;
  return new;
end;
$$;
drop trigger if exists booking_settings_owner_works on public.booking_settings;
create trigger booking_settings_owner_works after insert or update of owner_works on public.booking_settings
  for each row execute function private.owner_works_changed();

-- Staff manage their own services and prices; the owner manages everyone's (policy already there).
drop policy if exists "staff manage own prices" on public.booking_staff_prices;
create policy "staff manage own prices" on public.booking_staff_prices for all to authenticated
  using (staff_id in (select id from public.booking_staff where employee_id = public.my_employee_id()))
  with check (
    staff_id in (select id from public.booking_staff where employee_id = public.my_employee_id())
    and business_id = public.my_employee_business_id()
  );

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
      -- They do this service (ticked in My Services & Prices).
      and exists (select 1 from public.booking_staff_prices p where p.staff_id = st.id and p.service_id = svc.id)
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
  -- Possible start times: every slot_minutes (15) through each window, plus the
  -- moment each of their bookings (and its gap) ends, so the next booking can
  -- start straight after (a 45-minute booking at 10:30 frees them at 11:15).
  starts as (
    select w.staff_id, w.w_start, w.w_end, g.local_start
    from windows w, s, svc,
      generate_series(w.w_start, w.w_end - make_interval(mins => svc.duration_minutes), make_interval(mins => s.slot_minutes)) as g (local_start)
    union
    select w.staff_id, w.w_start, w.w_end, (b.blocked_until at time zone s.tz) as local_start
    from windows w, s, svc, public.bookings b
    where b.staff_id = w.staff_id and b.status in ('confirmed', 'completed', 'no_show') and b.id is distinct from p_ignore
      and (b.blocked_until at time zone s.tz) >= w.w_start
      and (b.blocked_until at time zone s.tz) + make_interval(mins => svc.duration_minutes) <= w.w_end
  ),
  candidates as (
    select distinct st.staff_id, (st.local_start at time zone s.tz) as starts_at,
      make_interval(mins => svc.duration_minutes) as length,
      make_interval(mins => svc.duration_minutes + s.buffer_minutes) as busy
    from starts st, s, svc
    where p_day between (now() at time zone s.tz)::date and (now() at time zone s.tz)::date + s.max_days_ahead
      -- The whole service fits inside their shift (or opening hours).
      and st.local_start + make_interval(mins => svc.duration_minutes) <= st.w_end
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

create or replace function public.booking_page(p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'business', jsonb_build_object(
      'name', b.name, 'logo', b.logo, 'timezone', b.timezone, 'phone', b.phone,
      'currency', upper(left(coalesce(nullif(b.currency, ''), 'AUD'), 3)),
      'email', coalesce(nullif(b.business_email, ''), b.owner_email)
    ),
    'accepting', bs.accepting,
    'maxDaysAhead', bs.max_days_ahead,
    'cancelNoticeHours', bs.cancel_notice_hours,
    'cancellationPolicy', bs.cancellation_policy,
    -- Deposits and cancellation fees (worked out per price on the page, and again when booking).
    'deposit', jsonb_build_object('type', bs.deposit_type, 'value', bs.deposit_value),
    'cancellationFee', jsonb_build_object('enabled', bs.cancellation_fee_enabled, 'type', bs.cancellation_fee_type,
      'value', bs.cancellation_fee_value, 'hours', bs.cancellation_fee_hours),
    'today', (now() at time zone b.timezone)::date,
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', sv.id, 'name', sv.name, 'description', sv.description, 'duration', sv.duration_minutes,
        'price', sv.price, 'category', sv.category,
        -- Who does it (bookable staff who ticked it) and what each charges: { "<staff id>": 55.00 }.
        'staffIds', coalesce((
          select jsonb_agg(p.staff_id) from public.booking_staff_prices p
          join public.booking_staff st on st.id = p.staff_id and st.active
          where p.service_id = sv.id
        ), '[]'),
        'staffPrices', coalesce((
          select jsonb_object_agg(p.staff_id, coalesce(p.price, sv.price)) from public.booking_staff_prices p
          join public.booking_staff st on st.id = p.staff_id and st.active
          where p.service_id = sv.id
        ), '{}')
      ) order by sv.sort, sv.name)
      from public.booking_services sv where sv.business_id = b.id and sv.active
    ), '[]'),
    'staff', coalesce((
      -- Bookable staff (the owner only if they do the work). photoPath is turned into a
      -- short-lived picture link by the booking-page function; nothing else about them is shared.
      select jsonb_agg(jsonb_build_object('id', st.id, 'name', st.name, 'photoPath', e.photo_path) order by st.sort, st.name)
      from public.booking_staff st left join public.employees e on e.id = st.employee_id
      where st.business_id = b.id and st.active
    ), '[]')
  )
  from public.booking_settings bs join public.businesses b on b.id = bs.business_id
  where bs.slug = lower(btrim(p_slug)) and b.system_type = 'bookings';
$$;

revoke execute on function public.booking_page(text) from public, anon, authenticated;
