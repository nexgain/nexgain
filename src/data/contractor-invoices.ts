// Contractor invoices: contractors invoice the business owner instead of
// getting payslips. Stored online ("contractor_invoices" + items). The database
// only lets a contractor see their own invoices and an owner see their
// business's; other workers can't see any. Sending, approving, declining and
// marking paid all go through database functions, so steps can't be skipped.
import { localParts, todayKey } from '@/data/business-time';
import { createStore } from '@/data/store';
import { newId } from '@/lib/ids';
import { supabase } from '@/lib/supabase';

export type InvoiceStatus = 'draft' | 'sent' | 'approved' | 'declined' | 'paid';

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  approved: 'Approved',
  declined: 'Declined',
  paid: 'Paid',
};

export const GST_RATE = 0.1;

export type InvoiceItem = {
  id: string;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
};

export type ContractorInvoice = {
  id: string;
  businessId: string;
  employeeId: string;
  number: string;
  /** "YYYY-MM-DD" */
  invoiceDate: string;
  dueDate: string | null;
  status: InvoiceStatus;
  notes: string;
  gstRegistered: boolean;
  subtotal: number;
  gst: number;
  total: number;
  declineReason: string | null;
  sentAt: string | null;
  approvedAt: string | null;
  declinedAt: string | null;
  paidAt: string | null;
  /** The contractor's details as they were when it was sent (null for drafts). */
  sentDetails: { name: string; phone: string; email: string; abn: string; billTo: string } | null;
  bankLast4: string | null;
  createdAt: string;
  items: InvoiceItem[];
};

// The encrypted bank columns can't be read at all, so columns are listed by name.
const SELECT = `id, business_id, employee_id, number, invoice_date, due_date, status, notes, gst_registered, subtotal, gst,
  total, decline_reason, sent_at, approved_at, declined_at, paid_at, from_name, from_phone, from_email, from_abn,
  bill_to, bank_last4, created_at, contractor_invoice_items (id, position, description, quantity, rate, amount)`;

type Row = {
  id: string;
  business_id: string;
  employee_id: string;
  number: string;
  invoice_date: string;
  due_date: string | null;
  status: InvoiceStatus;
  notes: string;
  gst_registered: boolean;
  subtotal: number | string;
  gst: number | string;
  total: number | string;
  decline_reason: string | null;
  sent_at: string | null;
  approved_at: string | null;
  declined_at: string | null;
  paid_at: string | null;
  from_name: string | null;
  from_phone: string | null;
  from_email: string | null;
  from_abn: string | null;
  bill_to: string | null;
  bank_last4: string | null;
  created_at: string;
  contractor_invoice_items?: { id: string; position: number; description: string; quantity: number | string; rate: number | string; amount: number | string }[];
};

