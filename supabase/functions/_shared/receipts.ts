// Matching receipts to bank transactions. Used by read-receipt (straight after
// the AI reads a receipt) and bank-sync (when new transactions come in).
//
// A receipt matches a bank transaction by what the AI read off it: the same
// amount (money out), a date close to the receipt's (banks usually show a
// purchase the same day or a few days later) and the supplier's name in the
// bank line. One clear match is linked automatically; several possible ones
// are saved as suggestions for the owner to pick. See pickReceiptMatch().
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { pickReceiptMatch, type MatchCandidate } from './receipt-match.ts';

export { pickReceiptMatch, sameSupplier, type MatchCandidate, type MatchPick } from './receipt-match.ts';

/** Categories a receipt never changes (they aren't purchases). */
const KEEP_CATEGORY = new Set(['Income', 'Transfers', 'Wages & super', 'Tax']);

const DAY = 24 * 60 * 60 * 1000;
const dateKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export type ReceiptRow = {
  id: string;
  business_id: string;
  status: 'reading' | 'ready' | 'failed';
  receipt_date: string | null;
  /** As the AI read it off the receipt, e.g. "Bunnings Warehouse". */
  supplier?: string | null;
  total: number | string | null;
  category: string | null;
  bank_transaction_id: string | null;
  expense_id: string | null;
  match_status: 'unmatched' | 'suggested' | 'matched';
  matched_by: 'auto' | 'owner' | null;
};

export const RECEIPT_COLUMNS =
  'id, business_id, status, receipt_date, supplier, total, category, bank_transaction_id, expense_id, match_status, matched_by';

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
  const cents = Math.round(total * 100) / 100;
  const { data: found, error } = await db
    .from('bank_transactions')
    .select('id, date, amount, merchant, description')
    .eq('business_id', receipt.business_id)
    // The receipt's total, up to 3% more (a card surcharge).
    .lte('amount', -cents)
    .gte('amount', -Math.round(cents * 1.03 * 100) / 100)
    .gte('date', from)
    .lte('date', to);
  if (error) throw error;

  // Leave out transactions that already have a receipt.
  const ids = (found ?? []).map((t) => t.id as string);
  const { data: taken } = ids.length
    ? await db.from('receipts').select('bank_transaction_id').in('bank_transaction_id', ids).neq('id', receipt.id)
    : { data: [] };
  const takenIds = new Set((taken ?? []).map((r) => r.bank_transaction_id as string));
  const candidates: MatchCandidate[] = (found ?? [])
    .filter((t) => !takenIds.has(t.id))
    .map((t) => ({ id: t.id, date: t.date, amount: Number(t.amount), merchant: t.merchant ?? null, description: t.description ?? null }));

  const pick = pickReceiptMatch({ total: cents, date: receipt.receipt_date, supplier: receipt.supplier ?? null }, candidates);
  const update =
    pick.kind === 'match'
      ? { bank_transaction_id: pick.id, match_status: 'matched', matched_by: 'auto', suggestions: [] }
      : pick.kind === 'suggest'
        ? { match_status: 'suggested', suggestions: pick.ids }
        : { match_status: 'unmatched', suggestions: [] };
  const { error: saveError } = await db
    .from('receipts')
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq('id', receipt.id)
    .eq('match_status', receipt.match_status);
  if (saveError) throw saveError;
  if (pick.kind === 'match') await applyReceiptCategory(db, pick.id, receipt.category);
  return pick.kind === 'match';
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
