-- =====================================================================
-- Super (superannuation), paid separately from wages.
--   - the business's super rate (one value, 12%) and which pay items count
--     towards super ("qualifying earnings")
--   - employees' super fund USI/ABN and member number (optional)
--   - super_payments: one row per employee per pay run, made when payroll is
--     approved (Unpaid), then Processing and Paid when the owner pays super
-- Run once, after migrations/20261009000000_payment_files.sql:
--   Supabase > SQL Editor > New query > paste this whole file > Run.
-- Safe to run again.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Settings (on the business, so there's only one place to change them)
-- ---------------------------------------------------------------------

-- Superannuation Guarantee rate (12% from 1 July 2025; Payday Super from 1 July 2026).
alter table public.businesses add column if not exists super_rate numeric(5, 4) not null default 0.12;
do $$
begin
  alter table public.businesses add constraint businesses_super_rate_check check (super_rate >= 0 and super_rate <= 0.5);
exception when duplicate_object then null;
end;
$$;

-- Which pay items count towards super (yes/no each). Overtime doesn't by default.
-- New pay item types (e.g. a tool allowance) can be added as new keys later.
alter table public.businesses add column if not exists pay_item_super jsonb not null
  default '{"ordinary": true, "overtime": false, "commission": true, "allowance": true}';

-- ---------------------------------------------------------------------
-- Employee super fund details (all optional for now). The fund name was
-- already collected at sign-up (employees.super_fund).
-- Employees can change these themselves (the update guard only protects pay).
-- ---------------------------------------------------------------------

alter table public.employees
  add column if not exists super_fund_usi text,
  add column if not exists super_member_number text;
do $$
begin
  alter table public.employees add constraint employees_super_details_check
    check (coalesce(length(super_fund_usi), 0) <= 30 and coalesce(length(super_member_number), 0) <= 30);
exception when duplicate_object then null;
end;
$$;

-- ---------------------------------------------------------------------
-- Due date: payday + 7 business days (Monday to Friday; public holidays
-- aren't counted yet).
-- ---------------------------------------------------------------------

create or replace function private.add_business_days(p_date date, p_days int)
returns date language plpgsql immutable set search_path = '' as $$
declare
  d date := p_date;
  remaining int := p_days;
begin
  while remaining > 0 loop
    d := d + 1;
    if extract(isodow from d) < 6 then
      remaining := remaining - 1;
    end if;
  end loop;
  return d;
end;
$$;

-- ---------------------------------------------------------------------
-- Super payments
-- ---------------------------------------------------------------------

create table if not exists public.super_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  pay_run_id uuid not null references public.pay_runs (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  payslip_id uuid references public.payslips (id) on delete cascade,
  qualifying_earnings numeric(12, 2) not null default 0,
  super_rate numeric(5, 4) not null,
  super_amount numeric(12, 2) not null default 0,
  due_date date not null,
  status text not null default 'unpaid' check (status in ('unpaid', 'processing', 'paid')),
  paid_at timestamptz,
  -- The super provider / clearing house's reference (empty until one is connected).
  provider_reference text,
  created_at timestamptz not null default now(),
  unique (pay_run_id, employee_id)
);
create index if not exists super_payments_business_idx on public.super_payments (business_id, due_date);
create index if not exists super_payments_employee_idx on public.super_payments (employee_id);

-- Owners see their own business's super; employees see only their own.
alter table public.super_payments enable row level security;
drop policy if exists "super visible to self and owner" on public.super_payments;
create policy "super visible to self and owner" on public.super_payments for select to authenticated
  using (public.is_business_owner(business_id) or employee_id = public.my_employee_id());
-- Created and changed only through the functions below.
revoke all on public.super_payments from anon;
revoke insert, update, delete on public.super_payments from authenticated;

-- ---------------------------------------------------------------------
-- Approve payroll (replaces the earlier version): exactly as before, plus an
-- Unpaid super record for each person with super to pay.
-- ---------------------------------------------------------------------

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
    pay_run_id, payroll_number, pay_date, status, paid_at
  )
  select coalesce((x ->> 'id')::uuid, gen_random_uuid()), biz.id, (x ->> 'employee_id')::uuid, p_period_start, p_period_end,
    (x ->> 'hours')::numeric, (x ->> 'rate')::numeric, coalesce(x ->> 'pay_type', 'hourly'),
    (x ->> 'ordinary_hours')::numeric, (x ->> 'overtime_hours')::numeric, (x ->> 'ordinary_rate')::numeric,
    (x ->> 'overtime_rate')::numeric, (x ->> 'ordinary_pay')::numeric, (x ->> 'overtime_pay')::numeric,
    (x ->> 'overtime_after_hours')::numeric, (x ->> 'gross')::numeric, (x ->> 'tax')::numeric,
    (x ->> 'net')::numeric, (x ->> 'super')::numeric,
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

-- The bank file was made (replaces the earlier version). If the pay date has
-- already passed it moves to the new date, and so does unpaid super's due date.
create or replace function public.record_payment_file(p_pay_run_id uuid, p_pay_date date)
returns public.pay_runs language plpgsql security definer set search_path = '' as $$
declare
  run public.pay_runs;
begin
  select * into run from public.pay_runs r where r.id = p_pay_run_id and public.is_business_owner(r.business_id);
  if run.id is null then raise exception 'Not allowed.'; end if;
  update public.pay_runs set file_downloaded_at = now(),
    pay_date = case when status = 'approved' and p_pay_date is not null and p_pay_date > pay_date then p_pay_date else pay_date end
  where id = run.id returning * into run;
  update public.payslips set pay_date = run.pay_date where pay_run_id = run.id and status = 'approved';
  update public.super_payments set due_date = private.add_business_days(run.pay_date, 7)
  where pay_run_id = run.id and status = 'unpaid';
  return run;
end;
$$;

-- Moves super records along: unpaid -> processing -> paid (or processing back
-- to unpaid if the payment failed). Owner only. Used by services/super-payments.ts.
-- TODO(super provider): once a real clearing house is connected, "paid" should
-- be set by the server when the provider confirms (e.g. a webhook), not the app.
create or replace function public.set_super_status(p_ids uuid[], p_status text, p_reference text default null)
returns setof public.super_payments language plpgsql security definer set search_path = '' as $$
declare
  bid uuid;
begin
  select id into bid from public.businesses where owner_id = auth.uid();
  if bid is null then raise exception 'Only the business owner can pay super.'; end if;
  if p_status not in ('unpaid', 'processing', 'paid') then raise exception 'Unknown super status.'; end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 then raise exception 'There is no super to pay.'; end if;
  if exists (select 1 from public.super_payments s where s.id = any (p_ids) and s.business_id <> bid)
     or (select count(*) from public.super_payments s where s.id = any (p_ids)) <> array_length(p_ids, 1) then
    raise exception 'Not allowed.';
  end if;
  -- Only these steps are allowed (e.g. paid super can't go back to unpaid).
  if exists (
    select 1 from public.super_payments s where s.id = any (p_ids) and not (
      (p_status = 'processing' and s.status = 'unpaid')
      or (p_status = 'paid' and s.status = 'processing')
      or (p_status = 'unpaid' and s.status = 'processing')
    )
  ) then
    raise exception 'Some of this super has already been paid or is being paid.';
  end if;

  return query
    update public.super_payments s set
      status = p_status,
      paid_at = case when p_status = 'paid' then now() else null end,
      provider_reference = case when p_status = 'paid' then coalesce(p_reference, s.provider_reference) else s.provider_reference end
    where s.id = any (p_ids)
    returning s.*;
end;
$$;

revoke execute on function public.approve_pay_run(date, date, date, jsonb) from public, anon;
revoke execute on function public.record_payment_file(uuid, date) from public, anon;
revoke execute on function public.set_super_status(uuid[], text, text) from public, anon;
grant execute on function public.approve_pay_run(date, date, date, jsonb) to authenticated;
grant execute on function public.record_payment_file(uuid, date) to authenticated;
grant execute on function public.set_super_status(uuid[], text, text) to authenticated;

-- ---------------------------------------------------------------------
-- Pay runs approved before this file: their super becomes Unpaid records,
-- worked out on normal (ordinary-time) pay like it was then.
-- ---------------------------------------------------------------------

insert into public.super_payments (
  business_id, pay_run_id, employee_id, payslip_id, qualifying_earnings, super_rate, super_amount, due_date
)
select ps.business_id, ps.pay_run_id, ps.employee_id, ps.id, coalesce(ps.ordinary_pay, ps.gross), b.super_rate, ps.super,
  private.add_business_days(coalesce(ps.pay_date, ps.period_end), 7)
from public.payslips ps
join public.businesses b on b.id = ps.business_id
where ps.pay_run_id is not null and ps.super > 0
on conflict (pay_run_id, employee_id) do nothing;

-- ---------------------------------------------------------------------
-- Live updates
-- ---------------------------------------------------------------------

do $$
begin
  begin
    alter publication supabase_realtime add table public.super_payments;
  exception when duplicate_object then null;
  end;
end;
$$;
