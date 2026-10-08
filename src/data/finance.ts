// Money in and money out, for the Dashboard, Revenue, Expenses and Analytics.
//   Revenue  = invoices marked Paid (counted on the day they were paid).
//   Expenses = approved payroll (gross wages + super, from payslips)
//              + expenses the owner enters (stored in the "expenses" table).
// Nothing is copied: revenue and wages are worked out from invoices and payslips.
import { businessStore } from '@/data/business';
import type { Employee } from '@/data/employees';
import { employeeFullName } from '@/data/employees';
import { docTotals, type SalesDoc } from '@/data/invoices';
import type { PayslipRecord } from '@/data/payroll';
import { fromDateKey, toDateKey } from '@/data/shifts';
import { createStore } from '@/data/store';
import { supabase } from '@/lib/supabase';

export const WAGES_CATEGORY = 'Wages & super';

export const EXPENSE_CATEGORIES = [
  'Fuel',
  'Materials & supplies',
  'Equipment & tools',
  'Vehicle',
  'Rent',
  'Utilities',
  'Insurance',
  'Phone & internet',
  'Software & subscriptions',
  'Advertising',
  'Other',
] as const;

export type Expense = {
  id: string;
  /** "YYYY-MM-DD" */
  date: string;
  amount: number;
  category: string;
  description: string;
  receiptPath: string | null;
};

/** One line on the Revenue or Expenses page. */
export type MoneyEntry = {
  id: string;
  date: Date;
  amount: number;
  title: string;
  subtitle: string;
  category: string;
  source: 'invoice' | 'payroll' | 'expense';
  /** The invoice (revenue) or expense this came from, to open it. */
  docId?: string;
  expense?: Expense;
};

// ---------------------------------------------------------------------------
// Date ranges
// ---------------------------------------------------------------------------

export type FinanceRange = { id: string; label: string; start: Date; end: Date };

/** This month (the default), last month, this financial year, and all time. */
export function financeRanges(now = new Date()): FinanceRange[] {
  const fyStartMonth = (businessStore.get()?.financialYearStartMonth ?? 7) - 1;
  const fyYear = now.getMonth() >= fyStartMonth ? now.getFullYear() : now.getFullYear() - 1;
  return [
    { id: 'this-month', label: 'This month', start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 1) },
    { id: 'last-month', label: 'Last month', start: new Date(now.getFullYear(), now.getMonth() - 1, 1), end: new Date(now.getFullYear(), now.getMonth(), 1) },
    { id: 'this-fy', label: 'This financial year', start: new Date(fyYear, fyStartMonth, 1), end: new Date(fyYear + 1, fyStartMonth, 1) },
    { id: 'all', label: 'All time', start: new Date(2000, 0, 1), end: new Date(now.getFullYear() + 100, 0, 1) },
  ];
}

export function inRange(entries: MoneyEntry[], range: Pick<FinanceRange, 'start' | 'end'>) {
  return entries.filter((e) => e.date >= range.start && e.date < range.end);
}

export function sumEntries(entries: MoneyEntry[]) {
  return Math.round(entries.reduce((sum, e) => sum + e.amount, 0) * 100) / 100;
}

/** e.g. "+12.5%" compared with the previous amount, or null when there's nothing to compare. */
export function percentChange(current: number, previous: number) {
  if (previous === 0) return null;
  const change = ((current - previous) / previous) * 100;
  return `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`;
}

// ---------------------------------------------------------------------------
// Revenue: paid invoices
// ---------------------------------------------------------------------------

export function revenueEntries(docs: SalesDoc[]): MoneyEntry[] {
  return docs
    .filter((d) => d.kind === 'invoice' && d.status === 'Paid' && d.paidAt)
    .map((d) => ({
      id: d.id,
      date: new Date(d.paidAt!),
      amount: docTotals(d.items, d.gstRate).total,
      title: d.client.name || 'Invoice',
      subtitle: [d.number, d.jobType].filter(Boolean).join(' · '),
      category: 'Invoice',
      source: 'invoice' as const,
      docId: d.id,
    }))
    .sort((a, b) => b.date.getTime() - a.date.getTime());
}

// ---------------------------------------------------------------------------
// Expenses: payroll + entered expenses
// ---------------------------------------------------------------------------

