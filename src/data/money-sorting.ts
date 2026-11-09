// The Transactions page's data layer and its AI sorting.
//
// useMoneyFeed() gives the page everything it shows, from either:
//   - the real bank feed (src/data/bank.ts, Basiq), or
//   - the sample preview (src/data/bank-sample.ts), kept in memory only.
// The page never needs to know which, so switching to the live feed needs no
// page changes.
//
// After the bank data loads, processBank() sorts new transactions (rules ->
// the owner's remembered choices -> best guess with a confidence score) and
// matches money coming in to unpaid invoices. "Needs review" (reviewItems)
// asks the owner about anything NexGain isn't sure of.
import { businessStore, updateBusiness, useBusiness } from '@/data/business';
import {
  bankSyncListeners,
  bankTransactionsStore,
  INCOME_CATEGORY,
  isBankConnected,
  setTransactionCategory,
  TRANSFERS_CATEGORY,
  useBankAccounts,
  useBankConnection,
  useBankTransactions,
  type BankAccount,
  type BankTransaction,
  type TransactionItem,
} from '@/data/bank';
import { buildSampleBank } from '@/data/bank-sample';
import { useClients } from '@/data/clients';
import { employeeFullName, employeesStore, isContractor } from '@/data/employees';
import { docsStore, docTotals, useDocs, type SalesDoc } from '@/data/invoices';
import { financeRanges, type FinanceRange } from '@/data/finance';
import { useJobs, type Job } from '@/data/jobs';
import { formatMoney } from '@/data/payroll';
import { useReceipts } from '@/data/receipts';
import { createStore } from '@/data/store';
import { supabase } from '@/lib/supabase';

import {
  groupOf,
  matchPayment,
  merchantKey,
  REVIEW_BELOW,
  sortTransaction,
  SPEND_GROUPS,
  suburbOf,
  suggestJob,
  travelCosts,
  type JobOption,
  type SortContext,
  type SortInput,
  type SpendGroup,
  type SpendGroupId,
  type UnpaidInvoice,
} from '../../supabase/functions/_shared/ai/sorting';
import { productPriceRises, purchasesFromReceipts, type ProductPurchase } from '../../supabase/functions/_shared/ai/products';

export {
  groupById,
  SPEND_GROUPS,
  type JobOption,
  type SpendGroup,
  type SpendGroupId,
  type UnpaidInvoice,
} from '../../supabase/functions/_shared/ai/sorting';

// ---------------------------------------------------------------------------
// The feed: real bank data or the sample preview
// ---------------------------------------------------------------------------

type Preview = {
  accounts: BankAccount[];
  transactions: BankTransaction[];
  invoices: UnpaidInvoice[];
  jobs: JobOption[];
  contractorNames: string[];
  learned: Map<string, string>;
  purchases: ProductPurchase[];
};

/** The sample preview, while it's switched on (null = real data). */
export const bankPreviewStore = createStore<Preview | null>(null);
export const useBankPreview = () => bankPreviewStore.use();

/** The owner's remembered choices: merchant key -> category. */
export const learnedRulesStore = createStore<Map<string, string>>(new Map());

export type MoneyFeed = {
  preview: boolean;
  connected: boolean;
  accounts: BankAccount[];
  transactions: BankTransaction[];
  /** Unpaid invoices, for matching money coming in. */
  invoices: UnpaidInvoice[];
  /** Jobs an expense could be linked to. */
  jobs: JobOption[];
  linkExpensesToJobs: boolean;
  /** Products bought, from receipts (for price rises on the Materials page). */
  purchases: ProductPurchase[];
};

/** Unpaid invoices from the Invoices section. */
export function unpaidInvoicesOf(docs: SalesDoc[]): UnpaidInvoice[] {
  return docs
    .filter((d) => d.kind === 'invoice' && d.status === 'Pending')
    .map((d) => ({
      id: d.id,
      number: d.number,
      clientName: d.client.name,
      total: docTotals(d.items, d.gstRate).total,
      reference: d.paymentReference,
    }));
}

