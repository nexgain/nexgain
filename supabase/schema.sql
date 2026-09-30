-- =====================================================================
-- NexGain database setup
-- Paste this whole file into Supabase > SQL Editor > New query > Run.
-- It is safe to run again: it only adds what's missing and updates
-- functions and security rules.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

-- One business per owner, created at the end of owner sign-up.
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users (id) on delete cascade,
  owner_name text not null,
  owner_email text not null,
  name text not null,
  logo text,
  abn text,
  industry text,
  industry_category text,
  business_type text,
  team_size text,
  vehicles text,
  years_operating text,
  services text[] not null default '{}',
  plan text not null default 'basic',
  financial_year_start_month int not null default 7,
  gst_registered boolean not null default true,
  currency text not null default 'AUD',
  track_gst_in_reports boolean not null default true,
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

-- One profile per employee. Everything else (roster, payroll, availability,
-- documents) links to this row, so details are never copied around.
create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  date_of_birth date,
  address text,
  position text,
  employment_type text,
  pay_rate numeric(10, 2),
  super_fund text,
  emergency_contact_name text,
  emergency_contact_phone text,
  -- Weekly availability: 7 entries (Monday first) of {available, start, end}.
  availability jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Bank details and TFN, encrypted. Only readable (decrypted) through
-- get_employee_private(), by the employee themselves or their business owner.
create table if not exists public.employee_private (
  employee_id uuid primary key references public.employees (id) on delete cascade,
  account_name_enc bytea,
  bsb_enc bytea,
  account_number_enc bytea,
  tfn_enc bytea,
  account_last4 text,
  has_tfn boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.employee_documents (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind text not null,
  file_name text not null,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  date date not null,
  start_time text not null,
  end_time text not null,
  employee_ids uuid[] not null default '{}',
  job_type text not null,
  location text not null default '',
  tasks text[] not null default '{}',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clock_sessions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists public.payslips (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  hours numeric(10, 2) not null default 0,
  rate numeric(10, 2) not null default 0,
  gross numeric(12, 2) not null default 0,
  tax numeric(12, 2) not null default 0,
  net numeric(12, 2) not null default 0,
  super numeric(12, 2) not null default 0,
  paid_at timestamptz not null default now()
);

create table if not exists public.job_reports (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  shift_date date,
  job_title text,
  location text,
  time_text text,
  outcome text not null,
  notes text not null default '',
  issues text not null default '',
  photos text[] not null default '{}',
  completed boolean not null default false,
  submitted_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  audience text not null check (audience in ('owner', 'employee')),
  type text not null,
  title text not null,
  summary text not null,
  body text not null default '',
  status text,
  details jsonb,
  photos text[],
  attachments jsonb,
  related_shift jsonb,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists employees_business_idx on public.employees (business_id);
create index if not exists shifts_business_date_idx on public.shifts (business_id, date);
create index if not exists notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index if not exists clock_sessions_employee_idx on public.clock_sessions (employee_id, started_at);
create index if not exists payslips_employee_idx on public.payslips (employee_id, period_start);
-- An employee can only be paid once per pay period (stops double payments).
create unique index if not exists payslips_one_per_period on public.payslips (employee_id, period_start);

-- ---------------------------------------------------------------------
-- Helper functions for security rules
-- ---------------------------------------------------------------------

create or replace function public.is_business_owner(bid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.businesses where id = bid and owner_id = auth.uid());
$$;

create or replace function public.my_employee_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.employees where user_id = auth.uid();
$$;

create or replace function public.my_employee_business_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select business_id from public.employees where user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- Row level security: who can see and change what
-- ---------------------------------------------------------------------

alter table public.businesses enable row level security;
alter table public.employees enable row level security;
alter table public.employee_private enable row level security;
alter table public.employee_documents enable row level security;
alter table public.shifts enable row level security;
alter table public.clock_sessions enable row level security;
alter table public.payslips enable row level security;
alter table public.job_reports enable row level security;
alter table public.notifications enable row level security;

-- Businesses: the owner, and that business's employees, can see it. Only the owner edits it.
drop policy if exists "business visible to owner and staff" on public.businesses;
create policy "business visible to owner and staff" on public.businesses for select to authenticated
  using (owner_id = auth.uid() or id = public.my_employee_business_id());
drop policy if exists "owner updates business" on public.businesses;
create policy "owner updates business" on public.businesses for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Employees: each employee sees their own profile; the owner sees their team.
drop policy if exists "employee profile visible to self and owner" on public.employees;
create policy "employee profile visible to self and owner" on public.employees for select to authenticated
  using (user_id = auth.uid() or public.is_business_owner(business_id));
drop policy if exists "employee profile editable by self and owner" on public.employees;
create policy "employee profile editable by self and owner" on public.employees for update to authenticated
  using (user_id = auth.uid() or public.is_business_owner(business_id));
drop policy if exists "owner removes employee" on public.employees;
create policy "owner removes employee" on public.employees for delete to authenticated
  using (public.is_business_owner(business_id));

-- Employees can't move themselves to another business or change their own pay rate.
create or replace function public.guard_employee_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.user_id := old.user_id;
  new.business_id := old.business_id;
  if not public.is_business_owner(old.business_id) then
    new.pay_rate := old.pay_rate;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists employees_guard on public.employees;
create trigger employees_guard before update on public.employees
  for each row execute function public.guard_employee_update();

-- Private details: only the masked parts (last 4 digits, has TFN) can be read
-- directly, by the employee or owner. Full details need get_employee_private().
drop policy if exists "private masked visible to self and owner" on public.employee_private;
create policy "private masked visible to self and owner" on public.employee_private for select to authenticated
  using (
    employee_id = public.my_employee_id()
    or exists (select 1 from public.employees e where e.id = employee_id and public.is_business_owner(e.business_id))
  );
-- Only the safe columns are readable at all; the encrypted ones never leave the database.
revoke all on public.employee_private from anon, authenticated;
grant select (employee_id, account_last4, has_tfn, updated_at) on public.employee_private to authenticated;

-- Documents
drop policy if exists "documents visible to self and owner" on public.employee_documents;
create policy "documents visible to self and owner" on public.employee_documents for select to authenticated
  using (employee_id = public.my_employee_id() or public.is_business_owner(business_id));
drop policy if exists "employee adds own documents" on public.employee_documents;
create policy "employee adds own documents" on public.employee_documents for insert to authenticated
  with check (employee_id = public.my_employee_id() and business_id = public.my_employee_business_id());
drop policy if exists "documents removable by self and owner" on public.employee_documents;
create policy "documents removable by self and owner" on public.employee_documents for delete to authenticated
  using (employee_id = public.my_employee_id() or public.is_business_owner(business_id));

-- Shifts: the owner manages them; employees see only the shifts they're on.
drop policy if exists "shifts visible to owner and assigned staff" on public.shifts;
create policy "shifts visible to owner and assigned staff" on public.shifts for select to authenticated
  using (
    public.is_business_owner(business_id)
    or (business_id = public.my_employee_business_id() and public.my_employee_id() = any (employee_ids))
  );
drop policy if exists "owner manages shifts" on public.shifts;
create policy "owner manages shifts" on public.shifts for all to authenticated
  using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));

-- Clock in / out
drop policy if exists "clock visible to self and owner" on public.clock_sessions;
create policy "clock visible to self and owner" on public.clock_sessions for select to authenticated
  using (employee_id = public.my_employee_id() or public.is_business_owner(business_id));
drop policy if exists "employee clocks in" on public.clock_sessions;
create policy "employee clocks in" on public.clock_sessions for insert to authenticated
  with check (employee_id = public.my_employee_id() and business_id = public.my_employee_business_id());
drop policy if exists "employee clocks out" on public.clock_sessions;
create policy "employee clocks out" on public.clock_sessions for update to authenticated
  using (employee_id = public.my_employee_id()) with check (employee_id = public.my_employee_id());

-- Payslips: the owner creates them; each employee sees their own.
drop policy if exists "payslips visible to self and owner" on public.payslips;
create policy "payslips visible to self and owner" on public.payslips for select to authenticated
  using (employee_id = public.my_employee_id() or public.is_business_owner(business_id));
drop policy if exists "owner creates payslips" on public.payslips;
create policy "owner creates payslips" on public.payslips for insert to authenticated
  with check (
    public.is_business_owner(business_id)
    and exists (select 1 from public.employees e where e.id = employee_id and e.business_id = payslips.business_id)
  );

-- Job reports: employees submit their own; the owner reads them.
drop policy if exists "reports visible to self and owner" on public.job_reports;
create policy "reports visible to self and owner" on public.job_reports for select to authenticated
  using (employee_id = public.my_employee_id() or public.is_business_owner(business_id));
drop policy if exists "employee submits report" on public.job_reports;
create policy "employee submits report" on public.job_reports for insert to authenticated
  with check (employee_id = public.my_employee_id() and business_id = public.my_employee_business_id());

-- Notifications: people only see (and mark as read) their own. They're created
-- by the database itself (triggers below), never directly by the app.
drop policy if exists "own notifications" on public.notifications;
create policy "own notifications" on public.notifications for select to authenticated
  using (recipient_id = auth.uid());
drop policy if exists "mark own notifications read" on public.notifications;
create policy "mark own notifications read" on public.notifications for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

-- ---------------------------------------------------------------------
-- Encryption key for bank details and TFNs (kept in Supabase Vault)
-- ---------------------------------------------------------------------

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'employee_private_key') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'employee_private_key',
      'Encrypts employee bank details and tax file numbers');
  end if;
