// Supabase Edge Function: starts connecting an owner's account (Gmail, Outlook...).
//
// POST { provider: "google" | "microsoft", redirect: <app address> }
//   -> { url: <Google / Microsoft login page> }
//
// The app opens the returned page in an in-app browser. (The function returns the
// link rather than redirecting, because the in-app browser can't carry the owner's
// NexGain login; the app calls this with it instead.)
//
// Saves a one-time "state" code with the owner's business (expires after 10
// minutes) so oauth-callback knows which business the login belongs to.
//
// Setup: deploy as "oauth-start" with "Verify JWT" ON (the default).
import {
  adminDb,
  base64Url,
  callbackUrl,
  CORS,
  env,
  isProvider,
  ownerBusinessId,
  PROVIDERS,
  randomCode,
  reply,
  type ProviderId,
} from '../_shared/connections.ts';

/**
 * Only send owners back into the NexGain app: its own scheme, Expo Go while
 * developing, or the web app on this computer.
 */
function isAppAddress(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 500) return false;
  try {
    const url = new URL(value);
    if (url.protocol === 'nexgain:' || url.protocol === 'exp:' || url.protocol === 'exps:') return true;
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname === 'localhost';
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: 'Method not allowed.' });

  try {
    const body = await req.json().catch(() => ({}));
    if (!isProvider(body.provider)) {
      return reply(400, { error: 'not_set_up', message: "This app can't be connected yet. Please try again later." });
    }
    const providerId: ProviderId = body.provider;
    // Its client id / secret haven't been added in Supabase > Edge Functions > Secrets yet.
    const setUp = PROVIDERS[providerId];
    if (!Deno.env.get(setUp.clientIdEnv) || !Deno.env.get(setUp.clientSecretEnv)) {
      console.error(`oauth-start: ${setUp.clientIdEnv} / ${setUp.clientSecretEnv} not set`);
      return reply(503, { error: 'not_set_up', message: `${setUp.name} isn't set up yet. Please try again later.` });
    }
    if (!isAppAddress(body.redirect)) return reply(400, { error: 'Invalid return address.' });

    const db = adminDb();
    const businessId = await ownerBusinessId(req, db);
    if (!businessId) return reply(403, { error: 'Only a business owner can connect accounts.' });

    const provider = PROVIDERS[providerId];
    const state = randomCode();
    const codeVerifier = randomCode(48);
    const challenge = base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier))));

    // Clear out old unused codes, then save this one.
    await db.from('oauth_states').delete().lt('expires_at', new Date().toISOString());
    const { error } = await db.from('oauth_states').insert({
      state,
      business_id: businessId,
      provider: providerId,
      code_verifier: codeVerifier,
      app_redirect: body.redirect,
    });
    if (error) throw error;

    const url = new URL(provider.authUrl);
    url.search = new URLSearchParams({
      client_id: env(provider.clientIdEnv),
      redirect_uri: callbackUrl(),
      response_type: 'code',
      scope: provider.scopes,
      state,
      ...(provider.pkce === false ? {} : { code_challenge: challenge, code_challenge_method: 'S256' }),
      ...provider.authParams,
    }).toString();

    return reply(200, { url: url.toString() });
  } catch (e) {
    console.error('oauth-start:', e instanceof Error ? e.message : e);
    return reply(500, { error: 'Could not start the connection. Please try again.' });
  }
});