/** e.g. "Smith deck": the client's surname and the job. */
export function jobOptionsOf(jobs: Job[], clients: { id: string; name: string }[]): JobOption[] {
  return jobs.map((j) => {
    const client = clients.find((c) => c.id === j.clientId)?.name.trim() ?? '';
    const surname = client.split(/\s+/).pop() ?? '';
    return {
      id: j.id,
      label: [surname, j.title.toLowerCase()].filter(Boolean).join(' ') || j.title,
      date: j.date,
      status: j.status,
      suburb: suburbOf(j.address),
    };
  });
}

export function useMoneyFeed(): MoneyFeed {
  const preview = useBankPreview();
  const connection = useBankConnection();
  const accounts = useBankAccounts();
  const transactions = useBankTransactions();
  const docs = useDocs();
  const jobs = useJobs();
  const clients = useClients();
  const business = useBusiness();
  const receipts = useReceipts();
  const linkExpensesToJobs = business?.linkExpensesToJobs ?? false;
  if (preview) {
    return {
      preview: true,
      connected: true,
      accounts: preview.accounts,
      transactions: preview.transactions,
      invoices: preview.invoices,
      jobs: preview.jobs,
      linkExpensesToJobs,
      purchases: preview.purchases,
    };
  }
  return {
    preview: false,
    connected: isBankConnected(connection),
    accounts,
    transactions,
    invoices: unpaidInvoicesOf(docs),
    jobs: jobOptionsOf(jobs, clients),
    linkExpensesToJobs,
    purchases: purchasesFromReceipts(receipts),
  };
}

// ---------------------------------------------------------------------------
// Sorting new transactions (and auto-matching payments)
// ---------------------------------------------------------------------------

const asInput = (t: BankTransaction): SortInput => ({
  amount: t.amount,
  description: t.description,
  merchant: t.merchant,
  bankCategory: t.bankCategory,
  date: t.date,
});

function contextFor(transactions: BankTransaction[], learned: Map<string, string>, contractorNames: string[]): SortContext {
  return { learned, contractorNames, history: transactions.filter((t) => t.amount < 0).map(asInput) };
}

/** Sorts transactions NexGain hasn't looked at yet. Returns the sorted copies (and which changed). */
function sortNew(transactions: BankTransaction[], ctx: SortContext) {
  const changed: BankTransaction[] = [];
  const all = transactions.map((t) => {
    if (t.categorySource !== 'auto' || t.categoryMethod !== null) return t;
    const s = sortTransaction(asInput(t), ctx);
    const next = { ...t, category: s.category, confidence: s.confidence, categoryMethod: s.method };
    changed.push(next);
    return next;
  });
  return { all, changed };
}

export async function loadLearnedRules() {
  const { data, error } = await supabase.from('merchant_category_rules').select('merchant_key, category');
  if (error) return learnedRulesStore.get(); // not set up yet: no remembered choices
  const map = new Map((data as { merchant_key: string; category: string }[]).map((r) => [r.merchant_key, r.category]));
  learnedRulesStore.set(map);
  return map;
}

let processing: Promise<void> | null = null;

/**
 * Sorts new bank transactions and matches new money coming in to unpaid
 * invoices (one clear match is marked Paid; the owner is told and can undo).
 * Run after the bank data loads. Safe to run any time.
 */
export function processBank() {
  if (!processing) processing = runProcess().finally(() => (processing = null));
  return processing;
}

async function runProcess() {
  const before = bankTransactionsStore.get();
  if (before.length === 0) return;
  const learned = await loadLearnedRules();
  const contractors = employeesStore.get().filter(isContractor).map(employeeFullName);
  const { all, changed } = sortNew(before, contextFor(before, learned, contractors));
  if (changed.length === 0) return;

  for (let i = 0; i < changed.length; i += 200) {
    const batch = changed
      .slice(i, i + 200)
      .map((t) => ({ id: t.id, category: t.category, confidence: t.confidence, method: t.categoryMethod }));
    const { error } = await supabase.rpc('set_transaction_sorting', { p: batch });
    if (error) {
      // The AI sorting database file hasn't been run yet: keep the categories as they were.
      console.warn('Could not save transaction sorting:', error.message);
      return;
    }
  }
  bankTransactionsStore.set(all);

  // New money in: one clear invoice match is marked paid automatically.
  const invoices = unpaidInvoicesOf(docsStore.get());
  for (const t of changed) {
    if (t.amount <= 0 || t.category !== INCOME_CATEGORY || t.invoiceId || t.invoiceReviewDone) continue;
    const match = matchPayment(t, invoices);
    if (match.kind !== 'one') continue;
    const ok = await saveInvoiceMatch(t.id, match.invoice.id, true);
    if (ok)
      invoices.splice(
        invoices.findIndex((i) => i.id === match.invoice.id),
        1,
      );
  }
}

