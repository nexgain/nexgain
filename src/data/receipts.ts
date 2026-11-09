// Receipts: photos or PDFs of receipts, what the AI read from them, and the
// transaction each one belongs to (a bank transaction, or an expense the owner
// typed in). Files are kept in the private "business-files" storage bucket,
// which only the business owner can open. The Edge Function read-receipt reads
// a receipt and links it to its bank transaction; bank-sync tries again for
// unmatched receipts when new transactions come in.
import { functionError } from '@/data/connected-accounts';
import { businessStore } from '@/data/business';
import {
  bankSyncListeners,
  bankTransactionsStore,
  INCOME_CATEGORY,
  TRANSFERS_CATEGORY,
  type BankTransaction,
  type TransactionItem,
} from '@/data/bank';
import { WAGES_CATEGORY } from '@/data/finance';
import { createStore } from '@/data/store';
import { newId } from '@/lib/ids';
import { tidyReceiptPhoto, type Crop, type ReceiptFile } from '@/lib/receipt-capture';
import { supabase } from '@/lib/supabase';

/** Australia: a tax invoice is needed to claim the GST on purchases over $82.50 (incl. GST). */
export const GST_RECEIPT_THRESHOLD = 82.5;

/** Money out that never needs a receipt. */
const NO_RECEIPT_NEEDED = new Set([INCOME_CATEGORY, TRANSFERS_CATEGORY, WAGES_CATEGORY, 'Tax', 'Bank fees']);

export type ReceiptLineItem = { description: string; quantity: number | null; amount: number | null };

export type Receipt = {
  id: string;
  filePath: string;
  fileType: 'image' | 'pdf';
  /** reading: the AI is reading it. ready: read. failed: couldn't be read (type the details in). */
  status: 'reading' | 'ready' | 'failed';
  supplier: string | null;
  abn: string | null;
  /** "YYYY-MM-DD" */
  date: string | null;
  total: number | null;
  gst: number | null;
  lineItems: ReceiptLineItem[];
  category: string | null;
  bankTransactionId: string | null;
  expenseId: string | null;
  matchStatus: 'unmatched' | 'suggested' | 'matched';
  matchedBy: 'auto' | 'owner' | null;
  createdAt: string;
};

type ReceiptRow = {
  id: string;
  file_path: string;
  file_type: 'image' | 'pdf';
  status: Receipt['status'];
  supplier: string | null;
  abn: string | null;
  receipt_date: string | null;
  total: number | string | null;
  gst: number | string | null;
  line_items: ReceiptLineItem[] | null;
  category: string | null;
  bank_transaction_id: string | null;
  expense_id: string | null;
  match_status: Receipt['matchStatus'];
  matched_by: Receipt['matchedBy'];
  created_at: string;
};

const COLUMNS =
  'id, file_path, file_type, status, supplier, abn, receipt_date, total, gst, line_items, category, bank_transaction_id, expense_id, match_status, matched_by, created_at';

const num = (v: number | string | null) => (v === null ? null : Number(v));

const fromRow = (r: ReceiptRow): Receipt => ({
  id: r.id,
  filePath: r.file_path,
  fileType: r.file_type,
  status: r.status,
  supplier: r.supplier,
  abn: r.abn,
  date: r.receipt_date,
  total: num(r.total),
  gst: num(r.gst),
  lineItems: r.line_items ?? [],
  category: r.category,
  bankTransactionId: r.bank_transaction_id,
  expenseId: r.expense_id,
  matchStatus: r.match_status,
  matchedBy: r.matched_by,
  createdAt: r.created_at,
});

export const receiptsStore = createStore<Receipt[]>([]);
/** Why a receipt couldn't be read, by receipt id (shown on its page until it's read again). */
export const receiptErrorsStore = createStore<Record<string, string>>({});

export const useReceipts = () => receiptsStore.use();
export const useReceiptErrors = () => receiptErrorsStore.use();

