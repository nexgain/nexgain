// NexGain Retail: loads one shop's stock and sales for the AI (the AI Assistant
// and the daily health check). With the owner's login, Row Level Security means
// only their own shop can be read. Big tables are read in pages of 1,000 rows
// (the most the database returns at once).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import type { RetailData, RetailProduct } from './retail-insights.ts';

const DAY = 86_400_000;
const PAGE = 1000;
/** Sales from the last 400 days (this year vs last year's same month). */
const SALES_DAYS = 400;
/** Stock changes (sell-outs, delivery costs, stocktakes) from the last 180 days. */
const CHANGES_DAYS = 180;
/** At most this many rows of any one table. */
const MAX_ROWS = 50_000;

type Row = Record<string, unknown>;

/** Every row a query returns, in pages. */
async function all(make: () => { range: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> }) {
  const rows: Row[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await make().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as Row[]));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** The shop's data, or null if it isn't a retail business (or can't be read). */
export async function loadRetailData(db: SupabaseClient, businessId: string): Promise<RetailData | null> {
  const { data: business } = await db.from('businesses').select('system_type, gst_registered, country, timezone').eq('id', businessId).maybeSingle();
  if (business?.system_type !== 'retail') return null;
  const salesSince = new Date(Date.now() - SALES_DAYS * DAY).toISOString();
  const changesSince = new Date(Date.now() - CHANGES_DAYS * DAY).toISOString();

  try {
    const [products, variants, categories, levels, suppliers, stores, sales, changes, orders] = await Promise.all([
      all(() => db.from('products').select('*').eq('business_id', businessId).order('id')),
      all(() => db.from('product_variants').select('id, product_id, size, colour, sku, barcode, sort').eq('business_id', businessId).order('id')),
      all(() => db.from('product_categories').select('id, name').eq('business_id', businessId).order('id')),
      all(() => db.from('stock_levels').select('variant_id, store_id, quantity').eq('business_id', businessId).order('variant_id')),
      all(() => db.from('suppliers').select('id, name, lead_time_days').eq('business_id', businessId).order('id')),
      all(() => db.from('store_locations').select('id, name').eq('business_id', businessId).order('id')),
      all(() =>
        db
          .from('sales')
          .select('variant_id, product_id, item_name, quantity, total, sold_at, sold_by')
          .eq('business_id', businessId)
          .gte('sold_at', salesSince)
          .order('sold_at', { ascending: false }),
      ),
      all(() =>
        db
          .from('stock_movements')
          .select('variant_id, kind, change, quantity_after, unit_cost, created_at')
          .eq('business_id', businessId)
          .in('kind', ['sold', 'received', 'stocktake'])
          .gte('created_at', changesSince)
          .order('created_at', { ascending: false }),
      ),
      all(() => db.from('purchase_orders').select('id, status, purchase_order_lines (variant_id, quantity)').eq('business_id', businessId).in('status', ['sent', 'pending']).order('id')),
    ]);

    const categoryName = new Map(categories.map((c) => [c.id as string, c.name as string]));
    const storeName = new Map(stores.map((s) => [s.id as string, s.name as string]));
    const variantsOf = new Map<string, Row[]>();
    for (const v of variants) variantsOf.set(v.product_id as string, [...(variantsOf.get(v.product_id as string) ?? []), v]);

    const stock: Record<string, number> = {};
    const storeStock: Record<string, Record<string, number>> = {};
    for (const l of levels) {
      const id = l.variant_id as string;
      const q = Number(l.quantity) || 0;
      stock[id] = (stock[id] ?? 0) + q;
      if (stores.length > 1) {
        const where = l.store_id ? (storeName.get(l.store_id as string) ?? 'Old store') : 'No store';
        storeStock[id] = { ...(storeStock[id] ?? {}), [where]: q };
      }
    }

    const onOrder: Record<string, number> = {};
    for (const o of orders) {
      for (const l of (o.purchase_order_lines as Row[] | null) ?? []) {
        onOrder[l.variant_id as string] = (onOrder[l.variant_id as string] ?? 0) + (Number(l.quantity) || 0);
      }
    }

    const retailProducts: RetailProduct[] = products.map((p) => ({
      id: p.id as string,
      name: p.name as string,
      sku: (p.sku as string) ?? '',
      brand: (p.brand as string) ?? '',
      category: p.category_id ? (categoryName.get(p.category_id as string) ?? '') : '',
      supplierId: (p.supplier_id as string | null) ?? null,
      costPrice: num(p.cost_price),
      sellPrice: num(p.sell_price),
      gstIncluded: p.gst_included !== false,
      lowStockLevel: Number(p.low_stock_level) || 0,
      createdAt: p.created_at as string,
      archived: p.archived === true,
      variants: (variantsOf.get(p.id as string) ?? [])
        .sort((a, b) => Number(a.sort) - Number(b.sort))
        .map((v) => ({ id: v.id as string, size: (v.size as string) ?? '', colour: (v.colour as string) ?? '', sku: (v.sku as string) ?? '', barcode: (v.barcode as string) ?? '' })),
    }));

    return {
      products: retailProducts,
      stock,
      storeStock,
      sales: sales.map((s) => ({
        variantId: (s.variant_id as string | null) ?? null,
        productId: (s.product_id as string | null) ?? null,
        itemName: (s.item_name as string) ?? '',
        quantity: Number(s.quantity) || 0,
        total: Number(s.total) || 0,
        soldAt: s.sold_at as string,
        soldBy: (s.sold_by as string) ?? '',
      })),
      changes: changes.map((c) => ({
        variantId: c.variant_id as string,
        kind: c.kind as string,
        change: Number(c.change) || 0,
        quantityAfter: Number(c.quantity_after) || 0,
        unitCost: num(c.unit_cost),
        createdAt: c.created_at as string,
      })),
      suppliers: suppliers.map((s) => ({ id: s.id as string, name: s.name as string, leadTimeDays: Number(s.lead_time_days ?? 7) })),
      onOrder,
      usesGst: business.gst_registered === true && business.country === 'AU',
      timeZone: (business.timezone as string) || 'Australia/Brisbane',
    };
  } catch (e) {
    console.warn('Could not load retail data:', e instanceof Error ? e.message : e);
    return null;
  }
}
