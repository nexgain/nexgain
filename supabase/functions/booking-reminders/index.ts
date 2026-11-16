// Supabase Edge Function: NexGain Bookings appointment reminders. Emails each
// customer before their appointment (the business's "reminder_hours", default
// 24 hours before) from the owner's connected Gmail or Outlook, and records
// the result on the booking (sent, failed with the reason, or skipped).
//
// Called by the timer (pg_cron, every 15 minutes, see
// 20261120000000_booking_reminders.sql) with header x-cron-secret. The
// database marks each reminder "sending" before it's handed over, so a
// customer can never get the same reminder twice.
//   POST {} -> 200 { sent, failed }
//
// Setup: deploy as "booking-reminders" with "Verify JWT" OFF (the timer has no
// login; the password is checked here). Secret: REMINDERS_CRON_SECRET (the same
// one job reminders use).
import { bookingPageUrl, money, ownerMailAccount, sendBookingEmail, whenText } from '../_shared/booking-mail.ts';
import { adminDb, CORS, env, reply } from '../_shared/connections.ts';
import { ReconnectNeeded } from '../_shared/mail.ts';

type Db = ReturnType<typeof adminDb>;

type Due = {
  booking_id: string;
  token: string;
  business_id: string;
  customer_name: string;
  customer_email: string;
  service_name: string;
  duration_minutes: number;
  price: number | string | null;
  staff_name: string;
  starts_at: string;
  cancel_notice_hours: number;
  cancellation_policy: string;
  business_name: string;
  business_email: string;
  business_phone: string;
  timezone: string;
  currency: string;
  email_app: string | null;
  reminder_provider: string | null;
};

/** The reminder email. The change/cancel link only while it can still be changed online. */
export function reminderMessage(r: Due, now = new Date()) {
  const { day, time } = whenText(r.starts_at, r.timezone);
  const canChange = now.getTime() < new Date(r.starts_at).getTime() - r.cancel_notice_hours * 3_600_000;
  const lines = [
    `Hi ${r.customer_name},`,
    '',
    `This is a reminder about your booking with ${r.business_name}.`,
    '',
    `Service: ${r.service_name} (${r.duration_minutes} minutes)`,
    `With: ${r.staff_name}`,
    `Date: ${day}`,
    `Time: ${time}`,
    ...(r.price !== null && Number(r.price) > 0 ? [`Price: ${money(Number(r.price), r.currency)}`] : []),
    '',
    canChange
      ? `Need to change or cancel? ${bookingPageUrl()}?m=${r.token}`
      : 'If you can’t make it, please let us know as soon as possible.',
    ...(r.cancellation_policy.trim() ? ['', `Cancellation policy: ${r.cancellation_policy.trim()}`] : []),
    '',
    'See you soon,',
    r.business_name,
    ...(r.business_phone ? [`Phone: ${r.business_phone}`] : []),
    ...(r.business_email ? [`Email: ${r.business_email}`] : []),
  ];
  return { subject: `Reminder: ${r.service_name} with ${r.business_name}, ${day} at ${time}`, body: lines.join('\n') };
}

async function record(db: Db, bookingId: string, status: 'sent' | 'failed', reason = '') {
  const now = new Date().toISOString();
  const { error } = await db
    .from('bookings')
    .update({ reminder_status: status, reminder_reason: reason, reminder_updated_at: now, ...(status === 'sent' ? { reminder_sent_at: now } : {}) })
    .eq('id', bookingId);
  if (error) console.error('booking-reminders record:', error.message);
}

async function sendDue(db: Db) {
  const { data, error } = await db.rpc('claim_due_booking_reminders', { p_limit: 50 });
  if (error) throw new Error(error.message);
  let sent = 0;
  let failed = 0;
  const accounts = new Map<string, Awaited<ReturnType<typeof ownerMailAccount>>>();
  for (const r of (data ?? []) as Due[]) {
    try {
      if (!accounts.has(r.business_id)) accounts.set(r.business_id, await ownerMailAccount(db, r.business_id, r.email_app, r.reminder_provider));
      const account = accounts.get(r.business_id);
      if (!account) {
        await record(db, r.booking_id, 'failed', 'No Gmail or Outlook account is connected. Connect one in More › Integrations.');
        failed++;
        continue;
      }
      const { subject, body } = reminderMessage(r);
      await sendBookingEmail(db, account, r.customer_email, subject, body, r.business_name);
      await record(db, r.booking_id, 'sent');
      sent++;
    } catch (e) {
      const reason =
        e instanceof ReconnectNeeded
          ? 'NexGain can’t send from your email account any more. Connect it again in More › Integrations.'
          : 'The email couldn’t be sent. NexGain will try again shortly.';
      console.error('booking-reminders send:', e instanceof Error ? e.message : e);
      await record(db, r.booking_id, 'failed', reason);
      failed++;
    }
  }
  return { sent, failed };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: 'Method not allowed.' });
  try {
    const secret = req.headers.get('x-cron-secret');
    if (!secret || secret !== env('REMINDERS_CRON_SECRET')) return reply(401, { error: 'Wrong password.' });
    return reply(200, await sendDue(adminDb()));
  } catch (e) {
    console.error('booking-reminders:', e instanceof Error ? e.message : e);
    return reply(500, { error: 'Could not send booking reminders.' });
  }
});
