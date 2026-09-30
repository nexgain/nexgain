-- =====================================================================
-- NexGain: Employees page, pay rate history, qualifications, invites
-- Run once, after schema.sql:
--   Supabase > SQL Editor > New query > paste this whole file > Run.
-- Safe to run again: it only adds what's missing and updates functions.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Employees: status, pay type, start date and profile photo.
-- Pay rate, pay type and employment type live ONLY here; Payroll reads them.
-- ---------------------------------------------------------------------

alter table public.employees add column if not exists status text not null default 'active';
alter table public.employees add column if not exists pay_type text not null default 'hourly';
alter table public.employees add column if not exists start_date date;
alter table public.employees add column if not exists photo_path text;
update public.employees set start_date = created_at::date where start_date is null;
alter table public.employees alter column start_date set default current_date;

do $$
begin
  alter table public.employees add constraint employees_status_check
    check (status in ('active', 'on_leave', 'inactive'));
exception when duplicate_object then null;
end;
$$;
do $$
begin
  alter table public.employees add constraint employees_pay_type_check
    check (pay_type in ('hourly', 'salary'));
exception when duplicate_object then null;
end;
$$;

-- Only the owner can change pay, employment type, status and start date.
-- Employees can still update their own phone, position and photo.
create or replace function public.guard_employee_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.user_id := old.user_id;
  new.business_id := old.business_id;
  if not public.is_business_owner(old.business_id) then
    new.pay_rate := old.pay_rate;
    new.pay_type := old.pay_type;
    new.employment_type := old.employment_type;
    new.status := old.status;
    new.start_date := old.start_date;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Pay rate history: written automatically by the database whenever a pay
-- rate or pay type changes. Past payslips keep the rate they were paid at.
-- ---------------------------------------------------------------------

create table if not exists public.pay_rate_history (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  old_rate numeric(10, 2),
  new_rate numeric(10, 2),
  old_pay_type text,
  new_pay_type text,
  changed_by uuid references auth.users (id) on delete set null,
  changed_at timestamptz not null default now()
);
create index if not exists pay_rate_history_employee_idx on public.pay_rate_history (employee_id, changed_at desc);

alter table public.pay_rate_history enable row level security;
drop policy if exists "pay history visible to self and owner" on public.pay_rate_history;
create policy "pay history visible to self and owner" on public.pay_rate_history for select to authenticated
  using (employee_id = public.my_employee_id() or public.is_business_owner(business_id));
-- No insert/update/delete policies: only the trigger below can write history.

create or replace function public.record_pay_rate_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.pay_rate is not null then
      insert into public.pay_rate_history (employee_id, business_id, old_rate, new_rate, old_pay_type, new_pay_type, changed_by)
      values (new.id, new.business_id, null, new.pay_rate, null, new.pay_type, auth.uid());
    end if;
  elsif (old.pay_rate, old.pay_type) is distinct from (new.pay_rate, new.pay_type) then
    insert into public.pay_rate_history (employee_id, business_id, old_rate, new_rate, old_pay_type, new_pay_type, changed_by)
    values (new.id, new.business_id, old.pay_rate, new.pay_rate, old.pay_type, new.pay_type, auth.uid());
  end if;
  return new;
end;
$$;
drop trigger if exists employees_pay_history on public.employees;
create trigger employees_pay_history after insert or update on public.employees
  for each row execute function public.record_pay_rate_change();

-- ---------------------------------------------------------------------
-- Qualifications (licences, tickets, certificates). Added by the employee
-- or their owner; files live in the private "employee-documents" bucket.
-- ---------------------------------------------------------------------

create table if not exists public.employee_qualifications (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  issue_date date,
  expiry_date date,
  file_name text,
  storage_path text,
  mime_type text,
  created_at timestamptz not null default now()
);
create index if not exists employee_qualifications_employee_idx on public.employee_qualifications (employee_id);

alter table public.employee_qualifications enable row level security;
drop policy if exists "qualifications visible to self and owner" on public.employee_qualifications;
create policy "qualifications visible to self and owner" on public.employee_qualifications for select to authenticated
  using (employee_id = public.my_employee_id() or public.is_business_owner(business_id));
drop policy if exists "qualifications added by self or owner" on public.employee_qualifications;
create policy "qualifications added by self or owner" on public.employee_qualifications for insert to authenticated
  with check (
    (employee_id = public.my_employee_id() and business_id = public.my_employee_business_id())
    or (
      public.is_business_owner(business_id)
      and exists (select 1 from public.employees e where e.id = employee_id and e.business_id = employee_qualifications.business_id)
    )
  );
drop policy if exists "qualifications removable by self and owner" on public.employee_qualifications;
create policy "qualifications removable by self and owner" on public.employee_qualifications for delete to authenticated
  using (employee_id = public.my_employee_id() or public.is_business_owner(business_id));

-- ---------------------------------------------------------------------
-- Invites: people the owner has added who haven't signed up yet. When they
-- sign up with the invite code (and the same email or phone, or the personal
-- invite link), the owner's details (role, pay...) are applied automatically.
-- ---------------------------------------------------------------------

create table if not exists public.employee_invites (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  position text,
  employment_type text,
  pay_type text not null default 'hourly' check (pay_type in ('hourly', 'salary')),
  pay_rate numeric(10, 2),
  start_date date,
  created_at timestamptz not null default now()
);
create index if not exists employee_invites_business_idx on public.employee_invites (business_id);

alter table public.employee_invites enable row level security;
drop policy if exists "owner manages invites" on public.employee_invites;
create policy "owner manages invites" on public.employee_invites for all to authenticated
  using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));

