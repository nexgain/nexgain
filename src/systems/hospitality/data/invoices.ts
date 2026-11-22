// NexGain Hospitality: invoices for the odd catering job, function or
// business customer, made from "Record sale".
//
// They're saved in the same place as System 1's invoices (sales_docs, see
// src/data/invoices.ts), so invoice numbers (INV-0001...), GST, the PDF and
// emailing from the owner's own email all work the same way. Hospitality adds
// a deposit, how it was paid, and the status "Cancelled".
// Statuses and amounts: ./invoice-status.ts.
import { emailInvoiceWithText } from '@/components/owner/invoice-pdf';
import { businessStore } from '@/data/business';
import {
  businessPaymentStore,
  docsStore,
  docTotals,
  GST_RATE,
  newItemId,
  saveDoc,
  saveDocsNow,
  updateDoc,
  type Client,
  type LineItem,
  type PaidMethod,
  type SalesDoc,
} from '@/data/invoices';
import { formatMoney } from '@/data/payroll';
import { businessUsesGst } from '@/data/super-rules';
import type { EmailResult } from '@/lib/email';

import { CANCELLED, infoOf, invoiceAmounts } from './invoice-status';

export * from './invoice-status';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** GST on new invoices: 10% for GST-registered Australian businesses, otherwise none (as for System 1). */
export function invoiceGstRate() {
  const business = businessStore.get();
  return business && businessUsesGst(business) ? GST_RATE : 0;
}

/**
 * One invoice line. Menu prices and the amounts the owner types include GST,
 * so the line's rate is the price before GST; the invoice total then equals
 * the menu price (e.g. 40 × $5.00 coffee = $200.00 including $18.18 GST).
 */
export function invoiceLine(description: string, qty: number, priceIncludingGst: number, gstRate: number, menuItemId: string | null = null): LineItem {
  const rate = gstRate > 0 ? Math.round((priceIncludingGst / (1 + gstRate)) * 10000) / 10000 : priceIncludingGst;
  return { id: newItemId(), description: description.trim(), qty, rate, menuItemId };
}

export type InvoiceDraft = {
  lines: LineItem[];
  client: Client;
  /** "YYYY-MM-DD" */
  dueDate: string;
  deposit: number | null;
  depositPaid: boolean;
  note: string;
};

export function validateInvoice(d: InvoiceDraft): string | null {
  if (d.lines.length === 0) return 'Add at least one item or line.';
  if (!d.client.name.trim()) return 'Enter the customer’s name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.client.email.trim())) return 'Enter the customer’s email address.';
  if (!d.dueDate) return 'Choose a due date.';
  const { total } = docTotals(d.lines, invoiceGstRate());
  if (d.deposit !== null && (!Number.isFinite(d.deposit) || d.deposit < 0)) return 'The deposit must be 0 or more (or leave it blank).';
  if (d.deposit !== null && d.deposit > total) return `The deposit can’t be more than the total (${formatMoney(total)}).`;
  return null;
}

/** Saves a new invoice (not sent yet). Returns its id. */
export function createInvoice(d: InvoiceDraft) {
  const problem = validateInvoice(d);
  if (problem) throw new Error(problem);
  const deposit = d.deposit && d.deposit > 0 ? round2(d.deposit) : null;
  return saveDoc({
    kind: 'invoice',
    status: 'Draft',
    client: {
      name: d.client.name.trim(),
      email: d.client.email.trim(),
      phone: d.client.phone.trim(),
      address: '',
      business: d.client.business?.trim() ?? '',
    },
    jobType: null,
    jobDate: null,
    description: d.note.trim(),
    items: d.lines,
    dueDate: d.dueDate,
    paymentReference: '',
    gstRate: invoiceGstRate(),
    hospitality: {
      deposit,
      depositPaid: !!deposit && d.depositPaid,
      depositPaidAt: deposit && d.depositPaid ? new Date().toISOString() : null,
      paidMethod: null,
    },
  });
}

