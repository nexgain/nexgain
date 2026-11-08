// Sending an email from an owner's connected Gmail or Outlook account, so it comes
// from their own address and shows in their Sent folder. Used by send-email (quotes,
// invoices, receipts) and send-reminders (automatic job reminders).
import {
  ACCOUNT_COLUMNS,
  ReconnectNeeded,
  randomCode,
  toBase64,
  workingAccessToken,
  type AccountRow,
} from './connections.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export { ACCOUNT_COLUMNS, ReconnectNeeded, type AccountRow };

export type Attachment = { fileName: string; base64: string };
export type Email = { to: string; subject: string; body: string; fromName: string; attachment: Attachment | null };

export const EMAIL = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/;

export const oneLine = (text: string) => text.replace(/[\r\n]+/g, ' ').trim();

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
export async function sendFromAccount(db: SupabaseClient, row: AccountRow, email: Email) {
  const token = await workingAccessToken(db, row);
  if (row.provider === 'google') await sendWithGmail(token, email, row.account_email);
  else await sendWithOutlook(token, email);
}
