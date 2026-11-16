// Supabase Edge Function: the data behind NexGain Bookings' public booking page.
//
// The page itself (docs/book/index.html) is a plain web page hosted on GitHub
// Pages, so customers book in any phone or computer browser without the app.
// It holds no data and no keys; it asks this function, which calls the
// public.booking_* database functions with the server key. Those only ever
// return what a customer may see (never other bookings or private details).
//
// Booking (link: .../book/?b=<business link name>)
//   GET  ?b=slug                                     -> business, services, staff
//   GET  ?b=slug&service=&staff=&from=YYYY-MM-DD&days=N -> days with free times
//   GET  ?b=slug&service=&staff=&day=YYYY-MM-DD     -> free times that day
//   POST { action: 'book', b, service, staff, start, name, phone, email, notes }
// Changing or cancelling (link in the confirmation email: .../book/?m=<secret code>)
//   GET  ?m=code                                     -> the booking
//   GET  ?m=code&from=&days= / ?m=code&day=          -> free times to move to
//   POST { action: 'cancel', m } / { action: 'reschedule', m, start }
//   (staff = a staff id, or empty for "Anyone available")
//
// After booking, moving or cancelling, the customer is emailed from the
// owner's connected Gmail or Outlook account (if one is connected).
//
// Setup: deploy as "booking-page" with "Verify JWT" OFF (customers aren't
// signed in). Optional secret BOOKING_PAGE_URL: the page's address, for the
// links in emails (default: the GitHub Pages address).
import { bookingPageUrl, EMAIL, money, whenText } from '../_shared/booking-mail.ts';
import { adminDb } from '../_shared/connections.ts';
import { sendEmail, sendSms } from '../_shared/messaging.ts';
import { chargeCancellationFee, refundDeposit, takeDeposit } from '../_shared/paymentService.ts';

type Db = ReturnType<typeof adminDb>;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const TOKEN = /^[A-Za-z0-9_-]{32}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const pageUrl = () => (Deno.env.get('BOOKING_PAGE_URL')?.trim() || 'https://nexgain.github.io/nexgain/book/').replace(/\/?$/, '/');

