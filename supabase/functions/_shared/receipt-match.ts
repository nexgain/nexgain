// Picking the bank transaction for a receipt, from what the AI read off it
// (total, date, supplier). Pure code with no imports, so the app's tests can
// use it too; receipts.ts does the database side.

const DAY = 24 * 60 * 60 * 1000;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY);

export type MatchCandidate = { id: string; date: string; amount: number; merchant: string | null; description: string | null };
export type MatchPick = { kind: 'match'; id: string } | { kind: 'suggest'; ids: string[] } | { kind: 'none' };

/** Words that don't identify a supplier ("Bunnings Warehouse Pty Ltd" -> bunnings, warehouse). */
const NOT_A_NAME = new Set(['pty', 'ltd', 'limited', 'the', 'and', 'store', 'stores', 'shop', 'australia', 'aust', 'group', 'co', 'inc', 'trading', 'services', 'tax', 'invoice', 'receipt']);
const nameWords = (text: string | null | undefined) =>
  (text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !/^\d+$/.test(w) && !NOT_A_NAME.has(w));

/** The receipt's supplier appears in the bank line, e.g. "Bunnings Warehouse" in "BUNNINGS 6342 CAPALABA". */
export function sameSupplier(supplier: string | null, t: Pick<MatchCandidate, 'merchant' | 'description'>) {
  const words = nameWords(supplier);
  if (words.length === 0) return false;
  const bank = new Set(nameWords(`${t.merchant ?? ''} ${t.description ?? ''}`));
  return words.some((w) => bank.has(w) || [...bank].some((b) => b.length >= 5 && w.length >= 5 && (b.startsWith(w) || w.startsWith(b))));
}

/**
 * Picks the bank transaction for a receipt, using what the AI read off it: the
 * total, the date and the supplier.
 * - Same amount, close date, and clearly the best: matched.
 * - The supplier's name in the bank line breaks ties (two $50 purchases the
 *   same day), allows a card surcharge (up to 3% more), and allows a receipt
 *   with no date when only one purchase fits.
 * - Otherwise the closest ones are suggested for the owner to pick.
 */
export function pickReceiptMatch(receipt: { total: number; date: string | null; supplier: string | null }, candidates: MatchCandidate[]): MatchPick {
  const spent = (t: MatchCandidate) => -t.amount;
  const scored = candidates
    .filter((t) => spent(t) >= receipt.total - 0.005 && spent(t) <= receipt.total * 1.03 + 0.005)
    .map((t) => {
      const exact = Math.abs(spent(t) - receipt.total) < 0.005;
      const supplier = sameSupplier(receipt.supplier, t);
      const days = receipt.date ? daysBetween(receipt.date, t.date) : null;
      // A bank date before the receipt date counts as further away.
      const distance = days === null ? 0 : days >= 0 ? days : -days * 2;
      const score = (exact ? 4 : 0) + (supplier ? 3 : 0) - distance * 0.5;
      return { id: t.id, exact, supplier, distance, score };
    })
    // A different amount is only a surcharge when the supplier's name matches.
    .filter((c) => c.exact || c.supplier)
    .sort((a, b) => b.score - a.score);

  const [best, next] = scored;
  if (!best) return { kind: 'none' };
  const close = receipt.date ? best.distance <= 5 : true;
  const clearlyBest = !next || best.score - next.score >= 1.5;
  const confident =
    close &&
    clearlyBest &&
    // With a date: exact amount, or the supplier matches. Without one: exact amount and the supplier matches.
    (receipt.date ? best.exact || best.supplier : best.exact && best.supplier);
  return confident ? { kind: 'match', id: best.id } : { kind: 'suggest', ids: scored.slice(0, 3).map((c) => c.id) };
}
