-- NexGain Bookings (System 2): customers book appointments online.
--
--   booking_settings  one per booking business: its public link name (slug),
--                     opening hours, buffer, notice, how far ahead, cancellation rules
--   booking_staff     who can be booked: the owner and each employee
--   booking_services  what can be booked: name, length, price, which staff do it
--   booking_time_off  days/hours off (one staff member, or the whole business)
--   bookings          the appointments
--
-- Customers never touch these tables. The public booking page goes through the
-- "booking-page" Edge Function, which calls the public.booking_* functions at
-- the bottom with the server key; those only ever return what a customer may
-- see (no other bookings, no private business data). Owners and staff use the
-- tables directly, limited by row level security.
--
-- Double bookings are impossible: the database refuses two bookings for the
-- same staff member whose times overlap (bookings_no_overlap), even if two
-- customers press "Confirm" at the same moment.
--
-- Times: stored as exact moments (timestamptz) and worked out in the
-- business's own time zone (businesses.timezone), so daylight saving in
-- Sydney, London or New York is handled. Safe to run again.

create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------
-- The business's time zone must be a real one (e.g. 'Europe/London').
-- ---------------------------------------------------------------------
create or replace function private.check_business_timezone()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.timezone is distinct from coalesce(old.timezone, '')
     and not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Unknown time zone: %', new.timezone;
  end if;
  return new;
