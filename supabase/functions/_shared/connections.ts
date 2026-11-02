// Shared by the account-connection Edge Functions (oauth-start, oauth-callback,
// send-email, send-reminders, oauth-disconnect).
//
// To add another app later (Xero, Stripe, Google Calendar...): add one entry to
// PROVIDERS below, add its id to the provider check in the connected_accounts
// table, and set its client id / secret as Supabase secrets.
//
// Secrets (Supabase > Edge Functions > Secrets), never in the app or in git:
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
//   MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET,
//   TOKEN_ENCRYPTION_KEY (32 random bytes, base64; see the setup steps),
//   REMINDERS_CRON_SECRET (send-reminders only: the password the reminders timer sends).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export type ProviderId = 'google' | 'microsoft';

type Provider = {
  name: string;
  authUrl: string;
  tokenUrl: string;
  scopes: string;
  /** Extra settings added to the login page link. */
  authParams: Record<string, string>;
  clientIdEnv: string;
  clientSecretEnv: string;
  /** A scope the owner must have allowed for the connection to be useful. */
  requiredScope?: string;
  /** The connected account's email address. */
  accountEmail: (accessToken: string) => Promise<string>;
  /** Cancels NexGain's access, where the provider allows it. */
  revoke?: (token: string) => Promise<void>;
};

export const PROVIDERS: Record<ProviderId, Provider> = {
  google: {
    name: 'Google',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    // Send only: NexGain can never read the inbox.
    scopes: 'openid email https://www.googleapis.com/auth/gmail.send',
    // offline + consent: Google returns a refresh token every time.
    authParams: { access_type: 'offline', prompt: 'consent' },
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_CLIENT_SECRET',
    requiredScope: 'https://www.googleapis.com/auth/gmail.send',
    async accountEmail(accessToken) {
      const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || typeof body.email !== 'string') throw new Error('Could not read the Google account email.');
      return body.email;
    },
    async revoke(token) {
      await fetch('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token }),
      });
    },
  },
  microsoft: {
    name: 'Microsoft',
    // "common": work, school and personal (outlook.com, hotmail) accounts.
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scopes: 'openid email offline_access User.Read Mail.Send',
    authParams: { prompt: 'select_account' },
    clientIdEnv: 'MICROSOFT_CLIENT_ID',
    clientSecretEnv: 'MICROSOFT_CLIENT_SECRET',
    async accountEmail(accessToken) {
      const res = await fetch('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const body = await res.json().catch(() => ({}));
      const email = body.mail || body.userPrincipalName;
      if (!res.ok || typeof email !== 'string') throw new Error('Could not read the Microsoft account email.');
      return email;
    },
    // Microsoft has no way to cancel one app's access from here; the owner can
    // remove it at https://account.microsoft.com/privacy/app-access (personal)
    // or https://myapps.microsoft.com (work). The row is still deleted.
  },
};

export function isProvider(value: unknown): value is ProviderId {
  return typeof value === 'string' && Object.hasOwn(PROVIDERS, value);
}

/** Where Google and Microsoft send the owner after they log in. Paste this into both consoles. */
export function callbackUrl() {
  return `${Deno.env.get('SUPABASE_URL')}/functions/v1/oauth-callback`;
}

export function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing secret ${name}.`);
  return value;
}

// ---------- Replies ----------

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

// ---------- Database ----------

export function adminDb() {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
}

/** The signed-in owner's business id, or null if the caller isn't a business owner. */
export async function ownerBusinessId(req: Request, db: SupabaseClient) {
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!jwt) return null;
  const { data: auth } = await db.auth.getUser(jwt);
  if (!auth.user) return null;
  const { data } = await db.from('businesses').select('id').eq('owner_id', auth.user.id).limit(1).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

// ---------- Encryption (AES-GCM, key from TOKEN_ENCRYPTION_KEY) ----------

let keyPromise: Promise<CryptoKey> | null = null;

function encryptionKey() {
  if (!keyPromise) {
    const raw = fromBase64(env('TOKEN_ENCRYPTION_KEY').trim());
    if (raw.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY must be 32 bytes, base64 encoded.');
    keyPromise = crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  }
  return keyPromise;
}

/** "iv.ciphertext", both base64. */
export async function encrypt(text: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await encryptionKey(), new TextEncoder().encode(text));
  return `${toBase64(iv)}.${toBase64(new Uint8Array(data))}`;
}

export async function decrypt(stored: string) {
  const [iv, data] = stored.split('.');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(iv) }, await encryptionKey(), fromBase64(data));
  return new TextDecoder().decode(plain);
}

// ---------- Encoding helpers ----------

export function toBase64(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function fromBase64(text: string) {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

export const base64Url = (bytes: Uint8Array) => toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const randomCode = (bytes = 32) => base64Url(crypto.getRandomValues(new Uint8Array(bytes)));

// ---------- Tokens ----------

export type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

/** Posts to the provider's token address (code swap or refresh). */
export async function requestTokens(provider: ProviderId, params: Record<string, string>): Promise<TokenResponse> {
  const p = PROVIDERS[provider];
  const res = await fetch(p.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ client_id: env(p.clientIdEnv), client_secret: env(p.clientSecretEnv), ...params }),
  });
  const body = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok && !body.error) body.error = `http_${res.status}`;
  return body;
}

export const expiresAt = (expiresIn?: number) =>
  // A minute early, so a token never runs out part way through sending.
  new Date(Date.now() + Math.max(0, (expiresIn ?? 3600) - 60) * 1000).toISOString();