const docById = (id: string) => docsStore.get().find((d) => d.id === id) ?? null;

/** Marks it Paid, with the date it was paid and how. */
export function markPaid(id: string, paidOn: Date, method: PaidMethod) {
  const doc = docById(id);
  if (!doc) return;
  const at = new Date(paidOn.getFullYear(), paidOn.getMonth(), paidOn.getDate(), 12).toISOString();
  updateDoc(id, { status: 'Paid', paidAt: at, receiptStatus: 'not_sent', hospitality: { ...infoOf(doc), paidMethod: method } });
}

/** Back to Unpaid (it shows as Overdue again by itself if the due date has passed). */
export function markUnpaid(id: string) {
  const doc = docById(id);
  if (!doc) return;
  updateDoc(id, { status: 'Pending', paidAt: null, receiptStatus: null, hospitality: { ...infoOf(doc), paidMethod: null } });
}

export function markOverdue(id: string) {
  const doc = docById(id);
  if (!doc) return;
  updateDoc(id, { status: 'Overdue', paidAt: null, receiptStatus: null, hospitality: { ...infoOf(doc), paidMethod: null } });
}

export function cancelInvoice(id: string) {
  const doc = docById(id);
  if (!doc) return;
  updateDoc(id, { status: CANCELLED, paidAt: null, receiptStatus: null, hospitality: { ...infoOf(doc), paidMethod: null } });
}

export function setDepositPaid(id: string, paid: boolean) {
  const doc = docById(id);
  if (!doc) return;
  updateDoc(id, { hospitality: { ...infoOf(doc), depositPaid: paid, depositPaidAt: paid ? new Date().toISOString() : null } });
}

const businessName = () => businessStore.get()?.businessName.trim() || 'us';
const firstName = (doc: SalesDoc) => doc.client.name.trim().split(/\s+/)[0] || 'there';
const dueText = (doc: SalesDoc) => {
  if (!doc.dueDate) return '';
  const [y, m, d] = doc.dueDate.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'long' });
};

export function invoiceEmail(doc: SalesDoc) {
  const a = invoiceAmounts(doc);
  const deposit = a.deposit > 0 ? (a.depositPaid ? ` Thanks for your deposit of ${formatMoney(a.deposit)}.` : ` A deposit of ${formatMoney(a.deposit)} is due now.`) : '';
  return {
    subject: `Invoice ${doc.number} from ${businessName()}`,
    body: `Hi ${firstName(doc)},\n\nPlease find attached your invoice from ${businessName()} for ${formatMoney(a.total)}.${deposit} The amount owing is ${formatMoney(a.owing)}, due ${dueText(doc)}. Payment details are on the invoice.\n\nThank you!`,
  };
}

export function reminderEmail(doc: SalesDoc) {
  const a = invoiceAmounts(doc);
  return {
    subject: `Reminder: invoice ${doc.number} from ${businessName()}`,
    body: `Hi ${firstName(doc)},\n\nJust a friendly reminder that invoice ${doc.number} for ${formatMoney(a.owing)} was due ${dueText(doc)}. The invoice is attached again, with our payment details. If you've already paid, thank you, and please ignore this email.\n\nKind regards,\n${businessName()}`,
  };
}

/**
 * Emails the invoice from the owner's email (connected Gmail/Outlook, or the
 * phone's email app), the same way System 1 invoices are sent. A first send
 * changes "not sent yet" to Unpaid.
 */
export async function sendInvoice(id: string, kind: 'invoice' | 'reminder' = 'invoice'): Promise<EmailResult> {
  await saveDocsNow();
  const doc = docById(id);
  if (!doc) throw new Error('That invoice isn’t here any more.');
  const result = await emailInvoiceWithText(doc, businessPaymentStore.get(), kind === 'reminder' ? reminderEmail(doc) : invoiceEmail(doc));
  if (result === 'sent' && doc.status === 'Draft') updateDoc(id, { status: 'Pending' });
  return result;
}
