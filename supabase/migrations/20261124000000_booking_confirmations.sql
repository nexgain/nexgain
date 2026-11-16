-- NexGain Bookings: booking confirmations by email and/or text message.
--   * bookings.confirm_by: how the customer wants their confirmation (and
--     messages about changes): 'email', 'sms' or 'both'. Set by the
--     booking-page function straight after booking.
--   * Customers give an email and/or a mobile: only the one(s) their
--     confirmation goes to are needed (the booking page checks which).
-- booking_create and booking_customer_view are the latest versions
-- (20261123000000_booking_payments.sql) with that change. Safe to run again.

alter table public.bookings add column if not exists confirm_by text not null default 'email';
do $$
begin
  alter table public.bookings add constraint bookings_confirm_by_check check (confirm_by in ('email', 'sms', 'both'));
exception when duplicate_object then null;
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
    'customerPhone', bk.customer_phone,
    'confirmBy', bk.confirm_by,
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

  -- A name, and an email and/or a mobile (whichever the confirmation goes to; the page checks which).
  if length(v_name) not between 1 and 100
     or (v_email <> '' and (v_email !~ '^[^[:space:]@<>",;]+@[^[:space:]@<>",;]+[.][^[:space:]@<>",;]+$' or length(v_email) > 200))
     or (v_phone <> '' and (length(regexp_replace(v_phone, '[^0-9]', '', 'g')) not between 6 and 15 or length(v_phone) > 30))
     or (v_email = '' and v_phone = '') then
    return jsonb_build_object('error', 'details');
  end if;

  -- Stops one person filling the diary.
  if (select count(*) from public.bookings
      where business_id = s.business_id and status = 'confirmed' and starts_at > now()
        and ((v_email <> '' and customer_email = v_email) or (v_phone <> '' and customer_phone = v_phone))) >= 5 then
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

revoke execute on function public.booking_create(text, uuid, uuid, timestamptz, text, text, text, text) from public, anon, authenticated;
revoke execute on function private.booking_customer_view(uuid) from public, anon, authenticated;
