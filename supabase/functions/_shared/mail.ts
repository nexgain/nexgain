// Sending an email from an owner's connected Gmail or Outlook account, so it comes
// from their own address and shows in their Sent folder. Used by send-email (quotes,
// invoices, receipts) and send-reminders (automatic job reminders).
import {
  adminDb,
  decrypt,
  encrypt,
  expiresAt,
  PROVIDERS,
  randomCode,
  requestTokens,
  toBase64,
  type ProviderId,
} from './connections.ts';

export type Attachment = { fileName: string; base64: string };
export type Email = { to: string; subject: string; body: string; fromName: string; attachment: Attachment | null };

/** Access was removed or has run out: the owner needs to connect again. */
export class ReconnectNeeded extends Error {}

export const EMAIL = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/;

export const oneLine = (text: string) => text.replace(/[\r\n]+/g, ' ').trim();

// ---------- Access tokens ----------

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
async function accessToken(db: ReturnType<typeof adminDb>, row: AccountRow) {
  const stillValid = row.access_token_expires_at && new Date(row.access_token_expires_at) > new Date();
  if (stillValid && row.access_token_encrypted) return decrypt(row.access_token_encrypted);

  const tokens = await requestTokens(row.provider, {
    grant_type: 'refresh_token',
    refresh_token: await decrypt(row.refresh_token_encrypted),
    // Microsoft wants the scopes again when refreshing; Google doesn't.
    ...(row.provider === 'microsoft' ? { scope: PROVIDERS[row.provider].scopes } : {}),
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
    access_token_expires_at: expiresAt(tokens.expires_in),
    // Microsoft hands out a new refresh token each time; keep the latest.
    ...(tokens.refresh_token ? { refresh_token_encrypted: await encrypt(tokens.refresh_token) } : {}),
  };
  await db.from('connected_accounts').update(update).eq('id', row.id);
  // Several reminders can go in one run: the next one reuses this token.
  Object.assign(row, update);
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

// ---------- Send ----------

/** Sends the email from the connected account. Throws ReconnectNeeded if access was removed. */
export async function sendFromAccount(db: ReturnType<typeof adminDb>, row: AccountRow, email: Email) {
  const token = await accessToken(db, row);
  if (row.provider === 'google') await sendWithGmail(token, email, row.account_email);
  else await sendWithOutlook(token, email);
}
