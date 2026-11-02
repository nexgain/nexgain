// Supabase Edge Function: sends clients their job reminders (a week before and
// the day before, at 9:00 am business time) from the owner's connected Gmail or
// Outlook account, and records each one in the job_reminders table.
//
// Two ways in:
//   1. The timer (pg_cron, every 15 minutes) with header x-cron-secret: sends
//      every reminder that's due. The database picks them and marks each one
//      "sending" first, so a reminder can never go out twice.
//   2. The app's "Send test reminder" button, with the owner's NexGain login:
//      POST { test: true, subject?, message? } -> sends a sample reminder to the
//      owner's own business email.
//      -> 200 { sent: true, to }
//      -> 4xx/5xx { error, message }
//
// Setup: deploy as "send-reminders" with "Verify JWT" OFF (the timer has no
// NexGain login; the password or the owner's login is checked here instead).
// Secret: REMINDERS_CRON_SECRET (the same password the timer sends).
import { adminDb, CORS, env, ownerBusinessId, PROVIDERS, reply, type ProviderId } from '../_shared/connections.ts';
import { ACCOUNT_COLUMNS, EMAIL, oneLine, ReconnectNeeded, sendFromAccount, type AccountRow } from '../_shared/mail.ts';

type Db = ReturnType<typeof adminDb>;

// ---------- The message ----------

// Keep in step with DEFAULT_REMINDER_SUBJECT / DEFAULT_REMINDER_MESSAGE in src/data/reminders.ts.
const DEFAULT_SUBJECT = 'Reminder: your booking with {business_name} on {job_date}';
const DEFAULT_MESSAGE = `Hi {client_name},

This is a friendly reminder about your upcoming booking with {business_name}.

Date: {job_date}
Time: {job_time}
Address: {address}
Job: {job_title}

If you need to change anything, just reply to this email.

Thanks,
{business_name}
Phone: {business_phone}
Email: {business_email}`;

const MAX_SUBJECT = 200;
const MAX_MESSAGE = 5000;

type Values = Record<string, string>;

/**
 * Fills in the {tags}. In the message, a line whose tag is blank (e.g. no phone
 * number saved) is left out, so the client never sees "Phone: " with nothing after it.
 */
function fill(template: string, values: Values, dropBlankLines: boolean) {
  const lines = template.split(/\r?\n/).flatMap((line) => {
    let blank = false;
    const out = line.replace(/\{(\w+)\}/g, (tag, key: string) => {
      if (!Object.hasOwn(values, key)) return tag;
      if (!values[key].trim()) blank = true;
      return values[key];
    });
    return dropBlankLines && blank ? [] : [out];
  });
  return lines.join('\n');
}

/** "Tuesday 3 November 2026" and "8:30 am", in the business's timezone. */
function localWhen(at: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-AU', {
      timeZone,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.weekday} ${parts.day} ${parts.month} ${parts.year}`,
    time: `${parts.hour}:${parts.minute} ${(parts.dayPeriod ?? '').toLowerCase()}`.trim(),
  };
}

type Business = {
  name: string;
  email: string;
  phone: string;
  timezone: string;
  subject: string;
  message: string;
};

type JobDetails = { title: string; start: Date; address: string; clientName: string };

function buildReminder(business: Business, job: JobDetails) {
  const when = localWhen(job.start, business.timezone);
  const values: Values = {
    client_name: job.clientName.trim() || 'there',
    business_name: business.name.trim(),
    business_phone: business.phone.trim(),
    business_email: business.email.trim(),
    job_title: job.title.trim(),
    job_date: when.date,
    job_time: when.time,
    address: job.address.trim(),
  };
  return {
    subject: oneLine(fill(business.subject.trim() || DEFAULT_SUBJECT, values, false)).slice(0, MAX_SUBJECT),
    body: fill(business.message.trim() || DEFAULT_MESSAGE, values, true),
  };
}

// ---------- Which account sends ----------

const EMAIL_APP_PROVIDER: Record<string, ProviderId> = { gmail: 'google', outlook: 'microsoft' };

/** The owner's choice if both are connected, else the one for their email app, else whichever is connected. */
function pickAccount(accounts: AccountRow[], reminderProvider: string | null, emailApp: string) {
  return (
    accounts.find((a) => a.provider === reminderProvider) ??
    accounts.find((a) => a.provider === EMAIL_APP_PROVIDER[emailApp]) ??
    accounts[0]
  );
}

async function accountsFor(db: Db, businessId: string) {
  const { data } = await db.from('connected_accounts').select(ACCOUNT_COLUMNS).eq('business_id', businessId);
  return (data ?? []) as AccountRow[];
}

const NOT_CONNECTED = 'No Gmail or Outlook account is connected. Connect one in More › Integrations.';
const reconnectReason = (provider: ProviderId) =>
  `NexGain can't send from your ${provider === 'google' ? 'Gmail' : 'Outlook'} account any more. Connect it again in More › Integrations.`;

// ---------- Timer: send everything that's due ----------

type Due = {
  reminder_id: string;
  kind: 'week' | 'day';
  job_title: string;
  job_start: string;
  address: string;
  client_name: string;
  client_email: string;
  business_id: string;
  business_name: string;
  business_email: string;
  business_phone: string;
  timezone: string;
  reminder_subject: string;
  reminder_message: string;
  email_app: string;
  reminder_provider: string | null;
};