end;
$$;
drop trigger if exists businesses_timezone_check on public.businesses;
create trigger businesses_timezone_check before insert or update of timezone on public.businesses
  for each row execute function private.check_business_timezone();

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table if not exists public.booking_settings (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  -- The end of the public link, e.g. "smith-barbers".
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 60),
  -- Off = the booking page says bookings are closed.
  accepting boolean not null default true,
  -- 7 days, Monday first: {"open": true, "start": "09:00", "end": "17:00"}.
  opening_hours jsonb not null default '[
    {"open": true, "start": "09:00", "end": "17:00"},
    {"open": true, "start": "09:00", "end": "17:00"},
    {"open": true, "start": "09:00", "end": "17:00"},
    {"open": true, "start": "09:00", "end": "17:00"},
    {"open": true, "start": "09:00", "end": "17:00"},
    {"open": true, "start": "09:00", "end": "14:00"},
    {"open": false, "start": "09:00", "end": "17:00"}
  ]' check (jsonb_typeof(opening_hours) = 'array' and jsonb_array_length(opening_hours) = 7),
  -- Start times are offered every this many minutes (9:00, 9:15, 9:30...).
  slot_minutes int not null default 15 check (slot_minutes in (5, 10, 15, 20, 30, 60)),
  -- Gap kept free after each booking (cleaning up, getting ready).
  buffer_minutes int not null default 0 check (buffer_minutes between 0 and 240),
  -- Customers can't book sooner than this from now.
  min_notice_minutes int not null default 60 check (min_notice_minutes between 0 and 43200),
  -- Customers can book up to this many days ahead.
  max_days_ahead int not null default 60 check (max_days_ahead between 1 and 365),
  -- Customers can cancel or move a booking until this many hours before it.
  cancel_notice_hours int not null default 24 check (cancel_notice_hours between 0 and 720),
  -- Shown to customers before they book, e.g. "No-shows are charged 50%".
  cancellation_policy text not null default '' check (length(cancellation_policy) <= 2000),
  -- Reminder sent this many hours before (Step 6).
  reminder_hours int not null default 24 check (reminder_hours between 1 and 168),
  -- Later: deposits or payment when booking. Not used yet.
  deposit_type text not null default 'none' check (deposit_type in ('none', 'fixed', 'percent', 'full')),
  deposit_value numeric(10, 2) not null default 0 check (deposit_value >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.booking_staff (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- The employee (null for the owner, or once the employee has been removed:
  -- their old bookings stay, and they can't be booked any more).
  employee_id uuid unique references public.employees (id) on delete set null,
  is_owner boolean not null default false,
  -- Shown to customers, e.g. "Sam".
  name text not null check (length(name) between 1 and 100),
  -- Off = can't be booked.
  active boolean not null default true,
  -- Their own week, 7 days Monday first {"working": true, "start": "09:00", "end": "17:00"};
  -- null = the business's opening hours.
  hours jsonb check (hours is null or (jsonb_typeof(hours) = 'array' and jsonb_array_length(hours) = 7)),
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists booking_staff_one_owner on public.booking_staff (business_id) where is_owner;

-- An employee removed from the business can't be booked any more.
create or replace function private.booking_staff_left()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.employee_id is not null and new.employee_id is null and not new.is_owner then new.active := false; end if;
  return new;
end;
$$;
drop trigger if exists booking_staff_left on public.booking_staff;
create trigger booking_staff_left before update of employee_id on public.booking_staff
  for each row execute function private.booking_staff_left();

create table if not exists public.booking_services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (length(name) between 1 and 100),
  description text not null default '' check (length(description) <= 1000),
  duration_minutes int not null default 30 check (duration_minutes between 5 and 600),
  -- null = no price shown.
  price numeric(10, 2) check (price is null or price >= 0),
  -- booking_staff ids who do this service; empty = everyone.
  staff_ids uuid[] not null default '{}',
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists booking_services_business on public.booking_services (business_id);

create table if not exists public.booking_time_off (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- null = the whole business is closed (e.g. a public holiday).
  staff_id uuid references public.booking_staff (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- Staff ask for time off; the owner approves it (Step 5). Owner-added = approved.
  status text not null default 'approved' check (status in ('pending', 'approved', 'declined')),
  note text not null default '' check (length(note) <= 500),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists booking_time_off_business on public.booking_time_off (business_id, starts_at);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  service_id uuid references public.booking_services (id) on delete set null,
  staff_id uuid not null references public.booking_staff (id) on delete restrict,
  -- The customer picked this staff member (false = "Anyone available").
  staff_chosen boolean not null default true,
  -- Copied from the service when booked, so later price changes don't change old bookings.
  service_name text not null,
  duration_minutes int not null check (duration_minutes between 5 and 600),
  price numeric(10, 2),
  customer_name text not null check (length(customer_name) between 1 and 100),
  customer_phone text not null default '' check (length(customer_phone) <= 30),
  customer_email text not null default '' check (length(customer_email) <= 200),
  notes text not null default '' check (length(notes) <= 1000),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- ends_at plus the buffer: the staff member is busy until then.
  blocked_until timestamptz not null,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled', 'completed', 'no_show')),
  -- 'online' = the booking page; 'owner' = added by hand (walk-in, phone call).
  source text not null default 'online' check (source in ('online', 'owner')),
  -- Secret code in the customer's "change or cancel" link.
  manage_token text not null unique default translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_'),
  cancelled_at timestamptz,
  cancelled_by text check (cancelled_by in ('customer', 'business')),
  reminder_sent_at timestamptz,
  -- Later: deposits or payment when booking. Not used yet.
  deposit_amount numeric(10, 2) not null default 0 check (deposit_amount >= 0),
  payment_status text not null default 'none' check (payment_status in ('none', 'pending', 'paid', 'refunded', 'failed')),
  payment_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at and blocked_until >= ends_at)
);
create index if not exists bookings_business_time on public.bookings (business_id, starts_at);
create index if not exists bookings_staff_time on public.bookings (staff_id, starts_at);

-- No double bookings: one staff member can't have two bookings at overlapping times.
do $$
begin
  alter table public.bookings add constraint bookings_no_overlap
    exclude using gist (staff_id with =, tstzrange(starts_at, blocked_until) with &&)
    where (status in ('confirmed', 'completed', 'no_show'));
exception when duplicate_object or duplicate_table then null;
end;
$$;

-- ---------------------------------------------------------------------
-- Who can see and change what (customers: nothing; see the functions below)
-- ---------------------------------------------------------------------
alter table public.booking_settings enable row level security;
alter table public.booking_staff enable row level security;
alter table public.booking_services enable row level security;
alter table public.booking_time_off enable row level security;
alter table public.bookings enable row level security;

drop policy if exists "owner manages booking settings" on public.booking_settings;
create policy "owner manages booking settings" on public.booking_settings for all to authenticated
  using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));
drop policy if exists "staff see booking settings" on public.booking_settings;
create policy "staff see booking settings" on public.booking_settings for select to authenticated
  using (business_id = public.my_employee_business_id());

drop policy if exists "owner manages booking staff" on public.booking_staff;
create policy "owner manages booking staff" on public.booking_staff for all to authenticated
  using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));
