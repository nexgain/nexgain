// NexGain Retail: the stock maths shared by the app (the Home "AI Business
// Watchdog", Review & Order Stock, Product Details) and the server (the AI
// Assistant and the daily health check), so they always agree.
//   - how fast each size / colour sells (sold minus returned, last 4 weeks),
//   - how many days of stock are left,
//   - when to reorder: at or below the reorder point, or it would run out
//     before a delivery could arrive (the supplier's delivery time plus a week
//     to spare). Stock already on order counts.
//   - how much: enough for the delivery time plus 4 more weeks of sales, plus
//     the reorder point as a safety buffer.
//   - best sellers and slow-moving stock.
// Pure functions with plain shapes (the app's Product / Movement fit them).

const DAY = 86_400_000;
/** Sales are measured over this many days. */
export const SALES_WINDOW_DAYS = 28;
/** A new order should last this long after it arrives. */
export const COVER_DAYS = 28;
/** Reorder when stock would run out within the delivery time plus this many days. */
export const SPARE_DAYS = 7;
/** Stock with no sales for this long is "slow". */
export const SLOW_DAYS = 60;

/** A sale (or return) line: sold = negative change, returned = positive. */
export type SaleLine = { variantId: string; kind: string; change: number; unitPrice: number | null; createdAt: string };

export type StockProduct = {
  id: string;
  archived: boolean;
  supplierId: string | null;
  /** The reorder point. */
  lowStockLevel: number;
  costPrice: number | null;
  createdAt: string;
  variants: { id: string }[];
};

export type VariantAdvice = {
  productId: string;
  variantId: string;
  stock: number;
  onOrder: number;
  reorderPoint: number;
  /** Units sold per day (last 4 weeks). */
  perDay: number;
  /** Days until it runs out at that rate (null = not selling). */
  daysLeft: number | null;
  leadTimeDays: number;
  needsReorder: boolean;
  /** How many to order now (0 when it doesn't need reordering). */
  recommended: number;
  /** Why, in plain English. */
  reason: string;
};

const isSale = (m: SaleLine) => m.kind === 'sold' || m.kind === 'returned';

/** Units sold (minus returns) for each variant between two dates. */
export function unitsSold(lines: SaleLine[], since: Date, until = new Date(8.64e15)) {
  const map = new Map<string, number>();
  for (const m of lines) {
    if (!isSale(m)) continue;
    const at = Date.parse(m.createdAt);
    if (at < since.getTime() || at >= until.getTime()) continue;
    map.set(m.variantId, (map.get(m.variantId) ?? 0) - m.change);
  }
  return map;
}

/** Money taken from sales (minus returns) between two dates. */
export function salesValue(lines: SaleLine[], since: Date, until = new Date(8.64e15)) {
  let total = 0;
  for (const m of lines) {
    if (!isSale(m) || m.unitPrice === null) continue;
    const at = Date.parse(m.createdAt);
    if (at < since.getTime() || at >= until.getTime()) continue;
    total += -m.change * m.unitPrice;
  }
  return Math.round(total * 100) / 100;
}

