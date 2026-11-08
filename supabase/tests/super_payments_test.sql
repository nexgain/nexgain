-- =====================================================================
-- Test: approving payroll makes Unpaid super records, and Pay Super moves
-- them Unpaid -> Processing -> Paid. Only the right owner can do it.
-- Run AFTER migrations/20261108000000_super_payments.sql.
-- Paste into Supabase > SQL Editor > Run.
--
-- It makes two pretend businesses, approves a pay run, pays the super, then
-- UNDOES EVERYTHING. So it always finishes with a red message:
--   "PASSED: super records ..."  = good
--   any other message            = a problem
-- =====================================================================

do $$
declare
  owner_a uuid := gen_random_uuid();
  owner_b uuid := gen_random_uuid();
  worker_a uuid := gen_random_uuid();
  biz_a uuid;
  biz_b uuid;
  emp_a uuid;
  run public.pay_runs;
  rec public.super_payments;
  ids uuid[];
begin
  insert into auth.users (id, instance_id, aud, role, email)
  values
    (owner_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-sa-' || owner_a || '@example.com'),
    (owner_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-sb-' || owner_b || '@example.com'),
    (worker_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-swa-' || worker_a || '@example.com');

  insert into public.businesses (owner_id, owner_name, owner_email, name, invite_code, country)
  values (owner_a, 'Test A', 'a@example.com', 'Test A', 'SUPA' || left(owner_a::text, 8), 'AU') returning id into biz_a;
  insert into public.businesses (owner_id, owner_name, owner_email, name, invite_code, country)
  values (owner_b, 'Test B', 'b@example.com', 'Test B', 'SUPB' || left(owner_b::text, 8), 'AU') returning id into biz_b;
  insert into public.employees (user_id, business_id, full_name, email, employment_type)
  values (worker_a, biz_a, 'Worker A', 'wa@example.com', 'Casual') returning id into emp_a;

  -- The super rate is one setting on the business.
  if (select super_rate from public.businesses where id = biz_a) <> 0.12 then
    raise exception 'FAILED: the default super rate should be 0.12';
  end if;

  -- Approve a pay run with payday Friday 2026-11-06: due 7 business days later = Tuesday 2026-11-17.
  perform set_config('request.jwt.claims', json_build_object('sub', owner_a, 'role', 'authenticated')::text, true);
  run := public.approve_pay_run(date '2026-10-26', date '2026-11-01', date '2026-11-06', jsonb_build_array(jsonb_build_object(
    'employee_id', emp_a,
    'hours', 40, 'rate', 30, 'ordinary_hours', 38, 'overtime_hours', 2, 'ordinary_rate', 30, 'overtime_rate', 45,
    'ordinary_pay', 1140, 'overtime_pay', 90, 'overtime_after_hours', 8, 'gross', 1230, 'tax', 246, 'net', 984,
    'super', 136.8, 'qualifying_earnings', 1140, 'super_rate', 0.12)));

  select * into rec from public.super_payments where pay_run_id = run.id;
  if rec.id is null then raise exception 'FAILED: approving payroll did not make a super record'; end if;
  if rec.status <> 'unpaid' or rec.super_amount <> 136.8 or rec.qualifying_earnings <> 1140 or rec.super_rate <> 0.12 then
    raise exception 'FAILED: super record has the wrong amounts or status: %', row_to_json(rec);
  end if;
  if rec.due_date <> date '2026-11-17' then
    raise exception 'FAILED: due date should be 2026-11-17 (payday + 7 business days) but was %', rec.due_date;
  end if;
  ids := array[rec.id];

  -- Owner B can't pay owner A's super.
  perform set_config('request.jwt.claims', json_build_object('sub', owner_b, 'role', 'authenticated')::text, true);
  begin
    perform public.set_super_status(ids, 'processing');
    raise exception 'FAILED: another business could change this super';
  exception when others then
    if sqlerrm like 'FAILED%' then raise; end if;
  end;

  -- Unpaid can't jump straight to Paid.
  perform set_config('request.jwt.claims', json_build_object('sub', owner_a, 'role', 'authenticated')::text, true);
  begin
    perform public.set_super_status(ids, 'paid', 'X');
    raise exception 'FAILED: unpaid super went straight to paid';
  exception when others then
    if sqlerrm like 'FAILED%' then raise; end if;
  end;

  -- Unpaid -> Processing -> Paid.
  perform public.set_super_status(ids, 'processing');
  if (select status from public.super_payments where id = rec.id) <> 'processing' then
    raise exception 'FAILED: super did not become processing';
  end if;
  perform public.set_super_status(ids, 'paid', 'SIM-TEST');
  select * into rec from public.super_payments where id = rec.id;
  if rec.status <> 'paid' or rec.paid_at is null or rec.provider_reference <> 'SIM-TEST' then
    raise exception 'FAILED: super was not marked paid with a paid date and reference';
  end if;

  -- Paid super can't go back to unpaid (no paying twice).
  begin
    perform public.set_super_status(ids, 'unpaid');
    raise exception 'FAILED: paid super went back to unpaid';
  exception when others then
    if sqlerrm like 'FAILED%' then raise; end if;
  end;

  raise exception 'PASSED: super records are made on approval, due 7 business days after payday, and only the owner can pay them. All test data has been removed.';
end;
$$;
