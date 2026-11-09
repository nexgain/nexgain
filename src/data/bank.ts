// The owner's business bank connection, accounts and transactions (Basiq for
// Australian banks). Connecting opens the bank-data company's page inside the
// app, where the owner picks their bank and allows NexGain to see it. NexGain
// never sees or stores bank login details. The Edge Functions bank-connect,
// bank-callback, bank-sync and bank-disconnect do the rest; the app only reads.
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { functionError, takeOAuthReturn } from '@/data/connected-accounts';
import { EXPENSE_CATEGORIES, WAGES_CATEGORY, type Expense } from '@/data/finance';
import { fromDateKey } from '@/data/shifts';
import { createStore } from '@/data/store';
import { supabase } from '@/lib/supabase';

export type BankConnection = {
  provider: 'basiq' | 'saltedge';
  /** pending: the bank login wasn't finished. active: connected. */
  status: 'pending' | 'active';
  lastSyncedAt: string | null;
  connectedAt: string;
};

export type BankAccount = {
  id: string;
  name: string;
  institution: string;
  /** e.g. "•••• 4321" */
  maskedNumber: string;
  balance: number | null;
  currency: string;
};

export type BankTransaction = {
  id: string;
  accountId: string;
  /** "YYYY-MM-DD" */
  date: string;
  description: string;
  /** Money in positive, money out negative. */
  amount: number;
  merchant: string | null;
  category: string;
  categorySource: 'auto' | 'owner';
};

export const INCOME_CATEGORY = 'Income';
export const TRANSFERS_CATEGORY = 'Transfers';

/** Every category a transaction can have, in the order they're offered. Matches supabase/functions/_shared/banks.ts. */
export const TRANSACTION_CATEGORIES: string[] = [
  INCOME_CATEGORY,
  ...EXPENSE_CATEGORIES.filter((c) => c !== 'Other'),
  WAGES_CATEGORY,
  'Bank fees',
  'Tax',
  TRANSFERS_CATEGORY,
  'Other',
];

export const bankConnectionStore = createStore<BankConnection | null>(null);
export const bankAccountsStore = createStore<BankAccount[]>([]);
export const bankTransactionsStore = createStore<BankTransaction[]>([]);
/** True while the latest transactions are being fetched from the bank. */
export const bankSyncingStore = createStore(false);
/** Run after new bank transactions come in (e.g. receipts reload, as some may now be matched). */
export const bankSyncListeners = new Set<() => void>();

export const useBankConnection = () => bankConnectionStore.use();
export const useBankAccounts = () => bankAccountsStore.use();
export const useBankTransactions = () => bankTransactionsStore.use();
export const useBankSyncing = () => bankSyncingStore.use();

/** Connected and finished (not just started). */
export const isBankConnected = (c: BankConnection | null) => c?.status === 'active';

type ConnectionRow = { provider: BankConnection['provider']; status: BankConnection['status']; last_synced_at: string | null; created_at: string };
type AccountRow = { id: string; name: string; institution: string; masked_number: string; balance: number | string | null; currency: string };
type TxnRow = {
  id: string;
  account_id: string;
  date: string;
  description: string;
  amount: number | string;
  merchant: string | null;
  category: string;
  category_source: 'auto' | 'owner';
};

const TXN_COLUMNS = 'id, account_id, date, description, amount, merchant, category, category_source';

const txnFromRow = (r: TxnRow): BankTransaction => ({
  id: r.id,
  accountId: r.account_id,
  date: r.date,
  description: r.description,
  amount: Number(r.amount),
  merchant: r.merchant,
  category: r.category,
  categorySource: r.category_source,
});

