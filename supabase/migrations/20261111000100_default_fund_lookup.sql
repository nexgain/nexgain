-- =====================================================================
-- NexGain: the employer's default super fund NAME, for employee sign-up.
-- While signing up, the person isn't an employee of the business yet, so they
-- can't read its super settings. With the business code they were given, this
-- returns only the default fund's name (nothing else), so "Use my employer's
-- fund" can say which fund that is. Like find_business_by_code, it works before
-- the person has an account (they only get one at the end of sign-up).
-- Run once: Supabase > SQL Editor > New query > paste this whole file > Run.
-- Safe to run again.
-- =====================================================================

create or replace function public.default_super_fund_for_code(p_code text)
returns text language sql stable security definer set search_path = '' as $$
  select nullif(s.settings ->> 'default_fund_name', '')
  from public.businesses b
  join public.business_super_settings s on s.business_id = b.id
  where b.invite_code = upper(trim(p_code));
$$;

revoke execute on function public.default_super_fund_for_code(text) from public;
grant execute on function public.default_super_fund_for_code(text) to anon, authenticated;