export async function loadReceipts() {
  const { data, error } = await supabase.from('receipts').select(COLUMNS).order('created_at', { ascending: false }).limit(5000);
  if (error) throw error;
  receiptsStore.set((data as ReceiptRow[]).map(fromRow));
}

export function clearReceipts() {
  receiptsStore.set([]);
  receiptErrorsStore.set({});
}

// New bank transactions can match receipts that were waiting (done on the server): show the result.
bankSyncListeners.add(() => {
  loadReceipts().catch(() => {});
});

function setLocal(id: string, change: Partial<Receipt>) {
  receiptsStore.set((all) => all.map((r) => (r.id === id ? { ...r, ...change } : r)));
}

async function refreshOne(id: string) {
  const { data } = await supabase.from('receipts').select(COLUMNS).eq('id', id).maybeSingle<ReceiptRow>();
  if (data) {
    const fresh = fromRow(data);
    receiptsStore.set((all) => (all.some((r) => r.id === id) ? all.map((r) => (r.id === id ? fresh : r)) : [fresh, ...all]));
    return fresh;
  }
  return null;
}

/** The linked bank transaction's category may have been improved by the receipt. */
async function refreshTransaction(id: string | null) {
  if (!id) return;
  const { data } = await supabase.from('bank_transactions').select('category, category_source').eq('id', id).maybeSingle();
  if (data) {
    bankTransactionsStore.set((all) =>
      all.map((t) => (t.id === id ? { ...t, category: data.category, categorySource: data.category_source } : t)),
    );
  }
}

async function upload(file: ReceiptFile) {
  const businessId = businessStore.get()?.id;
  if (!businessId) throw new Error('Your business hasn’t loaded yet.');
  const body = await (await fetch(file.uri)).arrayBuffer();
  const path = `${businessId}/receipts/${Date.now()}-${newId().slice(0, 8)}.${file.kind === 'pdf' ? 'pdf' : 'jpg'}`;
  const { error } = await supabase.storage.from('business-files').upload(path, body, { contentType: file.mimeType });
  if (error) throw error;
  return { businessId, path };
}

const removeFile = (path: string) => {
  supabase.storage.from('business-files').remove([path]).catch(() => {});
};

export type ReceiptLink = { bankTransactionId: string } | { expenseId: string };

/**
 * Saves a new receipt (optionally for a transaction the owner picked), then has
 * the AI read it in the background. Returns the receipt's id straight away.
 */
export async function addReceipt(file: ReceiptFile, link?: ReceiptLink) {
  const { businessId, path } = await upload(file);
  const linked = link
    ? {
        bank_transaction_id: 'bankTransactionId' in link ? link.bankTransactionId : null,
        expense_id: 'expenseId' in link ? link.expenseId : null,
        match_status: 'matched',
        matched_by: 'owner',
      }
    : {};
  const { data, error } = await supabase
    .from('receipts')
    .insert({ business_id: businessId, file_path: path, file_type: file.kind, status: 'reading', ...linked })
    .select(COLUMNS)
    .single<ReceiptRow>();
  if (error) {
    removeFile(path);
    throw error;
  }
  const receipt = fromRow(data);
  receiptsStore.set((all) => [receipt, ...all]);
  readReceipt(receipt.id, file).catch(() => {});
  return receipt.id;
}

/**
 * Has the AI read (or re-read) a receipt. With the photo still on the phone,
 * it's then trimmed to the receipt and turned upright.
 */
