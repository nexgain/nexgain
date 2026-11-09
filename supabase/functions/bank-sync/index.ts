// Supabase Edge Function: brings the owner's latest bank accounts and
// transactions into NexGain.
//
// POST { refresh?: boolean }
//   refresh: ask the bank for brand-new data first (the Sync button). Without it,
//   NexGain copies what the bank-data company already has.
//   -> 200 { status: "synced", accounts, added }
//   -> 200 { status: "still_loading" }   the bank is still sending its data; try again shortly
//   -> 404 { error: "not_connected", message }
//   -> 502 { error: "bank_error", message }
//
// Setup: deploy as "bank-sync" with "Verify JWT" ON (the default).
import { BANK_PROVIDERS, CONNECTION_COLUMNS, ownerBusiness, saveLatest, type ConnectionRow } from '../_shared/banks.ts';
import { adminDb, CORS, reply } from '../_shared/connections.ts';

const WAIT_MS = 45_000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: 'Method not allowed.' });

  const body = await req.json().catch(() => ({}));
  const db = adminDb();
  try {
    const business = await ownerBusiness(req, db);
    if (!business) return reply(403, { error: 'forbidden', message: 'Only a business owner can see bank transactions.' });

    const { data: connection } = await db
      .from('bank_connections')
      .select(CONNECTION_COLUMNS)
      .eq('business_id', business.id)
      .maybeSingle<ConnectionRow>();
    const provider = connection && BANK_PROVIDERS[connection.provider];
    if (!connection || connection.status !== 'active' || !provider) {
      return reply(404, { error: 'not_connected', message: 'Your bank isn’t connected. Connect it in More › Integrations.' });
    }

    let jobIds = connection.pending_job_ids ?? [];
    if (body.refresh === true && jobIds.length === 0) {
      jobIds = await provider.refresh(connection.external_user_id);
    }

    // Wait (up to 45 seconds) for the bank to finish sending its data.
    const started = Date.now();
    while (jobIds.length > 0) {
      const jobs = await provider.jobsState(jobIds);
      if (jobs.state === 'done') break;
      if (jobs.state === 'failed') {
        await db.from('bank_connections').update({ pending_job_ids: [] }).eq('id', connection.id);
        return reply(502, { error: 'bank_error', message: `Your bank didn’t send the latest transactions: ${jobs.message}` });
      }
      if (Date.now() - started > WAIT_MS) {
        await db.from('bank_connections').update({ pending_job_ids: jobIds }).eq('id', connection.id);
        return reply(200, { status: 'still_loading' });
      }
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    const result = await saveLatest(db, provider, connection);
    return reply(200, { status: 'synced', ...result });
  } catch (e) {
    console.error('bank-sync:', e instanceof Error ? e.message : e);
    return reply(502, { error: 'bank_error', message: 'Couldn’t get your bank transactions. Please try again.' });
  }
});
