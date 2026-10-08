-- =====================================================================
-- Test: payroll numbers count up 1, 2, 3... separately for each business.
-- Run AFTER migrations/20261009000000_payment_files.sql.
-- Paste into Supabase > SQL Editor > Run.
--
-- It makes two pretend businesses, approves pay runs for them, checks the
-- numbers, then UNDOES EVERYTHING. So it always finishes with a red message:
--   "PASSED: payroll numbers count up correctly per business ..."  = good
--   any other message                                              = a problem
-- =====================================================================

do $$
declare
  owner_a uuid := gen_random_uuid();
  owner_b uuid := gen_random_uuid();
  worker_a uuid := gen_random_uuid();
  worker_b uuid := gen_random_uuid();
  biz_a uuid;
  biz_b uuid;
  emp_a uuid;
  emp_b uuid;
  run public.pay_runs;
  got int[] := '{}';
  slip jsonb;
begin
  insert into auth.users (id, instance_id, aud, role, email)
  values
    (owner_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-a-' || owner_a || '@example.com'),
    (owner_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-b-' || owner_b || '@example.com'),
    (worker_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-wa-' || worker_a || '@example.com'),
    (worker_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-wb-' || worker_b || '@example.com');

  insert into public.businesses (owner_id, owner_name, owner_email, name, invite_code, country)
  values (owner_a, 'Test A', 'a@example.com', 'Test A', 'TESTA' || left(owner_a::text, 8), 'AU') returning id into biz_a;
  insert into public.businesses (owner_id, owner_name, owner_email, name, invite_code, country)
  values (owner_b, 'Test B', 'b@example.com', 'Test B', 'TESTB' || left(owner_b::text, 8), 'US') returning id into biz_b;
  insert into public.employees (user_id, business_id, full_name, email) values (worker_a, biz_a, 'Worker A', 'wa@example.com') returning id into emp_a;
  insert into public.employees (user_id, business_id, full_name, email) values (worker_b, biz_b, 'Worker B', 'wb@example.com') returning id into emp_b;

  -- Approves one week for an employee, signed in as the given owner.
  -- Business A: weeks 1, 2, 3. Business B: week 1. Then A again: week 4.
  for i in 1..5 loop
    perform set_config('request.jwt.claims',
      json_build_object('sub', case when i = 4 then owner_b else owner_a end, 'role', 'authenticated')::text, true);
    slip := jsonb_build_array(jsonb_build_object(
      'employee_id', case when i = 4 then emp_b else emp_a end,
      'hours', 8, 'rate', 30, 'ordinary_hours', 8, 'overtime_hours', 0, 'ordinary_rate', 30, 'overtime_rate', 45,
      'ordinary_pay', 240, 'overtime_pay', 0, 'overtime_after_hours', 8, 'gross', 240, 'tax', 48, 'net', 192, 'super', 28.8));
    run := public.approve_pay_run(date '2026-01-05' + 7 * i, date '2026-01-11' + 7 * i, date '2026-01-12' + 7 * i, slip);
    got := got || run.payroll_number;
  end loop;

  if got <> array[1, 2, 3, 1, 4] then
    raise exception 'FAILED: expected payroll numbers 1,2,3,1,4 but got %', got;
  end if;
  if (select count(*) from public.payslips where pay_run_id is not null and business_id in (biz_a, biz_b) and status = 'approved') <> 5 then
    raise exception 'FAILED: expected 5 approved payslips';
  end if;

  -- Marking paid changes the pay run and its payslips.
  perform set_config('request.jwt.claims', json_build_object('sub', owner_a, 'role', 'authenticated')::text, true);
  run := public.mark_pay_run_paid((select id from public.pay_runs where business_id = biz_a and payroll_number = 2));
  if run.status <> 'paid' or run.paid_at is null
     or (select status from public.payslips where pay_run_id = run.id) <> 'paid' then
    raise exception 'FAILED: mark as paid did not update the pay run and payslip';
  end if;

  -- Owner B can't mark owner A's pay run as paid.
  perform set_config('request.jwt.claims', json_build_object('sub', owner_b, 'role', 'authenticated')::text, true);
  begin
    perform public.mark_pay_run_paid((select id from public.pay_runs where business_id = biz_a and payroll_number = 3));
    raise exception 'FAILED: another business could mark this pay run as paid';
  exception when others then
    if sqlerrm like 'FAILED%' then raise; end if;
  end;

  raise exception 'PASSED: payroll numbers count up correctly per business (A got 1,2,3,4 and B got 1). All test data has been removed.';
end;
$$;
