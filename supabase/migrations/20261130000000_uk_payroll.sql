-- =====================================================================
-- UK payroll (United Kingdom businesses only): PAYE tax codes, National
-- Insurance on payslips, and monthly / four-weekly pay.
--
--   * employees: the UK tax code (e.g. 1257L) and "Scottish taxpayer".
--     Empty / off for everyone else, and never used outside the UK.
--   * payslips: employee NI, employer NI, the tax code and tax period
--     (e.g. M3) used. 0 / empty on every other country's payslips.
--   * approve_pay_run: saves those four extra payslip fields too. Everything
--     else it does is exactly as before (other countries don't send them).
--   * pay schedule: four-weekly and monthly are allowed, but ONLY for
--     businesses whose country is GB. Weekly and fortnightly as before.
--
-- Run once, after the earlier files:
--   Supabase > SQL Editor > New query > paste this whole file > Run.
-- Safe to run again.
-- =====================================================================

alter table public.employees add column if not exists uk_tax_code text;
alter table public.employees add column if not exists scottish_taxpayer boolean not null default false;
alter table public.employees drop constraint if exists employees_uk_tax_code_check;
alter table public.employees add constraint employees_uk_tax_code_check
  check (uk_tax_code is null or (length(uk_tax_code) between 2 and 12 and uk_tax_code ~ '^[A-Z0-9 ]+$'));

alter table public.payslips add column if not exists employee_ni numeric(12, 2) not null default 0;
alter table public.payslips add column if not exists employer_ni numeric(12, 2) not null default 0;
alter table public.payslips add column if not exists tax_code text;
alter table public.payslips add column if not exists tax_period text;

-- Four-weekly and monthly pay: UK businesses only.
alter table public.businesses drop constraint if exists businesses_pay_schedule_check;
alter table public.businesses add constraint businesses_pay_schedule_check check (
  (pay_schedule ->> 'frequency' in ('weekly', 'fortnightly')
    or (country = 'GB' and pay_schedule ->> 'frequency' in ('four-weekly', 'monthly')))
  and jsonb_typeof(pay_schedule -> 'start_day') = 'number'
  and (pay_schedule ->> 'start_day')::int between 0 and 6
  and (pay_schedule ->> 'anchor') ~ '^\d{4}-\d{2}-\d{2}$'
  and (pay_schedule -> 'from' is null or jsonb_typeof(pay_schedule -> 'from') = 'null'
       or (pay_schedule ->> 'from') ~ '^\d{4}-\d{2}-\d{2}$')
);

-- As in 20261108000000_super_payments.sql, plus employee_ni, employer_ni,
-- tax_code and tax_period on each payslip (0 / empty when not sent).
create or replace function public.approve_pay_run(p_period_start date, p_period_end date, p_pay_date date, p_payslips jsonb)
returns public.pay_runs language plpgsql security definer set search_path = '' as $$
declare
  biz public.businesses;
  n int;
  run public.pay_runs;
  people int;
begin
  select * into biz from public.businesses where owner_id = auth.uid();
  if biz.id is null then raise exception 'Only the business owner can approve payroll.'; end if;
  people := coalesce(jsonb_array_length(p_payslips), 0);
  if people = 0 then raise exception 'There is no one to pay.'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_payslips) x
    left join public.employees e on e.id = (x ->> 'employee_id')::uuid
    where e.id is null or e.business_id <> biz.id or e.employment_type = 'Contractor'
  ) then
    raise exception 'Someone in this pay run isn''t an employee of your business.';
  end if;

  -- Next number for this business. The row lock makes two approvals at the
  -- same moment wait for each other, so they can't get the same number.
  insert into public.payroll_counters as c (business_id, last_number) values (biz.id, 1)
  on conflict (business_id) do update set last_number = c.last_number + 1
  returning last_number into n;

  insert into public.pay_runs (business_id, payroll_number, period_start, period_end, pay_date, employee_count, total_net)
  values (biz.id, n, p_period_start, p_period_end, coalesce(p_pay_date, current_date), people,
    (select coalesce(sum((x ->> 'net')::numeric), 0) from jsonb_array_elements(p_payslips) x))
  returning * into run;

  -- One payslip per employee per period (the unique index stops double pay).
  insert into public.payslips (
    id, business_id, employee_id, period_start, period_end, hours, rate, pay_type, ordinary_hours, overtime_hours,
    ordinary_rate, overtime_rate, ordinary_pay, overtime_pay, overtime_after_hours, gross, tax, net, super,
    employee_ni, employer_ni, tax_code, tax_period,
    pay_run_id, payroll_number, pay_date, status, paid_at
  )
  select coalesce((x ->> 'id')::uuid, gen_random_uuid()), biz.id, (x ->> 'employee_id')::uuid, p_period_start, p_period_end,
    (x ->> 'hours')::numeric, (x ->> 'rate')::numeric, coalesce(x ->> 'pay_type', 'hourly'),
    (x ->> 'ordinary_hours')::numeric, (x ->> 'overtime_hours')::numeric, (x ->> 'ordinary_rate')::numeric,
    (x ->> 'overtime_rate')::numeric, (x ->> 'ordinary_pay')::numeric, (x ->> 'overtime_pay')::numeric,
    (x ->> 'overtime_after_hours')::numeric, (x ->> 'gross')::numeric, (x ->> 'tax')::numeric,
    (x ->> 'net')::numeric, (x ->> 'super')::numeric,
    coalesce((x ->> 'employee_ni')::numeric, 0), coalesce((x ->> 'employer_ni')::numeric, 0),
    nullif(x ->> 'tax_code', ''), nullif(x ->> 'tax_period', ''),
    run.id, n, run.pay_date, 'approved', null
  from jsonb_array_elements(p_payslips) x;

  -- Super to pay, from the same numbers as the payslip (never entered twice).
  insert into public.super_payments (
    business_id, pay_run_id, employee_id, payslip_id, qualifying_earnings, super_rate, super_amount, due_date
  )
  select biz.id, run.id, ps.employee_id, ps.id,
    coalesce((x ->> 'qualifying_earnings')::numeric, ps.ordinary_pay, 0),
    coalesce((x ->> 'super_rate')::numeric, biz.super_rate),
    ps.super,
    private.add_business_days(run.pay_date, 7)
  from jsonb_array_elements(p_payslips) x
  join public.payslips ps on ps.pay_run_id = run.id and ps.employee_id = (x ->> 'employee_id')::uuid
  where ps.super > 0;

  return run;
end;
$$;
revoke execute on function public.approve_pay_run(date, date, date, jsonb) from public, anon;
grant execute on function public.approve_pay_run(date, date, date, jsonb) to authenticated;
