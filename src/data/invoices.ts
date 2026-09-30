// Invoices and quotes created in the Owner section. Shown straight away, then
// saved online in the background ("sales_docs" table, business owner only).
// Paid invoices are the business's Revenue.
import { businessStore, GST_RATE } from '@/data/business';
import { createStore } from '@/data/store';
import { newId, warnSaveFailed } from '@/lib/ids';
import { supabase } from '@/lib/supabase';

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

export { GST_RATE };

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
    id = newId();
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
  scheduleSave(id!);
  return id!;
}

export function updateDoc(id: string, changes: Partial<Omit<SalesDoc, 'id' | 'kind' | 'number'>>) {
  docsStore.set((all) => all.map((d) => (d.id === id ? { ...d, ...changes } : d)));
  scheduleSave(id);
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
  pendingSaves.delete(id);
  supabase
    .from('sales_docs')
    .delete()
    .eq('id', id)
    .then(({ error }) => warnSaveFailed('invoice deletion', error));
}

// ---------------------------------------------------------------------------
// Saving online
// ---------------------------------------------------------------------------

type SalesDocRow = {
  id: string;
  business_id: string;
  kind: DocKind;
  number: string;
  status: DocStatus;
  client: Client;
  job_type: string | null;
  job_date: string | null;
  description: string;
  items: LineItem[];
  due_date: string | null;
  payment_reference: string;
  gst_rate: number | string;
  paid_at: string | null;
  receipt_status: ReceiptStatus | null;
  created_at: string;
};

const NO_CLIENT: Client = { name: '', phone: '', email: '', address: '' };

function fromRow(row: SalesDocRow): SalesDoc {
  return {
    id: row.id,
    kind: row.kind,
    number: row.number,
    status: row.status,
    client: { ...NO_CLIENT, ...row.client },
    jobType: row.job_type,
    jobDate: row.job_date,
    description: row.description,
    items: row.items ?? [],
    dueDate: row.due_date,
    paymentReference: row.payment_reference,
    gstRate: Number(row.gst_rate),
    createdAt: row.created_at,
    paidAt: row.paid_at,
    receiptStatus: row.receipt_status,
  };
}

function toRow(doc: SalesDoc, businessId: string): SalesDocRow {
  return {
    id: doc.id,
    business_id: businessId,
    kind: doc.kind,
    number: doc.number,
    status: doc.status,
    client: doc.client,
    job_type: doc.jobType,
    job_date: doc.jobDate,
    description: doc.description,
    items: doc.items,
    due_date: doc.dueDate,
    payment_reference: doc.paymentReference,
    gst_rate: doc.gstRate,
    paid_at: doc.paidAt ?? null,
    receipt_status: doc.receiptStatus ?? null,
    created_at: doc.createdAt,
  };
}

/** Loads the business's invoices and quotes (owner only). */
export async function loadDocs() {
  const { data, error } = await supabase.from('sales_docs').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  docsStore.set((data as SalesDocRow[]).map(fromRow));
}

// Changes are saved shortly after they stop, so a field edited letter by letter
// (e.g. the payment reference) doesn't send a request per keystroke.
const pendingSaves = new Set<string>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave(id: string) {
  pendingSaves.add(id);
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSaves, 600);
}

async function flushSaves() {
  const businessId = businessStore.get()?.id;
  const ids = [...pendingSaves];
  pendingSaves.clear();
  if (!businessId) return;
  const rows = docsStore
    .get()
    .filter((d) => ids.includes(d.id))
    .map((d) => toRow(d, businessId));
  if (rows.length === 0) return;
  const { error } = await supabase.from('sales_docs').upsert(rows);
  warnSaveFailed('invoices', error);
}

export function clearDocs() {
  pendingSaves.clear();
  if (saveTimer) clearTimeout(saveTimer);
  docsStore.set([]);
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
