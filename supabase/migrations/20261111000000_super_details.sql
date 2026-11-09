-- =====================================================================
-- NexGain: superannuation details (employee choice of fund) and the owner's
-- super settings. Collecting and storing only: no money is sent.
--
--   employee_super          one row per employee: where their super is paid
--                           (employer default / own fund / SMSF / not sure),
--                           the fund details, the declaration date, and the
--                           owner's "choice received / actioned" dates.
--                           SMSF bank BSB and account number are ENCRYPTED.
--   employee_super_history  every earlier version, with the date it changed
--                           (sensitive numbers masked). Never deleted by the
--                           app: kept for at least 5 years.
--   employees.gender        asked with the super details (funds need it).
--   business_super_settings  the owner's super contact, default fund,
--                           employer number and payment provider. Owner only
--                           (staff just get the default fund's name, through
--                           my_default_super_fund()).
--
-- Security
--   - Nobody can write these tables directly; only the functions below.
--   - The encrypted columns can't be read at all; the decrypted numbers only
--     come from reveal_employee_super(), for the employee or their owner.
--   - TFNs stay in employee_private (already encrypted); set_my_tfn() updates
--     it without touching bank details.
--   - Error messages never include the numbers.
--
-- Run once: Supabase > SQL Editor > New query > paste this whole file > Run.
-- Safe to run again.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Number checks (the same as the app's, done again here)
-- ---------------------------------------------------------------------

create or replace function private.valid_tfn(v text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  d text := regexp_replace(coalesce(v, ''), '\D', '', 'g');
  w int[] := array[1, 4, 3, 7, 5, 8, 6, 9, 10];
  s int := 0;
begin
  if length(d) <> 9 then return false; end if;
  for i in 1..9 loop s := s + w[i] * substr(d, i, 1)::int; end loop;
  return s % 11 = 0;
end;
$$;

create or replace function private.valid_abn(v text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  d text := regexp_replace(coalesce(v, ''), '\D', '', 'g');
  w int[] := array[10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  s int := 0;
begin
  if length(d) <> 11 then return false; end if;
  for i in 1..11 loop
    s := s + w[i] * (substr(d, i, 1)::int - case when i = 1 then 1 else 0 end);
  end loop;
  return s % 89 = 0;
end;
$$;

revoke all on function private.valid_tfn(text) from public, anon, authenticated;
revoke all on function private.valid_abn(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

alter table public.employees add column if not exists gender text;
do $$
begin
  alter table public.employees add constraint employees_gender_check
    check (gender is null or gender in ('female', 'male', 'x', 'not_said'));
exception when duplicate_object then null;
end;
$$;

create table if not exists public.employee_super (
  employee_id uuid primary key references public.employees (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- default: the employer's default fund. own: their own fund (APRA).
  -- smsf: self-managed fund. unsure: owner must request the stapled fund from the ATO.
  choice text not null check (choice in ('default', 'own', 'smsf', 'unsure')),
  fund_name text,
  fund_abn text,
  usi text,
  member_number text,
  account_name text,
  -- SMSF only.
  esa text,
  smsf_account_name text,
  smsf_bsb_enc bytea,
  smsf_account_number_enc bytea,
  smsf_bsb_last3 text,
  smsf_account_last3 text,
  -- The employee ticked "I confirm these super details are correct...".
  declared_at timestamptz not null,
  -- When the owner got this choice, and when they actioned it (set it up with the fund / payroll).
  choice_received_at timestamptz not null default now(),
  choice_actioned_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists employee_super_business_idx on public.employee_super (business_id);

create table if not exists public.employee_super_history (
  id uuid primary key default gen_random_uuid(),
  -- Kept even if the employee is removed (records must be kept 5 years).
  employee_id uuid references public.employees (id) on delete set null,
  business_id uuid not null references public.businesses (id) on delete cascade,
  employee_name text,
  -- The details as they were (BSB and account numbers masked, e.g. •••123).
  details jsonb not null,
  choice_received_at timestamptz,
  choice_actioned_at timestamptz,
  -- When they were replaced, and by whom.
  replaced_at timestamptz not null default now(),
  replaced_by uuid references auth.users (id) on delete set null
);
create index if not exists employee_super_history_employee_idx on public.employee_super_history (employee_id, replaced_at desc);

create table if not exists public.business_super_settings (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  -- legal_name, contact_name, contact_email, contact_phone, default_fund_name,
  -- default_fund_abn, default_fund_usi, employer_number, provider_name, provider_notes
  settings jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.business_super_settings enable row level security;
drop policy if exists "owner reads super settings" on public.business_super_settings;
create policy "owner reads super settings" on public.business_super_settings for select to authenticated
  using (public.is_business_owner(business_id));
drop policy if exists "owner adds super settings" on public.business_super_settings;
create policy "owner adds super settings" on public.business_super_settings for insert to authenticated
  with check (public.is_business_owner(business_id));
drop policy if exists "owner changes super settings" on public.business_super_settings;
create policy "owner changes super settings" on public.business_super_settings for update to authenticated
  using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));
revoke all on public.business_super_settings from anon;

-- The employer's default fund (name and USI only), for the employee choosing where super goes.
create or replace function public.my_default_super_fund()
returns table (fund_name text, usi text) language sql stable security definer set search_path = '' as $$
  select nullif(s.settings ->> 'default_fund_name', ''), nullif(s.settings ->> 'default_fund_usi', '')
  from public.business_super_settings s
  where s.business_id = coalesce(public.my_employee_business_id(), (select id from public.businesses where owner_id = auth.uid()));
$$;
revoke execute on function public.my_default_super_fund() from public, anon;
grant execute on function public.my_default_super_fund() to authenticated;

-- When an employee is removed, their current super details go into the history
-- first (records are kept at least 5 years), with the BSB and account masked.
-- Runs on the employee (before their super row is removed with them), so their
-- name can be kept.
create or replace function private.archive_employee_super()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.employee_super_history (employee_id, business_id, employee_name, details, choice_received_at, choice_actioned_at, replaced_by)
  select null, s.business_id, old.full_name, jsonb_build_object(
    'choice', s.choice, 'fund_name', s.fund_name, 'fund_abn', s.fund_abn, 'usi', s.usi,
    'member_number', s.member_number, 'account_name', s.account_name, 'esa', s.esa,
    'smsf_account_name', s.smsf_account_name,
    'smsf_bsb', case when s.smsf_bsb_last3 is null then null else '•••' || s.smsf_bsb_last3 end,
    'smsf_account_number', case when s.smsf_account_last3 is null then null else '•••' || s.smsf_account_last3 end,
    'declared_at', s.declared_at, 'removed', true
  ), s.choice_received_at, s.choice_actioned_at, auth.uid()
  from public.employee_super s
  where s.employee_id = old.id
    -- Not when the whole business is being deleted (everything goes then).
    and exists (select 1 from public.businesses b where b.id = s.business_id);
  return old;
end;
$$;
drop trigger if exists employee_super_archive on public.employee_super;
drop trigger if exists employee_super_archive on public.employees;
create trigger employee_super_archive before delete on public.employees
  for each row execute function private.archive_employee_super();

-- ---------------------------------------------------------------------
-- Who can see what
-- ---------------------------------------------------------------------

alter table public.employee_super enable row level security;
alter table public.employee_super_history enable row level security;

drop policy if exists "own or owner reads super" on public.employee_super;
create policy "own or owner reads super" on public.employee_super for select to authenticated
  using (employee_id = public.my_employee_id() or public.is_business_owner(business_id));

drop policy if exists "own or owner reads super history" on public.employee_super_history;
create policy "own or owner reads super history" on public.employee_super_history for select to authenticated
  using ((employee_id is not null and employee_id = public.my_employee_id()) or public.is_business_owner(business_id));

-- Read only the safe columns; never the encrypted ones. No direct writes.
revoke all on public.employee_super from anon, authenticated;
revoke all on public.employee_super_history from anon, authenticated;
grant select (
  employee_id, business_id, choice, fund_name, fund_abn, usi, member_number, account_name, esa,
  smsf_account_name, smsf_bsb_last3, smsf_account_last3, declared_at, choice_received_at, choice_actioned_at, updated_at
) on public.employee_super to authenticated;
grant select on public.employee_super_history to authenticated;

-- ---------------------------------------------------------------------
-- Saving (the employee), revealing (employee or owner), actioning (owner)
-- ---------------------------------------------------------------------

-- p = { choice, fund_name, fund_abn, usi, member_number, account_name, esa,
--       smsf_account_name, smsf_bsb, smsf_account_number, gender, declared: true }
create or replace function public.save_my_super(p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.my_employee_id();
  emp public.employees;
  prev public.employee_super;
  c text := p ->> 'choice';
  bsb text := regexp_replace(coalesce(p ->> 'smsf_bsb', ''), '\D', '', 'g');
  acct text := regexp_replace(coalesce(p ->> 'smsf_account_number', ''), '\D', '', 'g');
  abn text := regexp_replace(coalesce(p ->> 'fund_abn', ''), '\D', '', 'g');
  biz jsonb;
  shown_fund text;
begin
  if me is null then raise exception 'Only employees can save their super details.'; end if;
  select * into emp from public.employees where id = me;
  if coalesce((p ->> 'declared')::boolean, false) is not true then
    raise exception 'Please tick the declaration to confirm your super details.';
  end if;
  if c not in ('default', 'own', 'smsf', 'unsure') then raise exception 'Choose where your super should be paid.'; end if;
  if c in ('own', 'smsf') and not private.valid_abn(abn) then raise exception 'The fund''s ABN doesn''t look right.'; end if;
  if c in ('own', 'smsf') and coalesce(trim(p ->> 'fund_name'), '') = '' then raise exception 'Enter the fund''s name.'; end if;
  if c = 'own' and (coalesce(trim(p ->> 'usi'), '') = '' or coalesce(trim(p ->> 'member_number'), '') = '') then
    raise exception 'Enter the fund''s USI and your member number.';
  end if;
  if c = 'smsf' and (length(bsb) <> 6 or length(acct) not between 5 and 10 or coalesce(trim(p ->> 'esa'), '') = '') then
    raise exception 'Check the SMSF''s ESA, BSB and account number.';
  end if;
  if p ? 'gender' and coalesce(p ->> 'gender', '') <> '' then
    update public.employees set gender = p ->> 'gender' where id = me;
  end if;

  -- Keep the earlier version (masked) before replacing it.
  select * into prev from public.employee_super where employee_id = me;
  if prev.employee_id is not null then
    insert into public.employee_super_history (employee_id, business_id, employee_name, details, choice_received_at, choice_actioned_at, replaced_by)
    values (me, prev.business_id, emp.full_name, jsonb_build_object(
      'choice', prev.choice, 'fund_name', prev.fund_name, 'fund_abn', prev.fund_abn, 'usi', prev.usi,
      'member_number', prev.member_number, 'account_name', prev.account_name, 'esa', prev.esa,
      'smsf_account_name', prev.smsf_account_name,
      'smsf_bsb', case when prev.smsf_bsb_last3 is null then null else '•••' || prev.smsf_bsb_last3 end,
      'smsf_account_number', case when prev.smsf_account_last3 is null then null else '•••' || prev.smsf_account_last3 end,
      'declared_at', prev.declared_at
    ), prev.choice_received_at, prev.choice_actioned_at, auth.uid());
  end if;

  insert into public.employee_super as s (
    employee_id, business_id, choice, fund_name, fund_abn, usi, member_number, account_name, esa,
    smsf_account_name, smsf_bsb_enc, smsf_account_number_enc, smsf_bsb_last3, smsf_account_last3,
    declared_at, choice_received_at, choice_actioned_at, updated_at
  ) values (
    me, emp.business_id, c,
    case when c in ('own', 'smsf') then trim(p ->> 'fund_name') end,
    case when c in ('own', 'smsf') then abn end,
    case when c = 'own' then upper(regexp_replace(p ->> 'usi', '\s', '', 'g')) end,
    case when c = 'own' then trim(p ->> 'member_number') end,
    case when c = 'own' then nullif(trim(p ->> 'account_name'), '') end,
    case when c = 'smsf' then trim(p ->> 'esa') end,
    case when c = 'smsf' then nullif(trim(p ->> 'smsf_account_name'), '') end,
    case when c = 'smsf' then private.enc(bsb) end,
    case when c = 'smsf' then private.enc(acct) end,
    case when c = 'smsf' then right(bsb, 3) end,
    case when c = 'smsf' then right(acct, 3) end,
    now(), now(), null, now()
  )
  on conflict (employee_id) do update set
    choice = excluded.choice, fund_name = excluded.fund_name, fund_abn = excluded.fund_abn, usi = excluded.usi,
    member_number = excluded.member_number, account_name = excluded.account_name, esa = excluded.esa,
    smsf_account_name = excluded.smsf_account_name, smsf_bsb_enc = excluded.smsf_bsb_enc,
    smsf_account_number_enc = excluded.smsf_account_number_enc, smsf_bsb_last3 = excluded.smsf_bsb_last3,
    smsf_account_last3 = excluded.smsf_account_last3, declared_at = excluded.declared_at,
    -- A new choice is a new thing for the owner to action.
    choice_received_at = now(), choice_actioned_at = null, updated_at = now();

  -- Keep the simple fund fields on the employee in step (payroll and the owner's lists use them).
  select settings into biz from public.business_super_settings where business_id = emp.business_id;
  biz := coalesce(biz, '{}');
  shown_fund := case c
    when 'default' then coalesce(nullif(biz ->> 'default_fund_name', ''), 'Employer''s default fund')
    when 'unsure' then null
    else trim(p ->> 'fund_name') end;
  update public.employees set
    super_fund = shown_fund,
    super_fund_usi = case c when 'own' then upper(regexp_replace(p ->> 'usi', '\s', '', 'g'))
      when 'default' then nullif(biz ->> 'default_fund_usi', '') when 'smsf' then abn end,
    super_member_number = case when c = 'own' then trim(p ->> 'member_number') end
  where id = me;
end;
$$;

-- The SMSF's full BSB and account number: only for the employee or their owner.
create or replace function public.reveal_employee_super(p_employee_id uuid)
returns table (smsf_bsb text, smsf_account_number text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (
    p_employee_id = public.my_employee_id()
    or exists (select 1 from public.employees e where e.id = p_employee_id and public.is_business_owner(e.business_id))
  ) then
    raise exception 'Not allowed.';
  end if;
  return query
    select private.dec(s.smsf_bsb_enc), private.dec(s.smsf_account_number_enc)
    from public.employee_super s where s.employee_id = p_employee_id;
end;
$$;

-- The owner has set up the employee's choice (with the fund, provider or payroll).
create or replace function public.mark_super_choice_actioned(p_employee_id uuid, p_actioned boolean default true)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.employee_super s where s.employee_id = p_employee_id and public.is_business_owner(s.business_id)) then
    raise exception 'Not allowed.';
  end if;
  update public.employee_super set choice_actioned_at = case when p_actioned then now() end where employee_id = p_employee_id;
end;
$$;

-- The employee's TFN, on its own (optional; blank removes it). Bank details aren't touched.
create or replace function public.set_my_tfn(p_tfn text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.my_employee_id();
  d text := regexp_replace(coalesce(p_tfn, ''), '\D', '', 'g');
begin
  if me is null then raise exception 'Only employees can save a TFN.'; end if;
  if d <> '' and not private.valid_tfn(d) then raise exception 'That tax file number doesn''t look right.'; end if;
  insert into public.employee_private (employee_id) values (me) on conflict (employee_id) do nothing;
  update public.employee_private set tfn_enc = private.enc(nullif(d, '')), has_tfn = d <> '', updated_at = now()
  where employee_id = me;
end;
$$;

revoke execute on function public.save_my_super(jsonb) from public, anon;
revoke execute on function public.reveal_employee_super(uuid) from public, anon;
revoke execute on function public.mark_super_choice_actioned(uuid, boolean) from public, anon;
revoke execute on function public.set_my_tfn(text) from public, anon;
grant execute on function public.save_my_super(jsonb) to authenticated;
grant execute on function public.reveal_employee_super(uuid) to authenticated;
grant execute on function public.mark_super_choice_actioned(uuid, boolean) to authenticated;
grant execute on function public.set_my_tfn(text) to authenticated;