end;
$$;

create or replace function private.private_key()
returns text language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'employee_private_key';
$$;

create or replace function private.enc(value text)
returns bytea language sql stable security definer set search_path = '' as $$
  select case when value is null or value = '' then null
    else extensions.pgp_sym_encrypt(value, private.private_key()) end;
$$;

create or replace function private.dec(value bytea)
returns text language sql stable security definer set search_path = '' as $$
  select case when value is null then null else extensions.pgp_sym_decrypt(value, private.private_key()) end;
$$;

-- ---------------------------------------------------------------------
-- App functions
-- ---------------------------------------------------------------------

-- Owner sign-up: create the business with a unique invite code (e.g. BUXTON2026).
create or replace function public.create_business(p jsonb)
returns public.businesses language plpgsql security definer set search_path = '' as $$
declare
  base text := upper(regexp_replace(coalesce(p ->> 'invite_base', ''), '[^A-Za-z]', '', 'g'));
  code text;
  n int := 1;
  result public.businesses;
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  if exists (select 1 from public.employees where user_id = auth.uid()) then
    raise exception 'This account is already an employee account.';
  end if;
  if base = '' then base := 'TEAM'; end if;
  base := left(base, 10) || extract(year from now())::int;
  code := base;
  while exists (select 1 from public.businesses where invite_code = code) loop
    n := n + 1;
    code := base || '-' || n;
  end loop;

  insert into public.businesses (
    owner_id, owner_name, owner_email, name, logo, abn, industry, industry_category, business_type,
    team_size, vehicles, years_operating, services, financial_year_start_month, gst_registered,
    currency, track_gst_in_reports, invite_code
  ) values (
    auth.uid(), p ->> 'owner_name', p ->> 'owner_email', p ->> 'name', p ->> 'logo', p ->> 'abn',
    p ->> 'industry', p ->> 'industry_category', p ->> 'business_type', p ->> 'team_size',
    p ->> 'vehicles', p ->> 'years_operating',
    coalesce(array(select jsonb_array_elements_text(p -> 'services')), '{}'),
    coalesce((p ->> 'financial_year_start_month')::int, 7), coalesce((p ->> 'gst_registered')::boolean, true),
    coalesce(p ->> 'currency', 'AUD'), coalesce((p ->> 'track_gst_in_reports')::boolean, true), code
  )
  returning * into result;
  return result;
