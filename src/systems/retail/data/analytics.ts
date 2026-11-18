// NexGain Retail Reports (Analytics): the sums behind the Reports page.
//   - sales over time (and the profit made on them),
//   - sales by category, product, size or colour,
//   - sell-through: how much of the stock you had actually sold,
//   - profit margins (most and least profitable products),
//   - top staff, and each store side by side (2+ stores).
// Profit = what the customer paid without GST, minus the product's cost price.
// Sales rows don't keep the cost at the time, so today's cost price is used.
import type { ProductCategory, StoreLocation } from '@/systems/retail/data/retail';
import type { Sale } from '@/systems/retail/data/sales';
import { productStock, stockValue, type Product, type StockLevels, type Variant } from '@/systems/retail/data/stock';

export type Period = { start: Date; end: Date };
export type BreakdownBy = 'category' | 'product' | 'size' | 'colour';

export type BreakdownRow = {
  name: string;
  /** Items sold (less returns). */
  units: number;
  /** Money taken, incl. GST. */
  sales: number;
  /** Sales without GST, minus cost. null when no cost prices are entered. */
  profit: number | null;
  /** Share of all sales in the period, whole percent. */
  share: number;
};

export type SellThroughRow = { productId: string; name: string; sold: number; inStock: number; rate: number };
export type MarginRow = { productId: string; name: string; units: number; sales: number; profit: number; margin: number };
export type StoreRow = { storeId: string | null; name: string; sales: number; units: number; profit: number | null; stockCost: number; sellThrough: number };

const round = (n: number) => Math.round(n * 100) / 100;
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
const inPeriod = (s: Sale, p: Period) => {
  const at = Date.parse(s.soldAt);
  return at >= p.start.getTime() && at < p.end.getTime();
};

/** Finds each sale's product and size / colour. */
function lookups(products: Product[]) {
  const byProduct = new Map(products.map((p) => [p.id, p]));
  const byVariant = new Map<string, { product: Product; variant: Variant }>();
  for (const p of products) for (const v of p.variants) byVariant.set(v.id, { product: p, variant: v });
  return (s: Sale) => {
    const hit = s.variantId ? byVariant.get(s.variantId) : undefined;
    if (hit) return hit;
    const product = s.productId ? byProduct.get(s.productId) : undefined;
    return product ? { product, variant: null } : null;
  };
}

/** What a sale cost you (cost price x items). null when the product has no cost price. */
function costOf(product: Product | undefined, quantity: number) {
  if (!product || product.costPrice === null) return null;
  return product.costPrice * quantity;
}

/** Totals for a period: sales, GST, items, returns, cost of the stock sold, gross profit and margin. */
export function periodTotals(sales: Sale[], products: Product[], period: Period) {
  const find = lookups(products);
  let total = 0;
  let gst = 0;
  let items = 0;
  let returned = 0;
  let cost = 0;
  let costedExGst = 0;
  for (const s of sales) {
    if (!inPeriod(s, period)) continue;
    total += s.total;
    gst += s.gst;
    if (s.quantity > 0) items += s.quantity;
    else returned -= s.quantity;
    const c = costOf(find(s)?.product, s.quantity);
    if (c !== null) {
      cost += c;
      costedExGst += s.total - s.gst;
    }
  }
  const profit = costedExGst - cost;
  return {
    total: round(total),
    gst: round(gst),
    exGst: round(total - gst),
    items,
    returned,
    cost: round(cost),
    profit: round(profit),
    /** Gross margin on the sales that have a cost price, whole percent. */
    margin: pct(profit, costedExGst),
  };
}

/** Sales (incl. GST) and profit in each time bucket, for the chart. */
export function salesOverTime(sales: Sale[], products: Product[], buckets: Period[]) {
  return buckets.map((b) => {
    const t = periodTotals(sales, products, b);
    return { sales: t.total, profit: t.profit };
  });
}

/** Sales split by category, product, size or colour, most first. */
export function salesBreakdown(sales: Sale[], products: Product[], categories: ProductCategory[], period: Period, by: BreakdownBy): BreakdownRow[] {
  const find = lookups(products);
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const rows = new Map<string, { units: number; sales: number; profit: number; costed: boolean }>();
  let all = 0;
  for (const s of sales) {
    if (!inPeriod(s, period)) continue;
    const hit = find(s);
    let name: string;
    if (by === 'product') name = hit?.product.name ?? (s.itemName.split(' · ')[0] || 'Deleted product');
    else if (by === 'category') name = (hit?.product.categoryId && categoryName.get(hit.product.categoryId)) || 'No category';
    else if (by === 'size') name = hit?.variant?.size.trim() || 'No size';
    else name = hit?.variant?.colour.trim() || 'No colour';
    const row = rows.get(name) ?? { units: 0, sales: 0, profit: 0, costed: false };
    row.units += s.quantity;
    row.sales += s.total;
    const c = costOf(hit?.product, s.quantity);
    if (c !== null) {
      row.profit += s.total - s.gst - c;
      row.costed = true;
    }
    rows.set(name, row);
    all += s.total;
  }
  return [...rows.entries()]
    .map(([name, r]) => ({ name, units: r.units, sales: round(r.sales), profit: r.costed ? round(r.profit) : null, share: pct(r.sales, all) }))
    .sort((a, b) => b.sales - a.sales || b.units - a.units || a.name.localeCompare(b.name));
}