/** The advice for every size / colour of every product still on the list. */
export function reorderAdviceFor(
  products: StockProduct[],
  stockOf: (variantId: string) => number,
  lines: SaleLine[],
  suppliers: { id: string; leadTimeDays: number }[],
  onOrder: Map<string, number>,
  now = new Date(),
): VariantAdvice[] {
  const sold = unitsSold(lines, new Date(now.getTime() - SALES_WINDOW_DAYS * DAY));
  const out: VariantAdvice[] = [];
  for (const p of products) {
    if (p.archived) continue;
    const leadTimeDays = suppliers.find((s) => s.id === p.supplierId)?.leadTimeDays ?? 7;
    for (const v of p.variants) {
      const stock = stockOf(v.id);
      const coming = onOrder.get(v.id) ?? 0;
      const available = stock + coming;
      const perDay = Math.max(0, sold.get(v.id) ?? 0) / SALES_WINDOW_DAYS;
      const daysLeft = perDay > 0 ? Math.floor(stock / perDay) : null;
      const belowPoint = available <= p.lowStockLevel;
      const runsOutSoon = perDay > 0 && available / perDay <= leadTimeDays + SPARE_DAYS;
      const needsReorder = belowPoint || runsOutSoon;
      const target = Math.max(Math.ceil(perDay * (leadTimeDays + COVER_DAYS)) + p.lowStockLevel, p.lowStockLevel * 2, 1);
      const recommended = needsReorder ? Math.max(1, target - available) : 0;
      let reason = 'Plenty in stock.';
      if (needsReorder) {
        if (runsOutSoon && daysLeft !== null) reason = `Selling about ${Math.round(perDay * 7)} a week: runs out in about ${daysLeft} day${daysLeft === 1 ? '' : 's'}, and delivery takes ${leadTimeDays}.`;
        else reason = stock === 0 ? 'Sold out.' : `At or below its reorder point (${p.lowStockLevel}).`;
        if (coming > 0) reason += ` ${coming} already on order.`;
      }
      out.push({ productId: p.id, variantId: v.id, stock, onOrder: coming, reorderPoint: p.lowStockLevel, perDay, daysLeft, leadTimeDays, needsReorder, recommended, reason });
    }
  }
  return out;
}

export type ProductSales = { productId: string; units: number };

/** Products by units sold over the last 4 weeks, most first (only ones that sold). */
export function bestSellers(products: StockProduct[], lines: SaleLine[], now = new Date()): ProductSales[] {
  const sold = unitsSold(lines, new Date(now.getTime() - SALES_WINDOW_DAYS * DAY));
  return products
    .filter((p) => !p.archived)
    .map((p) => ({ productId: p.id, units: p.variants.reduce((s, v) => s + (sold.get(v.id) ?? 0), 0) }))
    .filter((x) => x.units > 0)
    .sort((a, b) => b.units - a.units);
}

export type SlowStock = { productId: string; stock: number; value: number; daysSinceSale: number | null };

/**
 * Slow-moving stock: products with stock that haven't sold in 60 days (and
 * have been in the shop at least that long), the most money tied up first.
 */
export function slowSellersFor(products: StockProduct[], stockOf: (variantId: string) => number, lines: SaleLine[], now = new Date()): SlowStock[] {
  const lastSale = new Map<string, number>();
  for (const m of lines) {
    if (m.kind !== 'sold') continue;
    const at = Date.parse(m.createdAt);
    if (at > (lastSale.get(m.variantId) ?? 0)) lastSale.set(m.variantId, at);
  }
  const out: SlowStock[] = [];
  for (const p of products) {
    if (p.archived || now.getTime() - Date.parse(p.createdAt) < SLOW_DAYS * DAY) continue;
    const stock = p.variants.reduce((s, v) => s + stockOf(v.id), 0);
    if (stock <= 0) continue;
    const last = Math.max(0, ...p.variants.map((v) => lastSale.get(v.id) ?? 0));
    const daysSinceSale = last ? Math.floor((now.getTime() - last) / DAY) : null;
    if (daysSinceSale !== null && daysSinceSale < SLOW_DAYS) continue;
    out.push({ productId: p.id, stock, value: Math.round(stock * (p.costPrice ?? 0) * 100) / 100, daysSinceSale });
  }
  return out.sort((a, b) => b.value - a.value || b.stock - a.stock);
}

export type SupplierReorder = { supplierId: string | null; items: VariantAdvice[] };

/** What needs reordering, grouped by who supplies it (no supplier last). */
export function reorderBySupplier(advice: VariantAdvice[], products: Pick<StockProduct, 'id' | 'supplierId'>[]): SupplierReorder[] {
  const groups = new Map<string | null, VariantAdvice[]>();
  for (const a of advice) {
    if (!a.needsReorder) continue;
    const supplierId = products.find((p) => p.id === a.productId)?.supplierId ?? null;
    groups.set(supplierId, [...(groups.get(supplierId) ?? []), a]);
  }
  return [...groups.entries()]
    .map(([supplierId, items]) => ({ supplierId, items }))
    .sort((a, b) => (a.supplierId === null ? 1 : b.supplierId === null ? -1 : b.items.length - a.items.length));
}