// Sort new transactions whenever the bank sends some.
bankSyncListeners.add(() => {
  processBank().catch(() => {});
});

// ---------------------------------------------------------------------------
// "Needs review"
// ---------------------------------------------------------------------------

export type ReviewItem =
  /** Not sure about the category. */
  | { kind: 'category'; txn: BankTransaction }
  /** Money in that could be for more than one invoice. */
  | { kind: 'invoice'; txn: BankTransaction; invoices: UnpaidInvoice[] }
  /** Money in that doesn't match an invoice. */
  | { kind: 'income'; txn: BankTransaction }
  /** Which job an expense was for (when "Link expenses to jobs" is on). */
  | { kind: 'job'; txn: BankTransaction; job: JobOption };

const daysSince = (date: string) => (Date.now() - Date.parse(`${date}T00:00:00`)) / 86_400_000;

/** Payments NexGain matched to an invoice by itself in the last week (shown with Undo). */
export function recentAutoMatches(feed: MoneyFeed) {
  return feed.transactions.filter((t) => t.invoiceId && t.invoiceMatchedBy === 'auto' && daysSince(t.date) <= 7);
}

/** Questions for the owner, most important first (payments, then categories, then jobs). */
export function reviewItems(feed: MoneyFeed): ReviewItem[] {
  const invoiceItems: ReviewItem[] = [];
  const categoryItems: ReviewItem[] = [];
  const jobItems: ReviewItem[] = [];
  for (const t of feed.transactions) {
    if (t.amount > 0) {
      if (t.category !== INCOME_CATEGORY || t.invoiceId || t.invoiceReviewDone || daysSince(t.date) > 60) continue;
      const match = matchPayment(t, feed.invoices);
      if (match.kind === 'several') invoiceItems.push({ kind: 'invoice', txn: t, invoices: match.invoices });
      // A clear match is linked automatically (real data) or shown as matched (preview).
      else if (match.kind === 'none') invoiceItems.push({ kind: 'income', txn: t });
      continue;
    }
    if (t.category === TRANSFERS_CATEGORY) continue;
    if (t.categorySource === 'auto' && !t.categoryReviewDone && t.confidence !== null && t.confidence < REVIEW_BELOW) {
      categoryItems.push({ kind: 'category', txn: t });
      continue;
    }
    if (feed.linkExpensesToJobs && !t.jobId && !t.jobReviewDone && daysSince(t.date) <= 30) {
      const job = suggestJob({ amount: t.amount, date: t.date, category: t.category }, feed.jobs);
      if (job) jobItems.push({ kind: 'job', txn: t, job });
    }
  }
  return [...invoiceItems, ...categoryItems, ...jobItems];
}

// ---------------------------------------------------------------------------
// The owner's answers
// ---------------------------------------------------------------------------

function updatePreview(change: (p: Preview) => Preview) {
  const p = bankPreviewStore.get();
  if (p) bankPreviewStore.set(change(p));
}

function patchTxns(ids: Set<string>, patch: (t: BankTransaction) => BankTransaction) {
  if (bankPreviewStore.get()) {
    updatePreview((p) => ({ ...p, transactions: p.transactions.map((t) => (ids.has(t.id) ? patch(t) : t)) }));
  } else {
    bankTransactionsStore.set((all) => all.map((t) => (ids.has(t.id) ? patch(t) : t)));
  }
}

/**
 * The owner picks a category for a transaction. NexGain remembers it for that
 * merchant and re-sorts their other (not owner-chosen) transactions the same
 * way. Returns how many other transactions changed.
 */
