// Shared by the bank Edge Functions (bank-connect, bank-callback, bank-sync,
// bank-disconnect).
//
// A "bank provider" is a bank-data company that connects to the owner's bank
// with their permission (open banking / CDR) and hands NexGain their accounts
// and transactions. NexGain never sees or stores bank login details.
//   - basiq: Australian banks (supabase/functions/_shared/basiq.ts).
//   - saltedge: overseas banks, not built yet. To add it, write saltedge.ts with
//     the same functions as basiq.ts, add it to BANK_PROVIDERS below, and pick
//     it in providerFor() (e.g. by the business's country).
//
// Secrets (Supabase > Edge Functions > Secrets):
//   BASIQ_API_KEY (from dashboard.basiq.io > your application > API Keys).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { basiq } from './basiq.ts';

export type BankProviderId = 'basiq' | 'saltedge';

export type BankAccountInfo = {
  externalId: string;
  name: string;
  institution: string;
  maskedNumber: string;
  balance: number | null;
  currency: string;
};

export type BankTxn = {
  externalId: string;
  accountExternalId: string;
  /** "YYYY-MM-DD" */
  date: string;
  description: string;
  /** Money in positive, money out negative. */
  amount: number;
  merchant: string | null;
  /** Words the bank / provider used to describe the kind of spending (for categories). */
  bankCategory: string | null;
  /** The provider's own type, e.g. "transfer", "bank-fee". */
  bankClass: string | null;
};

/** Where the bank's data fetching has got to. */
export type JobsState = { state: 'running' } | { state: 'done' } | { state: 'failed'; message: string };

export type BankProvider = {
  name: string;
  /** Its secrets have been added in Supabase. */
  isSetUp: () => boolean;
  /** Creates our customer at the provider. Returns its id. */
  createCustomer: (owner: { email: string }) => Promise<string>;
  /** The page where the owner picks their bank and allows NexGain to see it. */
  consentUrl: (customerId: string, state: string, options: { addAnother: boolean }) => Promise<string>;
  /** Asks the provider to fetch the latest from the bank. Returns job ids to wait for. */
  refresh: (customerId: string) => Promise<string[]>;
  jobsState: (jobIds: string[]) => Promise<JobsState>;
  accounts: (customerId: string) => Promise<BankAccountInfo[]>;
  /** Cleared (not pending) transactions on or after `since` ("YYYY-MM-DD"). */
  transactions: (customerId: string, since: string) => Promise<BankTxn[]>;
  /** Removes our customer and all their bank data at the provider (ends the consent). */
  deleteCustomer: (customerId: string) => Promise<void>;
};

export const BANK_PROVIDERS: Partial<Record<BankProviderId, BankProvider>> = { basiq };

/** Which bank-data company a business uses. Australia: Basiq. (Salt Edge later for other countries.) */
export function providerFor(): BankProviderId {
  return 'basiq';
}

export type ConnectionRow = {
  id: string;
  business_id: string;
  provider: BankProviderId;
  external_user_id: string;
  status: 'pending' | 'active';
  pending_job_ids: string[];
  last_synced_at: string | null;
};

export const CONNECTION_COLUMNS = 'id, business_id, provider, external_user_id, status, pending_job_ids, last_synced_at';

/** The signed-in owner's business (id and login email), or null if they aren't a business owner. */
export async function ownerBusiness(req: Request, db: SupabaseClient) {
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!jwt) return null;
  const { data: auth } = await db.auth.getUser(jwt);
  if (!auth.user) return null;
  const { data } = await db
    .from('businesses')
    .select('id, owner_email')
    .eq('owner_id', auth.user.id)
    .limit(1)
    .maybeSingle<{ id: string; owner_email: string }>();
  if (!data) return null;
  return { id: data.id, email: data.owner_email || auth.user.email || '' };
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

// Must match the names in the app (src/data/bank.ts and EXPENSE_CATEGORIES in src/data/finance.ts).
type Category =
  | 'Income'
  | 'Transfers'
  | 'Fuel'
  | 'Materials & supplies'
  | 'Equipment & tools'
  | 'Vehicle'
  | 'Rent'
  | 'Utilities'
  | 'Insurance'
  | 'Phone & internet'
  | 'Software & subscriptions'
  | 'Advertising'
  | 'Wages & super'
  | 'Bank fees'
  | 'Tax'
  | 'Other';

