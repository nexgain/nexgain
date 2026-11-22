// NexGain Hospitality: what the money coming into the bank was for.
// Pure functions (no database), tested in __tests__/money.test.ts.
//
//   * Card / till payouts (Square, Tyro, EFTPOS...) are matched to the sales
//     recorded in NexGain for the day (or days) before: payouts arrive 1-3
//     days later, with the provider's fees taken out.
//   * Delivery app payouts (Uber Eats...) are just labelled.
//   * Other money in is matched to unpaid invoices ONLY when the amount is
//     exactly what's owing (or a deposit), and the owner always confirms.
//   * Anything else: "We got $500 by direct debit. What was this for?"
import type { SalesDoc } from '@/data/invoices';
import { formatMoney } from '@/data/payroll';

import { hospitalityStatus, invoiceAmounts, isOpen } from './invoice-status';
import type { Sale } from './menu';
import { dateKey } from './sales-stats';

/** The bits of a bank transaction this needs. */
export type MoneyIn = {
  id: string;
  /** "YYYY-MM-DD" */
  date: string;
  amount: number;
  category: string;
  merchant: string | null;
  description: string;
  invoiceId: string | null;
  invoiceReviewDone: boolean;
  categorySource: 'auto' | 'owner';
  categoryReviewDone: boolean;
  confidence: number | null;
};

export const CARD_SALES = 'Card / till sales';
export const DELIVERY = 'Delivery apps';
export const CASH = 'Cash deposits';
export const CATERING = 'Catering & functions';
export const OTHER_INCOME = 'Other income';

const round2 = (n: number) => Math.round(n * 100) / 100;
const cents = (n: number) => Math.round(n * 100);

const fromKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const addDaysKey = (key: string, days: number) => {
  const d = fromKey(key);
  return dateKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + days));
};
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const weekdayOf = (key: string) => WEEKDAYS[fromKey(key).getDay()];

/** Recorded sales per day ("YYYY-MM-DD" in the phone's time -> total). */
export function salesByDay(sales: Pick<Sale, 'soldAt' | 'total'>[]) {
  const days = new Map<string, number>();
  for (const s of sales) {
    const key = dateKey(new Date(s.soldAt));
    days.set(key, round2((days.get(key) ?? 0) + s.total));
  }
  return days;
}

// ---------------------------------------------------------------------------
// Card / till payouts -> the day's sales
// ---------------------------------------------------------------------------

/** Card fees above this share of the sales don't count as a match. */
export const MAX_FEE_SHARE = 0.05;

export type PayoutMatch = {
  /** The sales days it covers (e.g. Fri, Sat and Sun for a Monday payout). */
  days: string[];
  salesTotal: number;
  /** Sales minus the payout: the provider's fees (0 for banks that charge fees separately). */
  fees: number;
};

/**
 * Matches card / till payouts to recorded sales. Each sales day is used once.
 * A payout can cover one day, or up to three days in a row (weekends), from 1
 * to 4 days before it arrived, as long as it's no more than the sales and the
 * difference (the fees) is 5% or less.
 */
export function matchPayouts(txns: MoneyIn[], daySales: Map<string, number>): Map<string, PayoutMatch> {
  const used = new Set<string>();
  const matches = new Map<string, PayoutMatch>();
  const payouts = txns.filter((t) => t.amount > 0 && t.category === CARD_SALES).sort((a, b) => a.date.localeCompare(b.date) || a.amount - b.amount);
  for (const t of payouts) {
    let best: PayoutMatch | null = null;
    for (let lag = 1; lag <= 4; lag++) {
      for (let span = 1; span <= 3; span++) {
        const days: string[] = [];
        for (let i = span - 1; i >= 0; i--) days.push(addDaysKey(t.date, -(lag + i)));
        if (days.some((d) => used.has(d) || !daySales.has(d))) continue;
        const salesTotal = round2(days.reduce((sum, d) => sum + (daySales.get(d) ?? 0), 0));
        const fees = round2(salesTotal - t.amount);
        if (salesTotal <= 0 || fees < 0 || fees > salesTotal * MAX_FEE_SHARE) continue;
        // The closest match wins (smallest fees), then the most recent days.
        if (!best || fees < best.fees) best = { days, salesTotal, fees };
      }
    }
    if (best) {
      best.days.forEach((d) => used.add(d));
      matches.set(t.id, best);
    }
  }
  return matches;
}