const slugOf = (v: unknown) => (typeof v === 'string' && v.length <= 60 && SLUG.test(v.toLowerCase()) ? v.toLowerCase() : null);
const tokenOf = (v: unknown) => (typeof v === 'string' && TOKEN.test(v) ? v : null);
const uuidOf = (v: unknown) => (typeof v === 'string' && UUID.test(v) ? v : null);
const dayOf = (v: unknown) => (typeof v === 'string' && DAY.test(v) && !Number.isNaN(Date.parse(v)) ? v : null);
const startOf = (v: unknown) => (typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
const daysOf = (v: string | null) => Math.min(62, Math.max(1, Number.parseInt(v ?? '', 10) || 14));

const MESSAGES: Record<string, string> = {
  not_found: 'This booking page or booking could not be found.',
  service: 'That service is no longer available. Please choose another.',
  details: 'Please check your name, phone number and email address.',
  too_many: 'You already have several upcoming bookings here. Please contact the business to book more.',
  taken: 'Sorry, someone just booked that time. Please choose another time.',
  too_late: 'It’s too late to change this booking online. Please contact the business.',
  fee: 'Cancelling now has a cancellation fee. Please confirm to cancel.',
  payment: 'Sorry, the deposit payment didn’t go through, so the booking wasn’t made. Please try again.',
};

type View = {
  token: string;
  status: string;
  service: string;
  duration: number;
  price: number | null;
  staff: string;
  start: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  /** 'email', 'sms' or 'both' (how the customer wants to hear from us). */
  confirmBy?: 'email' | 'sms' | 'both';
  canChange?: boolean;
  cancelNoticeHours?: number;
  cancellationPolicy: string;
  depositAmount?: number | string;
  paymentStatus?: string;
  cancellationFee?: number | string;
  feePolicy?: { enabled: boolean; type: 'fixed' | 'percent'; value: number | string; hours: number };
  business: { name: string; timezone: string; phone: string; email: string; currency: string };
};

// ---------- Emails to the customer ----------

type Kind = 'booked' | 'moved' | 'cancelled';

/** The deposit and cancellation terms, in one or two sentences. */
function policyLines(view: View) {
  const lines: string[] = [];
  const cur = view.business.currency;
  const fee = view.feePolicy;
  const deposit = Number(view.depositAmount ?? 0);
  if (fee?.enabled && Number(fee.value) > 0) {
    const amount = fee.type === 'percent' ? `${Number(fee.value)}% of the price` : money(Number(fee.value), cur);
    lines.push(`Cancelling less than ${fee.hours} hours before: a cancellation fee of ${amount}${deposit > 0 ? ', taken from your deposit' : ''}.`);
  } else if (view.cancelNoticeHours) {
    lines.push(`You can change or cancel online up to ${view.cancelNoticeHours} hours before${deposit > 0 ? ', and your deposit is refunded' : ''}.`);
  }
  if (view.cancellationPolicy.trim()) lines.push(view.cancellationPolicy.trim());
  return lines;
}

/** "$15.00 paid" / "$15.00 refunded" / null. */
function depositLine(view: View) {
  const deposit = Number(view.depositAmount ?? 0);
  if (deposit <= 0) return null;
  const amount = money(deposit, view.business.currency);
  if (view.paymentStatus === 'refunded') return Number(view.cancellationFee ?? 0) > 0 ? `${amount} paid (the rest refunded)` : `${amount} refunded`;
  if (view.paymentStatus === 'paid') return `${amount} paid`;
  return null;
}

/** The email: business, service, staff, date, time, price, deposit, policy and the change/cancel link. */
export function emailMessage(kind: Kind, view: View) {
  const { day, time } = whenText(view.start, view.business.timezone);
  const b = view.business;
  const cur = b.currency;
  const subject =
    kind === 'cancelled'
      ? `Cancelled: your booking with ${b.name}`
      : kind === 'moved'
        ? `Changed: your booking with ${b.name} on ${day}`
        : `Confirmed: your booking with ${b.name} on ${day}`;
  const deposit = depositLine(view);
  const fee = Number(view.cancellationFee ?? 0);
  const lines = [
    `Hi ${view.customerName},`,
    '',
    kind === 'cancelled'
      ? `Your booking with ${b.name} has been cancelled.`
      : kind === 'moved'
        ? `Your booking with ${b.name} has been changed. Here are the new details.`
        : `Thanks for booking with ${b.name}. Here are your details.`,
    '',
    `Business: ${b.name}`,
    `Service: ${view.service} (${view.duration} minutes)`,
    `With: ${view.staff}`,
    `Date: ${day}`,
    `Time: ${time}`,
    ...(view.price !== null && kind !== 'cancelled' ? [`Price: ${money(Number(view.price), cur)}`] : []),
    ...(deposit ? [`Deposit: ${deposit}`] : []),
    ...(kind === 'cancelled' && fee > 0 ? [`Cancellation fee: ${money(fee, cur)}`] : []),
  ];
  if (kind !== 'cancelled') {
    const policy = policyLines(view);
    if (policy.length) lines.push('', 'Cancellation policy:', ...policy);
    lines.push('', `Change or cancel your booking: ${bookingPageUrl()}?m=${view.token}`);
  }
  lines.push('', 'Thanks,', b.name, ...(b.phone ? [`Phone: ${b.phone}`] : []), ...(b.email ? [`Email: ${b.email}`] : []));
  return { subject, body: lines.join('\n') };
}

/** The text message: the same, short. */
export function smsMessage(kind: Kind, view: View) {
  const { day, time } = whenText(view.start, view.business.timezone);
  const b = view.business;
  const cur = b.currency;
  const shortDay = day.replace(/ \d{4}$/, '');
  if (kind === 'cancelled') {
    const fee = Number(view.cancellationFee ?? 0);
    return `${b.name}: your ${view.service} on ${shortDay} at ${time} is cancelled.${fee > 0 ? ` Cancellation fee ${money(fee, cur)}.` : ''}`;
  }
  const price = view.price !== null ? ` ${money(Number(view.price), cur)}` : '';
  const deposit = depositLine(view);
  const fee = view.feePolicy?.enabled && Number(view.feePolicy.value) > 0 ? ` Late cancellation (under ${view.feePolicy.hours}h) fee applies.` : '';
  return (
    `${b.name}: ${kind === 'moved' ? 'booking changed' : 'booked'}! ${view.service} with ${view.staff}, ${shortDay} at ${time}.${price}` +
    `${deposit ? ` Deposit ${deposit}.` : ''}${fee} Change/cancel: ${bookingPageUrl()}?m=${view.token}`
  );
}

/**
 * Sends the customer their confirmation (or change / cancellation) the way they
 * chose: email, text or both. Never stops the booking if it can't.
 */
async function notifyCustomer(db: Db, token: string, kind: Kind, view: View) {
  const sent = { email: false, sms: false };
  try {
    const { data: bk } = await db.from('bookings').select('business_id').eq('manage_token', token).maybeSingle();
    if (!bk) return sent;
    const by = view.confirmBy ?? 'email';
    if ((by === 'email' || by === 'both') && EMAIL.test(view.customerEmail)) {
      const { subject, body } = emailMessage(kind, view);
      const r = await sendEmail(db, { businessId: bk.business_id, to: view.customerEmail, subject, text: body, fromName: view.business.name, replyTo: view.business.email });
      sent.email = r.sent;
    }
    if ((by === 'sms' || by === 'both') && view.customerPhone) {
      const { data: biz } = await db.from('businesses').select('country').eq('id', bk.business_id).maybeSingle();
      const r = await sendSms({ to: view.customerPhone, country: biz?.country ?? null, text: smsMessage(kind, view) });
      sent.sms = r.sent;
      if (!r.sent) console.warn('booking-page sms:', r.reason);
    }
  } catch (e) {
    console.error('booking-page notify:', e instanceof Error ? e.message : e);
  }
  return sent;
}

// ---------- Payments (all through _shared/paymentService.ts) ----------

async function bookingRow(db: Db, token: string) {
  const { data } = await db.from('bookings').select('id, payment_ref, payment_status, deposit_amount').eq('manage_token', token).maybeSingle();
  return data as { id: string; payment_ref: string | null; payment_status: string; deposit_amount: number | string } | null;
}

async function record(db: Db, bookingId: string, paymentStatus: string | null, reference: string | null, feeStatus: string | null) {
  await rpc(db, 'booking_record_payment', { p_booking: bookingId, p_payment_status: paymentStatus, p_payment_ref: reference ?? '', p_fee_status: feeStatus });
}

/** Takes the deposit just after booking. A failed payment cancels the booking (frees the time). */
async function settleDeposit(db: Db, view: View, pageToken: string | null) {
  const row = await bookingRow(db, view.token);
  if (!row) return false;
  const result = await takeDeposit({
    amount: Number(row.deposit_amount),
    currency: view.business.currency,
    description: `Deposit: ${view.service} with ${view.staff}, ${view.business.name}`,
    customerEmail: view.customerEmail,
    bookingId: row.id,
    pagePaymentToken: pageToken,
  });
  if (!result.ok) console.error('booking-page deposit:', result.reason);
  await record(db, row.id, result.ok ? 'paid' : 'failed', result.ok ? result.reference : null, null);
  return result.ok;
}

/** After a customer cancels: the fee comes out of the deposit, the rest is refunded. */
async function settleCancellation(db: Db, view: View, fee: number) {
  const row = await bookingRow(db, view.token);
  if (!row) return;
  const deposit = row.payment_status === 'paid' ? Number(row.deposit_amount) : 0;
  const refund = Math.round(Math.max(deposit - fee, 0) * 100) / 100;
  const stillOwed = Math.round(Math.max(fee - deposit, 0) * 100) / 100;
  let paymentStatus: string | null = null;
  let feeStatus: string | null = fee > 0 ? 'charged' : null;
  if (refund > 0 && row.payment_ref) {
    const r = await refundDeposit({ reference: row.payment_ref, amount: refund, currency: view.business.currency, bookingId: row.id });
    if (r.ok) paymentStatus = 'refunded';
    else console.error('booking-page refund:', r.reason);
  }
  if (stillOwed > 0) {
    const c = await chargeCancellationFee({
      amount: stillOwed,
      currency: view.business.currency,
      customerEmail: view.customerEmail,
      bookingId: row.id,
      depositReference: row.payment_ref,
    });
    if (!c.ok) {
      console.error('booking-page fee:', c.reason);
      feeStatus = 'failed';
    }
  }
  if (paymentStatus || feeStatus) await record(db, row.id, paymentStatus, null, feeStatus);
}

// ---------- Requests ----------

async function rpc(db: Db, name: string, args: Record<string, unknown>) {
  const { data, error } = await db.rpc(name, args);
  if (error) {
    console.error(`booking-page ${name}:`, error.message);
    throw new Error('rpc');
  }
  return data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const db = adminDb();
  try {
    if (req.method === 'GET') {
      const q = new URL(req.url).searchParams;
      const token = tokenOf(q.get('m'));
      const slug = slugOf(q.get('b'));
      const day = dayOf(q.get('day'));
      const from = dayOf(q.get('from'));

      if (token) {
        if (day) return reply(200, { slots: await rpc(db, 'booking_slots_for_token', { p_token: token, p_day: day }) });
        if (from) return reply(200, { days: await rpc(db, 'booking_days_for_token', { p_token: token, p_from: from, p_days: daysOf(q.get('days')) }) });
        const view = await rpc(db, 'booking_by_token', { p_token: token });
        return view ? reply(200, { booking: view }) : reply(404, { error: 'not_found', message: MESSAGES.not_found });
      }
      if (!slug) return reply(404, { error: 'not_found', message: MESSAGES.not_found });
      const service = uuidOf(q.get('service'));
      const staff = uuidOf(q.get('staff'));
      if (service && day) return reply(200, { slots: await rpc(db, 'booking_slots', { p_slug: slug, p_service: service, p_staff: staff, p_day: day }) });
      if (service && from) {
        return reply(200, {
          days: await rpc(db, 'booking_days', { p_slug: slug, p_service: service, p_staff: staff, p_from: from, p_days: daysOf(q.get('days')) }),
        });
      }
      const page = await rpc(db, 'booking_page', { p_slug: slug });
      return page ? reply(200, page) : reply(404, { error: 'not_found', message: MESSAGES.not_found });
    }

    if (req.method !== 'POST') return reply(405, { error: 'method', message: 'Method not allowed.' });
    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === 'string' ? body.action : '';

    let result: { booking?: View; error?: string; fee?: number | string };
    let kind: 'booked' | 'moved' | 'cancelled';
    if (action === 'book') {
      const slug = slugOf(body.b);
      const service = uuidOf(body.service);
      const start = startOf(body.start);
      if (!slug || !service || !start) return reply(400, { error: 'details', message: 'Please choose a service and a time.' });
      result = await rpc(db, 'booking_create', {
        p_slug: slug,
        p_service: service,
        p_staff: uuidOf(body.staff),
        p_start: start,
        p_name: text(body.name, 100),
        p_phone: text(body.phone, 30),
        p_email: text(body.email, 200),
        p_notes: text(body.notes, 1000),
      });
      kind = 'booked';
    } else if (action === 'cancel' || action === 'reschedule') {
      const token = tokenOf(body.m);
      if (!token) return reply(404, { error: 'not_found', message: MESSAGES.not_found });
      if (action === 'cancel') {
        result = await rpc(db, 'booking_cancel', { p_token: token, p_accept_fee: body.acceptFee === true });
        kind = 'cancelled';
      } else {
        const start = startOf(body.start);
        if (!start) return reply(400, { error: 'details', message: 'Please choose a new time.' });
        result = await rpc(db, 'booking_reschedule', { p_token: token, p_start: start });
        kind = 'moved';
      }
    } else {
      return reply(400, { error: 'action', message: 'Unknown action.' });
    }

    if (!result?.booking) {
      const error = result?.error ?? 'not_found';
      return reply(error === 'not_found' ? 404 : 409, {
        error,
        message: MESSAGES[error] ?? MESSAGES.not_found,
        ...(error === 'fee' ? { fee: Number(result?.fee ?? 0) } : {}),
      });
    }
    let booking = result.booking;
    // Money: take the deposit after booking; refund it / charge the fee after cancelling.
    // How the customer wants their confirmation: email, text or both.
    if (kind === 'booked') {
      const confirmBy = ['email', 'sms', 'both'].includes(body.confirmBy) ? body.confirmBy : 'email';
      await db.from('bookings').update({ confirm_by: confirmBy }).eq('manage_token', booking.token);
      booking = { ...booking, confirmBy };
    }
    if (kind === 'booked' && Number(booking.depositAmount ?? 0) > 0) {
      const paid = await settleDeposit(db, booking, typeof body.paymentToken === 'string' ? body.paymentToken : null);
      if (!paid) return reply(402, { error: 'payment', message: MESSAGES.payment });
      booking = (await rpc(db, 'booking_by_token', { p_token: booking.token })) ?? booking;
    }
    if (kind === 'cancelled') {
      await settleCancellation(db, booking, Number(result.fee ?? 0));
      booking = (await rpc(db, 'booking_by_token', { p_token: booking.token })) ?? booking;
    }
    const sent = await notifyCustomer(db, booking.token, kind, booking);
    return reply(200, { booking, emailed: sent.email, texted: sent.sms });
  } catch {
    return reply(500, { error: 'server', message: 'Something went wrong. Please try again.' });
  }
});