/** Loads the connection, accounts and transactions saved in NexGain. */
export async function loadBank() {
  const { data: connection, error } = await supabase.from('my_bank_connection').select('*').maybeSingle<ConnectionRow>();
  if (error) throw error;
  if (!connection) {
    clearBank();
    return;
  }
  bankConnectionStore.set({
    provider: connection.provider,
    status: connection.status,
    lastSyncedAt: connection.last_synced_at,
    connectedAt: connection.created_at,
  });

  const { data: accounts, error: accountError } = await supabase
    .from('bank_accounts')
    .select('id, name, institution, masked_number, balance, currency')
    .order('name');
  if (accountError) throw accountError;
  bankAccountsStore.set(
    (accounts as AccountRow[]).map((a) => ({
      id: a.id,
      name: a.name,
      institution: a.institution,
      maskedNumber: a.masked_number,
      balance: a.balance === null ? null : Number(a.balance),
      currency: a.currency,
    })),
  );

  // The database hands back at most 1,000 rows at a time, so read in pages.
  const all: BankTransaction[] = [];
  for (let from = 0; from < 20_000; from += 1000) {
    const { data, error: txnError } = await supabase
      .from('bank_transactions')
      .select(TXN_COLUMNS)
      .order('date', { ascending: false })
      .order('id')
      .range(from, from + 999);
    if (txnError) throw txnError;
    all.push(...(data as TxnRow[]).map(txnFromRow));
    if (data.length < 1000) break;
  }
  bankTransactionsStore.set(all);
}

export function clearBank() {
  bankConnectionStore.set(null);
  bankAccountsStore.set([]);
  bankTransactionsStore.set([]);
}

export type BankConnectResult = { status: 'connected' } | { status: 'cancelled' } | { status: 'error'; message: string };

/** Opens the bank login inside the app. Once the owner has allowed access, brings in their transactions. */
export async function connectBank(): Promise<BankConnectResult> {
  const redirect = Linking.createURL('oauth-return');
  const { data, error } = await supabase.functions.invoke<{ url: string }>('bank-connect', { body: { redirect } });
  if (error || !data?.url) {
    const failure = await functionError(error, 'Couldn’t open the bank login. Please try again.');
    return { status: 'error', message: failure.message };
  }

  const startedAt = Date.now();
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirect);
  let status: string | undefined;
  let message: string | undefined;
  if (result.type === 'success') {
    const { queryParams } = Linking.parse(result.url);
    status = typeof queryParams?.status === 'string' ? queryParams.status : undefined;
    message = typeof queryParams?.message === 'string' ? queryParams.message : undefined;
  } else {
    // Finished in another browser (the link came back to the app), or just closed.
    const params = takeOAuthReturn(startedAt);
    status = params?.status;
    message = params?.message;
  }

  await loadBank().catch(() => {});
  if (status === 'error') return { status: 'error', message: message || 'Couldn’t connect your bank. Please try again.' };
  if (status === 'cancelled') return { status: 'cancelled' };
  // Closed without an answer: it may still have connected, so go by what the server says.
  if (status !== 'connected' && !isBankConnected(bankConnectionStore.get())) return { status: 'cancelled' };

  const synced = await syncBank();
  return synced.ok ? { status: 'connected' } : { status: 'error', message: synced.message };
}

let syncing: Promise<{ ok: true; added: number } | { ok: false; message: string }> | null = null;

/**
 * Brings the latest bank transactions into NexGain. `refresh` asks the bank for
 * brand-new data first (the Sync button); it can take up to a minute or two.
 */
export function syncBank({ refresh = false } = {}) {
  if (!syncing) {
    bankSyncingStore.set(true);
    syncing = runSync(refresh).finally(() => {
      syncing = null;
      bankSyncingStore.set(false);
    });
  }
  return syncing;
}

async function runSync(refresh: boolean): Promise<{ ok: true; added: number } | { ok: false; message: string }> {
  // The server waits up to 45 seconds a time for the bank; keep asking for a few minutes.
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, error } = await supabase.functions.invoke<{ status: 'synced' | 'still_loading'; added?: number }>('bank-sync', {
      body: { refresh: refresh && attempt === 0 },
    });
    if (error || !data) {
      const failure = await functionError(error, 'Couldn’t get your bank transactions. Please try again.');
      if (failure.code === 'not_connected') await loadBank().catch(() => {});
      return { ok: false, message: failure.message };
    }
    if (data.status === 'synced') {
      await loadBank().catch(() => {});
      bankSyncListeners.forEach((listener) => listener());
      return { ok: true, added: data.added ?? 0 };
    }
  }
  return { ok: false, message: 'Your bank is still sending your transactions. Check back in a few minutes.' };
}

