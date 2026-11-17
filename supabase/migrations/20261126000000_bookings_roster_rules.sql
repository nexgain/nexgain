-- NexGain Bookings: roster rules checked by the database, and the business type.
--
--   * A booking for a staff member must sit inside a time they're rostered on
--     (public.shifts), and the whole service must finish by the end of that
--     shift. This is checked on every new or moved booking, however it's made
--     (the booking link, or the owner adding or moving one in the app), so it
--     can't be got around. The owner's own bookings aren't on the roster (the
--     booking link only offers them in the opening hours).
--   * No double bookings: already enforced by bookings_no_overlap (one person
--     can't have two bookings whose times overlap, counting the gap after
--     each). The database applies it as each booking is saved, so two customers
--     booking the same time at the same moment can't both get it; the second
--     is told the time was just taken.
--   * New booking businesses no longer get the service-based system's service
--     list copied in as booking services. Their services come from the
--     business type picked at sign-up (booking_settings.business_types).
--   * The booking page gets the business type, so its wording fits ("Choose
--     your barber").
-- Safe to run again. Needs 20261125000000_bookings_staff_services.sql first.

-- ---------------------------------------------------------------------
-- Bookings must fit inside the person's rostered times
-- ---------------------------------------------------------------------
create or replace function private.check_booking_on_roster()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  st public.booking_staff;
  tz text;
  v_start timestamp;
  v_end timestamp;
begin
  -- Only bookings that hold a time (cancelled ones don't).
  if new.status not in ('confirmed', 'completed', 'no_show') then return new; end if;
  -- Status changes (Completed, No-show) on a booking whose time hasn't moved are fine.
  if tg_op = 'UPDATE' and old.status in ('confirmed', 'completed', 'no_show')
     and (old.starts_at, old.ends_at, old.staff_id) is not distinct from (new.starts_at, new.ends_at, new.staff_id) then
    return new;
  end if;

  select * into st from public.booking_staff where id = new.staff_id;
  if st.id is null or st.is_owner then return new; end if;

  select b.timezone into tz from public.businesses b where b.id = new.business_id;
  v_start := new.starts_at at time zone tz;
  v_end := new.ends_at at time zone tz;

  if not exists (
    select 1 from public.shifts sh
    where sh.business_id = new.business_id
      and st.employee_id = any (sh.employee_ids)
      and sh.date between v_start::date - 1 and v_start::date
      and sh.start_time ~ '^[0-9]{1,2}:[0-9]{2}$' and sh.end_time ~ '^[0-9]{1,2}:[0-9]{2}$'
      -- From the shift's start to its end (a shift past midnight ends the next day).
      and v_start >= sh.date + sh.start_time::time
      and v_end <= sh.date + sh.end_time::time
        + case when sh.end_time::time <= sh.start_time::time then interval '1 day' else interval '0' end
  ) then
    raise exception 'This person isn''t rostered on for all of that time.' using errcode = 'NXR01';
  end if;
  return new;
end;
$$;
revoke execute on function private.check_booking_on_roster() from public, anon, authenticated;

drop trigger if exists bookings_on_roster on public.bookings;
create trigger bookings_on_roster before insert or update on public.bookings
  for each row execute function private.check_booking_on_roster();

-- ---------------------------------------------------------------------
-- New booking businesses: no service-based services copied in
-- ---------------------------------------------------------------------
create or replace function private.setup_bookings(p_business uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  b public.businesses;
begin
  select * into b from public.businesses where id = p_business;
  if b.id is null or exists (select 1 from public.booking_settings where business_id = p_business) then return; end if;

  insert into public.booking_settings (business_id, slug) values (b.id, private.booking_slug(b.name, b.id));

  insert into public.booking_staff (business_id, is_owner, name, sort)
  values (b.id, true, coalesce(nullif(btrim(b.owner_name), ''), 'Owner'), 0);
  insert into public.booking_staff (business_id, employee_id, name, sort)
  select b.id, e.id, e.full_name, 1 from public.employees e
  where e.business_id = b.id and length(btrim(e.full_name)) > 0
  on conflict (employee_id) do nothing;
  -- Services: added by sign-up from the business type's preset list (never another type's).
end;
$$;
revoke execute on function private.setup_bookings(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- The booking page: as before, plus the business type
-- ---------------------------------------------------------------------
create or replace function public.booking_page(p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'business', jsonb_build_object(
      'name', b.name, 'logo', b.logo, 'timezone', b.timezone, 'phone', b.phone,
      'currency', upper(left(coalesce(nullif(b.currency, ''), 'AUD'), 3)),
      'email', coalesce(nullif(b.business_email, ''), b.owner_email),
      -- The booking business type picked at sign-up, e.g. "hair/barber" (sets the page's wording).
      'type', coalesce(bs.business_types[1], '')
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
