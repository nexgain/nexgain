// Spending maths on bank transactions: cleaning up messy bank merchant names,
// finding purchases by supplier / category / job / date, totals and
// month-vs-month comparisons. Used by the AI's chat tools and the spending
// checks in insights.ts. Pure functions only (no database), so it runs on the
// server, in the app and in tests the same way.
import { addMonths, dateKeyOf, inRange, previousPeriod, startOfMonth, type DateRange } from './dates.ts';
import type { DateKey, Transaction } from './types.ts';

const round = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Merchant names
// ---------------------------------------------------------------------------

/** Well-known suppliers, matched anywhere in the bank's text. */
const KNOWN_MERCHANTS: [RegExp, string][] = [
  [/BUNNINGS/, 'Bunnings'],
  [/MITRE ?10/, 'Mitre 10'],
  [/TOTAL ?TOOLS/, 'Total Tools'],
  [/SYDNEY ?TOOLS/, 'Sydney Tools'],
  [/REECE/, 'Reece'],
  [/TRADELINK/, 'Tradelink'],
  [/OFFICEWORKS/, 'Officeworks'],
  [/SUPERCHEAP/, 'Supercheap Auto'],
  [/REPCO/, 'Repco'],
  [/AMPOL|CALTEX/, 'Ampol'],
  [/\bBP\b/, 'BP'],
  [/SHELL/, 'Shell'],
  [/7-?ELEVEN/, '7-Eleven'],
  [/UNITED PETROL/, 'United Petroleum'],
  [/PUMA ENERGY/, 'Puma Energy'],
  [/COLES/, 'Coles'],
  [/WOOLWORTHS|WOOLIES/, 'Woolworths'],
  [/TELSTRA/, 'Telstra'],
  [/OPTUS/, 'Optus'],
  [/XERO/, 'Xero'],
  [/GOOGLE/, 'Google'],
  [/MICROSOFT/, 'Microsoft'],
  [/ADOBE/, 'Adobe'],
];

/** Supplier names the AI recognises in a question even before any purchases from them exist. */
export const KNOWN_SUPPLIER_NAMES = [...new Set(KNOWN_MERCHANTS.map(([, name]) => name))];

