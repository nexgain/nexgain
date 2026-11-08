// Shared by the account-connection Edge Functions (oauth-start, oauth-callback,
// send-email, send-reminders, oauth-disconnect, integration-data).
//
// Two kinds of connection:
//   - email (Gmail, Outlook): quotes, invoices and reminders send from them.
//   - app (Square so far): a business app whose data NexGain shows.
// To add another app later (Google Calendar, QuickBooks...): add one entry to
// PROVIDERS below, add its id to the provider check in the connected_accounts
// table, set its client id / secret as Supabase secrets, and add what to show
// for it in integration-data.
//
// Secrets (Supabase > Edge Functions > Secrets), never in the app or in git:
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
//   MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET,
//   SQUARE_APPLICATION_ID, SQUARE_APPLICATION_SECRET,
//   SQUARE_ENVIRONMENT ("sandbox" while testing, "production" for real sellers),
//   TOKEN_ENCRYPTION_KEY (32 random bytes, base64; see the setup steps),
//   REMINDERS_CRON_SECRET (send-reminders only: the password the reminders timer sends).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export type ProviderId = 'google' | 'microsoft' | 'square';

/** Who is connected: what the app shows (an email address or business name) and the provider's own id. */
type AccountInfo = { label: string; externalId?: string };

/** A saved connection, decrypted, for cancelling NexGain's access. */
type SavedConnection = { refreshToken: string; accessToken: string | null; externalId: string | null };

type Provider = {
  name: string;
  /** email: sends quotes, invoices and reminders. app: a business app whose data NexGain shows. */
  kind: 'email' | 'app';
  authUrl: string;
  tokenUrl: string;
  scopes: string;
  /** Extra settings added to the login page link. */
  authParams: Record<string, string>;
  clientIdEnv: string;
  clientSecretEnv: string;
  /** A scope the owner must have allowed for the connection to be useful. */
  requiredScope?: string;
  /** Send a PKCE code with the login (default yes). Square: no, so its refresh token never expires. */
  pkce?: boolean;
  /** How the token address wants the request (default: a form). */
  tokenFormat?: 'form' | 'json';
  /** Extra fields sent when refreshing an access token. */
  refreshParams?: Record<string, string>;
  /** Who is connected. */
  account: (accessToken: string) => Promise<AccountInfo>;
  /** Cancels NexGain's access, where the provider allows it. */
  revoke?: (saved: SavedConnection) => Promise<void>;
};

// Square's test ("Sandbox") and real servers have different addresses.
export const SQUARE_BASE =
  Deno.env.get('SQUARE_ENVIRONMENT') === 'production' ? 'https://connect.squareup.com' : 'https://connect.squareupsandbox.com';

