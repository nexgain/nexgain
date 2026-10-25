// Supabase Edge Function: sends an email from the owner's connected Gmail or
// Outlook account, so it comes from their own address and shows in their Sent folder.
//
// POST {
//   provider: "google" | "microsoft",
//   to, subject, body,                       (plain text)
//   fromName?,                               (e.g. the business name)
//   attachment?: { fileName, base64 }        (a PDF)
// }
//   -> 200 { sent: true }
//   -> 401 { error: "reconnect", message }   the owner removed access or it expired:
//                                            the app asks them to connect again
//   -> 404 { error: "not_connected" }
//   -> 4xx/5xx { error, message }            anything else
//
// Setup: deploy as "send-email" with "Verify JWT" ON (the default).
import {
  adminDb,
  CORS,
  decrypt,
  encrypt,
  expiresAt,
  isProvider,
  ownerBusinessId,
  PROVIDERS,
  randomCode,
  reply,
  requestTokens,
  toBase64,
  type ProviderId,
} from '../_shared/connections.ts';

type Attachment = { fileName: string; base64: string };
type Email = { to: string; subject: string; body: string; fromName: string; attachment: Attachment | null };

/** Access was removed or has run out: the owner needs to connect again. */
class ReconnectNeeded extends Error {}

const EMAIL = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/;
// A PDF of about 10 MB once encoded; quotes and invoices are far smaller.
const MAX_ATTACHMENT = 14_000_000;

const oneLine = (text: string) => text.replace(/[\r\n]+/g, ' ').trim();

function readEmail(body: Record<string, unknown>): Email | string {
  const to = typeof body.to === 'string' ? body.to.trim() : '';
  if (!EMAIL.test(to)) return "The customer's email address doesn't look right.";
  const subject = typeof body.subject === 'string' ? oneLine(body.subject) : '';
  if (!subject) return 'The email needs a subject.';
  const text = typeof body.body === 'string' ? body.body : '';
  const fromName = typeof body.fromName === 'string' ? oneLine(body.fromName).slice(0, 100) : '';

  let attachment: Attachment | null = null;
  const a = body.attachment as Partial<Attachment> | null | undefined;
  if (a) {
    if (typeof a.base64 !== 'string' || typeof a.fileName !== 'string') return 'The attachment is not valid.';
    if (a.base64.length > MAX_ATTACHMENT) return 'The PDF is too large to email.';
    // Plain file names only (no quotes or line breaks that could break the email).
    const fileName = oneLine(a.fileName).replace(/[^\w .()-]/g, '_').slice(0, 100) || 'document.pdf';
    attachment = { fileName, base64: a.base64.replace(/\s/g, '') };
  }
  return { to, subject, body: text, fromName, attachment };
}

// ---------- Access tokens ----------

type AccountRow = {
  id: string;
  account_email: string;
  refresh_token_encrypted: string;
  access_token_encrypted: string | null;
  access_token_expires_at: string | null;
};

/** A working access token, refreshed (and saved) when the old one has run out. */
async function accessToken(db: ReturnType<typeof adminDb>, provider: ProviderId, row: AccountRow) {
  const stillValid = row.access_token_expires_at && new Date(row.access_token_expires_at) > new Date();
  if (stillValid && row.access_token_encrypted) return decrypt(row.access_token_encrypted);

  const tokens = await requestTokens(provider, {
    grant_type: 'refresh_token',
    refresh_token: await decrypt(row.refresh_token_encrypted),
    // Microsoft wants the scopes again when refreshing; Google doesn't.
    ...(provider === 'microsoft' ? { scope: PROVIDERS[provider].scopes } : {}),
  });
  if (tokens.error === 'invalid_grant' || tokens.error === 'unauthorized_client') {
    // Access removed (or Google's 7-day test limit): the connection no longer works,
    // so remove it and the app stops showing "Connected".
    await db.from('connected_accounts').delete().eq('id', row.id);
    throw new ReconnectNeeded();
  }
  if (tokens.error || !tokens.access_token) throw new Error(`Refresh failed: ${tokens.error}`);

  await db
    .from('connected_accounts')
    .update({
      access_token_encrypted: await encrypt(tokens.access_token),
      access_token_expires_at: expiresAt(tokens.expires_in),
      // Microsoft hands out a new refresh token each time; keep the latest.
      ...(tokens.refresh_token ? { refresh_token_encrypted: await encrypt(tokens.refresh_token) } : {}),
    })
    .eq('id', row.id);
  return tokens.access_token;
}

