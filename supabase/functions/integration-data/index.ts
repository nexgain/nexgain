// Supabase Edge Function: the latest data from one of the owner's connected
// business apps, shown in the app's Integrations sheet so they can see it works.
//
// POST { provider: "square" }
//   -> 200 { items: [{ id, title, detail, amount, currency, date, status }] }
//   -> 401 { error: "reconnect", message }    access removed or expired: connect again
//   -> 404 { error: "not_connected", message }
//   -> 4xx/5xx { error, message }
//
// Square: the 10 most recent payments (view only; NexGain can't take or refund money).
//
// Setup: deploy as "integration-data" with "Verify JWT" ON (the default).
import {
  ACCOUNT_COLUMNS,
  adminDb,
  CORS,
  isProvider,
  ownerBusinessId,
  PROVIDERS,
  ReconnectNeeded,
  reply,
  SQUARE_BASE,
  workingAccessToken,
  type AccountRow,
  type ProviderId,
} from '../_shared/connections.ts';

type Item = {
  id: string;
  title: string;
  detail: string;
  /** In dollars (not cents). */
  amount: number | null;
  currency: string | null;
  /** ISO timestamp. */
  date: string;
  status: string;
};

type SquarePayment = {
  id: string;
  created_at: string;
  status?: string;
  amount_money?: { amount?: number; currency?: string };
  note?: string;
  source_type?: string;
  card_details?: { card?: { card_brand?: string; last_4?: string } };
};

const titleCase = (text: string) => text.toLowerCase().replace(/(^|_)(\w)/g, (_, gap, c) => (gap ? ' ' : '') + c.toUpperCase());

async function squarePayments(token: string): Promise<Item[]> {
  const url = new URL(`${SQUARE_BASE}/v2/payments`);
  url.search = new URLSearchParams({ sort_order: 'DESC', limit: '10' }).toString();
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  if (res.status === 401 || res.status === 403) throw new ReconnectNeeded(await res.text());
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Square ${res.status}: ${JSON.stringify(body.errors ?? body)}`);

  return ((body.payments ?? []) as SquarePayment[]).map((p) => {
    const card = p.card_details?.card;
    const how = card?.card_brand
      ? `${titleCase(card.card_brand)}${card.last_4 ? ` •••• ${card.last_4}` : ''}`
      : p.source_type
        ? titleCase(p.source_type)
        : 'Payment';
    return {
      id: p.id,
      title: p.note?.trim() || how,
      detail: p.note?.trim() ? how : '',
      // Square counts in cents (the smallest unit of the currency).
      amount: typeof p.amount_money?.amount === 'number' ? p.amount_money.amount / 100 : null,
      currency: p.amount_money?.currency ?? null,
      date: p.created_at,
      status: p.status ? titleCase(p.status) : '',
    };
  });
}

/** What to show for each business app. Email accounts (Gmail, Outlook) have nothing to show here. */
const FETCHERS: Partial<Record<ProviderId, (token: string) => Promise<Item[]>>> = {
  square: squarePayments,
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: 'Method not allowed.' });

  const body = await req.json().catch(() => ({}));
  const fetcher = isProvider(body.provider) ? FETCHERS[body.provider as ProviderId] : undefined;
  if (!fetcher) return reply(400, { error: 'bad_request', message: 'This app has no data to show yet.' });
  const providerId: ProviderId = body.provider;
  const name = PROVIDERS[providerId].name;

  const db = adminDb();
  let row: AccountRow | null = null;
  try {
    const businessId = await ownerBusinessId(req, db);
    if (!businessId) return reply(403, { error: 'forbidden', message: 'Only a business owner can see this.' });

    ({ data: row } = await db
      .from('connected_accounts')
      .select(ACCOUNT_COLUMNS)
      .eq('business_id', businessId)
      .eq('provider', providerId)
      .maybeSingle<AccountRow>());
    if (!row) return reply(404, { error: 'not_connected', message: `${name} isn't connected. Tap + Add to connect it.` });

    const token = await workingAccessToken(db, row);
    return reply(200, { items: await fetcher(token) });
  } catch (e) {
    if (e instanceof ReconnectNeeded) {
      // The connection doesn't work any more (e.g. removed in Square): delete it so the
      // app shows "+ Add" again. (A failed refresh has already deleted it.)
      if (row) await db.from('connected_accounts').delete().eq('id', row.id);
      return reply(401, { error: 'reconnect', message: `Your ${name} connection has expired. Please reconnect.` });
    }
    console.error('integration-data:', e instanceof Error ? e.message : e);
    return reply(502, { error: 'fetch_failed', message: `Couldn't load your ${name} data. Please try again.` });
  }
});