/** Card / payment wording banks add in front of the merchant. */
const PREFIXES =
  /^(VISA|MASTERCARD|EFTPOS|DEBIT|CREDIT|CARD|PURCHASE|POS|PAYMENT|DIRECT|DD|TFR|TRANSFER|TO|AUTHORISATION|AUTH|PENDING|INT'?L|\s|-|\d{2}\/\d{2}(\/\d{2,4})?|XX+\d+|\d{4,})+/;
const PAYMENT_APPS = /^(SQ|SP|PAYPAL|ZLR|LS|SUMUP|TYRO|STRIPE)\s*\*\s*/;
const STATES = /\b(QLD|NSW|VIC|SA|WA|TAS|NT|ACT|AU|AUS|AUSTRALIA)\b/g;
const COMPANY = /\b(PTY|LTD|LIMITED|P\/L|INC|CO)\b\.?/g;

const titleCase = (s: string) =>
  s
    .toLowerCase()
    .split(' ')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');

/**
 * A tidy supplier name from a bank statement line, e.g.
 * "BUNNINGS 6342 CAPALABA" -> "Bunnings", "SQ *JOE'S COFFEE 4152" -> "Joe's Coffee".
 */
export function cleanMerchantName(raw: string): string {
  const upper = raw.toUpperCase().replace(/\s+/g, ' ').trim();
  for (const [pattern, name] of KNOWN_MERCHANTS) if (pattern.test(upper)) return name;
  let s = upper.replace(PREFIXES, '').replace(PAYMENT_APPS, '');
  // Store numbers and suburbs usually come after the first number: keep what's before it.
  const firstNumber = s.search(/\s#?\d/);
  if (firstNumber > 2) s = s.slice(0, firstNumber);
  s = s.replace(STATES, ' ').replace(COMPANY, ' ').replace(/[^A-Z0-9&' -]/g, ' ').replace(/\s+/g, ' ').trim();
  return s ? titleCase(s) : raw.trim();
}

/** The supplier name for a transaction: the cleaned name it was saved with, or one worked out from the bank text. */
export function merchantOf(t: Pick<Transaction, 'merchant' | 'rawMerchant'>) {
  return t.merchant?.trim() || cleanMerchantName(t.rawMerchant);
}

/** Letters and digits only, lowercase: "Mitre 10" -> "mitre10". */
export const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function editDistance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

/**
 * Loose supplier matching: "bunnings", "Bunnings Warehouse" and a small typo
 * like "bunings" all match "BUNNINGS 6342 CAPALABA".
 */
export function matchesSupplier(t: Pick<Transaction, 'merchant' | 'rawMerchant'>, query: string) {
  const q = squash(query.replace(/\b(warehouse|store|pty|ltd)\b/gi, ''));
  if (!q) return true;
  const name = squash(merchantOf(t));
  const raw = squash(t.rawMerchant);
  if (name.includes(q) || q.includes(name) || raw.includes(q)) return true;
  // Allow about one typo per 5 letters.
  return name.length > 3 && editDistance(name, q) <= Math.floor(Math.max(q.length, name.length) / 5);
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

const CATEGORY_WORDS: Record<string, string[]> = {
  fuel: ['fuel', 'petrol', 'diesel', 'gas station', 'servo'],
  materials: ['material', 'supplies', 'supply', 'hardware', 'timber', 'paint'],
  tools: ['tool', 'equipment'],
  labour: ['labour', 'labor', 'subcontract', 'contractor', 'wages'],
  subscriptions: ['subscription', 'software', 'saas', 'app'],
  vehicle: ['vehicle', 'car', 'rego', 'registration', 'tyre', 'service'],
};

/** The family a category belongs to ("Materials & supplies" -> "materials"), or its own name. */
export function categoryKey(category: string | null | undefined) {
  const c = (category ?? '').toLowerCase().trim();
  if (!c) return 'uncategorised';
  for (const [key, words] of Object.entries(CATEGORY_WORDS)) {
    if (c === key || words.some((w) => c.includes(w))) return key;
  }
  return c;
}

export function matchesCategory(t: Pick<Transaction, 'category'>, query: string) {
  return categoryKey(t.category) === categoryKey(query);
}

// ---------------------------------------------------------------------------
// Finding and totalling
// ---------------------------------------------------------------------------

export type SpendFilter = {
  supplier?: string | null;
  category?: string | null;
  jobId?: string | null;
  range?: Pick<DateRange, 'start' | 'end'> | null;
  /** Free text matched against the merchant, bank text and description. */
  text?: string | null;
  minAmount?: number | null;
  maxAmount?: number | null;
};

export function filterTransactions(transactions: Transaction[], f: SpendFilter) {
  const text = f.text?.trim().toLowerCase();
  return transactions
    .filter(
      (t) =>
        (!f.range || inRange(t.date, f.range)) &&
        (!f.supplier || matchesSupplier(t, f.supplier)) &&
        (!f.category || matchesCategory(t, f.category)) &&
        (!f.jobId || t.jobId === f.jobId) &&
        (f.minAmount == null || t.amount >= f.minAmount) &&
        (f.maxAmount == null || t.amount <= f.maxAmount) &&
        (!text || `${merchantOf(t)} ${t.rawMerchant} ${t.description ?? ''}`.toLowerCase().includes(text)),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.amount - a.amount);
}

export const totalOf = (list: Pick<Transaction, 'amount'>[]) => round(list.reduce((sum, t) => sum + t.amount, 0));

/** e.g. 18.2 for 18.2% more; null when there's nothing to compare against. */
export function percentChange(current: number, previous: number) {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export type SpendSummary = {
  total: number;
  count: number;
  transactions: Transaction[];
  /** The period before (e.g. last month vs this month), when a date range was given. */
  comparison: { label: string; total: number; count: number; changePercent: number | null } | null;
};

/** Total, number of purchases and the list, plus the period before for comparison. */
export function spendSummary(transactions: Transaction[], f: SpendFilter & { range?: DateRange | null }): SpendSummary {
  const list = filterTransactions(transactions, f);
  const total = totalOf(list);
  let comparison: SpendSummary['comparison'] = null;
  if (f.range) {
    const before = previousPeriod(f.range);
    const prev = filterTransactions(transactions, { ...f, range: before });
    const prevTotal = totalOf(prev);
    comparison = { label: before.label, total: prevTotal, count: prev.length, changePercent: percentChange(total, prevTotal) };
  }
  return { total, count: list.length, transactions: list, comparison };
}

export type SpendGroup = {
  name: string;
  total: number;
  count: number;
  previousTotal: number;
  changePercent: number | null;
};

/** Spending grouped by supplier or category for a period, compared with the period before. Biggest first. */
export function spendingBreakdown(
  transactions: Transaction[],
  groupBy: 'supplier' | 'category',
  range: DateRange,
  f: Omit<SpendFilter, 'range'> = {},
): SpendGroup[] {
  const nameOf = (t: Transaction) => (groupBy === 'supplier' ? merchantOf(t) : t.category?.trim() || 'Uncategorised');
  const keyOf = (t: Transaction) => (groupBy === 'supplier' ? squash(merchantOf(t)) : categoryKey(t.category));
  const groups = new Map<string, SpendGroup>();
  const add = (t: Transaction, current: boolean) => {
    const key = keyOf(t);
    const g = groups.get(key) ?? { name: nameOf(t), total: 0, count: 0, previousTotal: 0, changePercent: null };
    if (current) {
      g.total += t.amount;
      g.count += 1;
    } else {
      g.previousTotal += t.amount;
    }
    groups.set(key, g);
  };
  for (const t of filterTransactions(transactions, { ...f, range })) add(t, true);
  for (const t of filterTransactions(transactions, { ...f, range: previousPeriod(range) })) add(t, false);
  return [...groups.values()]
    .map((g) => ({ ...g, total: round(g.total), previousTotal: round(g.previousTotal), changePercent: percentChange(g.total, g.previousTotal) }))
    .filter((g) => g.total !== 0 || g.previousTotal !== 0)
    .sort((a, b) => b.total - a.total);
}

/** Spending per calendar month for the last `months` full months (oldest first), optionally filtered. */
export function monthlyTotals(transactions: Transaction[], today: DateKey, months: number, f: Omit<SpendFilter, 'range'> = {}) {
  const thisMonth = startOfMonth(today);
  return Array.from({ length: months }, (_, i) => {
    const start = addMonths(thisMonth, -(months - i));
    const range = { start, end: addMonths(start, 1) };
    return { month: start.slice(0, 7), total: totalOf(filterTransactions(transactions, { ...f, range })) };
  });
}

/** Turns a transaction-like row from the database into a Transaction (see transactions-adapter.ts). */
export function toTransaction(row: Record<string, unknown>): Transaction | null {
  const amount = Number(row.amount);
  const rawDate = String(row.date ?? row.transaction_date ?? row.posted_at ?? '');
  if (!row.id || !Number.isFinite(amount) || !rawDate) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : dateKeyOf(rawDate);
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const raw = text(row.raw_merchant) ?? text(row.bank_description) ?? text(row.description) ?? '';
  return {
    id: String(row.id),
    date,
    amount,
    rawMerchant: raw,
    merchant: text(row.merchant) ?? text(row.supplier),
    category: text(row.category),
    jobId: text(row.job_id),
    description: text(row.description),
  };
}