drop policy if exists "staff see booking staff" on public.booking_staff;
create policy "staff see booking staff" on public.booking_staff for select to authenticated
  using (business_id = public.my_employee_business_id());

drop policy if exists "owner manages booking services" on public.booking_services;
create policy "owner manages booking services" on public.booking_services for all to authenticated
  using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));
drop policy if exists "staff see booking services" on public.booking_services;
create policy "staff see booking services" on public.booking_services for select to authenticated
  using (business_id = public.my_employee_business_id());

drop policy if exists "owner manages time off" on public.booking_time_off;
create policy "owner manages time off" on public.booking_time_off for all to authenticated
  using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));
drop policy if exists "staff see time off" on public.booking_time_off;
create policy "staff see time off" on public.booking_time_off for select to authenticated
  using (business_id = public.my_employee_business_id());

-- Staff see only their own bookings; the owner sees and manages all of them.
drop policy if exists "owner manages bookings" on public.bookings;
create policy "owner manages bookings" on public.bookings for all to authenticated
  using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));
drop policy if exists "staff see their bookings" on public.bookings;
create policy "staff see their bookings" on public.bookings for select to authenticated
  using (staff_id in (select id from public.booking_staff where employee_id = public.my_employee_id()));

-- ---------------------------------------------------------------------
-- Setting up a booking business (runs by itself)
-- ---------------------------------------------------------------------

-- A link name made from the business name, e.g. "Smith's Barbers" -> "smiths-barbers"
-- (or "smiths-barbers-2" when taken).
create or replace function private.booking_slug(p_name text, p_business uuid)
returns text language plpgsql stable set search_path = '' as $$
declare
  base text := trim(both '-' from left(trim(both '-' from regexp_replace(
    regexp_replace(lower(coalesce(p_name, '')), '[''’]', '', 'g'), '[^a-z0-9]+', '-', 'g')), 50));
  candidate text;
  n int := 1;
begin
  if base = '' then base := 'book'; end if;
  candidate := base;
  while exists (select 1 from public.booking_settings where slug = candidate and business_id <> p_business) loop
    n := n + 1;
    candidate := base || '-' || n;
  end loop;
  return candidate;
end;
$$;

-- The booking system for a business: settings, the owner (and any staff) as
-- bookable people, and the services chosen at sign-up (30 minutes, no price yet).
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

  insert into public.booking_services (business_id, name, sort)
  select b.id, left(s.name, 100), s.n::int from unnest(b.services) with ordinality as s (name, n)
  where length(btrim(s.name)) > 0;
end;
$$;

create or replace function private.businesses_bookings_setup()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.system_type = 'bookings' then perform private.setup_bookings(new.id); end if;
  return new;
end;
$$;
drop trigger if exists businesses_bookings_setup on public.businesses;
create trigger businesses_bookings_setup after insert or update of system_type on public.businesses
  for each row execute function private.businesses_bookings_setup();

-- New staff at a booking business can be booked straight away.
create or replace function private.employees_booking_staff()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.booking_settings where business_id = new.business_id)
     and length(btrim(new.full_name)) > 0 then
    insert into public.booking_staff (business_id, employee_id, name, sort)
    values (new.business_id, new.id, new.full_name, 1)
    on conflict (employee_id) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists employees_booking_staff on public.employees;
create trigger employees_booking_staff after insert on public.employees
  for each row execute function private.employees_booking_staff();

-- ---------------------------------------------------------------------
-- Free times
-- ---------------------------------------------------------------------

