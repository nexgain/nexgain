-- =====================================================================
-- NexGain: contractor invoices
--   - contractors' ABN and GST registration (asked at sign-up)
--   - contractor_invoices + contractor_invoice_items
--   - send / approve / decline / mark paid, with notifications both ways
-- Run once, after the earlier files:
--   Supabase > SQL Editor > New query > paste this whole file > Run.
-- Safe to run again.
--
-- Who is a contractor: employees.employment_type = 'Contractor' (chosen at
-- sign-up, changeable by the owner). Nothing else decides it.
-- =====================================================================

alter table public.employees add column if not exists abn text;
alter table public.employees add column if not exists gst_registered boolean not null default false;

-- Is this employee a contractor?
create or replace function public.is_contractor(p_employee_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.employees where id = p_employee_id and employment_type = 'Contractor');
$$;

-- The signed-in worker's employee id, only if they're a contractor (else null).
create or replace function public.my_contractor_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.employees where user_id = auth.uid() and employment_type = 'Contractor';
$$;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

create table if not exists public.contractor_invoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  -- e.g. INV-0001, unique per contractor (set by the database).
  number text not null,
  invoice_date date not null default current_date,
  due_date date,
  status text not null default 'draft' check (status in ('draft', 'sent', 'approved', 'declined', 'paid')),
  notes text not null default '',
  gst_registered boolean not null default false,
  subtotal numeric(12, 2) not null default 0,
  gst numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  decline_reason text,
  sent_at timestamptz,
  approved_at timestamptz,
  declined_at timestamptz,
  paid_at timestamptz,
  -- Copy of the contractor's details at the time it was sent (later profile
  -- changes don't affect sent invoices). Bank details stay encrypted.
  from_name text,
  from_phone text,
  from_email text,
  from_abn text,
  bill_to text,
  bank_account_name_enc bytea,
  bank_bsb_enc bytea,
  bank_account_number_enc bytea,
  bank_last4 text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, number)
);
create index if not exists contractor_invoices_business_idx on public.contractor_invoices (business_id, created_at desc);
create index if not exists contractor_invoices_employee_idx on public.contractor_invoices (employee_id, created_at desc);

create table if not exists public.contractor_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.contractor_invoices (id) on delete cascade,
  position int not null default 0,
  description text not null default '',
  quantity numeric(10, 2) not null default 1,
  rate numeric(12, 2) not null default 0,
  amount numeric(12, 2) not null default 0
);
create index if not exists contractor_invoice_items_invoice_idx on public.contractor_invoice_items (invoice_id, position);

-- ---------------------------------------------------------------------
-- New drafts: number them per contractor and stamp the business.
-- ---------------------------------------------------------------------

create or replace function public.prepare_contractor_invoice()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  next_no int;
begin
  select coalesce(max(nullif(regexp_replace(number, '\D', '', 'g'), '')::int), 0) + 1 into next_no
  from public.contractor_invoices where employee_id = new.employee_id;
  new.number := 'INV-' || lpad(next_no::text, 4, '0');
  new.business_id := (select business_id from public.employees where id = new.employee_id);
  new.status := 'draft';
  return new;
end;
$$;
drop trigger if exists contractor_invoices_prepare on public.contractor_invoices;
create trigger contractor_invoices_prepare before insert on public.contractor_invoices
  for each row execute function public.prepare_contractor_invoice();

create or replace function public.touch_contractor_invoice()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists contractor_invoices_touch on public.contractor_invoices;
create trigger contractor_invoices_touch before update on public.contractor_invoices
  for each row execute function public.touch_contractor_invoice();

-- ---------------------------------------------------------------------
-- Security
--   Contractor: their own invoices only; can edit only while Draft or Declined.
--   Owner: their own business's invoices only (changes go through the functions below).
--   Other workers (full-time, part-time, casual): no access at all.
--   Encrypted bank columns can't be read directly by anyone.
-- ---------------------------------------------------------------------

alter table public.contractor_invoices enable row level security;
alter table public.contractor_invoice_items enable row level security;

