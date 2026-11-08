// Super (superannuation) records: one per employee per pay run, made by the
// database when the owner approves payroll (status Unpaid). Paying super is a
// separate step from paying wages; see services/super-payments.ts.
// The owner sees their whole business; an employee sees only their own.
import { addDaysKey, localParts, todayKey } from '@/data/business-time';
import { createStore } from '@/data/store';
import { supabase } from '@/lib/supabase';

export type SuperStatus = 'unpaid' | 'processing' | 'paid';

export const SUPER_STATUS_LABEL: Record<SuperStatus, string> = {
  unpaid: 'Unpaid',
  processing: 'Processing',
  paid: 'Paid',
};

export type SuperPayment = {
  id: string;
  payRunId: string;
  employeeId: string;
  payslipId: string | null;
  qualifyingEarnings: number;
  /** e.g. 0.12, as it was when the pay run was approved. */
  superRate: number;
  superAmount: number;
  /** Payday + 7 business days, "YYYY-MM-DD". */
  dueDate: string;
  status: SuperStatus;
  paidAt: string | null;
  /** The super provider's reference (empty until one is connected). */
  providerReference: string | null;
  createdAt: string;
};

export type SuperPaymentRow = {
  id: string;
  pay_run_id: string;
  employee_id: string;
  payslip_id: string | null;
  qualifying_earnings: number | string;
  super_rate: number | string;
  super_amount: number | string;
  due_date: string;
  status: SuperStatus;
  paid_at: string | null;
  provider_reference: string | null;
  created_at: string;
};

export function fromRow(r: SuperPaymentRow): SuperPayment {
  return {
    id: r.id,
    payRunId: r.pay_run_id,
    employeeId: r.employee_id,
    payslipId: r.payslip_id,
    qualifyingEarnings: Number(r.qualifying_earnings),
    superRate: Number(r.super_rate),
    superAmount: Number(r.super_amount),
    dueDate: r.due_date,
    status: r.status,
    paidAt: r.paid_at,
    providerReference: r.provider_reference,
    createdAt: r.created_at,
  };
}

export const superPaymentsStore = createStore<SuperPayment[]>([]);

export function useSuperPayments() {
  return superPaymentsStore.use();
}

export async function loadSuperPayments() {
  const { data, error } = await supabase.from('super_payments').select('*').order('due_date', { ascending: false });
  if (error) throw error;
  superPaymentsStore.set((data as SuperPaymentRow[]).map(fromRow));
}

/** Puts changed records (e.g. from set_super_status) into the store. */
export function applySuperRows(rows: SuperPaymentRow[]) {
  const changed = new Map(rows.map((r) => [r.id, fromRow(r)]));
  superPaymentsStore.set((all) => all.map((p) => changed.get(p.id) ?? p));
}

/** The super record for one person in one pay run. */
export function superFor(records: SuperPayment[], payRunId: string | null, employeeId: string) {
  return payRunId ? (records.find((s) => s.payRunId === payRunId && s.employeeId === employeeId) ?? null) : null;
}

/** "Due soon" this many days before the due date. */
const DUE_SOON_DAYS = 3;

export type DueState = 'paid' | 'overdue' | 'soon' | 'ok';

/** Whether to warn about the due date: past it (overdue) or within 3 days (soon). */
export function dueStateOf(record: Pick<SuperPayment, 'status' | 'dueDate'>, today = todayKey()): DueState {
  if (record.status === 'paid') return 'paid';
  if (record.dueDate < today) return 'overdue';
  if (record.dueDate <= addDaysKey(today, DUE_SOON_DAYS)) return 'soon';
  return 'ok';
}

/** The Brisbane date super was paid, "YYYY-MM-DD". */
export function superPaidDateKey(record: Pick<SuperPayment, 'paidAt'>) {
  return record.paidAt ? localParts(record.paidAt).date : null;
}
