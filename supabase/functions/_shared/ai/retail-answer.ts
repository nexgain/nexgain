// NexGain Retail: the FREE AI Assistant answers for a shop (no AI company, no
// cost). It works out what the owner is asking ("how many size 10 black jeans
// do we have?", "what should I reorder?", "best seller last month?") and
// answers from the shop's own stock and sales, using the same lookups the paid
// Claude version uses (retail-insights.ts), so both always agree.
//
// answerRetailQuestion() returns null for anything that isn't about stock or
// sales (staff, rosters, payroll, bank spending...), so the normal free
// answers handle those.
import { findPeriod, inPeriod, type FreeAnswer } from './answer.ts';
import { dateKeyOf, inRange, resolvePeriod } from './dates.ts';
import { money } from './insights.ts';
import { itemLabel, marginOf, runRetailTool, saleLines, type RetailData } from './retail-insights.ts';
import { slowSellersFor } from './retail-stock.ts';

const normal = (text: string) => ` ${text.toLowerCase().replace(/[’‘]/g, "'").replace(/[?!.,]/g, ' ').replace(/\s+/g, ' ').trim()} `;
const has = (q: string, pattern: RegExp) => pattern.test(q);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const reply = (text: string): FreeAnswer => ({ understood: true, text, cards: [] });
const list = (lines: string[]) => lines.map((l) => `• ${l}`).join('\n');
const pct = (rate: number) => `${Math.round(rate * 100)}%`;

/** Questions to try (shown when a question isn't understood). */
export const RETAIL_EXAMPLE_QUESTIONS = [
  'How many size 10 black jeans do we have?',
  'What should I reorder?',
  'What was my best seller last month?',
  'Which stock isn’t selling?',
  'What’s low on stock?',
  'How much did we sell this week?',
  'Who sold the most this month?',
  'What are our busiest days and times?',
  'What are my most profitable products?',
  'What is my stock worth?',
];