/** Items sold per product (less returns) in a period, optionally at one store. */
function unitsByProduct(sales: Sale[], products: Product[], period: Period, storeId?: string | null) {
  const find = lookups(products);
  const units = new Map<string, number>();
  for (const s of sales) {
    if (!inPeriod(s, period)) continue;
    if (storeId !== undefined && (s.storeId ?? null) !== storeId) continue;
    const id = find(s)?.product.id;
    if (id) units.set(id, (units.get(id) ?? 0) + s.quantity);
  }
  return units;
}

/**
 * Sell-through: of the stock you had, how much sold. Sold / (sold + still in stock).
 * 80% = most of it sold; 10% = most of it is still sitting there.
 * Products that sold nothing and have no stock are left out. Lowest first.
 */
export function sellThrough(sales: Sale[], products: Product[], levels: StockLevels, period: Period, storeId?: string | null) {
  const units = unitsByProduct(sales, products, period, storeId);
  let sold = 0;
  let stock = 0;
  const rows: SellThroughRow[] = [];
  for (const p of products) {
    if (p.archived) continue;
    const s = Math.max(0, units.get(p.id) ?? 0);
    const q = Math.max(0, productStock(levels, p, storeId));
    if (s + q === 0) continue;
    sold += s;
    stock += q;
    rows.push({ productId: p.id, name: p.name, sold: s, inStock: q, rate: pct(s, s + q) });
  }
  rows.sort((a, b) => a.rate - b.rate || b.inStock - a.inStock || a.name.localeCompare(b.name));
  return { rate: pct(sold, sold + stock), sold, inStock: stock, rows };
}

/** Each product's profit and margin on what it actually sold (needs a cost price), most profit first. */
export function productMargins(sales: Sale[], products: Product[], period: Period): MarginRow[] {
  const find = lookups(products);
  const rows = new Map<string, { product: Product; units: number; sales: number; exGst: number; cost: number }>();
  for (const s of sales) {
    if (!inPeriod(s, period)) continue;
    const product = find(s)?.product;
    const c = costOf(product, s.quantity);
    if (!product || c === null) continue;
    const row = rows.get(product.id) ?? { product, units: 0, sales: 0, exGst: 0, cost: 0 };
    row.units += s.quantity;
    row.sales += s.total;
    row.exGst += s.total - s.gst;
    row.cost += c;
    rows.set(product.id, row);
  }
  return [...rows.values()]
    .filter((r) => r.units > 0)
    .map((r) => ({
      productId: r.product.id,
      name: r.product.name,
      units: r.units,
      sales: round(r.sales),
      profit: round(r.exGst - r.cost),
      margin: pct(r.exGst - r.cost, r.exGst),
    }))
    .sort((a, b) => b.profit - a.profit || a.name.localeCompare(b.name));
}

/** Each store side by side: sales, items, profit, stock value and sell-through. */
export function storeComparison(sales: Sale[], products: Product[], levels: StockLevels, stores: StoreLocation[], period: Period): StoreRow[] {
  const find = lookups(products);
  const known = new Set(stores.map((s) => s.id));
  const rows = stores.map((s) => ({ storeId: s.id as string | null, name: s.name }));
  // Sales with no store (or a deleted one) get their own row, if there are any.
  const unplaced = sales.some((s) => inPeriod(s, period) && !(s.storeId && known.has(s.storeId)));
  if (unplaced) rows.push({ storeId: null, name: 'No store' });

  return rows.map((r) => {
    let total = 0;
    let units = 0;
    let profit = 0;
    let costed = false;
    for (const s of sales) {
      if (!inPeriod(s, period)) continue;
      const at = s.storeId && known.has(s.storeId) ? s.storeId : null;
      if (at !== r.storeId) continue;
      total += s.total;
      units += s.quantity;
      const c = costOf(find(s)?.product, s.quantity);
      if (c !== null) {
        profit += s.total - s.gst - c;
        costed = true;
      }
    }
    return {
      ...r,
      sales: round(total),
      units,
      profit: costed ? round(profit) : null,
      stockCost: stockValue(products, levels, r.storeId).cost,
      sellThrough: sellThrough(sales, products, levels, period, r.storeId).rate,
    };
  });
}