/** 401, or 403 for missing permission (not a 403 for sending too fast). */
const accessRemoved = (status: number, detail: string) =>
  status === 401 || (status === 403 && /insufficient|scope|accessdenied|permission/i.test(detail));

// ---------- Gmail ----------

/** Words outside plain English letters in headers (e.g. "Café" or "–") need this. */
const headerWord = (text: string) =>
  /^[\x20-\x7E]*$/.test(text) ? text : `=?UTF-8?B?${toBase64(new TextEncoder().encode(text))}?=`;

const wrap76 = (base64: string) => base64.replace(/.{1,76}/g, '$&\r\n').trimEnd();

/** A standard email (MIME message) with the text and, if given, the PDF attached. */
function mimeMessage(email: Email, fromAddress: string) {
  const from = email.fromName ? `${headerWord(email.fromName.replace(/"/g, ''))} <${fromAddress}>` : fromAddress;
  const text = wrap76(toBase64(new TextEncoder().encode(email.body)));
  const headers = [`From: ${from}`, `To: ${email.to}`, `Subject: ${headerWord(email.subject)}`, 'MIME-Version: 1.0'];

  if (!email.attachment) {
    return [...headers, 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', text].join('\r\n');
  }
  const boundary = `nexgain_${randomCode(12)}`;
  const { fileName, base64 } = email.attachment;
  return [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    text,
    `--${boundary}`,
    `Content-Type: application/pdf; name="${fileName}"`,
    `Content-Disposition: attachment; filename="${fileName}"`,
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(base64),
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

async function sendWithGmail(token: string, email: Email, fromAddress: string) {
  const raw = toBase64(new TextEncoder().encode(mimeMessage(email, fromAddress)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw }),
  });
  if (res.ok) return;
  const detail = await res.text();
  if (accessRemoved(res.status, detail)) throw new ReconnectNeeded(detail);
  throw new Error(`Gmail ${res.status}: ${detail}`);
}

// ---------- Outlook (Microsoft Graph) ----------

async function sendWithOutlook(token: string, email: Email) {
  const message = {
    subject: email.subject,
    body: { contentType: 'Text', content: email.body },
    toRecipients: [{ emailAddress: { address: email.to } }],
    attachments: email.attachment
      ? [
          {
            '@odata.type': '#microsoft.graph.fileAttachment',
            name: email.attachment.fileName,
            contentType: 'application/pdf',
            contentBytes: email.attachment.base64,
          },
        ]
      : [],
  };
  const res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, saveToSentItems: true }),
  });
  if (res.ok) return;
  const detail = await res.text();
  if (accessRemoved(res.status, detail)) throw new ReconnectNeeded(detail);
  throw new Error(`Outlook ${res.status}: ${detail}`);
}

// ---------- Request ----------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: 'Method not allowed.' });

  const body = await req.json().catch(() => ({}));
  if (!isProvider(body.provider)) return reply(400, { error: 'bad_request', message: 'Unknown email account type.' });
  const provider: ProviderId = body.provider;
  const email = readEmail(body);
  if (typeof email === 'string') return reply(400, { error: 'bad_request', message: email });

  const db = adminDb();
  try {
    const businessId = await ownerBusinessId(req, db);
    if (!businessId) return reply(403, { error: 'forbidden', message: 'Only a business owner can send from a connected account.' });

    const { data: row } = await db
      .from('connected_accounts')
      .select('id, account_email, refresh_token_encrypted, access_token_encrypted, access_token_expires_at')
      .eq('business_id', businessId)
      .eq('provider', provider)
      .maybeSingle<AccountRow>();
    if (!row) return reply(404, { error: 'not_connected', message: 'This email account is no longer connected.' });

    const token = await accessToken(db, provider, row);
    if (provider === 'google') await sendWithGmail(token, email, row.account_email);
    else await sendWithOutlook(token, email);
    return reply(200, { sent: true });
  } catch (e) {
    const name = PROVIDERS[provider].name;
    if (e instanceof ReconnectNeeded) {
      console.warn('send-email: reconnect needed', e.message);
      return reply(401, {
        error: 'reconnect',
        message: `NexGain can't send from your ${name} account any more. Please connect it again.`,
      });
    }
    console.error('send-email:', e instanceof Error ? e.message : e);
    return reply(502, { error: 'send_failed', message: `${name} couldn't send the email. Please try again.` });
  }
});
