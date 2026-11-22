// NexGain Hospitality: an invoice's status and amounts (pure, no database or
// email), used by the invoice screens, Sales, Transactions and the tests.
//
// Statuses shown to the owner: Unpaid, Overdue, Paid, Cancelled.
//   saved status 'Draft'     -> Unpaid (not sent yet)
//   saved status 'Pending'   -> Unpaid, or Overdue once the due date has passed
//   saved status 'Overdue'   -> Overdue (the owner marked it)
//   saved status 'Paid'      -> Paid
//   saved status 'Cancelled' -> Cancelled
import { docTotals, type DocStatus, type HospitalityInvoiceInfo, type PaidMethod, type SalesDoc } from '@/data/invoices';

export type HospitalityStatus = 'Unpaid' | 'Overdue' | 'Paid' | 'Cancelled';

/** Saved as the invoice's status (only NexGain Hospitality uses it). */
export const CANCELLED = 'Cancelled' as DocStatus;

export const PAID_METHODS: PaidMethod[] = ['Bank transfer', 'Card', 'Cash', 'Other'];

const NO_INFO: HospitalityInvoiceInfo = { deposit: null, depositPaid: false, depositPaidAt: null, paidMethod: null };
const round2 = (n: number) => Math.round(n * 100) / 100;

/** "YYYY-MM-DD" in the phone's own time. */
export function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function infoOf(doc: Pick<SalesDoc, 'hospitality'>): HospitalityInvoiceInfo {
  return doc.hospitality ?? NO_INFO;
}

/** Unpaid, Overdue (automatically the day after the due date), Paid or Cancelled. */
export function hospitalityStatus(doc: Pick<SalesDoc, 'status' | 'dueDate'>, today = new Date()): HospitalityStatus {
  const status = doc.status as string;
  if (status === 'Cancelled') return 'Cancelled';
  if (status === 'Paid') return 'Paid';
  if (status === 'Overdue') return 'Overdue';
  if (doc.dueDate && doc.dueDate < dayKey(today)) return 'Overdue';
  return 'Unpaid';
}

/** Saved but never emailed. */
export const notSentYet = (doc: Pick<SalesDoc, 'status'>) => doc.status === 'Draft';

export type InvoiceAmounts = {
  subtotal: number;
  gst: number;
  total: number;
  /** The deposit asked for (0 = none). */
  deposit: number;
  depositPaid: boolean;
  /** What the customer still has to pay. 0 once it's paid or cancelled. */
  owing: number;
};

export function invoiceAmounts(doc: Pick<SalesDoc, 'items' | 'gstRate' | 'status' | 'hospitality'>): InvoiceAmounts {
  const { subtotal, gst, total } = docTotals(doc.items, doc.gstRate);
  const info = infoOf(doc);
  const deposit = info.deposit ?? 0;
  const depositPaid = deposit > 0 && info.depositPaid;
  const closed = (doc.status as string) === 'Paid' || (doc.status as string) === 'Cancelled';
  return { subtotal, gst, total, deposit, depositPaid, owing: closed ? 0 : round2(total - (depositPaid ? deposit : 0)) };
}

/** The business's invoices (NexGain Hospitality only ever has invoices, no quotes). */
export function hospitalityInvoices(docs: SalesDoc[]) {
  return docs.filter((d) => d.kind === 'invoice').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Unpaid or overdue: still to be paid. */
export function isOpen(doc: Pick<SalesDoc, 'status' | 'dueDate'>, today = new Date()) {
  const s = hospitalityStatus(doc, today);
  return s === 'Unpaid' || s === 'Overdue';
}

/** Invoices paid in a period (by the day they were paid), for the Sales totals. */
export function paidInvoicesIn(docs: SalesDoc[], start: Date, end: Date) {
  const from = start.toISOString();
  const to = end.toISOString();
  return docs.filter((d) => d.kind === 'invoice' && (d.status as string) === 'Paid' && d.paidAt && d.paidAt >= from && d.paidAt < to);
}
