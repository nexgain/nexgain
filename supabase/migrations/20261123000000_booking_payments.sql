-- NexGain Bookings: deposits and cancellation fees.
--   * Deposit (booking_settings.deposit_type / deposit_value, already there):
--     'none', 'fixed' (an amount, never more than the price) or 'percent' of
--     the price the customer pays. Worked out when booking, and paid straight
--     after by the booking-page function through _shared/paymentService.ts
--     (Stripe goes there later; for now it pretends the payment worked).
--   * Cancellation fee: on or off, 'fixed' or 'percent', and the window (e.g.
--     cancelling less than 24 hours before). With it on, customers can cancel
--     online until the appointment; inside the window they see the fee and agree
--     to it first. It comes out of the deposit; the rest of the deposit is refunded.
-- booking_customer_view, booking_page and booking_create are the latest versions
-- (20261117000000_bookings.sql, 20261122000000_booking_staff_prices.sql) with the
-- deposit and fee added. Safe to run again.

alter table public.booking_settings add column if not exists cancellation_fee_enabled boolean not null default false;
alter table public.booking_settings add column if not exists cancellation_fee_type text not null default 'fixed';
alter table public.booking_settings add column if not exists cancellation_fee_value numeric(10, 2) not null default 0;
alter table public.booking_settings add column if not exists cancellation_fee_hours int not null default 24;
do $$
begin
  alter table public.booking_settings add constraint booking_settings_fee_check check (
    cancellation_fee_type in ('fixed', 'percent') and cancellation_fee_value >= 0
    and (cancellation_fee_type <> 'percent' or cancellation_fee_value <= 100)
    and cancellation_fee_hours between 0 and 720
    and (deposit_type <> 'percent' or deposit_value <= 100));
exception when duplicate_object then null;
end;
$$;

-- The fee charged when the customer cancelled late, and where that's up to.
alter table public.bookings add column if not exists cancellation_fee numeric(10, 2) not null default 0 check (cancellation_fee >= 0);
alter table public.bookings add column if not exists fee_status text not null default 'none'
  check (fee_status in ('none', 'pending', 'charged', 'failed', 'waived'));

-- The deposit for a price: none, a fixed amount (never more than the price) or a percentage.
create or replace function private.deposit_for(p_price numeric, p_type text, p_value numeric)
returns numeric language sql immutable set search_path = '' as $$
  select case
    when p_type = 'fixed' then round(case when p_price is null then p_value else least(p_value, p_price) end, 2)
    when p_type = 'percent' then round(coalesce(p_price, 0) * p_value / 100, 2)
    when p_type = 'full' then coalesce(p_price, 0)
    else 0 end;
$$;

-- The cancellation fee if the customer cancelled now (0 outside the window or with fees off).
create or replace function private.cancel_fee_now(p_price numeric, p_start timestamptz, s public.booking_settings)
returns numeric language sql stable set search_path = '' as $$
  select case
    when not s.cancellation_fee_enabled or now() < p_start - make_interval(hours => s.cancellation_fee_hours) then 0
    when s.cancellation_fee_type = 'percent' then round(coalesce(p_price, 0) * s.cancellation_fee_value / 100, 2)
    else round(case when p_price is null then s.cancellation_fee_value else least(s.cancellation_fee_value, p_price) end, 2)
    end;
