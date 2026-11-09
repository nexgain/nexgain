// Matching receipts to bank transactions. Used by read-receipt (straight after
// the AI reads a receipt) and bank-sync (when new transactions come in).
//
// A receipt matches a bank transaction with exactly the same amount (money
// out) and a date close to the receipt's (banks usually show a purchase on
// the same day or a few days later). One clear match is linked automatically;
// several possible ones are saved as suggestions for the owner to pick.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

/** Categories a receipt never changes (they aren't purchases). */
const KEEP_CATEGORY = new Set(['Income', 'Transfers', 'Wages & super', 'Tax']);

const DAY = 24 * 60 * 60 * 1000;
const dateKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY);

export type ReceiptRow = {
  id: string;
  business_id: string;
  status: 'reading' | 'ready' | 'failed';
  receipt_date: string | null;
  total: number | string | null;
  category: string | null;
  bank_transaction_id: string | null;
  expense_id: string | null;
  match_status: 'unmatched' | 'suggested' | 'matched';
  matched_by: 'auto' | 'owner' | null;
};

export const RECEIPT_COLUMNS =
  'id, business_id, status, receipt_date, total, category, bank_transaction_id, expense_id, match_status, matched_by';

/** Uses the receipt's category for its bank transaction, unless the owner chose one themselves. */
export async function applyReceiptCategory(db: SupabaseClient, transactionId: string, category: string | null) {
  if (!category || KEEP_CATEGORY.has(category)) return;
  const { data: txn } = await db.from('bank_transactions').select('category, category_source, amount').eq('id', transactionId).maybeSingle();
  if (!txn || txn.category_source === 'owner' || Number(txn.amount) >= 0 || KEEP_CATEGORY.has(txn.category)) return;
  if (txn.category !== category) await db.from('bank_transactions').update({ category }).eq('id', transactionId);
}

/** Tries to find the receipt's bank transaction. Leaves receipts already linked alone. Returns true if it was linked. */
export async function matchReceipt(db: SupabaseClient, receipt: ReceiptRow): Promise<boolean> {
  if (receipt.match_status === 'matched' || receipt.bank_transaction_id || receipt.expense_id) return false;
  const total = receipt.total === null ? null : Number(receipt.total);
  if (total === null || !Number.isFinite(total) || total <= 0) return false;

  // From 3 days before the receipt to 10 days after (or the last 60 days if it had no date).
  const from = receipt.receipt_date ? dateKey(Date.parse(receipt.receipt_date) - 3 * DAY) : dateKey(Date.now() - 60 * DAY);
  const to = receipt.receipt_date ? dateKey(Date.parse(receipt.receipt_date) + 10 * DAY) : dateKey(Date.now() + DAY);
  const { data: found, error } = await db
    .from('bank_transactions')
    .select('id, date')
    .eq('business_id', receipt.business_id)
    .eq('amount', -Math.round(total * 100) / 100)
    .gte('date', from)
    .lte('date', to);
  if (error) throw error;

  // Leave out transactions that already have a receipt.
  const ids = (found ?? []).map((t) => t.id as string);
  const { data: taken } = ids.length
    ? await db.from('receipts').select('bank_transaction_id').in('bank_transaction_id', ids).neq('id', receipt.id)
    : { data: [] };
  const takenIds = new Set((taken ?? []).map((r) => r.bank_transaction_id as string));

  // Closest date first; a bank date before the receipt date counts as further away.
  const distance = (date: string) => {
    if (!receipt.receipt_date) return 0;
    const days = daysBetween(receipt.receipt_date, date);
    return days >= 0 ? days : -days * 2;
  };
  const candidates = (found ?? [])
    .filter((t) => !takenIds.has(t.id))
    .map((t) => ({ id: t.id as string, distance: distance(t.date as string) }))
    .sort((a, b) => a.distance - b.distance);

  const [best, next] = candidates;
  const clearWinner = best && best.distance <= 5 && (!next || next.distance - best.distance >= 3) && !!receipt.receipt_date;
  const update = clearWinner
    ? { bank_transaction_id: best.id, match_status: 'matched', matched_by: 'auto', suggestions: [] }
    : candidates.length > 0
      ? { match_status: 'suggested', suggestions: candidates.slice(0, 3).map((c) => c.id) }
      : { match_status: 'unmatched', suggestions: [] };
  const { error: saveError } = await db
    .from('receipts')
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq('id', receipt.id)
    .eq('match_status', receipt.match_status);
  if (saveError) throw saveError;
  if (clearWinner) await applyReceiptCategory(db, best.id, receipt.category);
  return !!clearWinner;
}

/** Tries again for every receipt still waiting for its bank transaction (new transactions just came in). */
export async function rematchReceipts(db: SupabaseClient, businessId: string) {
  const { data, error } = await db
    .from('receipts')
    .select(RECEIPT_COLUMNS)
    .eq('business_id', businessId)
    .eq('status', 'ready')
    .in('match_status', ['unmatched', 'suggested'])
    .is('bank_transaction_id', null)
    .is('expense_id', null)
    .limit(200);
  if (error) throw error;
  let matched = 0;
  for (const receipt of (data ?? []) as ReceiptRow[]) {
    if (await matchReceipt(db, receipt)) matched++;
  }
  return matched;
}
