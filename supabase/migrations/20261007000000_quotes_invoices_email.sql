-- =====================================================================
-- NexGain: send quotes & invoices from the owner's own email app, and let
-- customers accept or decline a quote online.
-- Run once, after the earlier files:
--   Supabase > SQL Editor > New query > paste this whole file > Run.
-- Safe to run again.
--
-- How it fits together:
--   owner presses Send Quote -> quote_share_token() gives the quote a secret link code
--   customer opens the link   -> the "quote-page" Edge Function calls quote_public_view()
--   customer accepts/declines -> respond_to_quote() updates the quote and notifies the owner
-- The customer functions can only be run by the Edge Function (server side), never by
-- the app or a browser, and they only ever touch the one quote the link code belongs to.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Business settings: which email app the owner sends from
-- ---------------------------------------------------------------------

alter table public.businesses add column if not exists email_app text not null default 'other';
alter table public.businesses add column if not exists business_email text not null default '';
do $$
begin
  alter table public.businesses add constraint businesses_email_app_check check (email_app in ('gmail', 'outlook', 'other'));
exception when duplicate_object then null;
end;
$$;

-- Bank details printed on invoices. Kept in their own table so only the owner
-- can read them (staff can read the businesses table).
create table if not exists public.business_bank_details (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  bank_name text not null default '',
  account_name text not null default '',
  bsb text not null default '',
  account_number text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.business_bank_details enable row level security;
drop policy if exists "owner manages bank details" on public.business_bank_details;
create policy "owner manages bank details" on public.business_bank_details for all to authenticated
  using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));

-- ---------------------------------------------------------------------
-- Quotes: customer link and response; invoices made from quotes
-- ---------------------------------------------------------------------

