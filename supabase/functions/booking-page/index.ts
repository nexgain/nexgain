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
import { adminDb, EMAIL_PROVIDERS, type ProviderId } from '../_shared/connections.ts';
import { ACCOUNT_COLUMNS, EMAIL, sendFromAccount, type AccountRow } from '../_shared/mail.ts';

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
  cancellationPolicy: string;
  business: { name: string; timezone: string; phone: string; email: string; currency: string };
};

// ---------- Emails to the customer ----------

const EMAIL_APP_PROVIDER: Record<string, ProviderId> = { gmail: 'google', outlook: 'microsoft' };

function when(view: View) {
  const date = new Date(view.start);
  const day = date.toLocaleDateString('en-GB', { timeZone: view.business.timezone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const time = date.toLocaleTimeString('en-US', { timeZone: view.business.timezone, hour: 'numeric', minute: '2-digit' });
  return { day, time };
}

function money(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).format(amount);
  } catch {
    return amount.toFixed(2);
  }
}

function message(kind: 'booked' | 'moved' | 'cancelled', view: View) {
  const { day, time } = when(view);
  const b = view.business;
  const subject =
    kind === 'cancelled'
      ? `Cancelled: your booking with ${b.name}`
      : kind === 'moved'
        ? `Changed: your booking with ${b.name} on ${day}`
        : `Confirmed: your booking with ${b.name} on ${day}`;
  const lines = [
    `Hi ${view.customerName},`,
    '',
    kind === 'cancelled'
      ? `Your booking with ${b.name} has been cancelled.`
      : kind === 'moved'
        ? `Your booking with ${b.name} has been changed. Here are the new details.`
        : `Thanks for booking with ${b.name}. Here are your details.`,
    '',
    `Service: ${view.service} (${view.duration} minutes)`,
    `With: ${view.staff}`,
    `Date: ${day}`,
    `Time: ${time}`,
    ...(view.price !== null && kind !== 'cancelled' ? [`Price: ${money(Number(view.price), view.business.currency)}`] : []),
  ];
  if (kind !== 'cancelled') {
    lines.push('', `Need to change or cancel? ${pageUrl()}?m=${view.token}`);
    if (view.cancellationPolicy.trim()) lines.push('', `Cancellation policy: ${view.cancellationPolicy.trim()}`);
  }
  lines.push('', 'Thanks,', b.name, ...(b.phone ? [`Phone: ${b.phone}`] : []), ...(b.email ? [`Email: ${b.email}`] : []));
  return { subject, body: lines.join('\n') };
}

/** Emails the customer from the owner's connected account. Never stops the booking if it can't. */
async function emailCustomer(db: Db, token: string, kind: 'booked' | 'moved' | 'cancelled', view: View) {
  try {
    if (!EMAIL.test(view.customerEmail)) return false;
    const { data: bk } = await db.from('bookings').select('business_id').eq('manage_token', token).maybeSingle();
    if (!bk) return false;
    const [{ data: biz }, { data: accounts }] = await Promise.all([
      db.from('businesses').select('email_app, reminder_provider').eq('id', bk.business_id).maybeSingle(),
      db.from('connected_accounts').select(ACCOUNT_COLUMNS).eq('business_id', bk.business_id).in('provider', EMAIL_PROVIDERS),
    ]);
    const list = (accounts ?? []) as AccountRow[];
    const account =
      list.find((a) => a.provider === biz?.reminder_provider) ?? list.find((a) => a.provider === EMAIL_APP_PROVIDER[biz?.email_app ?? '']) ?? list[0];
    if (!account) return false; // no Gmail or Outlook connected: the confirmation screen is the confirmation
    const { subject, body } = message(kind, view);
    await sendFromAccount(db, account, { to: view.customerEmail, subject, body, fromName: view.business.name, attachment: null });
    return true;
  } catch (e) {
    console.error('booking-page email:', e instanceof Error ? e.message : e);
    return false;
  }
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

    let result: { booking?: View; error?: string };
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
        result = await rpc(db, 'booking_cancel', { p_token: token });
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
      return reply(error === 'not_found' ? 404 : 409, { error, message: MESSAGES[error] ?? MESSAGES.not_found });
    }
    const emailed = await emailCustomer(db, result.booking.token, kind, result.booking);
    return reply(200, { booking: result.booking, emailed });
  } catch {
    return reply(500, { error: 'server', message: 'Something went wrong. Please try again.' });
  }
});
