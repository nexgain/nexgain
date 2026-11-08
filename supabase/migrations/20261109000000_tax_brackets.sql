-- =====================================================================
-- Tax from real tax brackets (replaces the flat 20% placeholder).
-- The brackets themselves live in the app (src/config/tax-brackets.ts);
-- the database only stores two settings:
--   - each employee: whether they claimed the tax-free threshold (yes by default)
--   - the business: a flat tax rate the owner enters, used only when NexGain
--     has no tax brackets for the business's country yet
-- Run once, after migrations/20261108000000_super_payments.sql:
--   Supabase > SQL Editor > New query > paste this whole file > Run.
-- Safe to run again.
-- =====================================================================

alter table public.employees add column if not exists tax_free_threshold boolean not null default true;

alter table public.businesses add column if not exists manual_tax_rate numeric(5, 4);
do $$
begin
  alter table public.businesses add constraint businesses_manual_tax_rate_check
    check (manual_tax_rate is null or (manual_tax_rate >= 0 and manual_tax_rate <= 0.6));
exception when duplicate_object then null;
end;
$$;
