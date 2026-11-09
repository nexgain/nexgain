// THE TRANSACTIONS DATA ADAPTER: the one and only place the AI reads bank
// transactions from. Both the free AI Assistant in the app and the daily
// health check on the server use what this returns.
//
// It reads the Transactions page's bank feed (bank_transactions, filled by the
// bank connection and sorted by src/data/money-sorting.ts). Only spending is
// passed on: money in and transfers between the owner's own accounts are left
// out, and amounts are turned positive ("money spent is positive").
//
// With no bank connected there are no rows, so the spending checks skip quietly
// and the AI says it can't see spending data yet.
import { toTransaction } from './transactions.ts';
import type { Transaction } from './types.ts';

/** The table the Transactions page saves to. null = not built yet. */
export const TRANSACTIONS_TABLE: string | null = 'bank_transactions';

/** Columns read (see toTransaction() in transactions.ts for how they're used). */
const COLUMNS = 'id, date, amount, merchant, category, job_id, description';
/** Before the AI sorting database file (job links) has been run. */
const BASIC_COLUMNS = 'id, date, amount, merchant, category, description';

/** Not spending: left out. */
const NOT_SPENDING = new Set(['Income', 'Transfers']);

/** How far back the AI looks (enough for "this financial year" and month-on-month trends). */
const MONTHS_BACK = 18;

export type TransactionsResult = { connected: boolean; transactions: Transaction[] };

/**
 * The parts of a Supabase client this uses. Both the app's client and the
 * server's client fit, so the same code runs in both places.
 */
type Query = {
  select(columns: string): Query;
  eq(column: string, value: string): Query;
  gte(column: string, value: string): Query;
  order(column: string, options: { ascending: boolean }): Query;
  limit(count: number): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
};
type Db = { from(table: string): unknown };

/**
 * One business's transactions. `db` is the signed-in owner's client (so
 * database security applies) or, for the daily check, the server client;
 * either way it's filtered to this business only.
 */
export async function loadTransactions(db: Db, businessId: string): Promise<TransactionsResult> {
  if (!TRANSACTIONS_TABLE) return { connected: false, transactions: [] };

  const since = new Date();
  since.setMonth(since.getMonth() - MONTHS_BACK);
  const read = (columns: string) =>
    (db.from(TRANSACTIONS_TABLE!) as Query)
      .select(columns)
      .eq('business_id', businessId)
      .gte('date', since.toISOString().slice(0, 10))
      .order('date', { ascending: false })
      .limit(5000);
  let { data, error } = await read(COLUMNS);
  if (error) ({ data, error } = await read(BASIC_COLUMNS));
  if (error) {
    // Don't break the AI if the table isn't ready: behave as not connected.
    console.warn('Transactions could not be loaded:', error.message);
    return { connected: false, transactions: [] };
  }
  const rows = (data ?? []) as Record<string, unknown>[];
  const transactions = rows
    .filter((row) => Number(row.amount) < 0 && !NOT_SPENDING.has(String(row.category)))
    // The bank feed has money out as negative; the AI counts spending as positive.
    .map((row) => toTransaction({ ...row, amount: -Number(row.amount) }))
    .filter((t): t is Transaction => t !== null);
  // Connected once the bank has sent anything at all.
  return { connected: rows.length > 0, transactions };
}
