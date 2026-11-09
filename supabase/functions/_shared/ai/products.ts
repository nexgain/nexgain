// PRODUCT PRICES: the same product bought again for more.
//
// Bank transactions only show the total ("BUNNINGS $86.40"), so product prices
// come from the line items the AI reads off receipts (see read-receipt). The
// same product is recognised by its words and size, so "Chlorine 20L",
// "CHLORINE 20 LITRE" and "20lt chlorine" are all the same thing.
//
// Pure code: used by the daily health check, the AI Assistant and the app.

/** One product on one receipt. */
export type ProductPurchase = {
  receiptId: string;
  /** "YYYY-MM-DD" */
  date: string;
  supplier: string | null;
  /** As written on the receipt, e.g. "Chlorine 20L". */
  description: string;
  quantity: number;
  /** Price for one. */
  unitPrice: number;
};

/** A receipt row as saved by the receipt reader (columns or app fields). */
type ReceiptLike = {
  id: string;
  status?: string | null;
  supplier?: string | null;
  date?: string | null;
  receipt_date?: string | null;
  created_at?: string | null;
  createdAt?: string | null;
  lineItems?: unknown;
  line_items?: unknown;
};

const UNITS: [RegExp, string][] = [
  [/(\d+(?:\.\d+)?)\s*(?:litres?|liters?|ltrs?|lt|l)\b/g, '$1l'],
  [/(\d+(?:\.\d+)?)\s*(?:millilitres?|milliliters?|ml)\b/g, '$1ml'],
  [/(\d+(?:\.\d+)?)\s*(?:kilograms?|kilos?|kgs?)\b/g, '$1kg'],
  [/(\d+(?:\.\d+)?)\s*(?:grams?|g)\b/g, '$1g'],
  [/(\d+(?:\.\d+)?)\s*(?:millimetres?|millimeters?|mm)\b/g, '$1mm'],
  [/(\d+(?:\.\d+)?)\s*(?:metres?|meters?|m)\b/g, '$1m'],
];
/** Words that don't change what the product is. */
const FILLER = new Set(['the', 'of', 'and', 'x', 'ea', 'each', 'pk', 'pack', 'bottle', 'btl', 'qty', 'unit', 'item']);

/**
 * The same key for the same product, e.g. "chlorine 20l". null when the line
 * isn't a product (blank, a total, a discount...).
 */
export function productKey(description: string): string | null {
  let d = description.toLowerCase().replace(/[^a-z0-9. ]/g, ' ');
  for (const [pattern, unit] of UNITS) d = d.replace(pattern, unit);
  const words = d
    .split(/\s+/)
    .map((w) => w.replace(/^\.+|\.+$/g, ''))
    // Drop stock codes (long numbers) and filler words.
    .filter((w) => w && !/^\d{5,}$/.test(w) && !FILLER.has(w));
  if (!words.some((w) => /^[a-z]{3,}$/.test(w))) return null;
  if (words.some((w) => /^(total|subtotal|gst|discount|rounding|change|cash|eftpos|tax)$/.test(w)) && words.length <= 2) return null;
  return [...new Set(words)].sort().join(' ');
}

const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));

/** Every product line on read receipts. */
export function purchasesFromReceipts(receipts: ReceiptLike[]): ProductPurchase[] {
  const out: ProductPurchase[] = [];
  for (const r of receipts) {
    if (r.status && r.status !== 'ready') continue;
    const date = (r.date ?? r.receipt_date ?? r.createdAt ?? r.created_at ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const items = (r.lineItems ?? r.line_items) as { description?: unknown; quantity?: unknown; amount?: unknown }[] | null;
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      const description = typeof item?.description === 'string' ? item.description.trim() : '';
      const amount = num(item?.amount);
      const quantity = num(item?.quantity) || 1;
      if (!description || amount === null || !Number.isFinite(amount) || amount <= 0 || quantity <= 0) continue;
      out.push({ receiptId: r.id, date, supplier: r.supplier?.trim() || null, description, quantity, unitPrice: Math.round((amount / quantity) * 100) / 100 });
    }
  }
  return out;
}

export type PriceRise = {
  key: string;
  /** As written on the latest receipt. */
  product: string;
  before: ProductPurchase;
  now: ProductPurchase;
  /** Whole percent, e.g. 20. */
  changePercent: number;
};

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/**
 * Products that cost more on their latest receipt than the time before, e.g.
 * 20L chlorine $20 last month, $24 this week (+20%). Only purchases in the
 * last `recentDays`, compared with the previous purchase in the year before.
 * Biggest rise first.
 */
export function productPriceRises(purchases: ProductPurchase[], today: string, recentDays = 45): PriceRise[] {
  const byProduct = new Map<string, ProductPurchase[]>();
  for (const p of purchases) {
    const key = productKey(p.description);
    if (key) byProduct.set(key, [...(byProduct.get(key) ?? []), p]);
  }
  const rises: PriceRise[] = [];
  for (const [key, list] of byProduct) {
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    const now = sorted[sorted.length - 1]!;
    if (daysBetween(now.date, today) > recentDays) continue;
    const before = [...sorted].reverse().find((p) => p.date < now.date && daysBetween(p.date, now.date) <= 365);
    if (!before) continue;
    const extra = now.unitPrice - before.unitPrice;
    const change = (extra / before.unitPrice) * 100;
    if (extra < 0.5 || change < 5) continue;
    rises.push({ key, product: now.description, before, now, changePercent: Math.round(change) });
  }
  return rises.sort((a, b) => (b.now.unitPrice - b.before.unitPrice) * b.now.quantity - (a.now.unitPrice - a.before.unitPrice) * a.now.quantity);
}