export async function chooseCategory(txnId: string, category: string): Promise<number> {
  const preview = bankPreviewStore.get();
  const list = preview ? preview.transactions : bankTransactionsStore.get();
  const txn = list.find((t) => t.id === txnId);
  if (!txn) return 0;
  const key = merchantKey(txn);
  const others = list.filter(
    (t) =>
      t.id !== txnId &&
      t.categorySource === 'auto' &&
      t.category !== category &&
      t.amount < 0 === txn.amount < 0 &&
      merchantKey(t) === key,
  );

  if (preview) {
    updatePreview((p) => ({ ...p, learned: new Map(p.learned).set(key, category) }));
    patchTxns(new Set([txnId]), (t) => ({
      ...t,
      category,
      categorySource: 'owner',
      categoryMethod: 'owner',
      confidence: 1,
      categoryReviewDone: true,
    }));
    patchTxns(new Set(others.map((t) => t.id)), (t) => ({ ...t, category, categoryMethod: 'learned', confidence: 1 }));
    return others.length;
  }

  await setTransactionCategory(txnId, category);
  if (!key) return 0;
  const businessId = businessStore.get()?.id;
  const { error } = await supabase
    .from('merchant_category_rules')
    .upsert({ business_id: businessId, merchant_key: key, category }, { onConflict: 'business_id,merchant_key' });
  if (error) return 0; // remembered choices aren't set up yet
  learnedRulesStore.set(new Map(learnedRulesStore.get()).set(key, category));
  if (others.length > 0) {
    const { error: sortError } = await supabase.rpc('set_transaction_sorting', {
      p: others.map((t) => ({ id: t.id, category, confidence: 1, method: 'learned' })),
    });
    if (!sortError)
      patchTxns(new Set(others.map((t) => t.id)), (t) => ({ ...t, category, categoryMethod: 'learned', confidence: 1 }));
  }
  return others.length;
}

/** "Yes, that job" (jobId) or "No job" (null). */
export async function answerJob(txnId: string, jobId: string | null) {
  patchTxns(new Set([txnId]), (t) => ({ ...t, jobId, jobReviewDone: true }));
  if (bankPreviewStore.get()) return true;
  const { error } = await supabase.from('bank_transactions').update({ job_id: jobId, job_review_done: true }).eq('id', txnId);
  return !error;
}

/** Links money in to an invoice and marks it Paid. Returns an error message, or null. */
async function saveInvoiceMatch(txnId: string, invoiceId: string, auto: boolean): Promise<string | null> {
  const preview = bankPreviewStore.get();
  if (preview) {
    patchTxns(new Set([txnId]), (t) => ({
      ...t,
      invoiceId,
      invoiceMatchedBy: auto ? 'auto' : 'owner',
      invoiceReviewDone: true,
      category: INCOME_CATEGORY,
    }));
    updatePreview((p) => ({ ...p, invoices: p.invoices.filter((i) => i.id !== invoiceId) }));
    return null;
  }
  const { error } = await supabase.rpc('match_payment_to_invoice', { p_transaction: txnId, p_invoice: invoiceId, p_auto: auto });
  if (error) return error.message;
  const txn = bankTransactionsStore.get().find((t) => t.id === txnId);
  patchTxns(new Set([txnId]), (t) => ({
    ...t,
    invoiceId,
    invoiceMatchedBy: auto ? 'auto' : 'owner',
    invoiceReviewDone: true,
    category: INCOME_CATEGORY,
  }));
  // The invoice shows as Paid everywhere straight away (the database sends the same change).
  docsStore.set((all) =>
    all.map((d) =>
      d.id === invoiceId
        ? {
            ...d,
            status: 'Paid',
            paidAt: txn ? new Date(`${txn.date}T12:00:00+10:00`).toISOString() : new Date().toISOString(),
            receiptStatus: 'not_sent',
          }
        : d,
    ),
  );
  return null;
}

/** The owner links money in to an invoice. Returns an error message, or null. */
export function linkInvoice(txnId: string, invoiceId: string) {
  return saveInvoiceMatch(txnId, invoiceId, false);
}

