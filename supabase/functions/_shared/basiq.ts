// Basiq (https://basiq.io): connects Australian business bank accounts through
// open banking (CDR). The owner logs in to their bank on Basiq's own page;
// NexGain only gets read-only accounts and transactions.
//
// Secret: BASIQ_API_KEY (Supabase > Edge Functions > Secrets).
// In the Basiq dashboard (Customise UI > Flow > External URLs > Redirect URL), set:
//   https://<project-ref>.supabase.co/functions/v1/bank-callback
import { BankError, reasonFrom } from './bank-error.ts';
import type { BankAccountInfo, BankProvider, BankTxn, JobsState } from './banks.ts';

const API = 'https://au-api.basiq.io';
const CONSENT = 'https://consent.basiq.io/home';

function apiKey() {
  // Tidy common copy-paste extras: spaces or line breaks, quote marks, "Basic " in front.
  let key = (Deno.env.get('BASIQ_API_KEY') ?? '')
    .replace(/\s+/g, '')
    .replace(/^["']|["']$/g, '')
    .replace(/^Basic/i, '');
  if (!key) throw new Error('Missing secret BASIQ_API_KEY.');
  // Pasted as "id:secret" instead of Basiq's ready-made key: make it the ready-made form.
  if (key.includes(':')) key = btoa(key);
  return key;
}

/** What kind of value BASIQ_API_KEY looks like (never the value itself), to help fix a wrong paste. */
function keyShape() {
  const key = apiKey();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) {
    return ' The saved BASIQ_API_KEY looks like an Application ID, not an API key. In Basiq, open your application > API Keys and copy the key.';
  }
  if (!/^[A-Za-z0-9+/=_-]+$/.test(key)) return ' The saved BASIQ_API_KEY has characters an API key never has. Copy it again from Basiq.';
  return ` The saved BASIQ_API_KEY is ${key.length} characters long. Check it matches the key in Basiq exactly (a Basiq API key is usually about 100 characters).`;
}

/** A Basiq access token (lasts an hour). SERVER_ACCESS for NexGain, CLIENT_ACCESS for the owner's bank login page. */
async function token(scope: 'SERVER_ACCESS' | 'CLIENT_ACCESS', userId?: string) {
  const res = await fetch(`${API}/token`, {
    method: 'POST',
    headers: {
      // Basiq's API key is already in the form Basic login wants (not encoded again).
      Authorization: `Basic ${apiKey()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'basiq-version': '3.0',
    },
    body: new URLSearchParams(userId ? { scope, userId } : { scope }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || typeof body.access_token !== 'string') {
    // 400/401/403 here means Basiq didn't accept the API key.
    const hint = res.status >= 400 && res.status < 404 && scope === 'SERVER_ACCESS' ? keyShape() : '';
    throw new BankError(res.status, `Basiq login ${res.status}: ${reasonFrom(body)}.${hint}`, JSON.stringify(body.data ?? body));
  }
  return body.access_token as string;
}

// One server token per run of a function (each run is short, well under an hour).
let serverToken: Promise<string> | null = null;
function server() {
  if (!serverToken) {
    serverToken = token('SERVER_ACCESS');
    // A failed try isn't kept, so the next call tries again.
    serverToken.catch(() => {
      serverToken = null;
    });
  }
  return serverToken;
}

async function call(path: string, init: RequestInit = {}) {
  const url = path.startsWith('http') ? path : `${API}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${await server()}`,
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  if (res.status === 204) return {};
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const step = `${init.method ?? 'GET'} ${path.replace(API, '').replace(/\/users\/[^/?]+/, '/users/…').split('?')[0]}`;
    throw new BankError(res.status, `Basiq ${step} ${res.status}: ${reasonFrom(body)}`, JSON.stringify(body.data ?? body));
  }
  return body;
}

const toNumber = (value: unknown) => {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : null;
};

// Bank names, looked up once per run.
const institutionNames = new Map<string, Promise<string>>();
function institutionName(id: string) {
  if (!institutionNames.has(id)) {
    institutionNames.set(
      id,
      call(`/institutions/${encodeURIComponent(id)}`)
        .then((i) => String(i.shortName || i.name || ''))
        .catch(() => ''),
    );
  }
  return institutionNames.get(id)!;
}

type BasiqAccount = {
  id: string;
  name?: string;
  displayName?: string;
  accountNo?: string;
  maskedNumber?: string;
  balance?: string | null;
  currency?: string;
  institution?: string | { id?: string };
};

type BasiqTxn = {
  id: string;
  status?: string;
  description?: string;
  amount?: string;
  account?: string | { id?: string };
  class?: string;
  subClass?: { title?: string } | null;
  transactionDate?: string | null;
  postDate?: string | null;
  enrich?: {
    cleanDescription?: string;
    merchant?: { businessName?: string } | null;
    category?: Record<string, unknown> | null;
  } | null;
};

const idOf = (value: string | { id?: string } | undefined) => (typeof value === 'string' ? value : (value?.id ?? ''));

/** Every "title" inside Basiq's category details (e.g. its ANZSIC industry names). */
function categoryWords(category: unknown): string[] {
  if (!category || typeof category !== 'object') return [];
  const words: string[] = [];
  for (const [key, value] of Object.entries(category)) {
    if (key === 'title' && typeof value === 'string') words.push(value);
    else if (value && typeof value === 'object') words.push(...categoryWords(value));
  }
  return words;
}

/** Whether this Basiq customer has already approved data sharing (an active consent). */
async function hasActiveConsent(userId: string) {
  try {
    const body = await call(`/users/${encodeURIComponent(userId)}/consents`);
    return ((body.data ?? []) as { status?: string }[]).some((c) => c.status === 'active');
  } catch {
    // Can't tell: fall back to Basiq's normal flow.
    return false;
  }
}

export const basiq: BankProvider = {
  name: 'Basiq',

  isSetUp: () => !!Deno.env.get('BASIQ_API_KEY')?.trim(),

  async createCustomer({ email }) {
    const user = await call('/users', { method: 'POST', body: JSON.stringify({ email }) });
    if (typeof user.id !== 'string') throw new Error('Basiq did not return a user id.');
    return user.id;
  },

  async consentUrl(userId, state, { addAnother }) {
    const url = new URL(CONSENT);
    url.searchParams.set('token', await token('CLIENT_ACCESS', userId));
    url.searchParams.set('state', state);
    // First time: Basiq's normal sign-up flow. After that: straight to adding another bank.
    // Also skip ahead when the owner already approved at Basiq but never made it back to
    // the app (e.g. closed the page early): otherwise Basiq only shows "Stop sharing".
    if (addAnother || (await hasActiveConsent(userId))) url.searchParams.set('action', 'connect');
    return url.toString();
  },

  async refresh(userId) {
    const body = await call(`/users/${encodeURIComponent(userId)}/connections/refresh`, { method: 'POST' });
    return ((body.data ?? []) as { id?: string }[]).map((j) => j.id).filter((id): id is string => !!id);
  },

  async jobsState(jobIds): Promise<JobsState> {
    let running = false;
    for (const id of jobIds) {
      const job = await call(`/jobs/${encodeURIComponent(id)}`);
      const steps = (job.steps ?? []) as { title?: string; status?: string; result?: { title?: string; detail?: string } }[];
      // Statements aren't needed, so a problem fetching them doesn't count.
      const needed = steps.filter((s) => s.title !== 'retrieve-statements');
      const failed = needed.find((s) => s.status === 'failed');
      if (failed) {
        return { state: 'failed', message: failed.result?.detail || failed.result?.title || 'The bank didn’t send your data.' };
      }
      const transactions = needed.find((s) => s.title === 'retrieve-transactions');
      const done = transactions ? transactions.status === 'success' : needed.every((s) => s.status === 'success');
      if (!done) running = true;
    }
    return running ? { state: 'running' } : { state: 'done' };
  },

  async accounts(userId): Promise<BankAccountInfo[]> {
    const body = await call(`/users/${encodeURIComponent(userId)}/accounts`);
    const accounts = (body.data ?? []) as BasiqAccount[];
    return Promise.all(
      accounts.map(async (a) => {
        const digits = (a.maskedNumber || a.accountNo || '').replace(/\D/g, '');
        return {
          externalId: a.id,
          name: a.name || a.displayName || 'Bank account',
          institution: await institutionName(idOf(a.institution)),
          maskedNumber: digits ? `•••• ${digits.slice(-4)}` : '',
          balance: toNumber(a.balance),
          currency: a.currency || 'AUD',
        };
      }),
    );
  },

  async transactions(userId, since): Promise<BankTxn[]> {
    const found: BankTxn[] = [];
    let next: string | null = `/users/${encodeURIComponent(userId)}/transactions?limit=500`;
    // Newest first, 500 a page: stop once a page reaches back past `since` (and never more than 40 pages).
    for (let page = 0; next && page < 40; page++) {
      const body = await call(next);
      let reachedEnd = false;
      for (const t of (body.data ?? []) as BasiqTxn[]) {
        // Pending transactions get a new id every time, so only cleared ones are kept.
        if (t.status !== 'posted') continue;
        const date = (t.postDate || t.transactionDate || '').slice(0, 10);
        const amount = toNumber(t.amount);
        if (!date || amount === null) continue;
        if (date < since) {
          reachedEnd = true;
          continue;
        }
        found.push({
          externalId: t.id,
          accountExternalId: idOf(t.account),
          date,
          description: (t.enrich?.cleanDescription || t.description || '').trim(),
          amount,
          merchant: t.enrich?.merchant?.businessName?.trim() || null,
          bankCategory: [t.subClass?.title, ...categoryWords(t.enrich?.category)].filter(Boolean).join(' · ') || null,
          bankClass: t.class ?? null,
        });
      }
      next = reachedEnd ? null : ((body.links?.next as string | undefined) ?? null);
    }
    return found;
  },

  async deleteCustomer(userId) {
    try {
      await call(`/users/${encodeURIComponent(userId)}`, { method: 'DELETE' });
    } catch (e) {
      // Already removed at Basiq: nothing left to delete.
      if (!(e instanceof BankError && e.status === 404)) throw e;
    }
  },
};
