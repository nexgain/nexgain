-- =====================================================================
-- NexGain: pay schedule (Payroll Settings).
--   businesses.pay_schedule: weekly or fortnightly, and the day pay periods
--   start (0 = Sunday ... 6 = Saturday). anchor = a day a full pay period
--   starts; from = the first day under this schedule (the day after the last
--   approved pay), so changing it never pays a day twice or skips one.
-- Existing businesses stay weekly, Monday to Sunday (1 Jan 2024 was a Monday).
-- Only the owner can change it (the existing "owner updates business" rule).
-- Run once: Supabase > SQL Editor > New query > paste this whole file > Run.
-- Safe to run again.
-- =====================================================================

alter table public.businesses add column if not exists pay_schedule jsonb not null
  default '{"frequency": "weekly", "start_day": 1, "anchor": "2024-01-01", "from": null}';

do $$
begin
  alter table public.businesses add constraint businesses_pay_schedule_check check (
    pay_schedule ->> 'frequency' in ('weekly', 'fortnightly')
    and jsonb_typeof(pay_schedule -> 'start_day') = 'number'
    and (pay_schedule ->> 'start_day')::int between 0 and 6
    and (pay_schedule ->> 'anchor') ~ '^\d{4}-\d{2}-\d{2}$'
    and (pay_schedule -> 'from' is null or jsonb_typeof(pay_schedule -> 'from') = 'null'
         or (pay_schedule ->> 'from') ~ '^\d{4}-\d{2}-\d{2}$')
  );
exception when duplicate_object then null;
end;
$$;
