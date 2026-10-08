-- =====================================================================
-- Bank payment files: business country, pay runs with payroll numbers,
-- bank details for each country, and the owner's payroll bank setup.
-- Paste into Supabase > SQL Editor > New query > Run. Safe to run again.
-- =====================================================================

-- ---------------------------------------------------------------------
-- The country chosen at sign-up (decides the bank file and bank boxes).
-- Existing businesses get it from their currency where that's clear.
-- ---------------------------------------------------------------------

alter table public.businesses add column if not exists country text;
update public.businesses set country = case left(currency, 3)
    when 'AUD' then 'AU' when 'USD' then 'US' when 'GBP' then 'GB' when 'NZD' then 'NZ' when 'CAD' then 'CA'
  end
where country is null;

-- Employee sign-up shows the right bank boxes for the business's country.
drop function if exists public.find_business_by_code(text);
create function public.find_business_by_code(p_code text)
returns table (id uuid, name text, logo text, industry text, industry_category text, country text)
language sql stable security definer set search_path = '' as $$
  select b.id, b.name, b.logo, b.industry, b.industry_category, b.country
  from public.businesses b
  where b.invite_code = upper(trim(p_code));
$$;
revoke execute on function public.find_business_by_code(text) from public;
grant execute on function public.find_business_by_code(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Employee bank details for every country (all encrypted).
--   bsb_enc holds the BSB (AU), routing number (US) or sort code (UK).
--   bank_country says which kind they are ('AU', 'US', 'GB', 'EU', 'OTHER';
--   empty = saved before countries existed, which were all Australian).
-- ---------------------------------------------------------------------

alter table public.employee_private
  add column if not exists bank_country text,
  add column if not exists account_type text,
  add column if not exists iban_enc bytea,
  add column if not exists bic_enc bytea;

-- Which country the saved details are for isn't sensitive (shown in the app).
grant select (bank_country) on public.employee_private to authenticated;

create or replace function public.update_my_private_details(p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.my_employee_id();
  digits text := regexp_replace(coalesce(p ->> 'account_number', ''), '\D', '', 'g');
  iban text := upper(regexp_replace(coalesce(p ->> 'iban', ''), '[^A-Za-z0-9]', '', 'g'));
  shown text;
begin
  if me is null then raise exception 'Only employees can update bank details.'; end if;
  shown := coalesce(nullif(right(iban, 4), ''), nullif(right(coalesce(nullif(digits, ''), p ->> 'account_number'), 4), ''));
  update public.employee_private set
    account_name_enc = private.enc(p ->> 'account_name'),
    bsb_enc = private.enc(p ->> 'bsb'),
    account_number_enc = private.enc(coalesce(nullif(digits, ''), p ->> 'account_number')),
    iban_enc = private.enc(iban),
    bic_enc = private.enc(upper(coalesce(p ->> 'bic', ''))),
    account_type = nullif(p ->> 'account_type', ''),
    bank_country = coalesce(nullif(p ->> 'bank_country', ''), bank_country),
    tfn_enc = case when p ? 'tfn' then private.enc(regexp_replace(coalesce(p ->> 'tfn', ''), '\D', '', 'g')) else tfn_enc end,
    account_last4 = shown,
    has_tfn = case when p ? 'tfn' then coalesce(p ->> 'tfn', '') <> '' else has_tfn end,
    updated_at = now()
  where employee_id = me;
end;
$$;

-- Full (decrypted) details: only for the employee or their owner (payroll).
drop function if exists public.get_employee_private(uuid);
create function public.get_employee_private(p_employee_id uuid)
returns table (
  account_name text, bsb text, account_number text, tfn text,
  bank_country text, account_type text, iban text, bic text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (
    p_employee_id = public.my_employee_id()
    or exists (select 1 from public.employees e where e.id = p_employee_id and public.is_business_owner(e.business_id))
  ) then
    raise exception 'Not allowed.';
  end if;
  return query
    select private.dec(ep.account_name_enc), private.dec(ep.bsb_enc), private.dec(ep.account_number_enc),
      private.dec(ep.tfn_enc), ep.bank_country, ep.account_type, private.dec(ep.iban_enc), private.dec(ep.bic_enc)
    from public.employee_private ep where ep.employee_id = p_employee_id;
end;
$$;
revoke execute on function public.get_employee_private(uuid) from public, anon;
grant execute on function public.get_employee_private(uuid) to authenticated;

-- Employee sign-up (replaces the earlier version): also saves the bank details'
-- country, IBAN, BIC and account type. Everything else is unchanged.
create or replace function public.complete_employee_signup(p_code text, p jsonb)
returns public.employees language plpgsql security definer set search_path = '' as $$
declare
  biz public.businesses;
  inv public.employee_invites;
  result public.employees;
  digits text := regexp_replace(coalesce(p ->> 'account_number', ''), '\D', '', 'g');
  iban text := upper(regexp_replace(coalesce(p ->> 'iban', ''), '[^A-Za-z0-9]', '', 'g'));
  my_phone text := private.phone_digits(p ->> 'phone');
  emp_type text;
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

  emp_type := coalesce(nullif(inv.employment_type, ''), p ->> 'employment_type');

  insert into public.employees (
    user_id, business_id, full_name, email, phone, date_of_birth, address, position, employment_type,
    super_fund, emergency_contact_name, emergency_contact_phone, status, pay_type, pay_rate, start_date,
    abn, gst_registered
  ) values (
    auth.uid(), biz.id, p ->> 'full_name', p ->> 'email', p ->> 'phone',
    nullif(p ->> 'date_of_birth', '')::date, nullif(p ->> 'address', ''),
    coalesce(nullif(inv.position, ''), p ->> 'position'),
    emp_type,
    nullif(p ->> 'super_fund', ''), p ->> 'emergency_contact_name', p ->> 'emergency_contact_phone',
    'active', coalesce(inv.pay_type, 'hourly'), inv.pay_rate, coalesce(inv.start_date, current_date),
    case when emp_type = 'Contractor' then nullif(regexp_replace(coalesce(p ->> 'abn', ''), '\D', '', 'g'), '') end,
    emp_type = 'Contractor' and coalesce((p ->> 'gst_registered')::boolean, false)
  )
  returning * into result;

  if inv.id is not null then
    delete from public.employee_invites where id = inv.id;
  end if;

  insert into public.employee_private (
    employee_id, account_name_enc, bsb_enc, account_number_enc, iban_enc, bic_enc, account_type, bank_country,
    tfn_enc, account_last4, has_tfn
  ) values (
    result.id, private.enc(p ->> 'account_name'), private.enc(p ->> 'bsb'),
    private.enc(coalesce(nullif(digits, ''), p ->> 'account_number')),
    private.enc(iban), private.enc(upper(coalesce(p ->> 'bic', ''))), nullif(p ->> 'account_type', ''),
    nullif(p ->> 'bank_country', ''),
    private.enc(regexp_replace(coalesce(p ->> 'tfn', ''), '\D', '', 'g')),
    coalesce(nullif(right(iban, 4), ''), nullif(right(coalesce(nullif(digits, ''), p ->> 'account_number'), 4), '')),
    coalesce(p ->> 'tfn', '') <> ''
  );
  return result;
end;
$$;
revoke execute on function public.complete_employee_signup(text, jsonb) from public, anon;
grant execute on function public.complete_employee_signup(text, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- The owner's payroll bank setup: the account wages are paid from and the
-- IDs their bank gave them. Only the owner can see or change it.
-- ---------------------------------------------------------------------

create table if not exists public.payroll_bank_settings (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  account_name text not null default '',
  bank_code text not null default '',
  account_number text not null default '',
  iban text not null default '',
  bic text not null default '',
  bank_short_name text not null default '',
  user_id_number text not null default '',
  company_id text not null default '',
  bank_name text not null default '',
  aba_balancing boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.payroll_bank_settings enable row level security;
drop policy if exists "owner reads payroll bank" on public.payroll_bank_settings;
create policy "owner reads payroll bank" on public.payroll_bank_settings for select to authenticated
  using (public.is_business_owner(business_id));
drop policy if exists "owner adds payroll bank" on public.payroll_bank_settings;
create policy "owner adds payroll bank" on public.payroll_bank_settings for insert to authenticated
  with check (public.is_business_owner(business_id));
drop policy if exists "owner changes payroll bank" on public.payroll_bank_settings;
create policy "owner changes payroll bank" on public.payroll_bank_settings for update to authenticated
  using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));
revoke all on public.payroll_bank_settings from anon;

-- ---------------------------------------------------------------------
-- Pay runs. Each approval makes one pay run with the business's next payroll
-- number (Payroll 001, 002, ...). Numbers come from a counter only the
-- database can change, so they're never reused or skipped by the app.
-- ---------------------------------------------------------------------

create table if not exists public.payroll_counters (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  last_number int not null default 0
);
alter table public.payroll_counters enable row level security;
-- No policies: nobody can read or change it directly, only the functions below.
revoke all on public.payroll_counters from anon, authenticated;

create table if not exists public.pay_runs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  payroll_number int not null check (payroll_number > 0),
  period_start date not null,
  period_end date not null,
  pay_date date not null,
  status text not null default 'approved' check (status in ('approved', 'paid')),
  employee_count int not null default 0,
  total_net numeric(12, 2) not null default 0,
  approved_at timestamptz not null default now(),
  file_downloaded_at timestamptz,
  paid_at timestamptz,
  unique (business_id, payroll_number)
);
create index if not exists pay_runs_business_idx on public.pay_runs (business_id, payroll_number desc);

alter table public.pay_runs enable row level security;
drop policy if exists "owner sees pay runs" on public.pay_runs;
create policy "owner sees pay runs" on public.pay_runs for select to authenticated
  using (public.is_business_owner(business_id));
-- Created and changed only through the functions below.
revoke insert, update, delete on public.pay_runs from anon, authenticated;

alter table public.payslips
  add column if not exists pay_run_id uuid references public.pay_runs (id) on delete restrict,
  add column if not exists payroll_number int,
  add column if not exists pay_date date,
  add column if not exists status text not null default 'paid';
alter table public.payslips drop constraint if exists payslips_status_check;
alter table public.payslips add constraint payslips_status_check check (status in ('approved', 'paid'));
-- Approved payslips aren't paid yet.
alter table public.payslips alter column paid_at drop not null;
alter table public.payslips alter column paid_at drop default;

-- Payslips now only come from approve_pay_run (so every one has a payroll number).
drop policy if exists "owner creates payslips" on public.payslips;

-- Payslips approved before pay runs existed: one pay run per business and
-- pay period, numbered in the order they were approved, already paid.
do $$
declare
  grp record;
  n int;
  run_id uuid;
begin
  for grp in
    select business_id, period_start, max(period_end) as period_end, min(paid_at) as paid_at,
      count(*) as people, sum(net) as total
    from public.payslips where pay_run_id is null
    group by business_id, period_start
    order by business_id, min(paid_at), period_start
  loop
    insert into public.payroll_counters as c (business_id, last_number) values (grp.business_id, 1)
    on conflict (business_id) do update set last_number = c.last_number + 1
    returning last_number into n;
    insert into public.pay_runs (business_id, payroll_number, period_start, period_end, pay_date, status,
      employee_count, total_net, approved_at, paid_at)
    values (grp.business_id, n, grp.period_start, grp.period_end, coalesce(grp.paid_at, now())::date, 'paid',
      grp.people, grp.total, coalesce(grp.paid_at, now()), coalesce(grp.paid_at, now()))
    returning id into run_id;
    update public.payslips set pay_run_id = run_id, payroll_number = n, pay_date = coalesce(grp.paid_at, now())::date,
      status = 'paid'
    where business_id = grp.business_id and period_start = grp.period_start and pay_run_id is null;
  end loop;
end;
$$;

-- Approve: make the pay run with the next payroll number and its payslips
-- (status approved, not paid yet). All or nothing.
create or replace function public.approve_pay_run(p_period_start date, p_period_end date, p_pay_date date, p_payslips jsonb)
returns public.pay_runs language plpgsql security definer set search_path = '' as $$
declare
  bid uuid;
  n int;
  run public.pay_runs;
  people int;
begin
  select id into bid from public.businesses where owner_id = auth.uid();
  if bid is null then raise exception 'Only the business owner can approve payroll.'; end if;
  people := coalesce(jsonb_array_length(p_payslips), 0);
  if people = 0 then raise exception 'There is no one to pay.'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_payslips) x
    left join public.employees e on e.id = (x ->> 'employee_id')::uuid
    where e.id is null or e.business_id <> bid or e.employment_type = 'Contractor'
  ) then
    raise exception 'Someone in this pay run isn''t an employee of your business.';
  end if;

  -- Next number for this business. The row lock makes two approvals at the
  -- same moment wait for each other, so they can't get the same number.
  insert into public.payroll_counters as c (business_id, last_number) values (bid, 1)
  on conflict (business_id) do update set last_number = c.last_number + 1
  returning last_number into n;

  insert into public.pay_runs (business_id, payroll_number, period_start, period_end, pay_date, employee_count, total_net)
  values (bid, n, p_period_start, p_period_end, coalesce(p_pay_date, current_date), people,
    (select coalesce(sum((x ->> 'net')::numeric), 0) from jsonb_array_elements(p_payslips) x))
  returning * into run;

  -- One payslip per employee per period (the unique index stops double pay).
  insert into public.payslips (
    id, business_id, employee_id, period_start, period_end, hours, rate, pay_type, ordinary_hours, overtime_hours,
    ordinary_rate, overtime_rate, ordinary_pay, overtime_pay, overtime_after_hours, gross, tax, net, super,
    pay_run_id, payroll_number, pay_date, status, paid_at
  )
  select coalesce((x ->> 'id')::uuid, gen_random_uuid()), bid, (x ->> 'employee_id')::uuid, p_period_start, p_period_end,
    (x ->> 'hours')::numeric, (x ->> 'rate')::numeric, coalesce(x ->> 'pay_type', 'hourly'),
    (x ->> 'ordinary_hours')::numeric, (x ->> 'overtime_hours')::numeric, (x ->> 'ordinary_rate')::numeric,
    (x ->> 'overtime_rate')::numeric, (x ->> 'ordinary_pay')::numeric, (x ->> 'overtime_pay')::numeric,
    (x ->> 'overtime_after_hours')::numeric, (x ->> 'gross')::numeric, (x ->> 'tax')::numeric,
    (x ->> 'net')::numeric, (x ->> 'super')::numeric,
    run.id, n, run.pay_date, 'approved', null
  from jsonb_array_elements(p_payslips) x;

  return run;