function fromRow(r: Row): ContractorInvoice {
  return {
    id: r.id,
    businessId: r.business_id,
    employeeId: r.employee_id,
    number: r.number,
    invoiceDate: r.invoice_date,
    dueDate: r.due_date,
    status: r.status,
    notes: r.notes,
    gstRegistered: r.gst_registered,
    subtotal: Number(r.subtotal),
    gst: Number(r.gst),
    total: Number(r.total),
    declineReason: r.decline_reason,
    sentAt: r.sent_at,
    approvedAt: r.approved_at,
    declinedAt: r.declined_at,
    paidAt: r.paid_at,
    sentDetails: r.sent_at
      ? { name: r.from_name ?? '', phone: r.from_phone ?? '', email: r.from_email ?? '', abn: r.from_abn ?? '', billTo: r.bill_to ?? '' }
      : null,
    bankLast4: r.bank_last4,
    createdAt: r.created_at,
    items: [...(r.contractor_invoice_items ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((i) => ({ id: i.id, description: i.description, quantity: Number(i.quantity), rate: Number(i.rate), amount: Number(i.amount) })),
  };
}

export const contractorInvoicesStore = createStore<ContractorInvoice[]>([]);

export function useContractorInvoices() {
  return contractorInvoicesStore.use();
}

/** The contractor's own invoices, or (for an owner) every invoice sent to their business. Newest first. */
export async function loadContractorInvoices() {
  const { data, error } = await supabase.from('contractor_invoices').select(SELECT).order('created_at', { ascending: false });
  if (error) throw error;
  contractorInvoicesStore.set((data as unknown as Row[]).map(fromRow));
}

async function reloadOne(id: string) {
  const { data, error } = await supabase.from('contractor_invoices').select(SELECT).eq('id', id).maybeSingle();
  if (error) throw error;
  contractorInvoicesStore.set((all) =>
    data ? all.map((i) => (i.id === id ? fromRow(data as unknown as Row) : i)) : all.filter((i) => i.id !== id),
  );
}

const round = (n: number) => Math.round(n * 100) / 100;

export function lineAmount(item: Pick<InvoiceItem, 'quantity' | 'rate'>) {
  return round((item.quantity || 0) * (item.rate || 0));
}

/** Subtotal, GST (10% only if GST registered) and total. */
export function invoiceTotals(items: Pick<InvoiceItem, 'quantity' | 'rate'>[], gstRegistered: boolean) {
  const subtotal = round(items.reduce((s, i) => s + lineAmount(i), 0));
  const gst = gstRegistered ? round(subtotal * GST_RATE) : 0;
  return { subtotal, gst, total: round(subtotal + gst) };
}

function addDays(key: string, days: number) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Starts a new draft (number given by the database). Returns its id. */
export async function createDraftInvoice(employeeId: string) {
  const today = todayKey();
  const { data, error } = await supabase
    .from('contractor_invoices')
    .insert({ employee_id: employeeId, invoice_date: today, due_date: addDays(today, 14) })
    .select(SELECT)
    .single();
  if (error) throw error;
  const invoice = fromRow(data as unknown as Row);
  contractorInvoicesStore.set((all) => [invoice, ...all]);
  return invoice.id;
}

export type DraftChanges = {
  invoiceDate: string;
  dueDate: string | null;
  notes: string;
  items: Omit<InvoiceItem, 'amount'>[];
};

/** Saves a draft (or a declined invoice being fixed, which goes back to Draft). */
export async function saveDraftInvoice(id: string, draft: DraftChanges) {
  const { error } = await supabase
    .from('contractor_invoices')
    .update({ invoice_date: draft.invoiceDate, due_date: draft.dueDate, notes: draft.notes.trim(), status: 'draft' })
    .eq('id', id);
  if (error) throw error;
  const del = await supabase.from('contractor_invoice_items').delete().eq('invoice_id', id);
  if (del.error) throw del.error;
  const rows = draft.items
    .filter((i) => i.description.trim() || i.quantity || i.rate)
    .map((i, position) => ({
      id: newId(),
      invoice_id: id,
      position,
      description: i.description.trim(),
      quantity: i.quantity || 0,
      rate: i.rate || 0,
      amount: lineAmount(i),
    }));
  if (rows.length > 0) {
    const ins = await supabase.from('contractor_invoice_items').insert(rows);
    if (ins.error) throw ins.error;
  }
  await reloadOne(id);
}

export async function deleteDraftInvoice(id: string) {
  const { error } = await supabase.from('contractor_invoices').delete().eq('id', id);
  if (error) throw error;
  contractorInvoicesStore.set((all) => all.filter((i) => i.id !== id));
}

/** Sends to the owner (the database checks the details and works out the totals). */
export async function sendInvoice(id: string) {
  const { error } = await supabase.rpc('send_contractor_invoice', { p_invoice_id: id });
  if (error) throw error;
  await reloadOne(id);
}

/** Owner: approve, decline (with a reason) or mark as paid. */
export async function setInvoiceStatus(id: string, status: 'approved' | 'declined' | 'paid', reason?: string) {
  const { error } = await supabase.rpc('set_contractor_invoice_status', { p_invoice_id: id, p_status: status, p_reason: reason ?? null });
  if (error) throw error;
  await reloadOne(id);
}

/** Bank details saved on a sent invoice (decrypted only for the contractor and their owner). */
export async function loadInvoiceBank(id: string) {
  const { data, error } = await supabase.rpc('get_contractor_invoice_bank', { p_invoice_id: id });
  if (error) throw error;
  const row = (data as { account_name: string | null; bsb: string | null; account_number: string | null }[])[0];
  return row ? { accountName: row.account_name ?? '', bsb: row.bsb ?? '', accountNumber: row.account_number ?? '' } : null;
}

export function clearContractorInvoices() {
  contractorInvoicesStore.set([]);
}

export type NewLine = Omit<InvoiceItem, 'id' | 'amount'>;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function dayLabel(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${WEEKDAYS[date.getDay()]} ${d} ${MONTHS[m - 1]}`;
}

/** One line per day worked (Brisbane days) between two dates, from clock in/out. */
export function linesFromClockedHours(
  sessions: { employeeId: string | null; start: Date; end: Date | null }[],
  employeeId: string,
  fromKey: string,
  toKey: string,
  rate: number,
): NewLine[] {
  const hoursByDay = new Map<string, number>();
  for (const s of sessions) {
    if (s.employeeId !== employeeId || !s.end) continue;
    let from = s.start.getTime();
    const to = s.end.getTime();
    while (from < to) {
      const day = localParts(new Date(from).toISOString()).date;
      // Midnight in Brisbane after `from`.
      const nextMidnight = new Date(`${addDays(day, 1)}T00:00:00+10:00`).getTime();
      const chunk = Math.min(to, nextMidnight) - from;
      if (day >= fromKey && day <= toKey) hoursByDay.set(day, (hoursByDay.get(day) ?? 0) + chunk / 3_600_000);
      from += chunk;
    }
  }
  return [...hoursByDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, hours]) => ({ description: `Work on ${dayLabel(day)}`, quantity: round(hours), rate }));
}

/** One line per completed job between two dates (hours from its scheduled times). */
export function linesFromCompletedJobs(
  jobs: { title: string; address: string; date: string; startsAt: string; endsAt: string; status: string }[],
  fromKey: string,
  toKey: string,
  rate: number,
): NewLine[] {
  return jobs
    .filter((j) => j.status === 'completed' && j.date >= fromKey && j.date <= toKey)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .map((j) => ({
      description: `${j.title}${j.address ? ` – ${j.address}` : ''} (${dayLabel(j.date)})`,
      quantity: round((new Date(j.endsAt).getTime() - new Date(j.startsAt).getTime()) / 3_600_000),
      rate,
    }));
}

/** Start of the financial year containing `date` (e.g. 1 July), as "YYYY-MM-DD". */
export function financialYearStart(date: Date, startMonth = 7) {
  const year = date.getMonth() + 1 >= startMonth ? date.getFullYear() : date.getFullYear() - 1;
  return `${year}-${String(startMonth).padStart(2, '0')}-01`;
}

/** The Brisbane date an invoice was paid, "YYYY-MM-DD". */
export function paidDateKey(invoice: ContractorInvoice) {
  return invoice.paidAt ? localParts(invoice.paidAt).date : null;
}