revoke all on public.contractor_invoices from anon, authenticated;
grant select (
  id, business_id, employee_id, number, invoice_date, due_date, status, notes, gst_registered, subtotal, gst, total,
  decline_reason, sent_at, approved_at, declined_at, paid_at, from_name, from_phone, from_email, from_abn, bill_to,
  bank_last4, created_at, updated_at
) on public.contractor_invoices to authenticated;
grant insert (employee_id, invoice_date, due_date, notes) on public.contractor_invoices to authenticated;
grant update (invoice_date, due_date, notes, status) on public.contractor_invoices to authenticated;
grant delete on public.contractor_invoices to authenticated;

revoke all on public.contractor_invoice_items from anon, authenticated;
grant select, insert, update, delete on public.contractor_invoice_items to authenticated;

drop policy if exists "contractor and owner see invoices" on public.contractor_invoices;
-- (The owner only sees invoices once they've been sent, not the contractor's drafts.)
create policy "contractor and owner see invoices" on public.contractor_invoices for select to authenticated
  using (employee_id = public.my_contractor_id() or (public.is_business_owner(business_id) and status <> 'draft'));

drop policy if exists "contractor creates drafts" on public.contractor_invoices;
create policy "contractor creates drafts" on public.contractor_invoices for insert to authenticated
  with check (employee_id = public.my_contractor_id());

-- Editing a draft or a declined invoice; saving it puts it back to Draft.
drop policy if exists "contractor edits drafts" on public.contractor_invoices;
create policy "contractor edits drafts" on public.contractor_invoices for update to authenticated
  using (employee_id = public.my_contractor_id() and status in ('draft', 'declined'))
  with check (employee_id = public.my_contractor_id() and status = 'draft');

drop policy if exists "contractor deletes drafts" on public.contractor_invoices;
create policy "contractor deletes drafts" on public.contractor_invoices for delete to authenticated
  using (employee_id = public.my_contractor_id() and status = 'draft');

drop policy if exists "items visible with invoice" on public.contractor_invoice_items;
create policy "items visible with invoice" on public.contractor_invoice_items for select to authenticated
  using (exists (
    select 1 from public.contractor_invoices i
    where i.id = invoice_id
      and (i.employee_id = public.my_contractor_id() or (public.is_business_owner(i.business_id) and i.status <> 'draft'))
  ));
drop policy if exists "contractor edits items of drafts" on public.contractor_invoice_items;
create policy "contractor edits items of drafts" on public.contractor_invoice_items for all to authenticated
  using (exists (
    select 1 from public.contractor_invoices i
    where i.id = invoice_id and i.employee_id = public.my_contractor_id() and i.status in ('draft', 'declined')
  ))
  with check (exists (
    select 1 from public.contractor_invoices i
    where i.id = invoice_id and i.employee_id = public.my_contractor_id() and i.status in ('draft', 'declined')
  ));

-- ---------------------------------------------------------------------
-- Sending (contractor), and approve / decline / paid (owner)
-- ---------------------------------------------------------------------

-- Sends a draft (or a fixed declined invoice) to the owner. Totals are worked out
-- here from the line items, and the contractor's current details are copied on.
create or replace function public.send_contractor_invoice(p_invoice_id uuid)
returns public.contractor_invoices language plpgsql security definer set search_path = '' as $$
declare
  inv public.contractor_invoices;
  emp public.employees;
  priv public.employee_private;
  biz_name text;
  sub numeric(12, 2);
  tax numeric(12, 2);
  missing text[] := '{}';
