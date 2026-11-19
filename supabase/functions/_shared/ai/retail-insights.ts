// NexGain Retail (System 3): what the AI knows about a shop's stock and sales.
//   1. retailInsights(): the retail checks in the daily business health check
//      (shown on the Home dashboard and in the AI Assistant):
//      reorder suggestions, slow / dead stock, best sellers, profit margins,
//      sizes that keep selling out, stock loss from stocktakes, supplier price
//      rises, staff sales and the busiest days and times.
//   2. RETAIL_TOOL_DEFINITIONS / runRetailTool(): the AI Assistant's stock and
//      sales lookups ("how many size 10 black jeans do we have?", "what was my
//      best seller last month?").
// Pure functions over one shop's data (loaded by retail-data.ts on the server
// for the signed-in owner only). Numbers only come from the data.
import { dateKeyOf, inRange, PERIODS, resolvePeriod } from './dates.ts';
import { money } from './insights.ts';
import { reorderAdviceFor, slowSellersFor, SALES_WINDOW_DAYS, type SaleLine, type StockProduct } from './retail-stock.ts';
import type { Insight } from './types.ts';

// ---------------------------------------------------------------------------
// The shop's data
// ---------------------------------------------------------------------------

export type RetailVariant = { id: string; size: string; colour: string; sku: string; barcode: string };

export type RetailProduct = StockProduct & {
  name: string;
  sku: string;
  brand: string;
  /** The category's name ('' = none). */
  category: string;
  sellPrice: number | null;
  gstIncluded: boolean;
  variants: RetailVariant[];
};

export type RetailSale = {
  variantId: string | null;
  productId: string | null;
  itemName: string;
  /** Negative for a return. */
  quantity: number;
  /** Incl. GST; negative for a return. */
  total: number;
  soldAt: string;
  soldBy: string;
};

/** Stock changes the checks need: sales (to spot sell-outs), deliveries (costs) and stocktakes (loss). */
export type RetailChange = { variantId: string; kind: string; change: number; quantityAfter: number; unitCost: number | null; createdAt: string };

export type RetailData = {
  products: RetailProduct[];
  /** Variant id -> in stock (every store together). */
  stock: Record<string, number>;
  /** Variant id -> store name -> in stock (only with more than one store). */
  storeStock: Record<string, Record<string, number>>;
  sales: RetailSale[];
  changes: RetailChange[];
  suppliers: { id: string; name: string; leadTimeDays: number }[];
  /** Variant id -> on order (Sent or Pending orders). */
  onOrder: Record<string, number>;
  /** Registered for GST (Australia): sell prices are compared without GST. */
  usesGst: boolean;
  timeZone: string;
};

const DAY = 86_400_000;
const round = (n: number) => Math.round(n * 100) / 100;
const pct = (rate: number) => `${Math.round(rate * 100)}%`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** "Classic Hoodie · M / Black" */
export function itemLabel(p: Pick<RetailProduct, 'name'>, v: Pick<RetailVariant, 'size' | 'colour'> | undefined) {
  const option = v ? [v.size, v.colour].map((x) => x.trim()).filter(Boolean).join(' / ') : '';
  return option ? `${p.name} · ${option}` : p.name;
}

/** Sales as sale lines (sold = negative change), for the stock maths. */
export function saleLines(sales: RetailSale[]): SaleLine[] {
  return sales
    .filter((s) => s.variantId && s.quantity !== 0)
    .map((s) => ({
      variantId: s.variantId!,
      kind: s.quantity > 0 ? 'sold' : 'returned',
      change: -s.quantity,
      unitPrice: s.quantity !== 0 ? s.total / s.quantity : null,
      createdAt: s.soldAt,
    }));
}

/** Profit on one item: the sell price (without GST, when registered) minus the cost. null if a price is missing. */
export function profitEach(p: Pick<RetailProduct, 'costPrice' | 'sellPrice' | 'gstIncluded'>, usesGst: boolean) {
  if (p.costPrice === null || p.sellPrice === null) return null;
  const sell = usesGst && p.gstIncluded ? p.sellPrice / 1.1 : p.sellPrice;
  return round(sell - p.costPrice);
}

