-- =====================================================================
-- NexGain Stage 4 update (run once, after schema.sql)
-- Paste into Supabase > SQL Editor > New query > Run. Safe to run again.
-- (schema.sql already includes this for brand-new setups.)
-- =====================================================================

-- An employee can only be paid once per pay period (stops double payments).
create unique index if not exists payslips_one_per_period on public.payslips (employee_id, period_start);