-- Every free start time on one day (business time) for a service: each one
-- with a staff member who can do it. A time is free when the staff member is
-- working (within the business's opening hours and their own hours), it isn't
-- too soon or too far ahead, and the whole appointment plus the buffer
-- doesn't overlap another booking or time off. p_ignore = a booking being moved.
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
  windows as (
    select st.id as staff_id,
      greatest((s.opening_hours -> d.i ->> 'start')::time, coalesce((st.hours -> d.i ->> 'start')::time, time '00:00')) as w_start,
      least((s.opening_hours -> d.i ->> 'end')::time, coalesce((st.hours -> d.i ->> 'end')::time, time '23:59')) as w_end
    from staff st, s, (select extract(isodow from p_day)::int - 1 as i) d
    where coalesce((s.opening_hours -> d.i ->> 'open')::boolean, false)
      and (st.hours is null or coalesce((st.hours -> d.i ->> 'working')::boolean, false))
  ),
  candidates as (
    select w.staff_id, (g.local_start at time zone s.tz) as starts_at,
      make_interval(mins => svc.duration_minutes) as length,
      make_interval(mins => svc.duration_minutes + s.buffer_minutes) as busy
    from windows w, s, svc,
      generate_series(p_day + w.w_start, p_day + w.w_end - make_interval(mins => svc.duration_minutes), make_interval(mins => s.slot_minutes)) as g (local_start)
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
      select 1 from public.booking_time_off o
      where o.business_id = p_business and o.status = 'approved' and (o.staff_id is null or o.staff_id = c.staff_id)
        and tstzrange(o.starts_at, o.ends_at) && tstzrange(c.starts_at, c.starts_at + c.length)
    )
  order by c.starts_at, c.staff_id;
$$;

-- ---------------------------------------------------------------------
-- What customers see (the booking page; server key only)
-- ---------------------------------------------------------------------

-- One booking as the customer sees it: no other bookings, no private details.
create or replace function private.booking_customer_view(p_booking uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'token', bk.manage_token,
    'status', bk.status,
    'service', bk.service_name,
    'serviceId', bk.service_id,
    'duration', bk.duration_minutes,
    'price', bk.price,
    'staff', st.name,
    'staffId', case when bk.staff_chosen then bk.staff_id end,
    'start', bk.starts_at,
    'end', bk.ends_at,
    'customerName', bk.customer_name,
    'customerEmail', bk.customer_email,
    'canChange', bk.status = 'confirmed' and now() < bk.starts_at - make_interval(hours => bs.cancel_notice_hours),
    'cancelNoticeHours', bs.cancel_notice_hours,
    'cancellationPolicy', bs.cancellation_policy,
    'business', jsonb_build_object(
      'name', b.name, 'slug', bs.slug, 'timezone', b.timezone, 'phone', b.phone,
      -- e.g. 'AUD' (from 'AUD – Australian Dollar').
      'currency', upper(left(coalesce(nullif(b.currency, ''), 'AUD'), 3)),
      'email', coalesce(nullif(b.business_email, ''), b.owner_email)
    )
  )
  from public.bookings bk
  join public.booking_staff st on st.id = bk.staff_id
  join public.businesses b on b.id = bk.business_id
  join public.booking_settings bs on bs.business_id = bk.business_id
  where bk.id = p_booking;
$$;

-- The booking page: the business's public details, services and staff.
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
    'today', (now() at time zone b.timezone)::date,
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', sv.id, 'name', sv.name, 'description', sv.description, 'duration', sv.duration_minutes,
        'price', sv.price, 'staffIds', sv.staff_ids
      ) order by sv.sort, sv.name)
      from public.booking_services sv where sv.business_id = b.id and sv.active
    ), '[]'),
    'staff', coalesce((
      select jsonb_agg(jsonb_build_object('id', st.id, 'name', st.name) order by st.sort, st.name)
      from public.booking_staff st where st.business_id = b.id and st.active
    ), '[]')
  )
  from public.booking_settings bs join public.businesses b on b.id = bs.business_id
  where bs.slug = lower(btrim(p_slug)) and b.system_type = 'bookings';
$$;

-- Days (from p_from, up to 62) that have at least one free time.
create or replace function public.booking_days(p_slug text, p_service uuid, p_staff uuid, p_from date, p_days int)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(d.day order by d.day), '[]')
  from public.booking_settings bs,
    lateral (select (p_from + n)::date as day from generate_series(0, least(greatest(p_days, 1), 62) - 1) as n) d
  where bs.slug = lower(btrim(p_slug))
    and exists (select 1 from private.free_slots(bs.business_id, p_service, p_staff, d.day));
$$;