end;
$$;

-- Bank details of everyone in a pay run, decrypted, for making the bank file.
-- Owner only. The app uses them straight away and never stores or logs them.
create or replace function public.pay_run_bank_details(p_pay_run_id uuid)
returns table (
  employee_id uuid, bank_country text, account_name text, bsb text, account_number text,
  account_type text, iban text, bic text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.pay_runs r where r.id = p_pay_run_id and public.is_business_owner(r.business_id)) then
    raise exception 'Not allowed.';
  end if;
  return query
    select ps.employee_id, ep.bank_country, private.dec(ep.account_name_enc), private.dec(ep.bsb_enc),
      private.dec(ep.account_number_enc), ep.account_type, private.dec(ep.iban_enc), private.dec(ep.bic_enc)
    from public.payslips ps
    left join public.employee_private ep on ep.employee_id = ps.employee_id
    where ps.pay_run_id = p_pay_run_id;
end;
$$;

-- The bank file was made. If the pay date has already passed, it moves to the
-- new date (banks won't take a date in the past).
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
  return run;
end;
$$;

-- Mark as paid: the pay run and its payslips become paid (each employee is
-- told, see notify_payslip below).
create or replace function public.mark_pay_run_paid(p_pay_run_id uuid)
returns public.pay_runs language plpgsql security definer set search_path = '' as $$
declare
  run public.pay_runs;
begin
  select * into run from public.pay_runs r where r.id = p_pay_run_id and public.is_business_owner(r.business_id);
  if run.id is null then raise exception 'Not allowed.'; end if;
  if run.status = 'paid' then return run; end if;
  update public.pay_runs set status = 'paid', paid_at = now() where id = run.id returning * into run;
  update public.payslips set status = 'paid', paid_at = run.paid_at where pay_run_id = run.id;
  return run;
end;
$$;

revoke execute on function public.approve_pay_run(date, date, date, jsonb) from public, anon;
revoke execute on function public.pay_run_bank_details(uuid) from public, anon;
revoke execute on function public.record_payment_file(uuid, date) from public, anon;
revoke execute on function public.mark_pay_run_paid(uuid) from public, anon;
grant execute on function public.approve_pay_run(date, date, date, jsonb) to authenticated;
grant execute on function public.pay_run_bank_details(uuid) to authenticated;
grant execute on function public.record_payment_file(uuid, date) to authenticated;
grant execute on function public.mark_pay_run_paid(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- "You've been paid!" now goes out when the pay run is marked as paid
-- (not when it's approved), with the amount, pay date and payroll number.
-- ---------------------------------------------------------------------

create or replace function public.notify_payslip()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  ref text;
begin
  if new.status <> 'paid' or (tg_op = 'UPDATE' and old.status = 'paid') then
    return new;
  end if;
  ref := case when new.payroll_number is not null then 'Payroll ' || lpad(new.payroll_number::text, 3, '0') end;
  insert into public.notifications (business_id, recipient_id, audience, type, title, summary, body, details)
  select new.business_id, e.user_id, 'employee', 'payslip_available', 'You''ve been paid!',
    'Your payment of $' || to_char(new.net, 'FM999,999,990.00') || coalesce(' (' || ref || ')', '') || ' has been paid. View payslip.',
    'Your payment of $' || to_char(new.net, 'FM999,999,990.00') || ' for ' ||
      to_char(new.period_start, 'DD Mon') || ' – ' || to_char(new.period_end, 'DD Mon YYYY') || ' has been paid' ||
      coalesce(' on ' || to_char(new.pay_date, 'DD Mon YYYY'), '') || coalesce(' (' || ref || ')', '') || '.',
    jsonb_build_array(
      jsonb_build_object('label', 'Payroll number', 'value', coalesce(ref, '—')),
      jsonb_build_object('label', 'Pay date', 'value', coalesce(to_char(new.pay_date, 'DD Mon YYYY'), '—')),
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
create trigger payslips_notify after insert or update of status on public.payslips
  for each row execute function public.notify_payslip();

-- ---------------------------------------------------------------------
-- Live updates
-- ---------------------------------------------------------------------

do $$
begin
  begin
    alter publication supabase_realtime add table public.pay_runs;
  exception when duplicate_object then null;
  end;
end;
$$;
