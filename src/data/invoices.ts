// Invoices and quotes created in the Owner section. Shown straight away, then
// saved online in the background ("sales_docs" table, business owner only).
// Paid invoices are the business's Revenue.
import { businessStore, GST_RATE } from '@/data/business';
import { createStore } from '@/data/store';
import { newId, warnSaveFailed } from '@/lib/ids';
import { supabase } from '@/lib/supabase';

export type DocKind = 'invoice' | 'quote';

export const INVOICE_STATUSES = ['Draft', 'Pending', 'Paid', 'Overdue'] as const;
/**
 * "Accepted" / "Declined": the customer answered on their quote page (or the owner set it).
 * "Booked": the quote has been confirmed as a job (see Jobs). It can't be booked twice.
 */
export const QUOTE_STATUSES = ['Draft', 'Sent', 'Accepted', 'Booked', 'Declined'] as const;
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
  /** Stored status; Pending invoices past their due date show as Overdue. */
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
  /** Quotes: when the customer accepted or declined on their quote page. Set by the database only. */
  respondedAt?: string | null;
  /** Invoices converted from a quote: that quote's id. */
  sourceQuoteId?: string | null;
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
  source_quote_id?: string | null;
  created_at: string;
};

/** Read-only columns: set by the database (customer's answer), never saved from the phone. */
type SalesDocServerRow = SalesDocRow & { responded_at?: string | null };

const NO_CLIENT: Client = { name: '', phone: '', email: '', address: '' };

function fromRow(row: SalesDocServerRow): SalesDoc {
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
    respondedAt: row.responded_at ?? null,
    sourceQuoteId: row.source_quote_id ?? null,
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
    source_quote_id: doc.sourceQuoteId ?? null,
    created_at: doc.createdAt,
  };
}

/** Loads the business's invoices and quotes (owner only). */
export async function loadDocs() {
  const { data, error } = await supabase.from('sales_docs').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  docsStore.set((data as SalesDocServerRow[]).map(fromRow));
}

/**
 * A quote or invoice changed online (e.g. the customer accepted a quote, or a job
 * was booked). New ones are added; for ones already on screen, only the status and
 * customer answer are taken, so edits still being typed on this phone aren't undone.
 */
export function applyRemoteDoc(event: 'INSERT' | 'UPDATE' | 'DELETE', row: Partial<SalesDocServerRow>) {
  if (!row.id) return;
  if (event === 'DELETE') {
    docsStore.set((all) => all.filter((d) => d.id !== row.id));
    return;
  }
  const remote = fromRow(row as SalesDocServerRow);
  docsStore.set((all) => {
    const local = all.find((d) => d.id === remote.id);
    if (!local) return [remote, ...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return all.map((d) => (d.id === remote.id ? { ...d, status: remote.status, respondedAt: remote.respondedAt } : d));
  });
}

// Changes are saved shortly after they stop, so a field edited letter by letter
// (e.g. the payment reference) doesn't send a request per keystroke.
const pendingSaves = new Set<string>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;
/** Why the most recent save failed (empty if it worked). */
let lastSaveError = '';

function scheduleSave(id: string) {
  pendingSaves.add(id);
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSaves, 600);
}

/** Saves any changes waiting to go online now (e.g. before sending a quote's link). */
export async function saveDocsNow() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  return flushSaves();
}