begin
  select * into inv from public.contractor_invoices where id = p_invoice_id for update;
  if inv.id is null or inv.employee_id is distinct from public.my_contractor_id() then
    raise exception 'Invoice not found.';
  end if;
  if inv.status not in ('draft', 'declined') then raise exception 'This invoice has already been sent.'; end if;

  select * into emp from public.employees where id = inv.employee_id;
  select * into priv from public.employee_private where employee_id = inv.employee_id;
  select name into biz_name from public.businesses where id = inv.business_id;

  if coalesce(trim(emp.full_name), '') = '' then missing := missing || 'name'; end if;
  if coalesce(trim(emp.phone), '') = '' then missing := missing || 'phone number'; end if;
  if coalesce(trim(emp.email), '') = '' then missing := missing || 'email'; end if;
  if coalesce(trim(emp.abn), '') = '' then missing := missing || 'ABN'; end if;
  if priv.account_name_enc is null or priv.bsb_enc is null or priv.account_number_enc is null then
    missing := missing || 'bank details';
  end if;
  if cardinality(missing) > 0 then
    raise exception 'Add your % in My Profile before sending.', array_to_string(missing, ', ');
  end if;

  update public.contractor_invoice_items set amount = round(quantity * rate, 2) where invoice_id = inv.id;
  select coalesce(sum(amount), 0) into sub from public.contractor_invoice_items where invoice_id = inv.id;
  if not exists (select 1 from public.contractor_invoice_items where invoice_id = inv.id) or sub <= 0 then
    raise exception 'Add at least one line item before sending.';
  end if;
  tax := case when emp.gst_registered then round(sub * 0.1, 2) else 0 end;

  update public.contractor_invoices set
    status = 'sent', sent_at = now(), decline_reason = null, declined_at = null,
    gst_registered = emp.gst_registered, subtotal = sub, gst = tax, total = sub + tax,
    from_name = emp.full_name, from_phone = emp.phone, from_email = emp.email, from_abn = emp.abn, bill_to = biz_name,
    bank_account_name_enc = priv.account_name_enc, bank_bsb_enc = priv.bsb_enc,
    bank_account_number_enc = priv.account_number_enc, bank_last4 = priv.account_last4
  where id = inv.id
  returning * into inv;
  return inv;
end;
$$;

-- Owner: approve, decline (with a reason) or mark as paid.
create or replace function public.set_contractor_invoice_status(p_invoice_id uuid, p_status text, p_reason text default null)
returns public.contractor_invoices language plpgsql security definer set search_path = '' as $$
declare
  inv public.contractor_invoices;
begin
  select * into inv from public.contractor_invoices where id = p_invoice_id for update;
  if inv.id is null or not public.is_business_owner(inv.business_id) then raise exception 'Invoice not found.'; end if;

  if p_status = 'approved' and inv.status = 'sent' then
    update public.contractor_invoices set status = 'approved', approved_at = now() where id = inv.id returning * into inv;
  elsif p_status = 'declined' and inv.status in ('sent', 'approved') then
    if coalesce(trim(p_reason), '') = '' then raise exception 'Please give a reason for declining.'; end if;
    update public.contractor_invoices set status = 'declined', declined_at = now(), decline_reason = trim(p_reason)
    where id = inv.id returning * into inv;
  elsif p_status = 'paid' and inv.status in ('sent', 'approved') then
    update public.contractor_invoices set status = 'paid', paid_at = now() where id = inv.id returning * into inv;
  else
    raise exception 'This invoice can''t be changed to %.', p_status;
  end if;
  return inv;
end;
$$;

-- Bank details on an invoice (decrypted): only for the contractor themselves or their owner.
create or replace function public.get_contractor_invoice_bank(p_invoice_id uuid)
returns table (account_name text, bsb text, account_number text)
language plpgsql stable security definer set search_path = '' as $$
declare
  inv public.contractor_invoices;
begin
  select * into inv from public.contractor_invoices where id = p_invoice_id;
  if inv.id is null or not (inv.employee_id = public.my_contractor_id() or public.is_business_owner(inv.business_id)) then
    raise exception 'Not allowed.';
  end if;
  return query select private.dec(inv.bank_account_name_enc), private.dec(inv.bank_bsb_enc), private.dec(inv.bank_account_number_enc);
end;
$$;

revoke execute on function public.send_contractor_invoice(uuid) from public, anon;
revoke execute on function public.set_contractor_invoice_status(uuid, text, text) from public, anon;
revoke execute on function public.get_contractor_invoice_bank(uuid) from public, anon;
revoke execute on function public.is_contractor(uuid) from public, anon;
revoke execute on function public.my_contractor_id() from public, anon;
grant execute on function public.send_contractor_invoice(uuid) to authenticated;
grant execute on function public.set_contractor_invoice_status(uuid, text, text) to authenticated;
grant execute on function public.get_contractor_invoice_bank(uuid) to authenticated;
grant execute on function public.is_contractor(uuid) to authenticated;
grant execute on function public.my_contractor_id() to authenticated;

