-- NexGain Retail: database check (READ ONLY - changes nothing).
-- Paste into Supabase > SQL Editor and press Run, after running every
-- 20261127... retail migration. Every row should say ✅.

with expected(name) as (
  values
    ('retail_settings'), ('product_categories'), ('store_locations'), ('suppliers'),
    ('products'), ('product_variants'), ('stock_levels'), ('stock_movements'),
    ('deliveries'), ('stocktakes'), ('stocktake_counts'), ('purchase_orders'),
    ('purchase_order_lines'), ('retail_staff_permissions'), ('sales')
),
tables as (
  select e.name,
         c.oid is not null as found,
         coalesce(c.relrowsecurity, false) as rls,
         (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = e.name) as policies
  from expected e
  left join pg_class c on c.relname = e.name and c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
)
select
  case when found and rls and policies > 0 then '✅' else '❌' end as ok,
  'Table ' || name as item,
  case
    when not found then 'Missing - run the retail migrations in order'
    when not rls then 'Row Level Security is OFF'
    when policies = 0 then 'No access rules'
    else 'Row Level Security on, ' || policies || ' access rule(s)'
  end as detail
from tables
union all
select
  case when exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'product_variants_unique_barcode') then '✅' else '❌' end,
  'Barcodes unique per business',
  'product_variants_unique_barcode'
union all
select
  case when count(*) = 4 then '✅' else '❌' end,
  'Safety triggers',
  count(*) || ' of 4 (barcode, variant business, product links, order links)'
from pg_trigger
where tgname in ('product_variants_barcode', 'product_variants_business', 'products_same_business', 'purchase_orders_same_business')
union all
select
  case when count(*) = 0 then '✅' else '❌' end,
  'Stock can only change through NexGain',
  case when count(*) = 0 then 'No direct write rules on stock, history or sales' else count(*) || ' direct write rule(s) found' end
from pg_policies
where schemaname = 'public' and tablename in ('stock_levels', 'stock_movements', 'sales', 'deliveries', 'stocktakes') and cmd <> 'SELECT';