/** "Neither" / "Not for an invoice": stop asking about this payment. */
export async function notForAnInvoice(txnId: string) {
  patchTxns(new Set([txnId]), (t) => ({ ...t, invoiceReviewDone: true }));
  if (bankPreviewStore.get()) return true;
  const { error } = await supabase.from('bank_transactions').update({ invoice_review_done: true }).eq('id', txnId);
  return !error;
}

/** Undoes a payment-to-invoice match: the invoice goes back to unpaid. Returns an error message, or null. */
export async function undoInvoiceMatch(txnId: string): Promise<string | null> {
  const preview = bankPreviewStore.get();
  const txn = (preview ? preview.transactions : bankTransactionsStore.get()).find((t) => t.id === txnId);
  if (!txn?.invoiceId) return null;
  const invoiceId = txn.invoiceId;
  if (preview) {
    const original = buildSampleBank().invoices.find((i) => i.id === invoiceId);
    patchTxns(new Set([txnId]), (t) => ({ ...t, invoiceId: null, invoiceMatchedBy: null, invoiceReviewDone: false }));
    if (original) updatePreview((p) => ({ ...p, invoices: [...p.invoices, original] }));
    return null;
  }
  const { error } = await supabase.rpc('undo_payment_match', { p_transaction: txnId });
  if (error) return error.message;
  patchTxns(new Set([txnId]), (t) => ({ ...t, invoiceId: null, invoiceMatchedBy: null, invoiceReviewDone: false }));
  docsStore.set((all) =>
    all.map((d) =>
      d.id === invoiceId && d.status === 'Paid' ? { ...d, status: 'Pending', paidAt: null, receiptStatus: null } : d,
    ),
  );
  return null;
}

export function setLinkExpensesToJobs(on: boolean) {
  updateBusiness({ linkExpensesToJobs: on });
}

// ---------------------------------------------------------------------------
// The sample preview
// ---------------------------------------------------------------------------

/** Shows the Transactions page with sample bank data (memory only, never saved). */
export function startBankPreview() {
  const sample = buildSampleBank();
  const learned = new Map<string, string>();
  const { all } = sortNew(sample.transactions, contextFor(sample.transactions, learned, sample.contractorNames));
  // Clear invoice matches are linked straight away, like the real feed.
  const invoices = [...sample.invoices];
  const transactions = all.map((t) => {
    if (t.amount <= 0 || t.category !== INCOME_CATEGORY) return t;
    const match = matchPayment(t, invoices);
    if (match.kind !== 'one') return t;
    invoices.splice(invoices.indexOf(match.invoice), 1);
    return { ...t, invoiceId: match.invoice.id, invoiceMatchedBy: 'auto' as const, invoiceReviewDone: true };
  });
  bankPreviewStore.set({
    accounts: sample.accounts,
    transactions,
    invoices,
    jobs: sample.jobs,
    contractorNames: sample.contractorNames,
    learned,
    purchases: sample.purchases,
  });
}

export function stopBankPreview() {
  bankPreviewStore.set(null);
}

/** The invoice a payment was matched to (real or sample), for showing its number. */
export function invoiceLabel(invoiceId: string | null, feed: MoneyFeed) {
  if (!invoiceId) return null;
  if (feed.preview) return buildSampleBank().invoices.find((i) => i.id === invoiceId) ?? null;
  const d = docsStore.get().find((x) => x.id === invoiceId);
  return d ? { id: d.id, number: d.number, clientName: d.client.name } : null;
}

/** For a job id: its label (real or sample). */
export function jobLabel(jobId: string | null, feed: MoneyFeed) {
  return jobId ? (feed.jobs.find((j) => j.id === jobId)?.label ?? null) : null;
}

/** On sign-out. */
export function clearMoneySorting() {
  learnedRulesStore.set(new Map());
  bankPreviewStore.set(null);
}

// ---------------------------------------------------------------------------
// Periods and "Expenses by category"
// ---------------------------------------------------------------------------

