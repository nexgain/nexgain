-- NexGain Retail (System 3), section 8: database safety checks.
-- Row Level Security already stops a business reading or changing another
-- business's rows. This adds the last guard: links between rows must stay
-- inside the same business, e.g. a product can only use its own business's
-- category, supplier and store; an order its own supplier and store; a
-- stocktake count its own products. Plus two indexes for faster loading.
--
-- Safe to run again. Needs 20261127000500_retail_sales.sql first.
-- Systems 1 and 2 aren't touched (only retail tables).

create or replace function private.retail_same_business()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.supplier_id is not null and not exists (select 1 from public.suppliers s where s.id = new.supplier_id and s.business_id = new.business_id) then
    raise exception 'That supplier isn''t in this business.' using errcode = 'NXS02';
  end if;
  if new.store_id is not null and not exists (select 1 from public.store_locations s where s.id = new.store_id and s.business_id = new.business_id) then
    raise exception 'That store isn''t in this business.' using errcode = 'NXS02';
  end if;
  -- Nested (not "and"): orders have no category_id, so it's only read for products.
  if tg_table_name = 'products' then
    if new.category_id is not null
       and not exists (select 1 from public.product_categories c where c.id = new.category_id and c.business_id = new.business_id) then
      raise exception 'That category isn''t in this business.' using errcode = 'NXS02';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function private.retail_same_business() from public, anon, authenticated;

drop trigger if exists products_same_business on public.products;
create trigger products_same_business before insert or update of business_id, category_id, supplier_id, store_id on public.products
  for each row execute function private.retail_same_business();

drop trigger if exists purchase_orders_same_business on public.purchase_orders;
create trigger purchase_orders_same_business before insert or update of business_id, supplier_id, store_id on public.purchase_orders
  for each row execute function private.retail_same_business();

-- Stocktake counts: only the business's own products (and an open stocktake).
drop policy if exists "owner manages stocktake counts" on public.stocktake_counts;
create policy "owner manages stocktake counts" on public.stocktake_counts for all to authenticated
  using (public.is_business_owner(business_id)) with check (
    public.is_business_owner(business_id)
    and exists (select 1 from public.stocktakes s where s.id = stocktake_id and s.business_id = stocktake_counts.business_id and s.status = 'counting')
    and exists (select 1 from public.product_variants v where v.id = variant_id and v.business_id = stocktake_counts.business_id)
  );

-- Faster loading of a shop's stock and orders.
create index if not exists stock_levels_business on public.stock_levels (business_id);
create index if not exists purchase_order_lines_business on public.purchase_order_lines (business_id);
