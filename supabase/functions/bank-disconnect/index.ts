// Supabase Edge Function: disconnects the owner's bank.
//
// POST {}  -> 200 { ok: true }
//
// Removes our customer at the bank-data company (which ends NexGain's access
// and deletes the bank data held there), then removes the connection, its
// accounts and its transactions from NexGain. Expenses the owner typed in stay.
//
// Setup: deploy as "bank-disconnect" with "Verify JWT" ON (the default).
import { BANK_PROVIDERS, CONNECTION_COLUMNS, ownerBusiness, type ConnectionRow } from '../_shared/banks.ts';
import { adminDb, CORS, reply } from '../_shared/connections.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: 'Method not allowed.' });

  const db = adminDb();
  try {
    const business = await ownerBusiness(req, db);
    if (!business) return reply(403, { error: 'forbidden', message: 'Only a business owner can disconnect the bank.' });

    const { data: connection } = await db
      .from('bank_connections')
      .select(CONNECTION_COLUMNS)
      .eq('business_id', business.id)
      .maybeSingle<ConnectionRow>();
    if (!connection) return reply(200, { ok: true });

    const provider = BANK_PROVIDERS[connection.provider];
    if (provider) await provider.deleteCustomer(connection.external_user_id);

    // Accounts and transactions go with it (on delete cascade).
    const { error } = await db.from('bank_connections').delete().eq('id', connection.id);
    if (error) throw error;
    return reply(200, { ok: true });
  } catch (e) {
    console.error('bank-disconnect:', e instanceof Error ? e.message : e);
    return reply(502, { error: 'failed', message: 'Couldn’t disconnect your bank. Please try again.' });
  }
});