end;
$$;

-- Employee sign-up, step 2: look up a business by its invite code. Returns only
-- what's needed to confirm it's the right business.
create or replace function public.find_business_by_code(p_code text)
returns table (id uuid, name text, logo text, industry text, industry_category text)
language sql stable security definer set search_path = '' as $$
  select b.id, b.name, b.logo, b.industry, b.industry_category
  from public.businesses b
  where b.invite_code = upper(trim(p_code));
$$;

-- Employee sign-up, final step: create the employee profile in the business
-- that matches the code, and store bank details / TFN encrypted.
create or replace function public.complete_employee_signup(p_code text, p jsonb)
returns public.employees language plpgsql security definer set search_path = '' as $$
declare
  biz public.businesses;
  result public.employees;
  digits text := regexp_replace(coalesce(p ->> 'account_number', ''), '\D', '', 'g');
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  select * into biz from public.businesses where invite_code = upper(trim(p_code));
  if biz.id is null then raise exception 'We couldn''t find a business with that code.'; end if;
  if biz.owner_id = auth.uid() then raise exception 'You can''t join your own business as an employee.'; end if;
  if exists (select 1 from public.employees where user_id = auth.uid()) then
    raise exception 'This account has already joined a business.';
  end if;

  insert into public.employees (
    user_id, business_id, full_name, email, phone, date_of_birth, address, position, employment_type,
    super_fund, emergency_contact_name, emergency_contact_phone
  ) values (
    auth.uid(), biz.id, p ->> 'full_name', p ->> 'email', p ->> 'phone',
    nullif(p ->> 'date_of_birth', '')::date, nullif(p ->> 'address', ''), p ->> 'position',
    p ->> 'employment_type', nullif(p ->> 'super_fund', ''), p ->> 'emergency_contact_name',
    p ->> 'emergency_contact_phone'
  )
  returning * into result;

  insert into public.employee_private (
    employee_id, account_name_enc, bsb_enc, account_number_enc, tfn_enc, account_last4, has_tfn
  ) values (
    result.id, private.enc(p ->> 'account_name'), private.enc(p ->> 'bsb'), private.enc(digits),
    private.enc(regexp_replace(coalesce(p ->> 'tfn', ''), '\D', '', 'g')),
    nullif(right(digits, 4), ''), coalesce(p ->> 'tfn', '') <> ''
  );
  return result;
