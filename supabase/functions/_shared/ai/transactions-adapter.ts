// THE TRANSACTIONS DATA ADAPTER: the one and only place the AI reads bank
// transactions from. Both the free AI Assistant in the app and the daily
// health check on the server use what this returns.
//
// Right now there is no Transactions page, so this returns "not connected" and
// no transactions. The spending checks then skip quietly and the AI says
// "Your Transactions page isn't connected yet, so I can't see spending data."
//
// TO CONNECT IT (see TRANSACTIONS_AI_LINK.md in the project folder):
//   1. Set TRANSACTIONS_TABLE to the name of the new table (e.g. 'transactions').
//   2. If its columns are named differently, adjust COLUMNS / toTransaction().
//   3. Deploy the ai-insights function again (the app picks it up straight away).
import { toTransaction } from './transactions.ts';
import type { Transaction } from './types.ts';

/** The table the Transactions page saves to. null = not built yet. */
export const TRANSACTIONS_TABLE: string | null = null;

/** Columns read (see toTransaction() in transactions.ts for how they're used). */
const COLUMNS = 'id, date, amount, raw_merchant, merchant, category, job_id, description';

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
  const { data, error } = await (db.from(TRANSACTIONS_TABLE) as Query)
    .select(COLUMNS)
    .eq('business_id', businessId)
    .gte('date', since.toISOString().slice(0, 10))
    .order('date', { ascending: false })
    .limit(5000);
  if (error) {
    // Don't break the AI if the table isn't ready: behave as not connected.
    console.warn('Transactions could not be loaded:', error.message);
    return { connected: false, transactions: [] };
  }
  const transactions = (data ?? [])
    .map((row) => toTransaction(row as Record<string, unknown>))
    .filter((t): t is Transaction => t !== null);
  return { connected: true, transactions };
}