const dayList = (days: string[]) => {
  const names = days.map((d) => weekdayOf(d));
  return names.length === 1 ? `${names[0]}’s` : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}’s`;
};

/** "Square payout $1,180.00 matches Tuesday’s sales of $1,214.00 (fees about $34.00)". */
export function payoutText(name: string, amount: number, match: PayoutMatch | null) {
  if (!match) return `${name} payout ${formatMoney(amount)}: no matching day of recorded sales yet.`;
  const fees = match.fees > 0 ? ` (fees about ${formatMoney(match.fees)})` : '';
  return `${name} payout ${formatMoney(amount)} matches ${dayList(match.days)} sales of ${formatMoney(match.salesTotal)}${fees}.`;
}

// ---------------------------------------------------------------------------
// Money in -> unpaid invoices (always confirmed by the owner)
// ---------------------------------------------------------------------------

export type InvoiceCandidate = {
  invoice: SalesDoc;
  /** full: pays what's owing. deposit: pays the deposit. */
  part: 'full' | 'deposit';
  /** Why it's shown first, e.g. "The reference says INV-0004". */
  why: string | null;
};

const words = (text: string) => text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3);

/**
 * Unpaid or overdue invoices whose amount owing (or unpaid deposit) is exactly
 * this payment. One the bank's text names (its number, or the customer's
 * name) comes first, with the reason. Never decides on its own.
 */
export function invoiceCandidates(t: Pick<MoneyIn, 'amount' | 'merchant' | 'description'>, docs: SalesDoc[], today = new Date()): InvoiceCandidate[] {
  if (t.amount <= 0) return [];
  const amount = cents(t.amount);
  const text = `${t.merchant ?? ''} ${t.description}`.toLowerCase();
  const textWords = new Set(words(text));
  const found: InvoiceCandidate[] = [];
  for (const d of docs) {
    if (d.kind !== 'invoice' || !isOpen(d, today)) continue;
    const a = invoiceAmounts(d);
    const part = cents(a.owing) === amount ? 'full' : a.deposit > 0 && !a.depositPaid && cents(a.deposit) === amount ? 'deposit' : null;
    if (!part) continue;
    const digits = d.number.replace(/\D/g, '').replace(/^0+/, '');
    const byNumber = text.includes(d.number.toLowerCase()) || (digits.length >= 2 && new RegExp(`(^|\\D)0*${digits}(\\D|$)`).test(text) && /inv/.test(text));
    const nameWords = [...words(d.client.name), ...words(d.client.business ?? '')];
    const byName = nameWords.some((w) => textWords.has(w));
    const why = byNumber ? `The reference says ${d.number}` : byName ? `The payer’s name matches ${d.client.business || d.client.name}` : null;
    found.push({ invoice: d, part, why });
  }
  // Named ones first, then the oldest due date.
  return found.sort((a, b) => Number(!!b.why) - Number(!!a.why) || (a.invoice.dueDate ?? '').localeCompare(b.invoice.dueDate ?? ''));
}

// ---------------------------------------------------------------------------
// "Needs review" questions about money in
// ---------------------------------------------------------------------------

export type HospitalityQuestion<T extends MoneyIn = MoneyIn> =
  /** Exactly what's owing on one or more invoices: "Is this for INV-0004?" / "Which invoice is it for?" */
  | { kind: 'hosp-invoice'; txn: T; candidates: InvoiceCandidate[] }
  /** "We got $500 by direct debit. What was this for?" */
  | { kind: 'hosp-income'; txn: T };

const daysAgo = (key: string, today: Date) => (today.getTime() - fromKey(key).getTime()) / 86_400_000;

/** Card and delivery payouts are never invoice payments. */
const isPayout = (t: MoneyIn) => t.category === CARD_SALES || t.category === DELIVERY;

/** Is NexGain unsure what this money in was for? */
export function unsureIncome(t: MoneyIn) {
  if (t.categorySource === 'owner' || t.categoryReviewDone) return false;
  return t.category === OTHER_INCOME || t.category === 'Income' || (t.confidence ?? 1) < 0.6;
}

/** Questions about money in, newest first (invoice questions only when there are unpaid invoices). */
export function moneyInQuestions<T extends MoneyIn>(txns: T[], docs: SalesDoc[], today = new Date()): HospitalityQuestion<T>[] {
  const out: HospitalityQuestion<T>[] = [];
  const anyOpen = docs.some((d) => d.kind === 'invoice' && isOpen(d, today));
  for (const t of [...txns].sort((a, b) => b.date.localeCompare(a.date))) {
    if (t.amount <= 0 || t.category === 'Transfers' || t.invoiceId || daysAgo(t.date, today) > 60) continue;
    if (anyOpen && !t.invoiceReviewDone && !isPayout(t)) {
      const candidates = invoiceCandidates(t, docs, today);
      if (candidates.length > 0) {
        out.push({ kind: 'hosp-invoice', txn: t, candidates });
        continue;
      }
    }
    if (unsureIncome(t)) out.push({ kind: 'hosp-income', txn: t });
  }
  return out;
}

/** "We got $500 by direct debit. What was this for?" */
export function incomeQuestionText(t: Pick<MoneyIn, 'amount' | 'description' | 'merchant'>) {
  const how = /direct debit|\bdd\b/i.test(t.description) ? ' by direct debit' : /transfer|osko|payid|\bnpp\b/i.test(t.description) ? ' by bank transfer' : '';
  return `We got ${formatMoney(t.amount)}${how}. What was this for?`;
}

/** Short date: "12 Dec". */
export const shortDate = (key: string) => fromKey(key).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** "Is this payment for INV-0004, Smith Co ($1,000.00, due 10 Dec)?" */
export function oneInvoiceQuestion(t: Pick<MoneyIn, 'amount' | 'date'>, c: InvoiceCandidate) {
  const d = c.invoice;
  const who = d.client.business || d.client.name;
  const due = d.dueDate ? `, due ${shortDate(d.dueDate)}` : '';
  if (c.part === 'deposit') return `We got ${formatMoney(t.amount)} on ${shortDate(t.date)}. Is this the deposit for ${d.number}, ${who}?`;
  return `We got ${formatMoney(t.amount)} on ${shortDate(t.date)}. Is this payment for ${d.number}, ${who} (${formatMoney(invoiceAmounts(d).owing)}${due})?`;
}

// ---------------------------------------------------------------------------
// Insights about money in
// ---------------------------------------------------------------------------

export type MoneyInsight = { id: string; text: string; tone: 'info' | 'warning' };

/**
 * e.g. "Card payouts were $240 less than recorded sales this week",
 * "Delivery apps made up 22% of income this month", "Card fees cost you about
 * $310 this month", "You have 2 overdue invoices totalling $1,450".
 */
export function moneyInsights(txns: MoneyIn[], daySales: Map<string, number>, docs: SalesDoc[], today = new Date()): MoneyInsight[] {
  const out: MoneyInsight[] = [];
  const todayKey = dateKey(today);
  const monthStart = dateKey(new Date(today.getFullYear(), today.getMonth(), 1));
  const weekStart = addDaysKey(todayKey, -((today.getDay() + 6) % 7));

  // Payouts vs recorded sales, for last week's sales (payouts arrive a few days later).
  const matches = matchPayouts(txns, daySales);
  const lastWeekStart = addDaysKey(weekStart, -7);
  const cardTxns = txns.filter((t) => t.amount > 0 && t.category === CARD_SALES);
  const lastWeekSales = [...daySales.entries()].filter(([d]) => d >= lastWeekStart && d < weekStart).reduce((s, [, v]) => s + v, 0);
  const lastWeekPayouts = cardTxns.filter((t) => t.date > lastWeekStart && t.date <= addDaysKey(weekStart, 3)).reduce((s, t) => s + t.amount, 0);
  const unexplained = round2(lastWeekSales - lastWeekPayouts);
  if (lastWeekSales > 0 && lastWeekPayouts > 0 && unexplained > Math.max(50, lastWeekSales * MAX_FEE_SHARE)) {
    out.push({
      id: 'payout-gap',
      tone: 'warning',
      text: `Card payouts were ${formatMoney(unexplained)} less than recorded sales last week. Check for missing payouts or refunds (cash sales also make the difference bigger).`,
    });
  }

  // Delivery apps' share of this month's money in.
  const monthIncome = txns.filter((t) => t.amount > 0 && t.date >= monthStart && t.category !== 'Transfers');
  const total = monthIncome.reduce((s, t) => s + t.amount, 0);
  const delivery = monthIncome.filter((t) => t.category === DELIVERY).reduce((s, t) => s + t.amount, 0);
  if (total > 0 && delivery > 0) {
    out.push({ id: 'delivery-share', tone: 'info', text: `Delivery apps made up ${Math.round((delivery / total) * 100)}% of income this month (${formatMoney(delivery)}).` });
  }

  // Card fees this month (from payouts matched to sales).
  const fees = round2(cardTxns.filter((t) => t.date >= monthStart).reduce((s, t) => s + (matches.get(t.id)?.fees ?? 0), 0));
  if (fees > 0) out.push({ id: 'card-fees', tone: 'info', text: `Card fees cost you about ${formatMoney(fees)} this month.` });

  // Overdue invoices.
  const overdue = docs.filter((d) => d.kind === 'invoice' && hospitalityStatus(d, today) === 'Overdue');
  if (overdue.length > 0) {
    const owed = round2(overdue.reduce((s, d) => s + invoiceAmounts(d).owing, 0));
    out.push({
      id: 'overdue-invoices',
      tone: 'warning',
      text: `You have ${overdue.length} overdue invoice${overdue.length === 1 ? '' : 's'} totalling ${formatMoney(owed)}.`,
    });
  }
  return out;
}