-- Free times on one day: [{ "start": exact moment, "staff": [who's free] }].
create or replace function public.booking_slots(p_slug text, p_service uuid, p_staff uuid, p_day date)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('start', f.starts_at, 'staff', f.staff) order by f.starts_at), '[]')
  from public.booking_settings bs,
    lateral (
      select fs.starts_at, jsonb_agg(fs.staff_id) as staff
      from private.free_slots(bs.business_id, p_service, p_staff, p_day) fs
      group by fs.starts_at
    ) f
  where bs.slug = lower(btrim(p_slug));
$$;

-- Makes a booking if the time is still free. With p_staff null ("Anyone
-- available"), the least busy free staff member that day gets it. Returns
-- { booking } or { error: 'not_found' | 'service' | 'details' | 'too_many' | 'taken' }.
create or replace function public.booking_create(
  p_slug text, p_service uuid, p_staff uuid, p_start timestamptz,
  p_name text, p_phone text, p_email text, p_notes text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.booking_settings;
  tz text;
  svc public.booking_services;
  v_day date;
  cand record;
  new_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_notes text := left(btrim(coalesce(p_notes, '')), 1000);
begin
  select bs.* into s from public.booking_settings bs where bs.slug = lower(btrim(p_slug));
  select b.timezone into tz from public.businesses b where b.id = s.business_id and b.system_type = 'bookings';
  if s.business_id is null or tz is null or not s.accepting then return jsonb_build_object('error', 'not_found'); end if;

  select * into svc from public.booking_services where id = p_service and business_id = s.business_id and active;
  if svc.id is null then return jsonb_build_object('error', 'service'); end if;

  if length(v_name) not between 1 and 100
     or v_email !~ '^[^[:space:]@<>",;]+@[^[:space:]@<>",;]+[.][^[:space:]@<>",;]+$' or length(v_email) > 200
     or length(regexp_replace(v_phone, '[^0-9]', '', 'g')) not between 6 and 15 or length(v_phone) > 30 then
    return jsonb_build_object('error', 'details');
  end if;

  -- Stops one person filling the diary.
  if (select count(*) from public.bookings
      where business_id = s.business_id and status = 'confirmed' and starts_at > now()
        and (customer_email = v_email or customer_phone = v_phone)) >= 5 then
    return jsonb_build_object('error', 'too_many');
  end if;

  v_day := (p_start at time zone tz)::date;
  for cand in
    select f.staff_id from private.free_slots(s.business_id, svc.id, p_staff, v_day) f
    where f.starts_at = p_start
    order by (select count(*) from public.bookings b
              where b.staff_id = f.staff_id and b.status = 'confirmed' and (b.starts_at at time zone tz)::date = v_day), random()
  loop
    begin
      insert into public.bookings (
        business_id, service_id, staff_id, staff_chosen, service_name, duration_minutes, price,
        customer_name, customer_phone, customer_email, notes, starts_at, ends_at, blocked_until, source
      ) values (
        s.business_id, svc.id, cand.staff_id, p_staff is not null, svc.name, svc.duration_minutes, svc.price,
        v_name, v_phone, v_email, v_notes, p_start, p_start + make_interval(mins => svc.duration_minutes),
        p_start + make_interval(mins => svc.duration_minutes + s.buffer_minutes), 'online'
      ) returning id into new_id;
      return jsonb_build_object('booking', private.booking_customer_view(new_id));
    exception when exclusion_violation then
      -- Someone booked this staff member at the same moment: try the next one.
      null;
    end;
  end loop;
  return jsonb_build_object('error', 'taken');
end;
$$;

-- The customer's booking, from the secret code in their link.
create or replace function public.booking_by_token(p_token text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select private.booking_customer_view(id) from public.bookings where manage_token = p_token;
$$;

-- Free times for moving a booking (same service; same staff member unless they chose "Anyone").
create or replace function public.booking_slots_for_token(p_token text, p_day date)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('start', f.starts_at, 'staff', f.staff) order by f.starts_at), '[]')
  from public.bookings bk,
    lateral (
      select fs.starts_at, jsonb_agg(fs.staff_id) as staff
      from private.free_slots(bk.business_id, bk.service_id, case when bk.staff_chosen then bk.staff_id end, p_day, bk.id) fs
      group by fs.starts_at
    ) f
  where bk.manage_token = p_token and bk.status = 'confirmed';
$$;

create or replace function public.booking_days_for_token(p_token text, p_from date, p_days int)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(d.day order by d.day), '[]')
  from public.bookings bk,
    lateral (select (p_from + n)::date as day from generate_series(0, least(greatest(p_days, 1), 62) - 1) as n) d
  where bk.manage_token = p_token and bk.status = 'confirmed'
    and exists (select 1 from private.free_slots(bk.business_id, bk.service_id, case when bk.staff_chosen then bk.staff_id end, d.day, bk.id));
$$;

-- Customer cancels, if it's not too late (cancel_notice_hours).
-- Returns { booking } or { error: 'not_found' | 'too_late' }.
create or replace function public.booking_cancel(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  bk public.bookings;
  notice int;
begin
  select * into bk from public.bookings where manage_token = p_token for update;
  if bk.id is null or bk.status <> 'confirmed' then return jsonb_build_object('error', 'not_found'); end if;
  select cancel_notice_hours into notice from public.booking_settings where business_id = bk.business_id;
  if now() >= bk.starts_at - make_interval(hours => notice) then return jsonb_build_object('error', 'too_late'); end if;
  update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = 'customer', updated_at = now()
  where id = bk.id;
  return jsonb_build_object('booking', private.booking_customer_view(bk.id));
end;
$$;

-- Customer moves their booking to another free time, if it's not too late.
-- Returns { booking } or { error: 'not_found' | 'too_late' | 'taken' }.
create or replace function public.booking_reschedule(p_token text, p_start timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  bk public.bookings;
  s public.booking_settings;
  tz text;
  cand record;
begin
  select * into bk from public.bookings where manage_token = p_token for update;
  if bk.id is null or bk.status <> 'confirmed' or bk.service_id is null then return jsonb_build_object('error', 'not_found'); end if;
  select * into s from public.booking_settings where business_id = bk.business_id;
  select timezone into tz from public.businesses where id = bk.business_id;
  if now() >= bk.starts_at - make_interval(hours => s.cancel_notice_hours) then return jsonb_build_object('error', 'too_late'); end if;

  for cand in
    select f.staff_id from private.free_slots(bk.business_id, bk.service_id, case when bk.staff_chosen then bk.staff_id end,
      (p_start at time zone tz)::date, bk.id) f
    where f.starts_at = p_start
    order by (f.staff_id = bk.staff_id) desc, random()
  loop
    begin
      update public.bookings set
        staff_id = cand.staff_id,
        starts_at = p_start,
        ends_at = p_start + make_interval(mins => bk.duration_minutes),
        blocked_until = p_start + make_interval(mins => bk.duration_minutes) + (bk.blocked_until - bk.ends_at),
        reminder_sent_at = null,
        updated_at = now()
      where id = bk.id;
      return jsonb_build_object('booking', private.booking_customer_view(bk.id));
    exception when exclusion_violation then
      null;
    end;
  end loop;
  return jsonb_build_object('error', 'taken');
end;
$$;

-- Only the server (the booking-page Edge Function) may call these.
revoke execute on function public.booking_page(text) from public, anon, authenticated;
revoke execute on function public.booking_days(text, uuid, uuid, date, int) from public, anon, authenticated;
revoke execute on function public.booking_slots(text, uuid, uuid, date) from public, anon, authenticated;
revoke execute on function public.booking_create(text, uuid, uuid, timestamptz, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.booking_by_token(text) from public, anon, authenticated;
revoke execute on function public.booking_slots_for_token(text, date) from public, anon, authenticated;
revoke execute on function public.booking_days_for_token(text, date, int) from public, anon, authenticated;
revoke execute on function public.booking_cancel(text) from public, anon, authenticated;
revoke execute on function public.booking_reschedule(text, timestamptz) from public, anon, authenticated;
revoke execute on function private.free_slots(uuid, uuid, uuid, date, uuid) from public, anon, authenticated;
revoke execute on function private.booking_customer_view(uuid) from public, anon, authenticated;
revoke execute on function private.setup_bookings(uuid) from public, anon, authenticated;

-- Businesses that already chose NexGain Bookings get set up now.
select private.setup_bookings(id) from public.businesses where system_type = 'bookings';
