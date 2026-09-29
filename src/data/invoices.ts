// Invoices and quotes created in the Owner section. In memory only until a
// database is connected.
import { createStore } from '@/data/store';

export type DocKind = 'invoice' | 'quote';

export const INVOICE_STATUSES = ['Draft', 'Pending', 'Paid', 'Overdue'] as const;
export const QUOTE_STATUSES = ['Draft', 'Sent', 'Accepted', 'Expired'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];
export type DocStatus = InvoiceStatus | QuoteStatus;

export type LineItem = {
  id: string;
  description: string;
  qty: number;
  rate: number;
};

export type Client = {
  name: string;
  phone: string;
  email: string;
  address: string;
};

export type SalesDoc = {
  id: string;
  kind: DocKind;
  number: string;
  /** Stored status; Pending invoices / Sent quotes past their date show as Overdue / Expired. */
  status: DocStatus;
  client: Client;
  jobType: string | null;
  jobDate: string | null; // "YYYY-MM-DD"
  description: string;
  items: LineItem[];
  /** Invoice due date or quote "valid until" date. */
  dueDate: string | null;
  paymentReference: string;
  /** GST rate charged on this document (0.1, or 0 if the business isn't GST registered). */
  gstRate: number;
  createdAt: string;
  /** When the invoice was marked Paid (ISO timestamp). Cleared if it's moved out of Paid. */
  paidAt?: string | null;
  /** Paid invoices only: whether a receipt has been sent to the client. */
  receiptStatus?: ReceiptStatus | null;
};

export type ReceiptStatus = 'not_sent' | 'sent';

export const GST_RATE = 0.1;

export const docsStore = createStore<SalesDoc[]>([]);

export function useDocs() {
  return docsStore.use();
}

export function newItemId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function nextNumber(kind: DocKind, docs: SalesDoc[]) {
  const prefix = kind === 'invoice' ? 'INV' : 'Q';
  const count = docs.filter((d) => d.kind === kind).length + 1;
  return `${prefix}-${String(count).padStart(4, '0')}`;
}

/** Creates or updates a document; returns its id. */
export function saveDoc(doc: Omit<SalesDoc, 'id' | 'number' | 'createdAt'> & { id?: string }) {
  let id = doc.id;
  docsStore.set((all) => {
    if (id && all.some((d) => d.id === id)) {
      return all.map((d) => (d.id === id ? { ...d, ...doc, id: d.id } : d));
    }
    id = newItemId();
    const number = nextNumber(doc.kind, all);
    return [
      {
        ...doc,
        id,
        number,
        paymentReference: doc.paymentReference || number,
        createdAt: new Date().toISOString(),
      },
      ...all,
    ];
  });
  return id!;
}

export function updateDoc(id: string, changes: Partial<Omit<SalesDoc, 'id' | 'kind' | 'number'>>) {
  docsStore.set((all) => all.map((d) => (d.id === id ? { ...d, ...changes } : d)));
}

/**
 * Changes a document's status. Marking an invoice Paid records when it was paid and
 * starts its receipt as "not_sent"; moving it out of Paid clears both.
 * Returns true when an invoice has just become Paid.
 */
export function setDocStatus(id: string, status: DocStatus) {
  const doc = docsStore.get().find((d) => d.id === id);
  if (!doc) return false;
  const becamePaid = doc.kind === 'invoice' && status === 'Paid' && doc.status !== 'Paid';
  if (becamePaid) {
    updateDoc(id, { status, paidAt: new Date().toISOString(), receiptStatus: 'not_sent' });
  } else if (doc.status === 'Paid' && status !== 'Paid') {
    updateDoc(id, { status, paidAt: null, receiptStatus: null });
  } else {
    updateDoc(id, { status });
  }
  return becamePaid;
}

export function deleteDoc(id: string) {
  docsStore.set((all) => all.filter((d) => d.id !== id));
}

function roundCents(amount: number) {
  return Math.round(amount * 100) / 100;
}

export function lineAmount(item: Pick<LineItem, 'qty' | 'rate'>) {
  return roundCents((item.qty || 0) * (item.rate || 0));
}

export function docTotals(items: Pick<LineItem, 'qty' | 'rate'>[], gstRate = GST_RATE) {
  const subtotal = roundCents(items.reduce((sum, item) => sum + lineAmount(item), 0));
  const gst = roundCents(subtotal * gstRate);
  return { subtotal, gst, total: roundCents(subtotal + gst), gstRate };
}

export function gstLabel(gstRate: number) {
  return gstRate > 0 ? `GST (${Math.round(gstRate * 100)}%)` : 'GST (not registered)';
}

/** Status to show, accounting for due / expiry dates that have passed. */
export function displayStatus(doc: Pick<SalesDoc, 'kind' | 'status' | 'dueDate'>, today = new Date()): DocStatus {
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const pastDue = !!doc.dueDate && doc.dueDate < todayKey;
  if (doc.kind === 'invoice' && doc.status === 'Pending' && pastDue) return 'Overdue';
  if (doc.kind === 'quote' && doc.status === 'Sent' && pastDue) return 'Expired';
  return doc.status;
}

/** The business's own bank details, printed on invoices. Entered once, reused. */
export type BusinessPayment = {
  bank: string;
  bsb: string;
  account: string;
};

export const businessPaymentStore = createStore<BusinessPayment>({ bank: '', bsb: '', account: '' });

export function useBusinessPayment() {
  return businessPaymentStore.use();
}

export function updateBusinessPayment(changes: Partial<BusinessPayment>) {
  businessPaymentStore.set((prev) => ({ ...prev, ...changes }));
}
