-- NexGain Retail (System 3), step 5: staff stock actions and permissions.
--   * retail_staff_permissions: what each staff member can do from the Scanner.
--     With no row, staff can look products up, mark items Sold and take
--     Returns; receiving deliveries, damaged / lost and stock counts are off
--     until the owner turns them on. Staff never see cost prices or margins.
--   * staff_stock_action(): Sold, Received, Returned, Damaged or Count, from the
--     Scanner. Checks the staff member's permissions, uses the product's own
--     sell price for sales and returns (never a price sent by the phone), and
--     updates stock straight away. It's logged in the stock history with the
--     staff member's name, so the owner's history, sales and analytics show it.
-- Row Level Security: the owner manages permissions; staff can read their own.
-- Safe to run again. Needs 20261127000300_retail_orders.sql first.

create table if not exists public.retail_staff_permissions (
  employee_id uuid primary key references public.employees (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  can_sell boolean not null default true,
  can_return boolean not null default true,
  can_receive boolean not null default false,
  can_damage boolean not null default false,
  can_count boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.retail_staff_permissions enable row level security;
drop policy if exists "owner manages staff permissions" on public.retail_staff_permissions;
create policy "owner manages staff permissions" on public.retail_staff_permissions for all to authenticated
  using (public.is_business_owner(business_id))
  with check (
    public.is_business_owner(business_id)
    and exists (select 1 from public.employees e where e.id = employee_id and e.business_id = retail_staff_permissions.business_id)
  );
drop policy if exists "staff see own permissions" on public.retail_staff_permissions;
create policy "staff see own permissions" on public.retail_staff_permissions for select to authenticated
  using (employee_id = public.my_employee_id());

/**
 * A stock action from the Scanner by a staff member:
 *   sold / returned / received / damaged: p_quantity items (1 to 1000)
 *   count: p_quantity is how many they counted (sets the stock to it)
 * Returns { "left": how many are now at that store }.
 */
create or replace function public.staff_stock_action(p_variant uuid, p_store uuid, p_kind text, p_quantity int, p_note text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  emp uuid := public.my_employee_id();
  biz uuid := public.my_employee_business_id();
  perm public.retail_staff_permissions;
  v record;
  allowed boolean;
  current_qty int;
  delta int;
  left_now int;
  zero constant uuid := '00000000-0000-0000-0000-000000000000';
begin
  if emp is null or biz is null then raise exception 'Only staff can do this here.' using errcode = 'NXS00'; end if;
  if not exists (select 1 from public.businesses where id = biz and system_type = 'retail') then
    raise exception 'This isn''t a retail business.' using errcode = 'NXS00';
  end if;
  select pv.id, p.sell_price, p.archived into v
  from public.product_variants pv join public.products p on p.id = pv.product_id
  where pv.id = p_variant and pv.business_id = biz;
  if v.id is null or v.archived then raise exception 'That product isn''t in your shop.' using errcode = 'NXS01'; end if;

  select * into perm from public.retail_staff_permissions where employee_id = emp;
  allowed := case p_kind
    when 'sold' then coalesce(perm.can_sell, true)
    when 'returned' then coalesce(perm.can_return, true)
    when 'received' then coalesce(perm.can_receive, false)
    when 'damaged' then coalesce(perm.can_damage, false)
    when 'count' then coalesce(perm.can_count, false)
    else null end;
  if allowed is null then raise exception 'Unknown stock action.'; end if;
  if not allowed then
    raise exception 'You don''t have permission to do that. Ask the owner to turn it on for you.' using errcode = 'NXS04';
  end if;

  if p_kind = 'count' then
    if p_quantity is null or p_quantity < 0 or p_quantity > 100000 then raise exception 'Enter how many you counted (0 or more).'; end if;
    select coalesce((select quantity from public.stock_levels where variant_id = p_variant and coalesce(store_id, zero) = coalesce(p_store, zero)), 0)
    into current_qty;
    delta := p_quantity - current_qty;
    if delta = 0 then
      return jsonb_build_object('left', current_qty);
    end if;
    left_now := private.apply_stock_change(biz, p_variant, p_store, 'stocktake', delta, coalesce(nullif(btrim(p_note), ''), 'Counted on the Scanner'));
    return jsonb_build_object('left', left_now);
  end if;

  if p_quantity is null or p_quantity < 1 or p_quantity > 1000 then raise exception 'Enter a quantity from 1 to 1000.'; end if;
  delta := case when p_kind in ('sold', 'damaged') then -p_quantity else p_quantity end;
  left_now := private.apply_stock_change(
    biz, p_variant, p_store, p_kind, delta, p_note,
    case when p_kind in ('sold', 'returned') then v.sell_price else null end
  );
  return jsonb_build_object('left', left_now);
end;
$$;
revoke execute on function public.staff_stock_action(uuid, uuid, text, int, text) from public, anon;
grant execute on function public.staff_stock_action(uuid, uuid, text, int, text) to authenticated;
