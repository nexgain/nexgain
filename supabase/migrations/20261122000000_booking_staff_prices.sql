-- NexGain Bookings: staff prices. A staff member can have their own price for a
-- service (e.g. a senior barber charges more); without one, the service's usual
-- price is used. Customers see the price for the person they pick, and a booking
-- is saved at the price of whoever does it ("Anyone available" included).
-- booking_page and booking_create are the same as in 20261117000000_bookings.sql
-- with the price added. Safe to run again. Needs 20261117000000_bookings.sql first.

create table if not exists public.booking_staff_prices (
  staff_id uuid not null references public.booking_staff (id) on delete cascade,
  service_id uuid not null references public.booking_services (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  price numeric(10, 2) not null check (price >= 0),
  updated_at timestamptz not null default now(),
  primary key (staff_id, service_id)
);
create index if not exists booking_staff_prices_service on public.booking_staff_prices (service_id);

-- Only the owner sets prices; staff can see them. Customers see them only through the booking page.
alter table public.booking_staff_prices enable row level security;
drop policy if exists "owner manages staff prices" on public.booking_staff_prices;
create policy "owner manages staff prices" on public.booking_staff_prices for all to authenticated
  using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));
drop policy if exists "staff see staff prices" on public.booking_staff_prices;
create policy "staff see staff prices" on public.booking_staff_prices for select to authenticated
  using (business_id = public.my_employee_business_id());

-- A price must be for a person and a service of the same business.
create or replace function private.check_staff_price()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.booking_staff where id = new.staff_id and business_id = new.business_id)
     or not exists (select 1 from public.booking_services where id = new.service_id and business_id = new.business_id) then
    raise exception 'That person or service belongs to another business.';
  end if;
  return new;
end;
$$;
drop trigger if exists booking_staff_prices_check on public.booking_staff_prices;
create trigger booking_staff_prices_check before insert or update on public.booking_staff_prices
  for each row execute function private.check_staff_price();

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
        'price', sv.price, 'staffIds', sv.staff_ids,
        -- Staff with their own price for this service: { "<staff id>": 55.00 }.
        'staffPrices', coalesce((
          select jsonb_object_agg(p.staff_id, p.price) from public.booking_staff_prices p
          join public.booking_staff st on st.id = p.staff_id and st.active
          where p.service_id = sv.id
        ), '{}')
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
        s.business_id, svc.id, cand.staff_id, p_staff is not null, svc.name, svc.duration_minutes,
        -- Their own price for this service, or the usual one.
        coalesce((select p.price from public.booking_staff_prices p where p.staff_id = cand.staff_id and p.service_id = svc.id), svc.price),
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

revoke execute on function public.booking_page(text) from public, anon, authenticated;
revoke execute on function public.booking_create(text, uuid, uuid, timestamptz, text, text, text, text) from public, anon, authenticated;