export function expenseEntries(expenses: Expense[], payslips: PayslipRecord[], employees: Employee[]): MoneyEntry[] {
  const names = new Map(employees.map((e) => [e.id, employeeFullName(e)]));
  const wages: MoneyEntry[] = payslips.map((p) => ({
    id: `payslip-${p.id}`,
    date: p.paidAt ? new Date(p.paidAt) : fromDateKey(p.payDate ?? p.periodEnd),
    amount: Math.round((p.gross + p.super) * 100) / 100,
    title: `Wages – ${names.get(p.employeeId) ?? 'Former employee'}`,
    subtitle: `Pay period from ${fromDateKey(p.periodStart).toLocaleDateString([], { day: 'numeric', month: 'short' })} · incl. super`,
    category: WAGES_CATEGORY,
    source: 'payroll',
  }));
  const entered: MoneyEntry[] = expenses.map((e) => ({
    id: e.id,
    date: fromDateKey(e.date),
    amount: e.amount,
    title: e.description || e.category,
    subtitle: e.category,
    category: e.category,
    source: 'expense',
    expense: e,
  }));
  return [...wages, ...entered].sort((a, b) => b.date.getTime() - a.date.getTime());
}

/** Totals per category, biggest first. */
export function byCategory(entries: MoneyEntry[]) {
  const totals = new Map<string, number>();
  for (const e of entries) totals.set(e.category, (totals.get(e.category) ?? 0) + e.amount);
  return [...totals.entries()]
    .map(([category, amount]) => ({ category, amount: Math.round(amount * 100) / 100 }))
    .sort((a, b) => b.amount - a.amount);
}

type ExpenseRow = {
  id: string;
  date: string;
  amount: number | string;
  category: string;
  description: string;
  receipt_path: string | null;
};

const fromRow = (r: ExpenseRow): Expense => ({
  id: r.id,
  date: r.date,
  amount: Number(r.amount),
  category: r.category,
  description: r.description,
  receiptPath: r.receipt_path,
});

export const expensesStore = createStore<Expense[]>([]);

export function useExpenses() {
  return expensesStore.use();
}

export async function loadExpenses() {
  const { data, error } = await supabase.from('expenses').select('id, date, amount, category, description, receipt_path').order('date', { ascending: false });
  if (error) throw error;
  expensesStore.set((data as ExpenseRow[]).map(fromRow));
}

export type ExpenseInput = Omit<Expense, 'id' | 'receiptPath'> & {
  /** A newly picked receipt photo/PDF to upload. */
  receipt?: { uri: string; name: string; mimeType: string } | null;
  /** true to remove the existing receipt. */
  removeReceipt?: boolean;
};

async function uploadReceipt(businessId: string, file: { uri: string; name: string; mimeType: string }) {
  const body = await (await fetch(file.uri)).arrayBuffer();
  const safeName = file.name.replace(/[^A-Za-z0-9._-]+/g, '_');
  const path = `${businessId}/receipts/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from('business-files').upload(path, body, { contentType: file.mimeType || undefined });
  if (error) throw error;
  return path;
}

/** Adds (no id) or updates an expense. Throws if it couldn't be saved. */
export async function saveExpense(input: ExpenseInput, existing?: Expense) {
  const businessId = businessStore.get()?.id;
  if (!businessId) throw new Error('Your business hasn’t loaded yet.');
  let receiptPath = input.removeReceipt ? null : (existing?.receiptPath ?? null);
  if (input.receipt) receiptPath = await uploadReceipt(businessId, input.receipt);

  const cols = {
    business_id: businessId,
    date: input.date,
    amount: input.amount,
    category: input.category,
    description: input.description.trim(),
    receipt_path: receiptPath,
    updated_at: new Date().toISOString(),
  };
  const query = existing
    ? supabase.from('expenses').update(cols).eq('id', existing.id)
    : supabase.from('expenses').insert(cols);
  const { data, error } = await query.select('id, date, amount, category, description, receipt_path').single<ExpenseRow>();
  if (error) {
    if (input.receipt && receiptPath) supabase.storage.from('business-files').remove([receiptPath]).catch(() => {});
    throw error;
  }
  // The old receipt file is no longer needed.
  if (existing?.receiptPath && existing.receiptPath !== receiptPath) {
    supabase.storage.from('business-files').remove([existing.receiptPath]).catch(() => {});
  }
  const saved = fromRow(data);
  expensesStore.set((all) =>
    [saved, ...all.filter((e) => e.id !== saved.id)].sort((a, b) => b.date.localeCompare(a.date)),
  );
  return saved;
}

export async function deleteExpense(expense: Expense) {
  const { error } = await supabase.from('expenses').delete().eq('id', expense.id);
  if (error) throw error;
  if (expense.receiptPath) supabase.storage.from('business-files').remove([expense.receiptPath]).catch(() => {});
  expensesStore.set((all) => all.filter((e) => e.id !== expense.id));
}

/** A private link to open a receipt (expires after 10 minutes). */
export async function receiptLink(path: string) {
  const { data, error } = await supabase.storage.from('business-files').createSignedUrl(path, 600);
  if (error) throw error;
  return data.signedUrl;
}

export const todayKey = () => toDateKey(new Date());