export type MoneyRange = FinanceRange & {
  /** The same stretch of the period before, for "Up 22%" (null = nothing to compare). */
  previous: { start: Date; end: Date } | null;
  /** e.g. "last month" */
  previousLabel: string;
};

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86_400_000);

/**
 * The Transactions page's periods: this month, this quarter, this financial
 * year (plus last month and all time). Periods still under way are compared
 * with the same number of days of the period before (1-9 Nov vs 1-9 Oct), so
 * "Up 22%" is fair part-way through a month.
 */
export function transactionRanges(now = new Date()): MoneyRange[] {
  const base = financeRanges(now);
  const byId = (id: string) => base.find((r) => r.id === id)!;
  const tomorrow = addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate()), 1);
  const withPrevious = (r: FinanceRange, months: number, previousLabel: string): MoneyRange => {
    const start = addMonths(r.start, -months);
    const end = r.end > tomorrow ? addDays(start, daysBetween(r.start, tomorrow)) : r.start;
    return { ...r, previous: { start, end }, previousLabel };
  };
  // Quarters line up with the financial year (Jul-Sep, Oct-Dec...).
  const fyStartMonth = (businessStore.get()?.financialYearStartMonth ?? 7) - 1;
  const intoQuarter = (((now.getMonth() - fyStartMonth) % 12) + 12) % 3;
  const quarterStart = new Date(now.getFullYear(), now.getMonth() - intoQuarter, 1);
  const quarter: FinanceRange = {
    id: 'this-quarter',
    label: 'This quarter',
    start: quarterStart,
    end: addMonths(quarterStart, 3),
  };
  return [
    withPrevious(byId('this-month'), 1, 'last month'),
    withPrevious(quarter, 3, 'last quarter'),
    withPrevious(byId('this-fy'), 12, 'last financial year'),
    withPrevious(byId('last-month'), 1, 'the month before'),
    { ...byId('all'), previous: null, previousLabel: '' },
  ];
}

/** Spending only (money out), with the group it belongs to. */
function spending(items: TransactionItem[], start: Date, end: Date, group?: SpendGroupId) {
  return items.filter((i) => {
    if (i.amount >= 0 || i.date < start || i.date >= end) return false;
    const g = groupOf(i.category);
    return g !== null && (!group || g === group);
  });
}

const total = (items: TransactionItem[]) => Math.round(items.reduce((sum, i) => sum - i.amount, 0) * 100) / 100;