async function flushSaves() {
  const businessId = businessStore.get()?.id;
  const ids = [...pendingSaves];
  pendingSaves.clear();
  if (!businessId) return false;
  const rows = docsStore
    .get()
    .filter((d) => ids.includes(d.id))
    .map((d) => toRow(d, businessId));
  if (rows.length === 0) return true;
  const { error } = await supabase.from('sales_docs').upsert(rows);
  warnSaveFailed('invoices', error);
  // Keep a failed save waiting, so the next save (or sending the quote) tries it again.
  if (error) ids.forEach((id) => pendingSaves.add(id));
  lastSaveError = error?.message ?? '';
  return !error;
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

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Status to show, accounting for invoice due dates that have passed. */
export function displayStatus(doc: Pick<SalesDoc, 'kind' | 'status' | 'dueDate'>, today = new Date()): DocStatus {
  const pastDue = !!doc.dueDate && doc.dueDate < dayKey(today);
  if (doc.kind === 'invoice' && doc.status === 'Pending' && pastDue) return 'Overdue';
  return doc.status;
}

/**
 * A sent quote whose "valid until" date has passed. It stays under Sent (shown with
 * an "Expired" tag) and the customer can still accept it; the owner decides.
 */
export function isQuoteExpired(doc: Pick<SalesDoc, 'kind' | 'status' | 'dueDate'>, today = new Date()) {
  return doc.kind === 'quote' && doc.status === 'Sent' && !!doc.dueDate && doc.dueDate < dayKey(today);
}

/** "Q-0001" -> "#0001", as printed on quotes and in email subjects. */
export function docNumberLabel(doc: Pick<SalesDoc, 'number'>) {
  return doc.number.replace(/^[A-Za-z]+-/, '#');
}

/**
 * The secret code in the customer's link for this quote (created the first time).
 * The quote is saved online first, since the link only works once it's there.
 */
export async function quoteLinkToken(id: string) {
  // Always save this quote again first, in case an earlier save didn't get through.
  pendingSaves.add(id);
  if (!(await saveDocsNow())) throw new Error(`The quote couldn't be saved online${lastSaveError ? ` (${lastSaveError})` : ''}.`);
  const { data, error } = await supabase.rpc('quote_share_token', { p_quote_id: id });
  if (error) throw new Error(`The quote's link couldn't be created (${error.message}).`);
  return data as string;
}

/**
 * After the owner sends a quote: it's Sent, and the customer can answer (again, if
 * it was declined and has been revised). Accepted and booked quotes stay as they are.
 */
export async function markQuoteSent(id: string) {
  docsStore.set((all) =>
    all.map((d) => (d.id === id && !['Accepted', 'Booked'].includes(d.status) ? { ...d, status: 'Sent', respondedAt: null } : d)),
  );
  const { error } = await supabase.rpc('mark_quote_sent', { p_quote_id: id });
  warnSaveFailed('quote status', error);
}

/** The invoice made from this quote, if it has been converted. */
export function invoiceForQuote(docs: SalesDoc[], quoteId: string) {
  return docs.find((d) => d.kind === 'invoice' && d.sourceQuoteId === quoteId);
}

/** Days customers have to pay an invoice converted from a quote. */
const INVOICE_DAYS = 14;

/** Makes a draft invoice with the quote's customer, job, items and GST. Returns its id. */
export function convertQuoteToInvoice(quote: SalesDoc) {
  const existing = invoiceForQuote(docsStore.get(), quote.id);
  if (existing) return existing.id;
  const due = new Date();
  due.setDate(due.getDate() + INVOICE_DAYS);
  return saveDoc({
    kind: 'invoice',
    status: 'Draft',
    client: { ...quote.client },
    jobType: quote.jobType,
    jobDate: quote.jobDate,
    description: quote.description,
    items: quote.items.map((item) => ({ ...item, id: newItemId() })),
    dueDate: dayKey(due),
    paymentReference: '',
    gstRate: quote.gstRate,
    sourceQuoteId: quote.id,
  });
}

/**
 * The business's own bank details, printed on invoices. Entered once (sign-up,
 * Business Profile or any invoice) and saved online ("business_bank_details", owner only).
 */
export type BusinessPayment = {
  bank: string;
  accountName: string;
  bsb: string;
  account: string;
};

const NO_PAYMENT: BusinessPayment = { bank: '', accountName: '', bsb: '', account: '' };

export const businessPaymentStore = createStore<BusinessPayment>(NO_PAYMENT);

export function useBusinessPayment() {
  return businessPaymentStore.use();
}

/** True once the details customers need to pay by bank transfer are filled in. */
export function hasBankDetails(p: BusinessPayment) {
  return !!(p.accountName.trim() && p.bsb.trim() && p.account.trim());
}

type BankRow = { bank_name: string; account_name: string; bsb: string; account_number: string };

export async function loadBusinessPayment() {
  const { data, error } = await supabase
    .from('business_bank_details')
    .select('bank_name, account_name, bsb, account_number')
    .maybeSingle<BankRow>();
  if (error) throw error;
  businessPaymentStore.set(
    data ? { bank: data.bank_name, accountName: data.account_name, bsb: data.bsb, account: data.account_number } : NO_PAYMENT,
  );
}

let paymentTimer: ReturnType<typeof setTimeout> | null = null;

/** Saves straight away on screen, and online shortly after typing stops. */
export function updateBusinessPayment(changes: Partial<BusinessPayment>) {
  businessPaymentStore.set((prev) => ({ ...prev, ...changes }));
  if (paymentTimer) clearTimeout(paymentTimer);
  paymentTimer = setTimeout(() => {
    paymentTimer = null;
    saveBusinessPayment().catch((e) => console.warn('Could not save bank details:', e.message));
  }, 700);
}

export async function saveBusinessPayment() {
  const businessId = businessStore.get()?.id;
  if (!businessId) return;
  const p = businessPaymentStore.get();
  const { error } = await supabase.from('business_bank_details').upsert({
    business_id: businessId,
    bank_name: p.bank.trim(),
    account_name: p.accountName.trim(),
    bsb: p.bsb.trim(),
    account_number: p.account.trim(),
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export function clearBusinessPayment() {
  if (paymentTimer) clearTimeout(paymentTimer);
  paymentTimer = null;
  businessPaymentStore.set(NO_PAYMENT);
}
