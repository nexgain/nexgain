// Supabase Edge Function: starts connecting the owner's business bank account.
//
// POST { redirect: <app address> }
//   -> 200 { url: <the bank-data company's page where the owner picks their bank> }
//   -> 503 { error: "not_set_up", message }   BASIQ_API_KEY not added yet
//
// Creates our customer at Basiq the first time (saved in bank_connections), and
// a one-time "state" code (oauth_states, expires after 10 minutes) so
// bank-callback knows which business the bank login belongs to.
//
// Setup: deploy as "bank-connect" with "Verify JWT" ON (the default).
import { BANK_PROVIDERS, CONNECTION_COLUMNS, ownerBusiness, providerFor, type ConnectionRow } from '../_shared/banks.ts';
import { BankError } from '../_shared/bank-error.ts';
import { adminDb, CORS, isAppAddress, randomCode, reply } from '../_shared/connections.ts';

Deno.serve(async (req) => {
  // Which step it got to, so a failure says where it went wrong.
  let step = 'reading the request';
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: 'Method not allowed.' });

  try {
    const body = await req.json().catch(() => ({}));
    if (!isAppAddress(body.redirect)) return reply(400, { error: 'bad_request', message: 'Invalid return address.' });

    step = 'checking your login';
    const db = adminDb();
    const business = await ownerBusiness(req, db);
    if (!business) return reply(403, { error: 'forbidden', message: 'Only a business owner can connect a bank account.' });

    step = 'reading your bank connection';
    const { data: existing, error: readError } = await db
      .from('bank_connections')
      .select(CONNECTION_COLUMNS)
      .eq('business_id', business.id)
      .maybeSingle<ConnectionRow>();
    if (readError) throw readError;
    const providerId = existing?.provider ?? providerFor();
    const provider = BANK_PROVIDERS[providerId];
    if (!provider?.isSetUp()) {
      console.error(`bank-connect: ${providerId} secrets not set`);
      return reply(503, { error: 'not_set_up', message: 'Bank connections aren’t set up yet. Please try again later.' });
    }

    let customerId = existing?.external_user_id;
    if (!customerId) {
      step = 'creating your Basiq customer';
      customerId = await provider.createCustomer({ email: business.email });
      step = 'saving your bank connection';
      const { error } = await db
        .from('bank_connections')
        .insert({ business_id: business.id, provider: providerId, external_user_id: customerId });
      if (error) throw error;
    }

    step = 'saving the login code';
    const state = randomCode();
    await db.from('oauth_states').delete().lt('expires_at', new Date().toISOString());
    const { error } = await db.from('oauth_states').insert({
      state,
      business_id: business.id,
      provider: providerId,
      // Bank logins don't use a PKCE code (the column is shared with email logins).
      code_verifier: '',
      app_redirect: body.redirect,
    });
    if (error) throw error;

    step = 'opening the Basiq page';
    const url = await provider.consentUrl(customerId, state, { addAnother: existing?.status === 'active' });
    return reply(200, { url });
  } catch (e) {
    const detail = e instanceof Error ? e.message : (e as { message?: string })?.message ?? String(e);
    console.error(`bank-connect (${step}):`, detail);
    // Basiq's own reason, or the database's, so the problem can be fixed (neither contains a secret).
    const reason = e instanceof BankError ? e.reason : detail.slice(0, 200);
    return reply(500, { error: 'failed', message: `Couldn’t start the bank connection (while ${step}). ${reason}` });
  }
});