// Checked in order: the first match wins (so "google ads" is Advertising, not Software).
const RULES: [Category, RegExp][] = [
  ['Tax', /\b(ato|australian taxation|tax office|bas payment)\b/],
  ['Wages & super', /\b(wages?|salary|payroll|superannuation|super fund|clearing house|australiansuper|rest super|hostplus|cbus)\b/],
  ['Advertising', /\b(google\s*\*?\s*ads|facebk|facebook|meta ads|instagram|hipages|airtasker|oneflare|service seeking|yellow pages|advertis\w*|marketing)\b/],
  [
    'Fuel',
    /\b(fuel|petrol|diesel|service station|bp|shell|caltex|ampol|7-eleven|7 eleven|united petroleum|puma energy|metro petroleum|liberty oil|mobil|eg fuel|on the run|otr)\b/,
  ],
  [
    'Materials & supplies',
    /\b(bunnings|mitre 10|home timber|hardware|timber|reece|tradelink|middys|rexel|lawrence and hanson|l&h|beacon lighting|plumbing|electrical wholesal\w*|building supplies|bowens|dulux|taubmans|paint|concrete|cement|boral|officeworks|supplies|materials)\b/,
  ],
  ['Equipment & tools', /\b(total tools|sydney tools|tools?|kennards|coates|equipment|machinery)\b/],
  [
    'Vehicle',
    /\b(rego|registration|service nsw|vicroads|tmr|mechanic|tyres?|tyrepower|bob jane|repco|supercheap|autobarn|car wash|linkt|e-?toll|tolls?|parking|wilson parking|secure parking|motor vehicle|automotive)\b/,
  ],
  ['Insurance', /\b(insurance|insure|nrma|allianz|suncorp|qbe|aami|gio|racv|racq|budget direct|youi|cgu|zurich)\b/],
  ['Phone & internet', /\b(telstra|optus|vodafone|tpg|aussie broadband|belong|iinet|dodo|amaysim|boost mobile|internet|broadband|nbn)\b/],
  [
    'Utilities',
    /\b(agl|origin energy|energyaustralia|energy australia|red energy|alinta|simply energy|electricity|power|gas|water|sydney water|yarra valley water|council rates)\b/,
  ],
  ['Rent', /\b(rent|rental|lease|real estate|property management)\b/],
  [
    'Software & subscriptions',
    /\b(xero|myob|quickbooks|adobe|microsoft|google|apple\.com|dropbox|canva|zoom|slack|software|subscription|app store|itunes)\b/,
  ],
  ['Bank fees', /\b(account fee|monthly fee|bank fee|merchant fee|dishonour fee|overdrawn fee|international transaction fee|fee)\b/],
];

/** NexGain's category for a bank transaction, from its description, merchant and the bank's own labels. */
export function categorise(txn: Pick<BankTxn, 'amount' | 'description' | 'merchant' | 'bankCategory' | 'bankClass'>): Category {
  if (txn.bankClass === 'transfer') return 'Transfers';
  if (txn.amount > 0) return 'Income';
  if (txn.bankClass === 'bank-fee') return 'Bank fees';
  const text = [txn.merchant, txn.description, txn.bankCategory].filter(Boolean).join(' ').toLowerCase();
  for (const [category, pattern] of RULES) if (pattern.test(text)) return category;
  return 'Other';
}

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------

const DAY = 24 * 60 * 60 * 1000;
const dateKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Copies the latest accounts and transactions from the provider into NexGain.
 * First time: the last 12 months. After that: from 2 weeks before the last sync
 * (banks can take a few days to clear a transaction). Transactions already saved
 * are left alone, so a category the owner chose is never changed.
 */
export async function saveLatest(db: SupabaseClient, provider: BankProvider, connection: ConnectionRow) {
  const accounts = await provider.accounts(connection.external_user_id);
  const now = new Date().toISOString();
  const { data: savedAccounts, error: accountError } = await db
    .from('bank_accounts')
    .upsert(
      accounts.map((a) => ({
        business_id: connection.business_id,
        connection_id: connection.id,
        external_id: a.externalId,
        name: a.name,
        institution: a.institution,
        masked_number: a.maskedNumber,
        balance: a.balance,
        currency: a.currency,
        updated_at: now,
      })),
      { onConflict: 'connection_id,external_id' },
    )
    .select('id, external_id');
  if (accountError) throw accountError;
  const accountIds = new Map((savedAccounts ?? []).map((a) => [a.external_id as string, a.id as string]));

  const since = connection.last_synced_at
    ? dateKey(new Date(connection.last_synced_at).getTime() - 14 * DAY)
    : dateKey(Date.now() - 365 * DAY);
  const txns = await provider.transactions(connection.external_user_id, since);
  const rows = txns
    .filter((t) => accountIds.has(t.accountExternalId))
    .map((t) => ({
      business_id: connection.business_id,
      account_id: accountIds.get(t.accountExternalId)!,
      external_id: t.externalId,
      date: t.date,
      description: t.description,
      amount: t.amount,
      merchant: t.merchant,
      bank_category: t.bankCategory,
      category: categorise(t),
    }));

  let added = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const { data, error } = await db
      .from('bank_transactions')
      .upsert(rows.slice(i, i + 500), { onConflict: 'account_id,external_id', ignoreDuplicates: true })
      .select('id');
    if (error) throw error;
    added += data?.length ?? 0;
  }

  await db.from('bank_connections').update({ status: 'active', pending_job_ids: [], last_synced_at: now }).eq('id', connection.id);
  return { accounts: accounts.length, added };
}