const SIX_HOURS = 6 * 60 * 60 * 1000;

/** Gets the latest from the bank in the background if it's been a while (opening Transactions). */
export function syncBankIfStale() {
  const connection = bankConnectionStore.get();
  if (!isBankConnected(connection)) return;
  const last = connection?.lastSyncedAt ? Date.parse(connection.lastSyncedAt) : 0;
  if (Date.now() - last > SIX_HOURS) syncBank({ refresh: true }).catch(() => {});
}

/** Disconnects the bank. Its accounts and transactions are removed from NexGain. Returns an error message if it failed. */
export async function disconnectBank(): Promise<string | null> {
  const { error } = await supabase.functions.invoke('bank-disconnect', { body: {} });
  if (error) return (await functionError(error, 'Couldn’t disconnect your bank. Please try again.')).message;
  clearBank();
  return null;
}

/** The owner picks a different category for a bank transaction. Throws if it couldn't be saved. */
export async function setTransactionCategory(id: string, category: string) {
  const before = bankTransactionsStore.get();
  bankTransactionsStore.set((all) => all.map((t) => (t.id === id ? { ...t, category, categorySource: 'owner' } : t)));
  const { error } = await supabase.from('bank_transactions').update({ category, category_source: 'owner' }).eq('id', id);
  if (error) {
    bankTransactionsStore.set(before);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// One list for the Transactions tab: bank transactions plus expenses the owner typed in
// ---------------------------------------------------------------------------

export type TransactionItem = {
  id: string;
  date: Date;
  /** Money in positive, money out negative. */
  amount: number;
  title: string;
  subtitle: string;
  category: string;
  source: 'bank' | 'expense';
  bank?: BankTransaction;
  expense?: Expense;
};

export function transactionItems(txns: BankTransaction[], accounts: BankAccount[], expenses: Expense[]): TransactionItem[] {
  const accountName = new Map(accounts.map((a) => [a.id, [a.institution, a.name].filter(Boolean).join(' ')]));
  const fromBank: TransactionItem[] = txns.map((t) => ({
    id: t.id,
    date: fromDateKey(t.date),
    amount: t.amount,
    title: t.merchant || t.description || 'Bank transaction',
    subtitle: accountName.get(t.accountId) ?? '',
    category: t.category,
    source: 'bank',
    bank: t,
  }));
  const typedIn: TransactionItem[] = expenses.map((e) => ({
    id: `expense-${e.id}`,
    date: fromDateKey(e.date),
    amount: -e.amount,
    title: e.description || e.category,
    subtitle: 'Added by you',
    category: e.category,
    source: 'expense',
    expense: e,
  }));
  return [...fromBank, ...typedIn].sort((a, b) => b.date.getTime() - a.date.getTime());
}

/** Groups transactions into sections by category: Income first, then the biggest spending, Transfers last. */
export function categorySections(items: TransactionItem[]) {
  const groups = new Map<string, TransactionItem[]>();
  for (const item of items) groups.set(item.category, [...(groups.get(item.category) ?? []), item]);
  const rank = (category: string, total: number) =>
    category === INCOME_CATEGORY ? -Infinity : category === TRANSFERS_CATEGORY ? Infinity : category === 'Other' ? 1e12 : -Math.abs(total);
  return [...groups.entries()]
    .map(([category, list]) => ({
      category,
      items: list,
      total: Math.round(list.reduce((sum, i) => sum + i.amount, 0) * 100) / 100,
    }))
    .sort((a, b) => rank(a.category, a.total) - rank(b.category, b.total));
}