export const PROVIDERS: Record<ProviderId, Provider> = {
  google: {
    name: 'Google',
    kind: 'email',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    // Send only: NexGain can never read the inbox.
    scopes: 'openid email https://www.googleapis.com/auth/gmail.send',
    // offline + consent: Google returns a refresh token every time.
    authParams: { access_type: 'offline', prompt: 'consent' },
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_CLIENT_SECRET',
    requiredScope: 'https://www.googleapis.com/auth/gmail.send',
    async account(accessToken) {
      const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || typeof body.email !== 'string') throw new Error('Could not read the Google account email.');
      return { label: body.email };
    },
    async revoke({ refreshToken }) {
      await fetch('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: refreshToken }),
      });
    },
  },
  microsoft: {
    name: 'Microsoft',
    kind: 'email',
    // "common": work, school and personal (outlook.com, hotmail) accounts.
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scopes: 'openid email offline_access User.Read Mail.Send',
    authParams: { prompt: 'select_account' },
    clientIdEnv: 'MICROSOFT_CLIENT_ID',
    clientSecretEnv: 'MICROSOFT_CLIENT_SECRET',
    // Microsoft wants the scopes again when refreshing; Google doesn't.
    refreshParams: { scope: 'openid email offline_access User.Read Mail.Send' },
    async account(accessToken) {
      const res = await fetch('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const body = await res.json().catch(() => ({}));
      const email = body.mail || body.userPrincipalName;
      if (!res.ok || typeof email !== 'string') throw new Error('Could not read the Microsoft account email.');
      return { label: email };
    },
    // Microsoft has no way to cancel one app's access from here; the owner can
    // remove it at https://account.microsoft.com/privacy/app-access (personal)
    // or https://myapps.microsoft.com (work). The row is still deleted.
  },
  square: {
    name: 'Square',
    kind: 'app',
    authUrl: `${SQUARE_BASE}/oauth2/authorize`,
    tokenUrl: `${SQUARE_BASE}/oauth2/token`,
    // View only: the business name, and payments. NexGain can never take or refund money.
    scopes: 'MERCHANT_PROFILE_READ PAYMENTS_READ',
    authParams: {},
    clientIdEnv: 'SQUARE_APPLICATION_ID',
    clientSecretEnv: 'SQUARE_APPLICATION_SECRET',
    pkce: false,
    tokenFormat: 'json',
    async account(accessToken) {
      const res = await fetch(`${SQUARE_BASE}/v2/merchants/me`, { headers: { Authorization: `Bearer ${accessToken}` } });
      const body = await res.json().catch(() => ({}));
      const merchant = body.merchant;
      if (!res.ok || typeof merchant?.id !== 'string') throw new Error('Could not read the Square business.');
      return { label: merchant.business_name || 'Square account', externalId: merchant.id };
    },
    async revoke({ externalId, accessToken }) {
      const res = await fetch(`${SQUARE_BASE}/oauth2/revoke`, {
        method: 'POST',
        headers: { Authorization: `Client ${env('SQUARE_APPLICATION_SECRET')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: env('SQUARE_APPLICATION_ID'),
          ...(externalId ? { merchant_id: externalId } : { access_token: accessToken }),
        }),
      });
      if (!res.ok) throw new Error(`Square revoke ${res.status}: ${await res.text()}`);
    },
  },
};

export const EMAIL_PROVIDERS = (Object.keys(PROVIDERS) as ProviderId[]).filter((id) => PROVIDERS[id].kind === 'email');

export function isProvider(value: unknown): value is ProviderId {
  return typeof value === 'string' && Object.hasOwn(PROVIDERS, value);
}

/** Where Google and Microsoft send the owner after they log in. Paste this into both consoles. */
export function callbackUrl() {
  return `${Deno.env.get('SUPABASE_URL')}/functions/v1/oauth-callback`;
}

/**
 * Only send owners back into the NexGain app: its own scheme, Expo Go while
 * developing, or the web app on this computer.
 */
export function isAppAddress(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 500) return false;
  try {
    const url = new URL(value);
    if (url.protocol === 'nexgain:' || url.protocol === 'exp:' || url.protocol === 'exps:') return true;
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname === 'localhost';
  } catch {
    return false;
  }
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
  /** Square says when the token runs out, instead of how long it lasts. */
  expires_at?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

/** Posts to the provider's token address (code swap or refresh). */
export async function requestTokens(provider: ProviderId, params: Record<string, string>): Promise<TokenResponse> {
  const p = PROVIDERS[provider];
  const fields = { client_id: env(p.clientIdEnv), client_secret: env(p.clientSecretEnv), ...params };
  const json = p.tokenFormat === 'json';
  const res = await fetch(p.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': json ? 'application/json' : 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: json ? JSON.stringify(fields) : new URLSearchParams(fields),
  });
  const body = (await res.json().catch(() => ({}))) as TokenResponse & {
    errors?: { code?: string; detail?: string }[];
    message?: string;
  };
  if (!res.ok && !body.error) {
    // Square: { errors: [{ code, detail }] }. Turned down (e.g. access removed) = invalid_grant.
    body.error = res.status === 401 || res.status === 400 ? 'invalid_grant' : `http_${res.status}`;
    body.error_description = body.errors?.[0]?.detail ?? body.message;
  }
  return body;
}

/** When a new access token runs out, a minute early so it never runs out part way through a request. */
export function expiresAt(tokens: Pick<TokenResponse, 'expires_in' | 'expires_at'>) {
  const ends = tokens.expires_at ? new Date(tokens.expires_at).getTime() : Date.now() + (tokens.expires_in ?? 3600) * 1000;
  return new Date(ends - 60_000).toISOString();
}

// ---------- Working access tokens ----------

/** Access was removed or has run out: the owner needs to connect again. */
export class ReconnectNeeded extends Error {}

export type AccountRow = {
  id: string;
  provider: ProviderId;
  account_email: string;
  refresh_token_encrypted: string;
  access_token_encrypted: string | null;
  access_token_expires_at: string | null;
};

export const ACCOUNT_COLUMNS =
  'id, provider, account_email, refresh_token_encrypted, access_token_encrypted, access_token_expires_at';

/** A working access token, refreshed (and saved) when the old one has run out. */
export async function workingAccessToken(db: SupabaseClient, row: AccountRow) {
  const stillValid = row.access_token_expires_at && new Date(row.access_token_expires_at) > new Date();
  if (stillValid && row.access_token_encrypted) return decrypt(row.access_token_encrypted);

  const tokens = await requestTokens(row.provider, {
    grant_type: 'refresh_token',
    refresh_token: await decrypt(row.refresh_token_encrypted),
    ...PROVIDERS[row.provider].refreshParams,
  });
  if (tokens.error === 'invalid_grant' || tokens.error === 'unauthorized_client') {
    // Access removed (or Google's 7-day test limit): the connection no longer works,
    // so remove it and the app stops showing "Connected".
    await db.from('connected_accounts').delete().eq('id', row.id);
    throw new ReconnectNeeded();
  }
  if (tokens.error || !tokens.access_token) throw new Error(`Refresh failed: ${tokens.error}`);

  const update = {
    access_token_encrypted: await encrypt(tokens.access_token),
    access_token_expires_at: expiresAt(tokens),
    // Microsoft hands out a new refresh token each time; keep the latest.
    ...(tokens.refresh_token ? { refresh_token_encrypted: await encrypt(tokens.refresh_token) } : {}),
  };
  await db.from('connected_accounts').update(update).eq('id', row.id);
  // Several requests can happen in one run: the next one reuses this token.
  Object.assign(row, update);
  return tokens.access_token;
}