-- ---------------------------------------------------------------------
-- Notifications: the owner hears about new invoices (they sit in the owner's
-- "To Do" list until paid or declined); the contractor hears when theirs is
-- approved, declined or paid.
-- ---------------------------------------------------------------------

-- What a notification is about (e.g. a contractor invoice), so it can open it
-- and its to-do status can follow the invoice.
alter table public.notifications add column if not exists related_id uuid;
create index if not exists notifications_related_idx on public.notifications (related_id);

create or replace function public.notify_contractor_invoice()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  who text;
  emp_user uuid;
  amount text := '$' || to_char(new.total, 'FM999,999,990.00');
begin
  if new.status is not distinct from old.status then return new; end if;
  select full_name, user_id into who, emp_user from public.employees where id = new.employee_id;

  -- The owner's to-do: "To review" when sent, "To pay" once approved, done when paid or declined.
  update public.notifications set status = case new.status
      when 'approved' then 'To pay'
      when 'paid' then 'Paid'
      when 'declined' then 'Declined'
      else status end
  where related_id = new.id and type = 'contractor_invoice';

  if new.status = 'sent' then
    insert into public.notifications (business_id, recipient_id, audience, type, title, summary, body, details, status, related_id)
    select new.business_id, b.owner_id, 'owner', 'contractor_invoice',
      'New invoice from ' || coalesce(who, 'a contractor'),
      new.number || ' · ' || amount,
      coalesce(who, 'A contractor') || ' sent you invoice ' || new.number || ' for ' || amount || '. Open Contractor Invoices to approve or pay it.',
      jsonb_build_array(
        jsonb_build_object('label', 'Invoice', 'value', new.number),
        jsonb_build_object('label', 'Total', 'value', amount),
        jsonb_build_object('label', 'Due', 'value', coalesce(to_char(new.due_date, 'DD Mon YYYY'), '—'))
      ),
      'To review', new.id
    from public.businesses b where b.id = new.business_id;
  elsif new.status in ('approved', 'declined', 'paid') then
    insert into public.notifications (business_id, recipient_id, audience, type, title, summary, body, related_id)
    values (new.business_id, emp_user, 'employee', 'invoice_status',
      case new.status when 'approved' then 'Invoice approved' when 'declined' then 'Invoice declined' else 'Invoice paid' end,
      new.number || ' · ' || amount,
      case new.status
        when 'approved' then 'Your invoice ' || new.number || ' for ' || amount || ' has been approved.'
        when 'declined' then 'Your invoice ' || new.number || ' was declined: ' || coalesce(new.decline_reason, '') || ' You can fix it and send it again.'
        else 'Your invoice ' || new.number || ' for ' || amount || ' has been paid.'
      end,
      new.id);
  end if;
  return new;
end;
$$;
drop trigger if exists contractor_invoices_notify on public.contractor_invoices;
create trigger contractor_invoices_notify after update on public.contractor_invoices
  for each row execute function public.notify_contractor_invoice();

-- ---------------------------------------------------------------------
-- Employee sign-up (replaces the earlier version): also saves a contractor's
-- ABN and GST registration. Everything else is unchanged.
-- ---------------------------------------------------------------------

create or replace function public.complete_employee_signup(p_code text, p jsonb)
returns public.employees language plpgsql security definer set search_path = '' as $$
declare
  biz public.businesses;
  inv public.employee_invites;
  result public.employees;
  digits text := regexp_replace(coalesce(p ->> 'account_number', ''), '\D', '', 'g');
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
    employee_id, account_name_enc, bsb_enc, account_number_enc, tfn_enc, account_last4, has_tfn
  ) values (
    result.id, private.enc(p ->> 'account_name'), private.enc(p ->> 'bsb'), private.enc(digits),
    private.enc(regexp_replace(coalesce(p ->> 'tfn', ''), '\D', '', 'g')),
    nullif(right(digits, 4), ''), coalesce(p ->> 'tfn', '') <> ''
  );
  return result;
end;
$$;
revoke execute on function public.complete_employee_signup(text, jsonb) from public, anon;
grant execute on function public.complete_employee_signup(text, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Live updates
-- ---------------------------------------------------------------------

do $$
begin
  begin
    alter publication supabase_realtime add table public.contractor_invoices;
  exception when duplicate_object then null;
  end;
end;
$$;
