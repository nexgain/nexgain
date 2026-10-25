// Supabase Edge Function: disconnects one of the owner's connected accounts.
//
// POST { provider: "google" | "microsoft" }  -> { disconnected: true }
//
// Cancels NexGain's access with the provider where that's possible (Google), then
// deletes the saved connection. Microsoft has no way to do this for one app, so the
// owner can remove it in their Microsoft account (see _shared/connections.ts).
//
// Setup: deploy as "oauth-disconnect" with "Verify JWT" ON (the default).
import { adminDb, CORS, decrypt, isProvider, ownerBusinessId, PROVIDERS, reply, type ProviderId } from '../_shared/connections.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: 'Method not allowed.' });

  const body = await req.json().catch(() => ({}));
  if (!isProvider(body.provider)) return reply(400, { error: 'Unknown provider.' });
  const providerId: ProviderId = body.provider;

  try {
    const db = adminDb();
    const businessId = await ownerBusinessId(req, db);
    if (!businessId) return reply(403, { error: 'Only a business owner can disconnect accounts.' });

    const { data: row } = await db
      .from('connected_accounts')
      .select('id, refresh_token_encrypted')
      .eq('business_id', businessId)
      .eq('provider', providerId)
      .maybeSingle();

    if (row) {
      const revoke = PROVIDERS[providerId].revoke;
      if (revoke) {
        // Best effort: the connection is deleted either way.
        try {
          await revoke(await decrypt(row.refresh_token_encrypted));
        } catch (e) {
          console.warn('oauth-disconnect: revoke failed', e instanceof Error ? e.message : e);
        }
      }
      const { error } = await db.from('connected_accounts').delete().eq('id', row.id);
      if (error) throw error;
    }
    return reply(200, { disconnected: true });
  } catch (e) {
    console.error('oauth-disconnect:', e instanceof Error ? e.message : e);
    return reply(500, { error: 'Could not disconnect. Please try again.' });
  }
});
