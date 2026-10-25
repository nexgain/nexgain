// Supabase Edge Function: where Google / Microsoft send the owner after they log in.
//
// GET ?code=...&state=...   (or ?error=...&state=... if they cancelled)
//
// Checks the one-time state code, swaps the login code for tokens, reads the
// account's email address, saves the connection (encrypted, replacing any old
// connection for that provider) and sends the owner back into the app with:
//   ?status=connected&provider=google&email=name@gmail.com
//   ?status=cancelled
//   ?status=error&message=...
//
// Setup: deploy as "oauth-callback" and turn OFF "Verify JWT" (Google and
// Microsoft send the browser here without a NexGain login; the state code is
// what's checked). Its address is the redirect URL pasted into Google and Microsoft:
//   https://<project-ref>.supabase.co/functions/v1/oauth-callback
import {
  adminDb,
  callbackUrl,
  encrypt,
  expiresAt,
  isProvider,
  PROVIDERS,
  requestTokens,
  type ProviderId,
} from '../_shared/connections.ts';

function backToApp(appRedirect: string, params: Record<string, string>) {
  const url = new URL(appRedirect);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return new Response(null, { status: 302, headers: { Location: url.toString(), 'Cache-Control': 'no-store' } });
}

/** Shown only when we can't tell which app to go back to (old or reused link). */
function plainPage(text: string) {
  return new Response(text, { status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

Deno.serve(async (req) => {
  if (req.method !== 'GET') return plainPage('Method not allowed.');
  const params = new URL(req.url).searchParams;
  const state = params.get('state') ?? '';
  if (!state) return plainPage('This link is not valid. Go back to the NexGain app and try connecting again.');

  const db = adminDb();
  // One-time: the code is removed as it's read, so the same link can't be used twice.
  const { data: saved } = await db.from('oauth_states').delete().eq('state', state).select().maybeSingle();
  if (!saved || new Date(saved.expires_at) < new Date() || !isProvider(saved.provider)) {
    return plainPage('This login has expired. Go back to the NexGain app and tap Connect again.');
  }
  const providerId: ProviderId = saved.provider;
  const provider = PROVIDERS[providerId];
  const appRedirect: string = saved.app_redirect;

  const loginError = params.get('error');
  if (loginError) {
    // "access_denied": the owner pressed Cancel / didn't allow access.
    if (loginError === 'access_denied') return backToApp(appRedirect, { status: 'cancelled' });
    console.error('oauth-callback login error:', loginError, params.get('error_description'));
    return backToApp(appRedirect, { status: 'error', message: `${provider.name} didn't finish the login. Please try again.` });
  }

  try {
    const tokens = await requestTokens(providerId, {
      grant_type: 'authorization_code',
      code: params.get('code') ?? '',
      redirect_uri: callbackUrl(),
      code_verifier: saved.code_verifier,
    });
    if (tokens.error || !tokens.access_token) {
      console.error('oauth-callback token error:', tokens.error, tokens.error_description);
      return backToApp(appRedirect, { status: 'error', message: `${provider.name} didn't accept the login. Please try again.` });
    }
    if (!tokens.refresh_token) {
      return backToApp(appRedirect, {
        status: 'error',
        message: `${provider.name} didn't give NexGain lasting access. Please try connecting again.`,
      });
    }
    // Google lets people untick boxes on its Allow screen; sending must be allowed.
    if (provider.requiredScope && !(tokens.scope ?? '').split(' ').includes(provider.requiredScope)) {
      return backToApp(appRedirect, {
        status: 'error',
        message: 'Please tick the box that lets NexGain send email for you, then tap Allow.',
      });
    }

    const accountEmail = await provider.accountEmail(tokens.access_token);
    const { error } = await db.from('connected_accounts').upsert(
      {
        business_id: saved.business_id,
        provider: providerId,
        account_email: accountEmail,
        refresh_token_encrypted: await encrypt(tokens.refresh_token),
        access_token_encrypted: await encrypt(tokens.access_token),
        access_token_expires_at: expiresAt(tokens.expires_in),
        connected_at: new Date().toISOString(),
      },
      { onConflict: 'business_id,provider' },
    );
    if (error) throw error;

    return backToApp(appRedirect, { status: 'connected', provider: providerId, email: accountEmail });
  } catch (e) {
    console.error('oauth-callback:', e instanceof Error ? e.message : e);
    return backToApp(appRedirect, { status: 'error', message: 'Something went wrong connecting your account. Please try again.' });
  }
});