export async function readReceipt(id: string, localFile?: ReceiptFile) {
  setLocal(id, { status: 'reading' });
  receiptErrorsStore.set((all) => {
    const next = { ...all };
    delete next[id];
    return next;
  });
  const { data, error } = await supabase.functions.invoke<{
    status: 'ready' | 'failed';
    message?: string;
    crop?: Crop | null;
    rotation?: number;
  }>('read-receipt', { body: { receiptId: id } });

  if (error || !data || data.status === 'failed') {
    const message = data?.message ?? (await functionError(error, 'Couldn’t read this receipt. Tap “Read again” to try again.')).message;
    receiptErrorsStore.set((all) => ({ ...all, [id]: message }));
    await refreshOne(id);
    if (receiptsStore.get().find((r) => r.id === id)?.status === 'reading') setLocal(id, { status: 'failed' });
    return;
  }

  if (localFile?.kind === 'image' && (data.crop || data.rotation)) {
    try {
      const tidy = await tidyReceiptPhoto(localFile.uri, data.crop ?? null, data.rotation ?? 0);
      if (tidy) await swapFile(id, tidy);
    } catch {
      // The original photo is kept; it was still read fine.
    }
  }
  const fresh = await refreshOne(id);
  await refreshTransaction(fresh?.bankTransactionId ?? null);
}

/** Puts a new file in place of the receipt's current one (without reading it again). */
async function swapFile(id: string, file: ReceiptFile) {
  const old = receiptsStore.get().find((r) => r.id === id);
  const { path } = await upload(file);
  const { error } = await supabase.from('receipts').update({ file_path: path, file_type: file.kind }).eq('id', id);
  if (error) {
    removeFile(path);
    throw error;
  }
  setLocal(id, { filePath: path, fileType: file.kind });
  if (old && old.filePath !== path) removeFile(old.filePath);
}

/** Replace: a new photo or PDF for the same receipt, read again by the AI. */
export async function replaceReceiptFile(id: string, file: ReceiptFile) {
  await swapFile(id, file);
  readReceipt(id, file).catch(() => {});
}

export type ReceiptEdits = Partial<Pick<Receipt, 'supplier' | 'abn' | 'date' | 'total' | 'gst' | 'category'>>;

/** The owner corrects what the AI read. Throws if it couldn't be saved. */
export async function updateReceipt(id: string, edits: ReceiptEdits) {
  const cols: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ('supplier' in edits) cols.supplier = edits.supplier;
  if ('abn' in edits) cols.abn = edits.abn;
  if ('date' in edits) cols.receipt_date = edits.date;
  if ('total' in edits) cols.total = edits.total;
  if ('gst' in edits) cols.gst = edits.gst;
  if ('category' in edits) cols.category = edits.category;
  // Typed in by hand: it now counts as read.
  const current = receiptsStore.get().find((r) => r.id === id);
  if (current?.status === 'failed') cols.status = 'ready';
  const { error } = await supabase.from('receipts').update(cols).eq('id', id);
  if (error) throw error;
  setLocal(id, { ...edits, ...(cols.status ? { status: 'ready' as const } : {}) });
  if ('category' in edits && current?.bankTransactionId) await applyCategory(current.bankTransactionId, edits.category ?? null);
}

/** Uses the receipt's category for the bank transaction, unless the owner chose one themselves. */
async function applyCategory(transactionId: string, category: string | null) {
  const txn = bankTransactionsStore.get().find((t) => t.id === transactionId);
  if (!txn || !category || txn.categorySource === 'owner' || txn.amount >= 0 || NO_RECEIPT_NEEDED.has(txn.category)) return;
  if (NO_RECEIPT_NEEDED.has(category) || txn.category === category) return;
  const { error } = await supabase.from('bank_transactions').update({ category }).eq('id', transactionId);
  if (!error) bankTransactionsStore.set((all) => all.map((t) => (t.id === transactionId ? { ...t, category } : t)));
}

