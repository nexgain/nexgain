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
import { adminDb, CORS, isProvider, ownerBusinessId, PROVIDERS, reply, type ProviderId } from '../_shared/connections.ts';
import {
  ACCOUNT_COLUMNS,
  EMAIL,
  oneLine,
  ReconnectNeeded,
  sendFromAccount,
  type AccountRow,
  type Attachment,
  type Email,
} from '../_shared/mail.ts';

// A PDF of about 10 MB once encoded; quotes and invoices are far smaller.
const MAX_ATTACHMENT = 14_000_000;

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
      .select(ACCOUNT_COLUMNS)
      .eq('business_id', businessId)
      .eq('provider', provider)
      .maybeSingle<AccountRow>();
    if (!row) return reply(404, { error: 'not_connected', message: 'This email account is no longer connected.' });

    await sendFromAccount(db, row, email);
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