/** Whole-number percent change, or null when there's nothing to compare. */
export function changePercent(current: number, previous: number | null) {
  if (previous === null || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** Worth pointing out: up at least 15% and at least $20. */
export const isUpALot = (current: number, previous: number | null) =>
  previous !== null && previous > 0 && current - previous >= 20 && (current - previous) / previous >= 0.15;

export type GroupSummary = {
  group: SpendGroup;
  items: TransactionItem[];
  total: number;
  previous: number | null;
  change: number | null;
  upALot: boolean;
};

export function groupSummary(items: TransactionItem[], range: MoneyRange, groupId: SpendGroupId): GroupSummary {
  const group = SPEND_GROUPS.find((g) => g.id === groupId)!;
  const inPeriod = spending(items, range.start, range.end, groupId);
  const now = total(inPeriod);
  const previous = range.previous ? total(spending(items, range.previous.start, range.previous.end, groupId)) : null;
  return { group, items: inPeriod, total: now, previous, change: changePercent(now, previous), upALot: isUpALot(now, previous) };
}

/** The six groups, in order: Materials, Labour, Tools, Fuel, Vehicle, Other. */
export function groupSummaries(items: TransactionItem[], range: MoneyRange) {
  return SPEND_GROUPS.map((g) => groupSummary(items, range, g.id));
}

/** A group's spending in each of the last few months (this month last), for the bar chart. */
export function monthlyTotals(items: TransactionItem[], groupId: SpendGroupId, months = 4, now = new Date()) {
  return Array.from({ length: months }, (_, i) => {
    const start = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
    const end = addMonths(start, 1);
    return { label: start.toLocaleDateString([], { month: 'short' }), total: total(spending(items, start, end, groupId)) };
  });
}

/** How the transactions were sorted, e.g. { rule: 12, learned: 2, ai: 3, owner: 1 }. */
export function sortingCounts(items: TransactionItem[]) {
  const counts = { rule: 0, learned: 0, ai: 0, owner: 0, typed: 0 };
  for (const i of items) {
    if (i.source === 'expense') counts.typed++;
    else counts[i.bank?.categoryMethod ?? 'rule']++;
  }
  return counts;
}

const roundTo = (amount: number, step: number) => Math.max(step, Math.round(amount / step) * step);

const todayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The AI insight on a group's page, in plain English. */
export function groupInsight(summary: GroupSummary, range: MoneyRange, jobs: JobOption[], purchases: ProductPurchase[] = []): string {
  const name = summary.group.name.toLowerCase();

  // Materials: the same product costing more than last time (from receipts), not total spending.
  if (summary.group.id === 'materials') {
    const rise = productPriceRises(purchases, todayKey())[0];
    if (rise) {
      const at = rise.now.supplier ? ` at ${rise.now.supplier}` : '';
      return `${rise.product} went up ${rise.changePercent}%${at}: ${formatMoney(rise.before.unitPrice)} last time, ${formatMoney(rise.now.unitPrice)} now. Ask about the rise or compare another supplier, and update your quote prices to cover it.`;
    }
  }
  if (summary.items.length === 0) return `No ${name} spending in this period yet.`;

  // Fuel: travel to jobs further away.
  if (summary.group.id === 'fuel') {
    const jobsInPeriod = jobs.filter((j) => {
      const d = new Date(`${j.date}T00:00:00`);
      return d >= range.start && d < range.end;
    });
    const fuel = summary.items.map((i) => ({
      amount: i.amount,
      description: [i.bank?.description, i.title].filter(Boolean).join(' '),
      date: i.bank?.date ?? i.expense?.date ?? '',
    }));
    const travel = travelCosts(fuel, jobsInPeriod)[0];
    if (travel) {
      const jobsText = travel.jobs === 1 ? 'One job' : `${travel.jobs === 2 ? 'Two' : travel.jobs} jobs`;
      return `${jobsText} in ${travel.suburb} added about ${formatMoney(roundTo(travel.fuel, 10)).replace('.00', '')} in fuel. Add a travel charge to your quotes for ${travel.suburb} jobs.`;
    }
  }

  // Who it mostly went to.
  const byMerchant = new Map<string, number>();
  for (const i of summary.items) byMerchant.set(i.title, (byMerchant.get(i.title) ?? 0) - i.amount);
  const [topName, topAmount] = [...byMerchant].sort((a, b) => b[1] - a[1])[0]!;
  const share = Math.round((topAmount / summary.total) * 100);

  if (summary.upALot && summary.change !== null && summary.group.id !== 'materials') {
    return `${summary.group.name} is up ${summary.change}% on the same time ${range.previousLabel}. The biggest part was ${topName} (${formatMoney(topAmount)}). Check your quotes cover it.`;
  }
  if (summary.change !== null && summary.change <= -15) {
    return `${summary.group.name} is down ${Math.abs(summary.change)}% on the same time ${range.previousLabel}. Nice work keeping it down.`;
  }
  if (byMerchant.size > 1 && share >= 50) {
    return `${topName} is ${share}% of your ${name} spending in this period. If you buy there often, ask them about a trade account discount.`;
  }
  return `${summary.items.length} ${name} transaction${summary.items.length === 1 ? '' : 's'} so far, about the same as usual.`;
}

/**
 * Spending by group (Materials, Labour, Fuel...) between two dates, biggest
 * first, from the same transactions as the Transactions page (bank + typed-in
 * expenses). `extraLabour` adds wages paid through payroll when there's no
 * bank feed to see them.
 */
export function spendingByGroup(items: TransactionItem[], start: Date, end: Date, extraLabour = 0) {
  return SPEND_GROUPS.map((group) => ({
    group,
    total: total(spending(items, start, end, group.id)) + (group.id === 'labour' ? extraLabour : 0),
  }))
    .filter((g) => g.total > 0)
    .sort((a, b) => b.total - a.total);
}