export function marginOf(p: Pick<RetailProduct, 'costPrice' | 'sellPrice' | 'gstIncluded'>, usesGst: boolean) {
  const profit = profitEach(p, usesGst);
  if (profit === null || !p.sellPrice) return null;
  const sell = usesGst && p.gstIncluded ? p.sellPrice / 1.1 : p.sellPrice;
  return sell > 0 ? profit / sell : null;
}

function finder(d: RetailData) {
  const byVariant = new Map<string, { p: RetailProduct; v: RetailVariant }>();
  for (const p of d.products) for (const v of p.variants) byVariant.set(v.id, { p, v });
  return (variantId: string | null) => (variantId ? byVariant.get(variantId) : undefined);
}

/** Weekday (0 = Monday) and hour of a moment in the shop's time zone. */
function whenIn(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'long', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
  const day = WEEKDAYS.indexOf(parts.find((x) => x.type === 'weekday')?.value ?? '');
  const hour = Number(parts.find((x) => x.type === 'hour')?.value ?? 0);
  return { day: Math.max(0, day), hour };
}

const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'am' : 'pm'}`;

// ---------------------------------------------------------------------------
// 1. The retail health checks
// ---------------------------------------------------------------------------

function insight(i: Omit<Insight, 'related'>): Insight {
  return { ...i, related: [] };
}

/** What the retail checks found for one shop. */
export function retailInsights(d: RetailData, now = new Date()): Insight[] {
  const out: Insight[] = [];
  const t = now.getTime();
  const find = finder(d);
  const live = d.products.filter((p) => !p.archived);
  const stockOf = (id: string) => d.stock[id] ?? 0;
  const lines = saleLines(d.sales);
  const salesBetween = (from: number, to: number) => d.sales.filter((s) => Date.parse(s.soldAt) >= from && Date.parse(s.soldAt) < to);
  const last30 = salesBetween(t - 30 * DAY, t + 1);

  // 1. Time to reorder (the same maths as the Home watchdog).
  const advice = reorderAdviceFor(live, stockOf, lines, d.suppliers, new Map(Object.entries(d.onOrder)), now).filter((a) => a.needsReorder);
  if (advice.length > 0) {
    const urgent = [...advice].sort((a, b) => (a.daysLeft ?? (a.stock === 0 ? -1 : 9999)) - (b.daysLeft ?? (b.stock === 0 ? -1 : 9999)))[0];
    const name = (() => {
      const f = find(urgent.variantId);
      return f ? itemLabel(f.p, f.v) : 'An item';
    })();
    const beforeDelivery = advice.some((a) => a.daysLeft !== null && a.daysLeft <= a.leadTimeDays);
    const first =
      urgent.daysLeft !== null
        ? `${name} will sell out in about ${plural(urgent.daysLeft, 'day')} — reorder ${urgent.recommended}.`
        : urgent.stock === 0
          ? `${name} is sold out — reorder ${urgent.recommended}.`
          : `${name} is at its reorder point — reorder ${urgent.recommended}.`;
    out.push(
      insight({
        key: 'retail_reorder',
        check: 'retail_reorder',
        area: 'spending',
        severity: beforeDelivery ? 'high' : 'medium',
        placements: beforeDelivery ? ['attention', 'analytics', 'notification'] : ['attention', 'analytics'],
        title: `${plural(advice.length, 'item')} ready to reorder`,
        summary: `${first}${advice.length > 1 ? ` ${plural(advice.length - 1, 'other item')} also ${advice.length === 2 ? 'needs' : 'need'} reordering.` : ''}`,
        suggestion: 'Open Home › Review & Order Stock: the order for each supplier is filled in for you.',
        estimatedSaving: null,
        metrics: { items: advice.length, units: advice.reduce((s, a) => s + a.recommended, 0) },
      }),
    );
  }

  // 2. Slow-moving / dead stock.
  const slow = slowSellersFor(live, stockOf, lines, now);
  const tiedUp = round(slow.reduce((s, x) => s + x.value, 0));
  if (slow.length > 0) {
    const top = d.products.find((p) => p.id === slow[0].productId)!;
    out.push(
      insight({
        key: 'retail_slow_stock',
        check: 'retail_slow_stock',
        area: 'spending',
        severity: tiedUp >= 1000 ? 'medium' : 'low',
        placements: tiedUp >= 500 ? ['attention', 'analytics'] : ['other', 'analytics'],
        title: tiedUp > 0 ? `${money(tiedUp, false)} tied up in slow stock` : `${plural(slow.length, 'product')} not selling`,
        summary: `${plural(slow.length, 'product')} ${slow.length === 1 ? 'hasn’t' : 'haven’t'} sold in 60+ days, led by ${top.name} (${slow[0].stock} in stock).`,
        suggestion: 'Put them on sale, bundle them with a best seller, or move them to the front of the shop. Don’t reorder them for now.',
        estimatedSaving: tiedUp > 0 ? tiedUp : null,
        metrics: { products: slow.length, value: tiedUp },
      }),
    );
  }

  // 3. Best sellers (product, category, size and colour) in the last 30 days.
  const units = (by: (s: RetailSale) => string | null) => {
    const map = new Map<string, number>();
    for (const s of last30) {
      const k = by(s);
      if (k) map.set(k, (map.get(k) ?? 0) + s.quantity);
    }
    return [...map.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  };
  const byProduct = units((s) => find(s.variantId)?.p.name ?? null);
  if (byProduct.length > 0 && last30.length >= 5) {
    const byCategory = units((s) => find(s.variantId)?.p.category || null);
    const bySize = units((s) => find(s.variantId)?.v.size || null);
    const byColour = units((s) => find(s.variantId)?.v.colour || null);
    const extra = [
      byCategory[0] && `top category ${byCategory[0][0]}`,
      bySize[0] && `top size ${bySize[0][0]}`,
      byColour[0] && `top colour ${byColour[0][0]}`,
    ].filter(Boolean);
    out.push(
      insight({
        key: 'retail_best_sellers',
        check: 'retail_best_sellers',
        area: 'finance',
        severity: 'low',
        placements: ['other', 'analytics'],
        title: `${byProduct[0][0]} is your best seller`,
        summary: `${byProduct[0][0]} sold ${byProduct[0][1]} in the last 30 days${extra.length ? ` (${extra.join(', ')})` : ''}.`,
        suggestion: `Keep ${byProduct[0][0]} well stocked, and put slower items next to it.`,
        estimatedSaving: null,
        metrics: { product: byProduct[0][0], units: byProduct[0][1] },
      }),
    );
  }

  // 4. Profit margins: what makes the most money, and what barely makes any.
  const profitByProduct = new Map<string, number>();
  for (const s of last30) {
    const f = find(s.variantId);
    const each = f ? profitEach(f.p, d.usesGst) : null;
    if (f && each !== null) profitByProduct.set(f.p.id, (profitByProduct.get(f.p.id) ?? 0) + each * s.quantity);
  }
  const topProfit = [...profitByProduct.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topProfit && topProfit[1] > 0) {
    const p = d.products.find((x) => x.id === topProfit[0])!;
    const m = marginOf(p, d.usesGst);
    out.push(
      insight({
        key: 'retail_top_profit',
        check: 'retail_top_profit',
        area: 'finance',
        severity: 'low',
        placements: ['analytics', 'other'],
        title: `${p.name} makes you the most money`,
        summary: `${p.name} made about ${money(round(topProfit[1]), false)} profit in the last 30 days${m !== null ? ` (${pct(m)} margin)` : ''}.`,
        suggestion: `Never let ${p.name} run out, and feature it in your marketing.`,
        estimatedSaving: null,
        metrics: { product: p.name, profit: round(topProfit[1]), margin: m === null ? null : round(m) },
      }),
    );
  }
  const lowMargin = live
    .filter((p) => profitByProduct.has(p.id))
    .map((p) => ({ p, m: marginOf(p, d.usesGst) }))
    .filter((x): x is { p: RetailProduct; m: number } => x.m !== null && x.m < 0.25)
    .sort((a, b) => a.m - b.m);
  if (lowMargin.length > 0) {
    const w = lowMargin[0];
    out.push(
      insight({
        key: `retail_low_margin:${w.p.id}`,
        check: 'retail_low_margin',
        area: 'finance',
        severity: w.m < 0.1 ? 'medium' : 'low',
        placements: ['attention', 'analytics'],
        title: `Low margin on ${w.p.name}`,
        summary: `${w.p.name} only makes ${pct(w.m)} on each sale${lowMargin.length > 1 ? ` (${plural(lowMargin.length - 1, 'other selling product')} under 25%)` : ''}.`,
        suggestion: `Raise the price of ${w.p.name}, or ask the supplier for a better cost price.`,
        estimatedSaving: null,
        metrics: { product: w.p.name, margin: round(w.m), products: lowMargin.length },
      }),
    );
  }

  // 5. Sizes that keep selling out (a sale that left none, last 90 days).
  const sellOuts = new Map<string, number>();
  for (const c of d.changes) {
    if (c.kind !== 'sold' || c.quantityAfter !== 0 || Date.parse(c.createdAt) < t - 90 * DAY) continue;
    const size = find(c.variantId)?.v.size.trim();
    if (size) sellOuts.set(size, (sellOuts.get(size) ?? 0) + 1);
  }
  const topSize = [...sellOuts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topSize && topSize[1] >= 3) {
    out.push(
      insight({
        key: `retail_size_sellouts:${topSize[0]}`,
        check: 'retail_size_sellouts',
        area: 'spending',
        severity: 'medium',
        placements: ['attention', 'analytics'],
        title: `Size ${topSize[0]} keeps selling out`,
        summary: `Size ${topSize[0]} sold out ${plural(topSize[1], 'time')} in the last 90 days.`,
        suggestion: `Order more size ${topSize[0]} next time (and fewer of the sizes that sit on the shelf).`,
        estimatedSaving: null,
        metrics: { size: topSize[0], sellOuts: topSize[1] },
      }),
    );
  }

  // 6. Stock loss (shrinkage) from stocktake differences, last 90 days.
  let missingUnits = 0;
  let missingValue = 0;
  for (const c of d.changes) {
    if (c.kind !== 'stocktake' || c.change >= 0 || Date.parse(c.createdAt) < t - 90 * DAY) continue;
    const f = find(c.variantId);
    missingUnits += -c.change;
    missingValue += -c.change * (f?.p.costPrice ?? 0);
  }
  missingValue = round(missingValue);
  if (missingUnits >= 3 && missingValue >= 50) {
    out.push(
      insight({
        key: 'retail_shrinkage',
        check: 'retail_shrinkage',
        area: 'spending',
        severity: missingValue >= 500 ? 'high' : 'medium',
        placements: missingValue >= 500 ? ['attention', 'analytics', 'notification'] : ['attention', 'analytics'],
        title: `${money(missingValue, false)} of stock missing`,
        summary: `Stock counts in the last 90 days found ${plural(missingUnits, 'item')} missing (${money(missingValue, false)} at cost).`,
        suggestion: 'Check deliveries are counted when they arrive, sales are always scanned, and keep high-value items near the counter.',
        estimatedSaving: missingValue,
        metrics: { units: missingUnits, value: missingValue },
      }),
    );
  }

  // 7. Supplier price rises: the latest delivery cost vs the one before (same item).
  const deliveries = d.changes
    .filter((c) => c.kind === 'received' && c.unitCost !== null && c.unitCost > 0)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const lastCost = new Map<string, number>();
  const rises: { variantId: string; before: number; now: number; rise: number }[] = [];
  for (const c of deliveries) {
    const before = lastCost.get(c.variantId);
    if (before !== undefined && c.unitCost! > before * 1.05 && Date.parse(c.createdAt) >= t - 90 * DAY) {
      rises.push({ variantId: c.variantId, before, now: c.unitCost!, rise: c.unitCost! / before - 1 });
    }
    lastCost.set(c.variantId, c.unitCost!);
  }
  if (rises.length > 0) {
    const r = rises.sort((a, b) => b.rise - a.rise)[0];
    const f = find(r.variantId);
    const supplier = d.suppliers.find((s) => s.id === f?.p.supplierId)?.name;
    out.push(
      insight({
        key: `retail_cost_rise:${r.variantId}`,
        check: 'retail_cost_rise',
        area: 'spending',
        severity: r.rise >= 0.15 ? 'medium' : 'low',
        placements: ['attention', 'analytics'],
        title: `${f ? f.p.name : 'A product'} costs ${pct(r.rise)} more`,
        summary: `${f ? itemLabel(f.p, f.v) : 'An item'} now costs ${money(r.now)}${supplier ? ` from ${supplier}` : ''}, up from ${money(r.before)} last delivery.`,
        suggestion: 'Ask the supplier about the rise or compare another supplier, and check your sell price still gives you a good margin.',
        estimatedSaving: null,
        metrics: { before: r.before, now: r.now, rise: round(r.rise), items: rises.length },
      }),
    );
  }

  // 8. Staff sales (last 30 days), with two or more people selling.
  const byPerson = new Map<string, { total: number; items: number }>();
  for (const s of last30) {
    const name = s.soldBy || 'Owner';
    const row = byPerson.get(name) ?? { total: 0, items: 0 };
    row.total += s.total;
    row.items += s.quantity;
    byPerson.set(name, row);
  }
  const people = [...byPerson.entries()].sort((a, b) => b[1].total - a[1].total);
  if (people.length >= 2 && people[0][1].total > 0) {
    const [name, row] = people[0];
    out.push(
      insight({
        key: 'retail_staff_sales',
        check: 'retail_staff_sales',
        area: 'team',
        severity: 'low',
        placements: ['analytics', 'other'],
        title: `${name} sold the most`,
        summary: `${name} sold ${plural(row.items, 'item')} (${money(round(row.total), false)}) in the last 30 days. Next: ${people[1][0]} with ${money(round(people[1][1].total), false)}.`,
        suggestion: 'Ask your top seller to share what works with the team.',
        estimatedSaving: null,
        metrics: Object.fromEntries(people.slice(0, 5).map(([n, r]) => [n, round(r.total)])),
      }),
    );
  }

  // 9. Busiest days and times (last 8 weeks), to help with rostering.
  const recent = salesBetween(t - 56 * DAY, t + 1).filter((s) => s.quantity > 0);
  if (recent.length >= 30) {
    const days = Array(7).fill(0) as number[];
    const hours = Array(24).fill(0) as number[];
    for (const s of recent) {
      const w = whenIn(s.soldAt, d.timeZone);
      days[w.day]++;
      hours[w.hour]++;
    }
    const busiestDay = days.indexOf(Math.max(...days));
    let bestHour = 0;
    for (let h = 0; h < 23; h++) if (hours[h] + hours[h + 1] > hours[bestHour] + hours[bestHour + 1]) bestHour = h;
    out.push(
      insight({
        key: 'retail_busy_times',
        check: 'retail_busy_times',
        area: 'team',
        severity: 'low',
        placements: ['other', 'analytics'],
        title: `${WEEKDAYS[busiestDay]}s are busiest`,
        summary: `${pct(days[busiestDay] / recent.length)} of sales in the last 8 weeks were on ${WEEKDAYS[busiestDay]}s, and ${hourLabel(bestHour)}–${hourLabel((bestHour + 2) % 24)} is the busiest time of day.`,
        suggestion: `Roster your best sellers on ${WEEKDAYS[busiestDay]}s around ${hourLabel(bestHour)}, and keep quieter times for restocking.`,
        estimatedSaving: null,
        metrics: { day: WEEKDAYS[busiestDay], from: hourLabel(bestHour), sales: recent.length },
      }),
    );
  }

  // 10. Sales down on the 30 days before.
  const now30 = round(last30.reduce((s, x) => s + x.total, 0));
  const before30 = round(salesBetween(t - 60 * DAY, t - 30 * DAY).reduce((s, x) => s + x.total, 0));
  if (before30 >= 500 && now30 <= before30 * 0.8) {
    const drop = (before30 - now30) / before30;
    out.push(
      insight({
        key: 'retail_sales_drop',
        check: 'retail_sales_drop',
        area: 'finance',
        severity: drop >= 0.4 ? 'high' : 'medium',
        placements: ['attention', 'analytics'],
        title: `Sales down ${pct(drop)}`,
        summary: `Sales were ${money(now30, false)} in the last 30 days, down from ${money(before30, false)} the 30 days before.`,
        suggestion: 'Check your best sellers are in stock, run a promotion on slow stock, and post new arrivals on social media.',
        estimatedSaving: round(before30 - now30),
        metrics: { now: now30, before: before30, drop: round(drop) },
      }),
    );
  }

  return out;
}

// ---------------------------------------------------------------------------
// 2. The AI Assistant's stock and sales lookups
// ---------------------------------------------------------------------------

const PERIOD_HELP = `A period: one of ${PERIODS.join(', ')}; or "since:YYYY-MM-DD", "month:YYYY-MM", or "YYYY-MM-DD..YYYY-MM-DD".`;

export const RETAIL_TOOL_DEFINITIONS = [
  {
    name: 'retail_stock_lookup',
    description:
      'How many of a product are in stock, by size and colour (and by store). Search with the words the owner used, e.g. "black jeans 10", "classic hoodie M", a SKU or a barcode. Returns each matching size / colour with its stock, reorder point, price and whether it is low or out.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Product words, size, colour, SKU or barcode, e.g. "size 10 black jeans".' },
        limit: { type: 'integer', description: 'Max sizes / colours to return (default 20).' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'retail_sales_report',
    description:
      'Sales in a period: totals (money incl. GST, items, returns) and the best or worst sellers grouped by product, category, size, colour, item (product + size + colour), staff member, weekday or hour of the day. For "worst" by product, products that sold nothing (with stock) are included.',
    input_schema: {
      type: 'object',
      properties: {
        period: { type: 'string', description: PERIOD_HELP },
        group_by: { type: 'string', enum: ['product', 'category', 'size', 'colour', 'item', 'staff', 'weekday', 'hour'] },
        order: { type: 'string', enum: ['best', 'worst'], description: 'best = most sold first (default).' },
        limit: { type: 'integer', description: 'Max rows (default 10).' },
      },
      required: ['period'],
      additionalProperties: false,
    },
  },
  {
    name: 'retail_reorder_suggestions',
    description:
      'What to reorder now and how many: items at or below their reorder point, or that will sell out before a delivery could arrive (based on how fast they sell and the supplier delivery time). Includes days of stock left, stock already on order and the supplier.',
    input_schema: { type: 'object', properties: { limit: { type: 'integer', description: 'Max items (default 15).' } }, additionalProperties: false },
  },
  {
    name: 'retail_stock_health',
    description:
      'An overview of the stock: value at cost and sell price, low and out-of-stock counts, slow-moving stock, profit margins (most and least profitable), sizes that keep selling out, stock lost in stocktakes and supplier price rises.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
] as const;

export const RETAIL_PROMPT = `This business is a retail shop or product brand using NexGain Retail. It sells physical products and keeps stock; it has no jobs, quotes or customer invoices.
- For stock ("how many size 10 black jeans do we have?") use retail_stock_lookup. For sales, best or worst sellers, sales by size, colour, staff or time of day use retail_sales_report. For what to order use retail_reorder_suggestions. For margins, slow stock, stock loss and supplier price rises use retail_stock_health.
- Revenue for this shop is its sales (retail_sales_report), not invoices. Bank spending, payroll and the team work as usual.
- When suggesting an order, tell the owner they can place it from Home › Review & Order Stock.`;

type Input = Record<string, unknown>;
const STOP_WORDS = new Set(['size', 'sizes', 'colour', 'color', 'in', 'the', 'a', 'an', 'of', 'how', 'many', 'much', 'do', 'we', 'have', 'stock', 'left', 'any', 'are', 'there', 'is']);

/** Runs one retail lookup. Never throws: problems come back as { error }. */
export function runRetailTool(d: RetailData, name: string, input: Input, now = new Date()): { result: unknown } {
  try {
    return { result: runInner(d, name, input ?? {}, now) };
  } catch (e) {
    return { result: { error: `That lookup failed: ${e instanceof Error ? e.message : 'unknown problem'}.` } };
  }
}

function runInner(d: RetailData, name: string, input: Input, now: Date): unknown {
  const find = finder(d);
  const live = d.products.filter((p) => !p.archived);
  const stockOf = (id: string) => d.stock[id] ?? 0;
  const limitOf = (fallback: number) => Math.max(1, Math.min(50, Number(input.limit) || fallback));

  switch (name) {
    case 'retail_stock_lookup': {
      const words = String(input.query ?? '')
        .toLowerCase()
        .split(/[^a-z0-9.-]+/)
        .filter((w) => w && !STOP_WORDS.has(w));
      if (words.length === 0) return { error: 'Say which product to look up.' };
      const rows: unknown[] = [];
      for (const p of live) {
        for (const v of p.variants) {
          const text = [p.name, p.brand, p.category, p.sku, v.sku, v.barcode, v.size, v.colour].join(' ').toLowerCase();
          const tokens = text.split(/[^a-z0-9.-]+/);
          // Each word must match: a whole size (so "10" isn't "100"), or the start of another word.
          if (!words.every((w) => tokens.some((tok) => tok === w || (w.length > 2 && tok.startsWith(w))))) continue;
          const qty = stockOf(v.id);
          rows.push({
            item: itemLabel(p, v),
            sku: v.sku || p.sku || null,
            inStock: qty,
            byStore: d.storeStock[v.id] ?? null,
            onOrder: d.onOrder[v.id] ?? 0,
            reorderPoint: p.lowStockLevel,
            status: qty <= 0 ? 'out of stock' : qty <= p.lowStockLevel ? 'low' : 'ok',
            sellPrice: p.sellPrice,
          });
        }
      }
      const limit = limitOf(20);
      return rows.length === 0
        ? { found: 0, note: 'No product matches those words. Try fewer words or the product name.' }
        : { found: rows.length, items: rows.slice(0, limit), totalInStock: rows.reduce((s: number, r) => s + (r as { inStock: number }).inStock, 0) };
    }

    case 'retail_sales_report': {
      const range = resolvePeriod(String(input.period ?? 'this_month'), now);
      if (!range) return { error: `Unknown period. ${PERIOD_HELP}` };
      const sales = d.sales.filter((s) => inRange(dateKeyOf(s.soldAt), range));
      const totals = {
        period: range.label,
        sales: round(sales.reduce((s, x) => s + x.total, 0)),
        itemsSold: sales.filter((s) => s.quantity > 0).reduce((s, x) => s + x.quantity, 0),
        itemsReturned: -sales.filter((s) => s.quantity < 0).reduce((s, x) => s + x.quantity, 0),
      };
      const groupBy = String(input.group_by ?? 'product');
      const keyOf = (s: RetailSale): string | null => {
        const f = find(s.variantId);
        switch (groupBy) {
          case 'category':
            return f?.p.category || 'No category';
          case 'size':
            return f?.v.size || 'No size';
          case 'colour':
            return f?.v.colour || 'No colour';
          case 'item':
            return f ? itemLabel(f.p, f.v) : s.itemName;
          case 'staff':
            return s.soldBy || 'Owner';
          case 'weekday':
            return WEEKDAYS[whenIn(s.soldAt, d.timeZone).day];
          case 'hour': {
            const h = whenIn(s.soldAt, d.timeZone).hour;
            return `${hourLabel(h)}–${hourLabel((h + 1) % 24)}`;
          }
          default:
            return f?.p.name ?? s.itemName.split(' · ')[0];
        }
      };
      const groups = new Map<string, { units: number; sales: number }>();
      for (const s of sales) {
        const k = keyOf(s);
        if (!k) continue;
        const g = groups.get(k) ?? { units: 0, sales: 0 };
        g.units += s.quantity;
        g.sales += s.total;
        groups.set(k, g);
      }
      const worst = input.order === 'worst';
      // Worst by product: products with stock that sold nothing count too.
      if (worst && groupBy === 'product') {
        for (const p of live) if (!groups.has(p.name) && p.variants.some((v) => stockOf(v.id) > 0)) groups.set(p.name, { units: 0, sales: 0 });
      }
      const rows = [...groups.entries()]
        .map(([k, g]) => ({ [groupBy]: k, unitsSold: g.units, sales: round(g.sales) }))
        .sort((a, b) => (worst ? a.unitsSold - b.unitsSold || a.sales - b.sales : b.unitsSold - a.unitsSold || b.sales - a.sales));
      return { ...totals, groupedBy: groupBy, order: worst ? 'worst first' : 'best first', rows: rows.slice(0, limitOf(10)) };
    }

    case 'retail_reorder_suggestions': {
      const advice = reorderAdviceFor(live, stockOf, saleLines(d.sales), d.suppliers, new Map(Object.entries(d.onOrder)), now)
        .filter((a) => a.needsReorder)
        .sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));
      return {
        itemsToReorder: advice.length,
        basedOn: `sales in the last ${SALES_WINDOW_DAYS} days and each supplier's delivery time`,
        items: advice.slice(0, limitOf(15)).map((a) => {
          const f = find(a.variantId);
          return {
            item: f ? itemLabel(f.p, f.v) : 'Removed item',
            inStock: a.stock,
            onOrder: a.onOrder,
            sellingPerWeek: round(a.perDay * 7),
            daysLeft: a.daysLeft,
            supplier: d.suppliers.find((s) => s.id === f?.p.supplierId)?.name ?? null,
            deliveryDays: a.leadTimeDays,
            recommendedOrder: a.recommended,
            why: a.reason,
          };
        }),
        howToOrder: 'Home › Review & Order Stock has these orders filled in, one per supplier.',
      };
    }

    case 'retail_stock_health': {
      let cost = 0;
      let sell = 0;
      let low = 0;
      let out = 0;
      for (const p of live) {
        for (const v of p.variants) {
          const q = stockOf(v.id);
          cost += Math.max(0, q) * (p.costPrice ?? 0);
          sell += Math.max(0, q) * (p.sellPrice ?? 0);
          if (q <= 0) out++;
          else if (q <= p.lowStockLevel) low++;
        }
      }
      const margins = live
        .map((p) => ({ product: p.name, margin: marginOf(p, d.usesGst), profitEach: profitEach(p, d.usesGst) }))
        .filter((x) => x.margin !== null)
        .sort((a, b) => b.margin! - a.margin!);
      const slow = slowSellersFor(live, stockOf, saleLines(d.sales), now).slice(0, 5);
      const found = retailInsights(d, now).filter((i) => ['retail_size_sellouts', 'retail_shrinkage', 'retail_cost_rise'].includes(i.check));
      return {
        products: live.length,
        stockValueAtCost: round(cost),
        stockValueAtSellPrice: round(sell),
        sizesOrColoursLow: low,
        sizesOrColoursOut: out,
        mostProfitable: margins.slice(0, 5).map((m) => ({ ...m, margin: `${Math.round(m.margin! * 100)}%` })),
        leastProfitable: margins
          .slice(-5)
          .reverse()
          .map((m) => ({ ...m, margin: `${Math.round(m.margin! * 100)}%` })),
        slowStock: slow.map((s) => ({ product: d.products.find((p) => p.id === s.productId)?.name, inStock: s.stock, valueAtCost: s.value, daysSinceSale: s.daysSinceSale })),
        otherFindings: found.map((i) => `${i.title}: ${i.summary}`),
      };
    }

    default:
      return { error: `Unknown lookup ${name}.` };
  }
}