-- "0412 345 678", "+61 412 345 678" -> "0412345678"
create or replace function private.phone_digits(value text)
returns text language sql immutable set search_path = '' as $$
  select case
    when d like '61%' and length(d) = 11 then '0' || substr(d, 3)
    else nullif(d, '')
  end
  from (select regexp_replace(coalesce(value, ''), '\D', '', 'g') as d) x;
$$;

-- Personal invite links (nexgain://join/CODE?invite=ID) pre-fill sign-up.
-- Needs both the business code and the invite id, so it can't be guessed.
create or replace function public.get_invite(p_code text, p_invite uuid)
returns table (full_name text, email text, phone text)
language sql stable security definer set search_path = '' as $$
  select i.full_name, i.email, i.phone
  from public.employee_invites i
  join public.businesses b on b.id = i.business_id
  where i.id = p_invite and b.invite_code = upper(trim(p_code));
$$;

-- ---------------------------------------------------------------------
-- Employee sign-up (replaces the earlier version): also marks the employee
-- Active with today's start date, and applies a matching invite.
-- ---------------------------------------------------------------------

create or replace function public.complete_employee_signup(p_code text, p jsonb)
returns public.employees language plpgsql security definer set search_path = '' as $$
declare
  biz public.businesses;
  inv public.employee_invites;
  result public.employees;
  digits text := regexp_replace(coalesce(p ->> 'account_number', ''), '\D', '', 'g');
  my_phone text := private.phone_digits(p ->> 'phone');
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  select * into biz from public.businesses where invite_code = upper(trim(p_code));
  if biz.id is null then raise exception 'We couldn''t find a business with that code.'; end if;
  if biz.owner_id = auth.uid() then raise exception 'You can''t join your own business as an employee.'; end if;
  if exists (select 1 from public.employees where user_id = auth.uid()) then
    raise exception 'This account has already joined a business.';
  end if;

  -- The owner's invite for this person: by personal link, login email or phone.
  select * into inv from public.employee_invites i
  where i.business_id = biz.id and (
    i.id::text = coalesce(p ->> 'invite_id', '')
    or (i.email is not null and lower(trim(i.email)) = lower(auth.email()))
    or (my_phone is not null and private.phone_digits(i.phone) = my_phone)
  )
  order by (i.id::text = coalesce(p ->> 'invite_id', '')) desc, i.created_at desc
  limit 1;

  insert into public.employees (
    user_id, business_id, full_name, email, phone, date_of_birth, address, position, employment_type,
    super_fund, emergency_contact_name, emergency_contact_phone, status, pay_type, pay_rate, start_date
  ) values (
    auth.uid(), biz.id, p ->> 'full_name', p ->> 'email', p ->> 'phone',
    nullif(p ->> 'date_of_birth', '')::date, nullif(p ->> 'address', ''),
    coalesce(nullif(inv.position, ''), p ->> 'position'),
    coalesce(nullif(inv.employment_type, ''), p ->> 'employment_type'),
    nullif(p ->> 'super_fund', ''), p ->> 'emergency_contact_name', p ->> 'emergency_contact_phone',
    'active', coalesce(inv.pay_type, 'hourly'), inv.pay_rate, coalesce(inv.start_date, current_date)
  )
  returning * into result;

  if inv.id is not null then
    delete from public.employee_invites where id = inv.id;
  end if;

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

-- ---------------------------------------------------------------------
-- New invite code: the old one stops working straight away.
-- ---------------------------------------------------------------------

create or replace function public.regenerate_invite_code()
returns text language plpgsql security definer set search_path = '' as $$
declare
  biz public.businesses;
  base text;
  code text;
begin
  select * into biz from public.businesses where owner_id = auth.uid();
  if biz.id is null then raise exception 'Only business owners can change the invite code.'; end if;
  base := left(regexp_replace(upper(biz.invite_code), '[^A-Z]', '', 'g'), 10);
  if base = '' then base := 'TEAM'; end if;
  loop
    code := base || lpad((floor(random() * 10000))::int::text, 4, '0');
    exit when code <> biz.invite_code and not exists (select 1 from public.businesses where invite_code = code);
  end loop;
  update public.businesses set invite_code = code where id = biz.id;
  return code;
end;
$$;

revoke execute on function public.regenerate_invite_code() from public, anon;
grant execute on function public.regenerate_invite_code() to authenticated;
revoke execute on function public.complete_employee_signup(text, jsonb) from public, anon;
grant execute on function public.complete_employee_signup(text, jsonb) to authenticated;
grant execute on function public.get_invite(text, uuid) to anon, authenticated;
revoke all on function private.phone_digits(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- File storage: owners can now upload (qualifications, profile photos) into
-- their own employees' folders, and files can be removed by the employee or owner.
-- Files live at: <business id>/<employee id>/<file name>
-- ---------------------------------------------------------------------

drop policy if exists "owner uploads employee files" on storage.objects;
create policy "owner uploads employee files" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'employee-documents'
    and exists (
      select 1 from public.employees e
      join public.businesses b on b.id = e.business_id
      where b.owner_id = auth.uid()
        and b.id::text = (storage.foldername(name))[1]
        and e.id::text = (storage.foldername(name))[2]
    )
  );
drop policy if exists "employee files removable by self and owner" on storage.objects;
create policy "employee files removable by self and owner" on storage.objects for delete to authenticated
  using (
    bucket_id = 'employee-documents'
    and (
      (storage.foldername(name))[2] = public.my_employee_id()::text
      or exists (select 1 from public.businesses b where b.id::text = (storage.foldername(name))[1] and b.owner_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------
-- Live updates between phones
-- ---------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['employee_invites', 'employee_qualifications'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end;
$$;