async function sendDue(db: Db) {
  const { data, error } = await db.rpc('claim_due_reminders', { p_limit: 50 });
  if (error) throw new Error(`claim_due_reminders: ${error.message}`);
  const due = (data ?? []) as Due[];

  const accounts = new Map<string, AccountRow[]>();
  let sent = 0;
  let failed = 0;

  // One at a time: a business usually has only a few, and Gmail and Outlook
  // don't like lots at once.
  for (const r of due) {
    const record = (fields: Record<string, unknown>) =>
      db.from('job_reminders').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', r.reminder_id);
    const fail = (reason: string) => {
      failed++;
      return record({ status: 'failed', reason });
    };

    if (!EMAIL.test(r.client_email)) {
      await fail("The client's email address doesn't look right.");
      continue;
    }
    if (!accounts.has(r.business_id)) accounts.set(r.business_id, await accountsFor(db, r.business_id));
    const account = pickAccount(accounts.get(r.business_id)!, r.reminder_provider, r.email_app);
    if (!account) {
      await fail(NOT_CONNECTED);
      continue;
    }

    const { subject, body } = buildReminder(
      {
        name: r.business_name,
        email: r.business_email,
        phone: r.business_phone,
        timezone: r.timezone,
        subject: r.reminder_subject,
        message: r.reminder_message,
      },
      { title: r.job_title, start: new Date(r.job_start), address: r.address, clientName: r.client_name },
    );

    try {
      await sendFromAccount(db, account, { to: r.client_email, subject, body, fromName: r.business_name, attachment: null });
      sent++;
      await record({ status: 'sent', reason: '', sent_to: r.client_email, sent_at: new Date().toISOString() });
    } catch (e) {
      if (e instanceof ReconnectNeeded) {
        // The connection was removed: don't try it again for this business's other reminders.
        accounts.set(r.business_id, accounts.get(r.business_id)!.filter((a) => a.id !== account.id));
        await fail(reconnectReason(account.provider));
      } else {
        console.error('send-reminders:', r.reminder_id, e instanceof Error ? e.message : e);
        await fail(`${PROVIDERS[account.provider].name} couldn't send the email. NexGain will try again shortly.`);
      }
    }
  }
  return { due: due.length, sent, failed };
}

// ---------- The owner's test reminder ----------

async function sendTest(req: Request, db: Db, body: Record<string, unknown>) {
  const businessId = await ownerBusinessId(req, db);
  if (!businessId) return reply(403, { error: 'forbidden', message: 'Only a business owner can send a test reminder.' });

  const { data: b } = await db
    .from('businesses')
    .select('name, owner_name, owner_email, business_email, phone, timezone, reminder_subject, reminder_message, email_app, reminder_provider')
    .eq('id', businessId)
    .single();
  if (!b) return reply(404, { error: 'not_found', message: 'Business not found.' });

  const account = pickAccount(await accountsFor(db, businessId), b.reminder_provider, b.email_app);
  if (!account) return reply(404, { error: 'not_connected', message: NOT_CONNECTED });

  const to = (b.business_email as string).trim() || (b.owner_email as string);
  // The wording on screen, which may not have finished saving yet.
  const text = (key: string, saved: string, max: number) =>
    typeof body[key] === 'string' ? (body[key] as string).slice(0, max) : saved;
  const business: Business = {
    name: b.name,
    email: to,
    phone: b.phone,
    timezone: b.timezone,
    subject: text('subject', b.reminder_subject, MAX_SUBJECT),
    message: text('message', b.reminder_message, MAX_MESSAGE),
  };
  // A pretend job tomorrow, addressed to the owner.
  const start = new Date(Date.now() + 24 * 3600_000);
  const { subject, body: message } = buildReminder(business, {
    title: 'Sample job',
    start,
    address: '123 Example Street',
    clientName: (b.owner_name as string).split(/\s+/)[0] ?? '',
  });

  try {
    await sendFromAccount(db, account, {
      to,
      subject: `[Test] ${subject}`,
      body: `This is a test. Your clients will get reminders like this one.\n\n----------\n\n${message}`,
      fromName: b.name,
      attachment: null,
    });
    return reply(200, { sent: true, to });
  } catch (e) {
    if (e instanceof ReconnectNeeded) return reply(401, { error: 'reconnect', message: reconnectReason(account.provider) });
    console.error('send-reminders test:', e instanceof Error ? e.message : e);
    return reply(502, { error: 'send_failed', message: `${PROVIDERS[account.provider].name} couldn't send the email. Please try again.` });
  }
}

// ---------- Request ----------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: 'Method not allowed.' });

  const db = adminDb();
  try {
    const cronSecret = req.headers.get('x-cron-secret');
    if (cronSecret) {
      if (cronSecret !== env('REMINDERS_CRON_SECRET')) return reply(401, { error: 'Wrong password.' });
      const result = await sendDue(db);
      if (result.due > 0) console.log('send-reminders:', result);
      return reply(200, result);
    }
    const body = await req.json().catch(() => ({}));
    if (body?.test === true) return await sendTest(req, db, body);
    return reply(400, { error: 'bad_request', message: 'Nothing to do.' });
  } catch (e) {
    console.error('send-reminders:', e instanceof Error ? e.message : e);
    return reply(500, { error: 'server_error', message: 'Something went wrong. Please try again.' });
  }
});
