-- =====================================================================
-- NexGain: overtime
--   - each employee's overtime rate (empty = automatic 1.5x their pay rate)
--   - the business's overtime rule ("overtime starts after 8 hours in a day")
--   - payslips keep the normal / overtime split used when they were approved
-- Run once, after the earlier files:
--   Supabase > SQL Editor > New query > paste this whole file > Run.
-- Safe to run again.
-- =====================================================================

-- Overtime rate per hour. null = "Auto": 1.5x the employee's pay rate, so it
-- follows pay rate changes. A number = a custom rate set by the owner.
alter table public.employees add column if not exists overtime_rate numeric(10, 2);
do $$
begin
  alter table public.employees add constraint employees_overtime_rate_check
    check (overtime_rate is null or (overtime_rate > 0 and overtime_rate <= 2000));
exception when duplicate_object then null;
end;
$$;

-- Only the owner can change pay (now including the overtime rate), employment
-- type, status and start date. Employees can still update their phone, position and photo.
create or replace function public.guard_employee_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.user_id := old.user_id;
  new.business_id := old.business_id;
  if not public.is_business_owner(old.business_id) then
    new.pay_rate := old.pay_rate;
    new.pay_type := old.pay_type;
    new.overtime_rate := old.overtime_rate;
    new.employment_type := old.employment_type;
    new.status := old.status;
    new.start_date := old.start_date;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- The business's overtime rules. Daily only for now; kept as a small JSON
-- object so weekly, double-time or weekend rules can be added later.
-- Only the owner can change it (only owners can update their business).
alter table public.businesses add column if not exists overtime_rules jsonb not null default '{"daily_after_hours": 8}';
do $$
begin
  alter table public.businesses add constraint businesses_overtime_rules_check
    check (
      jsonb_typeof(overtime_rules -> 'daily_after_hours') = 'number'
      and (overtime_rules ->> 'daily_after_hours')::numeric between 0.5 and 24
      and mod((overtime_rules ->> 'daily_after_hours')::numeric * 2, 1) = 0
    );
exception when duplicate_object then null;
end;
$$;

-- What each payslip was actually paid on, saved at approval so later changes to
-- a rate or the rule never change an approved payroll. (Payslips can't be
-- edited at all: there's no update rule for them.)
alter table public.payslips add column if not exists pay_type text not null default 'hourly';
alter table public.payslips add column if not exists ordinary_hours numeric(10, 2);
alter table public.payslips add column if not exists overtime_hours numeric(10, 2) not null default 0;
alter table public.payslips add column if not exists ordinary_rate numeric(10, 2);
alter table public.payslips add column if not exists overtime_rate numeric(10, 2) not null default 0;
alter table public.payslips add column if not exists ordinary_pay numeric(12, 2);
alter table public.payslips add column if not exists overtime_pay numeric(12, 2) not null default 0;
alter table public.payslips add column if not exists overtime_after_hours numeric(4, 2);

-- Payslips approved before overtime existed: all their hours were normal hours,
-- paid the way the employee was paid then.
update public.payslips p set pay_type = coalesce(e.pay_type, 'hourly')
from public.employees e
where e.id = p.employee_id and p.ordinary_hours is null;
update public.payslips set
  ordinary_hours = hours,
  ordinary_rate = rate,
  ordinary_pay = gross
where ordinary_hours is null;