$$;

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
    -- With cancellation fees on, customers can cancel online until the appointment (a fee may apply).
    'canCancel', bk.status = 'confirmed' and now() < bk.starts_at - case when bs.cancellation_fee_enabled then interval '0' else make_interval(hours => bs.cancel_notice_hours) end,
    'feeIfCancelledNow', private.cancel_fee_now(bk.price, bk.starts_at, bs),
    'depositAmount', bk.deposit_amount,
    'paymentStatus', bk.payment_status,
    'cancellationFee', bk.cancellation_fee,
    'feeStatus', bk.fee_status,
    'feePolicy', jsonb_build_object('enabled', bs.cancellation_fee_enabled, 'type', bs.cancellation_fee_type,
      'value', bs.cancellation_fee_value, 'hours', bs.cancellation_fee_hours),
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
  v_deposit numeric;
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
      -- The deposit, from the price this person charges (paid next, by the booking-page function).
      v_deposit := private.deposit_for(
        coalesce((select p.price from public.booking_staff_prices p where p.staff_id = cand.staff_id and p.service_id = svc.id), svc.price),
        s.deposit_type, s.deposit_value);
      insert into public.bookings (
        business_id, service_id, staff_id, staff_chosen, service_name, duration_minutes, price,
        customer_name, customer_phone, customer_email, notes, starts_at, ends_at, blocked_until, source,
        deposit_amount, payment_status
      ) values (
        s.business_id, svc.id, cand.staff_id, p_staff is not null, svc.name, svc.duration_minutes,
        -- Their own price for this service, or the usual one.
        coalesce((select p.price from public.booking_staff_prices p where p.staff_id = cand.staff_id and p.service_id = svc.id), svc.price),
        v_name, v_phone, v_email, v_notes, p_start, p_start + make_interval(mins => svc.duration_minutes),
        p_start + make_interval(mins => svc.duration_minutes + s.buffer_minutes), 'online',
        v_deposit, case when v_deposit > 0 then 'pending' else 'none' end
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

-- Customer cancels. Without fees: only until cancel_notice_hours before (as before).
-- With fees: until the appointment; inside the fee window they must agree to the
-- fee first (p_accept_fee), else { error: 'fee', fee }.
-- Returns { booking, fee } or { error: 'not_found' | 'too_late' | 'fee' }.
drop function if exists public.booking_cancel(text);
create or replace function public.booking_cancel(p_token text, p_accept_fee boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  bk public.bookings;
  s public.booking_settings;
  fee numeric;
begin
  select * into bk from public.bookings where manage_token = p_token for update;
  if bk.id is null or bk.status <> 'confirmed' then return jsonb_build_object('error', 'not_found'); end if;
  select * into s from public.booking_settings where business_id = bk.business_id;
  -- (Brackets: inside IF, a bare CASE ... THEN would end the condition early.)
  if now() >= bk.starts_at - (case when s.cancellation_fee_enabled then interval '0' else make_interval(hours => s.cancel_notice_hours) end) then
    return jsonb_build_object('error', 'too_late');
  end if;
  fee := private.cancel_fee_now(bk.price, bk.starts_at, s);
  if fee > 0 and not p_accept_fee then return jsonb_build_object('error', 'fee', 'fee', fee); end if;
  update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = 'customer', updated_at = now(),
    cancellation_fee = fee, fee_status = case when fee > 0 then 'pending' else 'none' end
  where id = bk.id;
  return jsonb_build_object('booking', private.booking_customer_view(bk.id), 'fee', fee);
end;
$$;

-- What the payment service did (server only): the deposit paid, refunded or failed,
-- and the cancellation fee charged. A failed deposit cancels the booking (frees the time).
create or replace function public.booking_record_payment(p_booking uuid, p_payment_status text, p_payment_ref text, p_fee_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.bookings set
    payment_status = coalesce(p_payment_status, payment_status),
    payment_ref = coalesce(nullif(p_payment_ref, ''), payment_ref),
    fee_status = coalesce(p_fee_status, fee_status),
    status = case when p_payment_status = 'failed' and status = 'confirmed' then 'cancelled' else status end,
    cancelled_at = case when p_payment_status = 'failed' and status = 'confirmed' then now() else cancelled_at end,
    cancelled_by = case when p_payment_status = 'failed' and status = 'confirmed' then 'business' else cancelled_by end,
    updated_at = now()
  where id = p_booking;
end;
$$;

revoke execute on function public.booking_page(text) from public, anon, authenticated;
revoke execute on function public.booking_create(text, uuid, uuid, timestamptz, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.booking_cancel(text, boolean) from public, anon, authenticated;
revoke execute on function public.booking_record_payment(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function private.booking_customer_view(uuid) from public, anon, authenticated;