const REORDER = /\b(re-? ?order|restock|order more|need to (order|buy)|what (should|do) (i|we) (order|buy)|place an order)\b/;
const LOW = /\b(low (on )?stock|out of stock|sold out|running (low|out)|what'?s low|whats low|low items|nearly out)\b/;
const SLOW = /\b(not selling|isn'?t selling|aren'?t selling|slow|dead stock|sitting (there|on)|worst sell|least popular|sells? the least|selling the least|doesn'?t sell|don'?t sell)\b/;
const BUSY = /\b(busiest|busy|quietest|quiet|peak|rush|what time|which day|what day)\b/;
const STAFF = /\bwho (sold|sells|has sold|made)\b|\b(staff|employees?|team)('s)? (sales|selling|sold)\b|\bsales (by|per) (staff|person|employee)\b|\b(top|best) (sales ?person|staff|employee)\b/;
const MARGIN = /\b(margins?|profitable|make[s]? (me |us )?the most money|most money)\b/;
const PROFIT = /\b(gross )?profit\b/;
const WORTH = /\b(stock|inventory) (value|worth)\b|\b(worth|value of)\b.*\b(stock|inventory)\b|\bstock.*\bworth\b/;
const BEST = /\b(best ?sell(er|ers|ing)?|top sell(er|ers|ing)|most popular|sold the most|sells? the most|selling the most|top (product|item|size|colour|color|category|categories)s?|(best|top|most popular) (size|colour|color|category))\b/;
const SALES = /\b(sales|sold|sell|takings|turnover|revenue|how much (did|have) (we|i) (make|made|take|taken))\b/;
const STOCK = /\bhow many\b|\bin stock\b|\bstock (of|for|level|levels|count)\b|\bdo (we|i|you) have\b|\b(have|got) (any|we got)\b|\bleft\b|\bavailable\b|\bcheck stock\b/;

/** Words that aren't the product ("how many ... do we have left this week"). */
const FILLER = new Set(
  (
    'what whats what\'s how many much do does did we i you our my us got have has any are is there the a an of for in on at ' +
    'stock stocks left available units pieces items item currently right now today please tell me show can check level levels count ' +
    'store shop size sizes colour colours color colors this last week month year yesterday'
  ).split(' '),
);

/** The product words left in a question: "how many size 10 black hoodies" -> "10 black hoodie". */
function productWords(q: string) {
  return q
    .split(/[^a-z0-9.-]+/)
    .filter((w) => w && !FILLER.has(w))
    .map((w) => (w.length > 3 && /[^s]s$/.test(w) ? w.slice(0, -1) : w.length > 4 && w.endsWith('ies') ? `${w.slice(0, -3)}y` : w))
    .join(' ');
}

type SalesRow = Record<string, unknown> & { unitsSold: number; sales: number };
type SalesReport = { period: string; sales: number; itemsSold: number; itemsReturned: number; rows: SalesRow[] };

function salesReport(d: RetailData, period: string, groupBy: string, now: Date, order: 'best' | 'worst' = 'best', limit = 5) {
  return runRetailTool(d, 'retail_sales_report', { period, group_by: groupBy, order, limit }, now).result as SalesReport;
}

const periodText = (period: string, now: Date) => inPeriod(resolvePeriod(period, now)?.label ?? 'the last 30 days');

/** Answers a stock or sales question, or null if it isn't one. */
export function answerRetailQuestion(d: RetailData, question: string, now = new Date()): FreeAnswer | null {
  const q = normal(question);
  const period = findPeriod(q, now);

  // 1. What to reorder.
  if (has(q, REORDER)) {
    const r = runRetailTool(d, 'retail_reorder_suggestions', { limit: 8 }, now).result as {
      itemsToReorder: number;
      items: { item: string; inStock: number; daysLeft: number | null; recommendedOrder: number; supplier: string | null }[];
    };
    if (r.itemsToReorder === 0) return reply('Nothing needs reordering right now — everything has enough stock for how fast it’s selling.');
    const lines = r.items.map(
      (i) =>
        `${i.item}: ${i.inStock <= 0 ? 'sold out' : `${i.inStock} left`}${i.inStock > 0 && i.daysLeft !== null ? ` (about ${plural(Math.max(1, Math.round(i.daysLeft)), 'day')})` : ''} — order ${i.recommendedOrder}${i.supplier ? ` from ${i.supplier}` : ''}`,
    );
    return reply(
      `${plural(r.itemsToReorder, 'item')} ${r.itemsToReorder === 1 ? 'is' : 'are'} ready to reorder:\n${list(lines)}${r.itemsToReorder > lines.length ? `\n…and ${r.itemsToReorder - lines.length} more.` : ''}\n\nGo to Home › Review & Order Stock to send the orders.`,
    );
  }

  // 2. Low and out of stock.
  if (has(q, LOW)) {
    const out: string[] = [];
    const low: string[] = [];
    for (const p of d.products) {
      if (p.archived) continue;
      for (const v of p.variants) {
        const n = d.stock[v.id] ?? 0;
        if (n <= 0) out.push(itemLabel(p, v));
        else if (n <= p.lowStockLevel) low.push(`${itemLabel(p, v)} (${n} left)`);
      }
    }
    if (out.length + low.length === 0) return reply('Nothing is low — every size and colour is above its reorder point.');
    const parts = [];
    if (out.length) parts.push(`Out of stock (${out.length}):\n${list(out.slice(0, 8))}${out.length > 8 ? `\n…and ${out.length - 8} more.` : ''}`);
    if (low.length) parts.push(`Running low (${low.length}):\n${list(low.slice(0, 8))}${low.length > 8 ? `\n…and ${low.length - 8} more.` : ''}`);
    return reply(`${parts.join('\n\n')}\n\nAsk “what should I reorder?” for how many to order.`);
  }

  // 3. Slow stock / worst sellers.
  if (has(q, SLOW)) {
    const live = d.products.filter((p) => !p.archived);
    const slow = slowSellersFor(live, (id) => d.stock[id] ?? 0, saleLines(d.sales), now).slice(0, 5);
    const p = period ?? 'last_30_days';
    const worst = slow.length ? [] : salesReport(d, p, 'product', now, 'worst', 5).rows;
    if (slow.length === 0 && worst.length === 0) return reply('Everything with stock has been selling — no slow stock right now.');
    const parts = [];
    if (slow.length) {
      const tied = slow.reduce((s, x) => s + x.value, 0);
      parts.push(
        `No sales in 60+ days (${money(tied, false)} tied up at cost):\n${list(
          slow.map((s) => {
            const name = d.products.find((x) => x.id === s.productId)?.name ?? 'Removed product';
            return `${name}: ${s.stock} in stock, ${money(s.value, false)}${s.daysSinceSale !== null ? `, last sold ${s.daysSinceSale} days ago` : ', never sold'}`;
          }),
        )}`,
      );
    } else {
      parts.push(`Sold the least ${periodText(p, now)}:\n${list(worst.map((r) => `${String(r.product)}: ${plural(r.unitsSold, 'sold', 'sold')}`))}`);
    }
    return reply(`${parts.join('\n\n')}\n\nIdeas: put it on sale, bundle it with a best seller, move it to the front of the shop, or stop reordering it.`);
  }

  // 4. Busiest days and times.
  if (has(q, BUSY)) {
    const p = period ?? 'last_90_days';
    const days = salesReport(d, p, 'weekday', now, 'best', 7);
    if (days.rows.length === 0) return reply(`No sales ${periodText(p, now)} yet, so there’s nothing to compare.`);
    const hours = salesReport(d, p, 'hour', now, 'best', 3);
    const quiet = days.rows[days.rows.length - 1];
    return reply(
      `Based on sales ${periodText(p, now)}:\n${list([
        `Busiest day: ${String(days.rows[0].weekday)} (${plural(days.rows[0].unitsSold, 'item')}, ${money(days.rows[0].sales, false)})`,
        ...(days.rows.length > 1 ? [`Quietest day: ${String(quiet.weekday)} (${plural(quiet.unitsSold, 'item')})`] : []),
        `Busiest times: ${hours.rows.map((h) => String(h.hour)).join(', ')}`,
      ])}\n\nRoster more staff for the busy times, and use quiet times for stocktakes and deliveries.`,
    );
  }

  // 5. Staff sales.
  if (has(q, STAFF)) {
    const p = period ?? 'this_month';
    const r = salesReport(d, p, 'staff', now, 'best', 8);
    if (r.rows.length === 0) return reply(`No sales ${periodText(p, now)} yet.`);
    return reply(
      `${String(r.rows[0].staff)} sold the most ${periodText(p, now)}:\n${list(r.rows.map((x) => `${String(x.staff)}: ${money(x.sales, false)} (${plural(x.unitsSold, 'item')})`))}`,
    );
  }

  // 6. Margins / most profitable.
  if (has(q, MARGIN) || (has(q, PROFIT) && !period)) {
    const ranked = d.products
      .filter((p) => !p.archived)
      .map((p) => ({ name: p.name, margin: marginOf(p, d.usesGst) }))
      .filter((x): x is { name: string; margin: number } => x.margin !== null)
      .sort((a, b) => b.margin - a.margin);
    if (ranked.length === 0) return reply('Add cost prices to your products (Products › a product › Edit) and I can work out your profit margins.');
    const low = ranked.filter((x) => x.margin < 0.3).slice(-3).reverse();
    return reply(
      `Most profitable (profit on each sale):\n${list(ranked.slice(0, 5).map((x) => `${x.name}: ${pct(x.margin)}`))}${
        low.length ? `\n\nLow margins (under 30%):\n${list(low.map((x) => `${x.name}: ${pct(x.margin)}`))}\nThink about a price rise or a cheaper supplier.` : ''
      }\n\nReports shows the profit each product actually made.`,
    );
  }

  // 7. Stock value.
  if (has(q, WORTH)) {
    const r = runRetailTool(d, 'retail_stock_health', {}, now).result as { stockValueAtCost: number; stockValueAtSellPrice: number; sizesOrColoursLow: number; sizesOrColoursOut: number };
    return reply(
      `Your stock is worth ${money(r.stockValueAtCost, false)} at cost price, or ${money(r.stockValueAtSellPrice, false)} at sell price.${
        r.sizesOrColoursOut + r.sizesOrColoursLow ? ` ${plural(r.sizesOrColoursOut, 'size / colour', 'sizes / colours')} out of stock, ${r.sizesOrColoursLow} running low.` : ''
      }`,
    );
  }

  // 8. Best sellers (by product, or by size / colour / category if asked).
  if (has(q, BEST)) {
    const p = period ?? 'last_30_days';
    const by = has(q, /\bsizes?\b/) ? 'size' : has(q, /\bcolou?rs?\b/) ? 'colour' : has(q, /\bcategor(y|ies)\b/) ? 'category' : 'product';
    const r = salesReport(d, p, by, now, 'best', 5);
    if (r.rows.length === 0) return reply(`No sales ${periodText(p, now)} yet.`);
    const top = r.rows[0];
    return reply(
      `Your best-selling ${by} ${periodText(p, now)} was ${String(top[by])} — ${plural(top.unitsSold, 'item')}, ${money(top.sales, false)}.${
        r.rows.length > 1 ? `\n\nTop ${r.rows.length}:\n${list(r.rows.map((x) => `${String(x[by])}: ${x.unitsSold} sold, ${money(x.sales, false)}`))}` : ''
      }`,
    );
  }

  // 9. Sales totals (and profit for a period): "how much did we sell this week?"
  if (has(q, SALES) || (has(q, PROFIT) && period)) {
    const p = period ?? 'this_month';
    // "How many hoodies did we sell?": just that product.
    const words = productWords(q.replace(SALES, ' ').replace(PROFIT, ' '));
    if (words) {
      const look = runRetailTool(d, 'retail_stock_lookup', { query: words, limit: 50 }, now).result as { found: number; items?: { item: string }[] };
      if (look.found > 0) {
        const names = new Set(look.items!.map((i) => i.item));
        const r = salesReport(d, p, 'item', now, 'best', 50);
        const rows = r.rows.filter((x) => names.has(String(x.item)));
        const units = rows.reduce((s, x) => s + x.unitsSold, 0);
        const total = rows.reduce((s, x) => s + x.sales, 0);
        if (units === 0) return reply(`None of those sold ${periodText(p, now)}.`);
        return reply(`You sold ${plural(units, 'item')} (${money(total, false)}) ${periodText(p, now)}:\n${list(rows.slice(0, 8).map((x) => `${String(x.item)}: ${x.unitsSold}`))}`);
      }
    }
    const r = salesReport(d, p, 'product', now, 'best', 3);
    if (r.itemsSold === 0 && r.itemsReturned === 0) return reply(`No sales ${periodText(p, now)} yet.`);
    const profit = grossProfit(d, p, now);
    return reply(
      `Sales ${periodText(p, now)}: ${money(r.sales)} from ${plural(r.itemsSold, 'item')}${r.itemsReturned ? ` (${r.itemsReturned} returned)` : ''}.${
        profit !== null ? ` Gross profit about ${money(profit, false)} (sales without GST, minus cost prices).` : ''
      }${r.rows.length ? `\nTop sellers: ${r.rows.map((x) => `${String(x.product)} (${x.unitsSold})`).join(', ')}.` : ''}`,
    );
  }

  // 10. Stock of one product: "how many size 10 black jeans do we have?"
  if (has(q, STOCK)) {
    const words = productWords(q);
    if (!words) return null;
    const r = runRetailTool(d, 'retail_stock_lookup', { query: words, limit: 12 }, now).result as {
      found: number;
      totalInStock?: number;
      items?: { item: string; inStock: number; status: string; onOrder: number; byStore: Record<string, number> | null }[];
    };
    // Not a product ("how many staff do we have?"): let the normal answers try.
    if (!r.found || !r.items) return null;
    const line = (i: NonNullable<typeof r.items>[number]) =>
      `${i.item}: ${i.inStock}${i.status === 'out of stock' ? ' — out of stock' : i.status === 'low' ? ' — low' : ''}${i.onOrder ? ` (${i.onOrder} on order)` : ''}${
        i.byStore ? ` [${Object.entries(i.byStore).map(([s, n]) => `${s} ${n}`).join(', ')}]` : ''
      }`;
    if (r.found === 1) {
      const i = r.items[0];
      return reply(`You have ${i.inStock} ${i.item} in stock.${i.status === 'low' ? ' That’s low — time to reorder.' : i.status === 'out of stock' ? ' It’s sold out.' : ''}${
        i.onOrder ? ` ${i.onOrder} more on order.` : ''
      }${i.byStore ? `\nBy store: ${Object.entries(i.byStore).map(([s, n]) => `${s} ${n}`).join(', ')}` : ''}`);
    }
    return reply(`${r.totalInStock} in stock across ${plural(r.found, 'size / colour', 'sizes / colours')}:\n${list(r.items.map(line))}${r.found > r.items.length ? `\n…and ${r.found - r.items.length} more.` : ''}`);
  }

  return null;
}

/** Sales without GST minus cost prices, for a period. null when no product has a cost price. */
function grossProfit(d: RetailData, period: string, now: Date) {
  const range = resolvePeriod(period, now);
  if (!range) return null;
  const byVariant = new Map<string, RetailData['products'][number]>();
  for (const p of d.products) for (const v of p.variants) byVariant.set(v.id, p);
  let profit = 0;
  let costed = false;
  for (const s of d.sales.filter((x) => inRange(dateKeyOf(x.soldAt), range))) {
    const p = s.variantId ? byVariant.get(s.variantId) : undefined;
    if (!p || p.costPrice === null) continue;
    const exGst = d.usesGst ? s.total / 1.1 : s.total;
    profit += exGst - p.costPrice * s.quantity;
    costed = true;
  }
  return costed ? Math.round(profit) : null;
}

/** The reply when a question isn't understood: what to try instead. */
export function retailNotUnderstood(): FreeAnswer {
  return {
    understood: false,
    text: `I’m not sure what you mean. I can answer questions about your stock, sales and team, like:\n${list(RETAIL_EXAMPLE_QUESTIONS.slice(0, 6))}`,
    cards: [],
  };
}