end;
$$;

-- Update my own bank details / TFN later.
create or replace function public.update_my_private_details(p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.my_employee_id();
  digits text := regexp_replace(coalesce(p ->> 'account_number', ''), '\D', '', 'g');
begin
  if me is null then raise exception 'Only employees can update bank details.'; end if;
  update public.employee_private set
    account_name_enc = private.enc(p ->> 'account_name'),
    bsb_enc = private.enc(p ->> 'bsb'),
    account_number_enc = private.enc(digits),
    tfn_enc = case when p ? 'tfn' then private.enc(regexp_replace(coalesce(p ->> 'tfn', ''), '\D', '', 'g')) else tfn_enc end,
    account_last4 = nullif(right(digits, 4), ''),
    has_tfn = case when p ? 'tfn' then coalesce(p ->> 'tfn', '') <> '' else has_tfn end,
    updated_at = now()
  where employee_id = me;
end;
$$;

-- Full (decrypted) bank details and TFN: only for the employee or their owner (payroll).
create or replace function public.get_employee_private(p_employee_id uuid)
returns table (account_name text, bsb text, account_number text, tfn text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (
    p_employee_id = public.my_employee_id()
    or exists (select 1 from public.employees e where e.id = p_employee_id and public.is_business_owner(e.business_id))
  ) then
    raise exception 'Not allowed.';
  end if;
  return query
    select private.dec(ep.account_name_enc), private.dec(ep.bsb_enc), private.dec(ep.account_number_enc), private.dec(ep.tfn_enc)
    from public.employee_private ep where ep.employee_id = p_employee_id;
end;
$$;

-- Who am I? Used after login to open the right dashboard.
create or replace function public.my_role()
returns text language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.businesses where owner_id = auth.uid()) then 'owner'
    when exists (select 1 from public.employees where user_id = auth.uid()) then 'employee'
    else 'none'
  end;
$$;

-- Only signed-in users can call app functions, except the invite code lookup.
revoke execute on function public.create_business(jsonb) from public, anon;
revoke execute on function public.complete_employee_signup(text, jsonb) from public, anon;
revoke execute on function public.update_my_private_details(jsonb) from public, anon;
revoke execute on function public.get_employee_private(uuid) from public, anon;
revoke execute on function public.my_role() from public, anon;
grant execute on function public.create_business(jsonb) to authenticated;
grant execute on function public.complete_employee_signup(text, jsonb) to authenticated;
grant execute on function public.update_my_private_details(jsonb) to authenticated;
grant execute on function public.get_employee_private(uuid) to authenticated;
grant execute on function public.my_role() to authenticated;
grant execute on function public.find_business_by_code(text) to anon, authenticated;
revoke all on function private.private_key() from public, anon, authenticated;
revoke all on function private.enc(text) from public, anon, authenticated;
revoke all on function private.dec(bytea) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Automatic notifications
-- ---------------------------------------------------------------------

-- New employee joined -> tell the owner.
create or replace function public.notify_employee_joined()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (business_id, recipient_id, audience, type, title, summary, body, details)
  select new.business_id, b.owner_id, 'owner', 'employee_added',
    new.full_name || ' has joined your business.',
    coalesce(new.position, 'New team member') || coalesce(' · ' || new.employment_type, ''),
    new.full_name || ' joined using your invite code and is ready to be rostered.',
    jsonb_build_array(
      jsonb_build_object('label', 'Position', 'value', coalesce(new.position, '—')),
      jsonb_build_object('label', 'Employment type', 'value', coalesce(new.employment_type, '—')),
      jsonb_build_object('label', 'Phone', 'value', coalesce(new.phone, '—')),
      jsonb_build_object('label', 'Email', 'value', new.email)
    )
  from public.businesses b where b.id = new.business_id;
  return new;
end;
$$;
drop trigger if exists employees_joined on public.employees;
create trigger employees_joined after insert on public.employees
  for each row execute function public.notify_employee_joined();

-- Shift assigned / changed / cancelled -> tell the employees on it.
create or replace function public.notify_shift_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  emp record;
  shift_title text;
  shift_when text;
  shift_info jsonb;
begin
  if tg_op = 'DELETE' then
    shift_title := old.job_type;
    shift_when := to_char(old.date, 'Dy DD Mon') || ' · ' || old.start_time || '–' || old.end_time;
    for emp in select e.user_id from public.employees e where e.id = any (old.employee_ids) loop
      insert into public.notifications (business_id, recipient_id, audience, type, title, summary, body)
      values (old.business_id, emp.user_id, 'employee', 'shift_changed', 'Shift cancelled',
        shift_title || ' · ' || shift_when, 'Your ' || shift_title || ' shift on ' || shift_when || ' has been cancelled.');
    end loop;
    return old;
  end if;

  shift_title := new.job_type;
  shift_when := to_char(new.date, 'Dy DD Mon') || ' · ' || new.start_time || '–' || new.end_time;
  shift_info := jsonb_build_object('date', new.date, 'title', new.job_type,
    'subtitle', concat_ws(' · ', nullif(new.location, ''), new.start_time || '–' || new.end_time));

  for emp in
    select e.user_id, e.id from public.employees e where e.id = any (new.employee_ids)
  loop
    if tg_op = 'INSERT' or not (emp.id = any (old.employee_ids)) then
      insert into public.notifications (business_id, recipient_id, audience, type, title, summary, body, related_shift)
      values (new.business_id, emp.user_id, 'employee', 'roster_published', 'New shift assigned',
        shift_title || ' · ' || shift_when, 'You''ve been rostered on ' || shift_title || ', ' || shift_when ||
        coalesce(' at ' || nullif(new.location, ''), '') || '.', shift_info);
    elsif (old.date, old.start_time, old.end_time, old.location) is distinct from (new.date, new.start_time, new.end_time, new.location) then
      insert into public.notifications (business_id, recipient_id, audience, type, title, summary, body, related_shift)
      values (new.business_id, emp.user_id, 'employee', 'shift_changed', 'Shift updated',
        shift_title || ' · ' || shift_when, 'Your ' || shift_title || ' shift has changed. It''s now ' || shift_when ||
        coalesce(' at ' || nullif(new.location, ''), '') || '.', shift_info);
    end if;
  end loop;

  if tg_op = 'UPDATE' then
    -- Employees taken off the shift.
    for emp in
      select e.user_id from public.employees e where e.id = any (old.employee_ids) and not (e.id = any (new.employee_ids))
    loop
      insert into public.notifications (business_id, recipient_id, audience, type, title, summary, body)
      values (new.business_id, emp.user_id, 'employee', 'shift_changed', 'Removed from a shift',
        shift_title || ' · ' || shift_when, 'You''re no longer rostered on ' || shift_title || ', ' || shift_when || '.');
    end loop;
  end if;
  return new;
end;
$$;
drop trigger if exists shifts_notify on public.shifts;
create trigger shifts_notify after insert or update or delete on public.shifts
  for each row execute function public.notify_shift_change();

-- Payslip created (payment approved) -> tell the employee.
create or replace function public.notify_payslip()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (business_id, recipient_id, audience, type, title, summary, body, details)
  select new.business_id, e.user_id, 'employee', 'payslip_available', 'You''ve been paid!',
    'Your payment of $' || to_char(new.net, 'FM999,999,990.00') || ' has been processed. View payslip.',
    'Your payment of $' || to_char(new.net, 'FM999,999,990.00') || ' for ' ||
      to_char(new.period_start, 'DD Mon') || ' – ' || to_char(new.period_end, 'DD Mon YYYY') || ' has been processed.',
    jsonb_build_array(
      jsonb_build_object('label', 'Hours', 'value', new.hours::text),
      jsonb_build_object('label', 'Gross pay', 'value', '$' || to_char(new.gross, 'FM999,999,990.00')),
      jsonb_build_object('label', 'Tax', 'value', '$' || to_char(new.tax, 'FM999,999,990.00')),
      jsonb_build_object('label', 'Net pay', 'value', '$' || to_char(new.net, 'FM999,999,990.00'))
    )
  from public.employees e where e.id = new.employee_id;
  return new;
end;
$$;
drop trigger if exists payslips_notify on public.payslips;
create trigger payslips_notify after insert on public.payslips
  for each row execute function public.notify_payslip();

-- Job report submitted -> tell the owner (flagged if there were issues).
create or replace function public.notify_job_report()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  who text;
  flagged boolean := new.outcome <> 'Went well' or trim(new.issues) <> '';
  serious boolean := new.outcome = 'Didn''t go well';
begin
  select full_name into who from public.employees where id = new.employee_id;
  insert into public.notifications (
    business_id, recipient_id, audience, type, title, summary, body, status, details, photos, related_shift, read
  )
  select new.business_id, b.owner_id, 'owner',
    case when serious then 'incident_report' when flagged then 'report_flagged' else 'job_completed' end,
    case when serious then 'Incident report submitted' when flagged then 'Job report flagged for review' else 'Job report submitted' end,
    coalesce(who, 'An employee') || ' reported ' || lower(new.outcome) || ' on ' || coalesce(new.job_title, 'a job'),
    coalesce(nullif(concat_ws(E'\n\n',
      case when trim(new.issues) <> '' then 'Issues:' || E'\n' || trim(new.issues) end,
      case when trim(new.notes) <> '' then 'Job notes:' || E'\n' || trim(new.notes) end), ''), 'No further details were given.'),
    case when flagged then 'Needs attention' end,
    jsonb_build_array(
      jsonb_build_object('label', 'Job', 'value', coalesce(new.job_title, 'No job assigned')),
      jsonb_build_object('label', 'Location', 'value', coalesce(nullif(new.location, ''), '—')),
      jsonb_build_object('label', 'Reported by', 'value', coalesce(who, '—')),
      jsonb_build_object('label', 'Time', 'value', coalesce(new.time_text, '—')),
      jsonb_build_object('label', 'Outcome', 'value', new.outcome),
      jsonb_build_object('label', 'Job completed', 'value', case when new.completed then 'Yes' else 'No' end)
    ),
    new.photos,
    case when new.job_title is not null then jsonb_build_object('date', new.shift_date, 'title', new.job_title, 'subtitle', new.location) end,
    not flagged
  from public.businesses b where b.id = new.business_id;
  return new;
end;
$$;
drop trigger if exists job_reports_notify on public.job_reports;
create trigger job_reports_notify after insert on public.job_reports
  for each row execute function public.notify_job_report();

-- ---------------------------------------------------------------------
-- File storage for employee documents (White Card, licence, etc.)
-- Files live at: <business id>/<employee id>/<file name>
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('employee-documents', 'employee-documents', false)
on conflict (id) do nothing;

drop policy if exists "employee uploads own documents" on storage.objects;
create policy "employee uploads own documents" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'employee-documents'
    and (storage.foldername(name))[1] = public.my_employee_business_id()::text
    and (storage.foldername(name))[2] = public.my_employee_id()::text
  );
-- Is the signed-in person the owner of the business with this id (the first folder of a file path)?
create or replace function public.owns_business_folder(folder text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.businesses where id::text = folder and owner_id = auth.uid());
$$;
revoke execute on function public.owns_business_folder(text) from public, anon;
grant execute on function public.owns_business_folder(text) to authenticated;

drop policy if exists "documents readable by self and owner" on storage.objects;
create policy "documents readable by self and owner" on storage.objects for select to authenticated
  using (
    bucket_id = 'employee-documents'
    and (
      (storage.foldername(name))[2] = public.my_employee_id()::text
      or public.owns_business_folder((storage.foldername(name))[1])
    )
  );

-- ---------------------------------------------------------------------
-- Live updates between phones
-- ---------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['notifications', 'shifts', 'employees', 'clock_sessions', 'payslips', 'job_reports'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end;
$$;