-- Secret code in the customer's link (random, impossible to guess).
alter table public.sales_docs add column if not exists public_token text;
create unique index if not exists sales_docs_public_token_idx on public.sales_docs (public_token) where public_token is not null;
-- When the customer accepted or declined online (empty if they haven't).
alter table public.sales_docs add column if not exists responded_at timestamptz;
-- Invoices converted from a quote point back at it.
alter table public.sales_docs add column if not exists source_quote_id uuid references public.sales_docs (id) on delete set null;

-- "Expired" is now worked out from the quote's date and never stored.
update public.sales_docs set status = 'Sent' where kind = 'quote' and status = 'Expired';

-- Notifications can open a quote or invoice.
alter table public.notifications add column if not exists related_doc_id uuid references public.sales_docs (id) on delete set null;

-- The app saves quotes a moment after each edit. If a save from the phone was
-- already on its way when the customer answered, don't let it undo their answer.
create or replace function public.keep_customer_response()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.kind = 'quote'
    and old.responded_at is not null
    and new.responded_at is not distinct from old.responded_at
    and old.status in ('Accepted', 'Declined')
    and new.status in ('Draft', 'Sent') then
    new.status := old.status;
  end if;
  return new;
end;
$$;

drop trigger if exists sales_docs_keep_customer_response on public.sales_docs;
create trigger sales_docs_keep_customer_response before update on public.sales_docs
  for each row execute function public.keep_customer_response();

-- ---------------------------------------------------------------------
-- Owner functions (run from the app, signed in)
-- ---------------------------------------------------------------------

-- Gives the quote its secret link code (the same one every time it's sent).
create or replace function public.quote_share_token(p_quote_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  q public.sales_docs;
begin
  select * into q from public.sales_docs where id = p_quote_id for update;
  if q.id is null or not public.is_business_owner(q.business_id) then raise exception 'Quote not found.'; end if;
  if q.kind <> 'quote' then raise exception 'Only quotes have a customer link.'; end if;
  if q.public_token is null then
    -- 24 random bytes = 32 letters/numbers.
    update public.sales_docs
    set public_token = translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_')
    where id = q.id
    returning public_token into q.public_token;
  end if;
  return q.public_token;
end;
$$;

-- After the owner sends a quote: it's "Sent" and waiting for the customer again
-- (so a revised quote can be accepted or declined afresh).
create or replace function public.mark_quote_sent(p_quote_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  q public.sales_docs;
begin
  select * into q from public.sales_docs where id = p_quote_id for update;
  if q.id is null or not public.is_business_owner(q.business_id) then raise exception 'Quote not found.'; end if;
  if q.kind <> 'quote' or q.status in ('Accepted', 'Booked') then return; end if;
  update public.sales_docs set status = 'Sent', responded_at = null where id = q.id;
end;
$$;

revoke execute on function public.quote_share_token(uuid) from public, anon;
revoke execute on function public.mark_quote_sent(uuid) from public, anon;
grant execute on function public.quote_share_token(uuid) to authenticated;
grant execute on function public.mark_quote_sent(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Customer functions (run only by the quote-page Edge Function)
-- ---------------------------------------------------------------------

-- What the customer's page shows. Only this quote, and only what's on the quote.
create or replace function public.quote_public_view(p_token text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'number', q.number,
    'state', case when q.status in ('Accepted', 'Booked') then 'accepted' when q.status = 'Declined' then 'declined' else 'open' end,
    'createdAt', q.created_at,
    'validUntil', q.due_date,
    'respondedAt', q.responded_at,
    'customerName', coalesce(q.client ->> 'name', ''),
    'description', q.description,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'description', coalesce(i ->> 'description', ''),
        'qty', coalesce((i ->> 'qty')::numeric, 0),
        'rate', coalesce((i ->> 'rate')::numeric, 0)
      ) order by n)
      from jsonb_array_elements(q.items) with ordinality as t (i, n)
    ), '[]'::jsonb),
    'gstRate', q.gst_rate,
    'business', jsonb_build_object(
      'name', b.name,
      'logo', b.logo,
      'abn', coalesce(b.abn, ''),
      'email', coalesce(nullif(b.business_email, ''), b.owner_email)
    )
  )
  from public.sales_docs q
  join public.businesses b on b.id = q.business_id
  where q.public_token = p_token and q.kind = 'quote';
$$;

-- The customer accepts or declines. Only works once; after that the quote stays
-- as it is and this just returns it. Adds a notification for the owner.
create or replace function public.respond_to_quote(p_token text, p_accept boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  q public.sales_docs;
  owner uuid;
  who text;
  num text;
  verb text := case when p_accept then 'accepted' else 'declined' end;
begin
  select * into q from public.sales_docs where public_token = p_token and kind = 'quote' for update;
  if q.id is null then return null; end if;

  if q.status in ('Draft', 'Sent') and q.responded_at is null then
    update public.sales_docs
    set status = case when p_accept then 'Accepted' else 'Declined' end, responded_at = now()
    where id = q.id;

    select owner_id into owner from public.businesses where id = q.business_id;
    who := coalesce(nullif(trim(q.client ->> 'name'), ''), 'Your customer');
    num := regexp_replace(q.number, '^[A-Za-z]+-', '#');
    insert into public.notifications (business_id, recipient_id, audience, type, title, summary, body, details, related_doc_id)
    values (
      q.business_id, owner, 'owner', 'quote_' || verb,
      format('%s %s Quote %s', who, verb, num),
      case when p_accept then 'Ready to convert to an invoice or book in as a job.' else 'The quote has moved to Declined.' end,
      format('%s %s Quote %s online.', who, verb, num),
      jsonb_build_array(
        jsonb_build_object('label', 'Quote', 'value', q.number),
        jsonb_build_object('label', 'Customer', 'value', who)
      ),
      q.id
    );
  end if;

  return public.quote_public_view(p_token);
end;
$$;

-- Nobody can run these directly: only the Edge Function, using the server-side key.
revoke execute on function public.quote_public_view(text) from public, anon, authenticated;
revoke execute on function public.respond_to_quote(text, boolean) from public, anon, authenticated;
grant execute on function public.quote_public_view(text) to service_role;
grant execute on function public.respond_to_quote(text, boolean) to service_role;