/** The owner links the receipt to a transaction, or unlinks it (null). Throws if it couldn't be saved. */
export async function linkReceipt(id: string, link: ReceiptLink | null) {
  const cols = link
    ? {
        bank_transaction_id: 'bankTransactionId' in link ? link.bankTransactionId : null,
        expense_id: 'expenseId' in link ? link.expenseId : null,
        match_status: 'matched' as const,
        matched_by: 'owner' as const,
        suggestions: [],
      }
    : { bank_transaction_id: null, expense_id: null, match_status: 'unmatched' as const, matched_by: null, suggestions: [] };
  const { error } = await supabase.from('receipts').update({ ...cols, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
  setLocal(id, {
    bankTransactionId: cols.bank_transaction_id,
    expenseId: cols.expense_id,
    matchStatus: cols.match_status,
    matchedBy: cols.matched_by,
  });
  const receipt = receiptsStore.get().find((r) => r.id === id);
  if (receipt && cols.bank_transaction_id) await applyCategory(cols.bank_transaction_id, receipt.category);
}

export async function deleteReceipt(id: string) {
  const receipt = receiptsStore.get().find((r) => r.id === id);
  const { error } = await supabase.from('receipts').delete().eq('id', id);
  if (error) throw error;
  if (receipt) removeFile(receipt.filePath);
  receiptsStore.set((all) => all.filter((r) => r.id !== id));
}

/** A private link to view or download a receipt file (works for 10 minutes). */
export async function receiptFileUrl(path: string) {
  const { data, error } = await supabase.storage.from('business-files').createSignedUrl(path, 600);
  if (error) throw error;
  return data.signedUrl;
}

// ---------------------------------------------------------------------------
// Receipt status of transactions
// ---------------------------------------------------------------------------

export type ReceiptIndex = { byBank: Map<string, Receipt>; byExpense: Map<string, Receipt> };

export function indexReceipts(receipts: Receipt[]): ReceiptIndex {
  const byBank = new Map<string, Receipt>();
  const byExpense = new Map<string, Receipt>();
  for (const r of receipts) {
    if (r.bankTransactionId && !byBank.has(r.bankTransactionId)) byBank.set(r.bankTransactionId, r);
    if (r.expenseId && !byExpense.has(r.expenseId)) byExpense.set(r.expenseId, r);
  }
  return { byBank, byExpense };
}

/** The receipt attached to a transaction, if there is one. */
export function receiptFor(item: TransactionItem, index: ReceiptIndex) {
  if (item.bank) return index.byBank.get(item.bank.id) ?? null;
  if (item.expense) return index.byExpense.get(item.expense.id) ?? null;
  return null;
}

/** Money out that needs a receipt to claim its GST: over $82.50 and a purchase (not wages, tax, transfers...). */
export function needsReceipt(item: Pick<TransactionItem, 'amount' | 'category'>) {
  return item.amount < 0 && -item.amount > GST_RECEIPT_THRESHOLD && !NO_RECEIPT_NEEDED.has(item.category);
}

/**
 * attached: a receipt is saved for it. missing: it needs one and has none.
 * none: no receipt and none needed (small expense, income, transfer...).
 */
export function receiptStatus(item: TransactionItem, index: ReceiptIndex): 'attached' | 'missing' | 'none' {
  if (receiptFor(item, index) || item.expense?.receiptPath) return 'attached';
  return needsReceipt(item) ? 'missing' : 'none';
}

/** Receipts not linked to any transaction yet. */
export function unmatchedReceipts(receipts: Receipt[]) {
  return receipts.filter((r) => !r.bankTransactionId && !r.expenseId);
}

/**
 * Bank transactions the receipt could be, best first: same amount (money out),
 * date close to the receipt's, and no receipt yet.
 */
export function likelyTransactions(receipt: Receipt, txns: BankTransaction[], index: ReceiptIndex, limit = 3) {
  if (receipt.total === null) return [];
  const cents = Math.round(receipt.total * 100);
  const day = (key: string) => Date.parse(`${key}T00:00:00Z`) / 86_400_000;
  return txns
    .filter((t) => Math.round(-t.amount * 100) === cents && !index.byBank.has(t.id))
    .map((t) => {
      const days = receipt.date ? day(t.date) - day(receipt.date) : 0;
      return { txn: t, distance: days >= 0 ? days : -days * 2 };
    })
    .filter((c) => !receipt.date || c.distance <= 20)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit)
    .map((c) => c.txn);
}

/** The best name to show for a receipt. */
export function receiptTitle(r: Receipt) {
  if (r.supplier) return r.supplier;
  if (r.status === 'reading') return 'Reading receipt…';
  return 'Receipt';
}
