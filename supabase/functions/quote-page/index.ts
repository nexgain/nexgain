// Supabase Edge Function: the data behind the customer's quote page.
//
// The page itself (docs/quote/index.html) is hosted on GitHub Pages, because
// Supabase only shows web pages on a paid custom domain. The page holds no data and
// no keys; it asks this function for one quote using the secret code in its link.
//
// GET  ?q=<code>                          -> the quote to show
// POST { q: <code>, action: "accept" }    -> customer accepts (only works once)
// POST { q: <code>, action: "decline" }   -> customer declines (only works once)
//
// Security:
// - The server-side key (SUPABASE_SERVICE_ROLE_KEY) is provided by Supabase to this
//   function automatically. It never leaves the server.
// - The database functions it calls only ever read or change the one quote whose
//   secret code matches, and only return what's printed on the quote.
//
// Setup (Supabase > Edge Functions): deploy as "quote-page" and turn OFF
// "Verify JWT" (customers aren't signed in; the secret code is what's checked).
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// Secret codes are 32 letters, numbers, "-" or "_" (see quote_share_token()).
const CODE = /^[A-Za-z0-9_-]{32}$/;

type QuoteView = {
  number: string;
  state: 'open' | 'accepted' | 'declined';
  items: { description: string; qty: number; rate: number }[];
  gstRate: number;
  [key: string]: unknown;
};

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

const cents = (amount: number) => Math.round(amount * 100) / 100;

/** Same sums as the app (src/data/invoices.ts), so the page matches the PDF. */
function withTotals(quote: QuoteView) {
  const items = quote.items.map((item) => ({ ...item, amount: cents((item.qty || 0) * (item.rate || 0)) }));
  const subtotal = cents(items.reduce((sum, item) => sum + item.amount, 0));
  const gstRate = Number(quote.gstRate) || 0;
  const gst = cents(subtotal * gstRate);
  return { ...quote, items, gstRate, subtotal, gst, total: cents(subtotal + gst) };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  let code = '';
  let action = '';
  if (req.method === 'GET') {
    code = new URL(req.url).searchParams.get('q') ?? '';
  } else if (req.method === 'POST') {
    const body = await req.json().catch(() => ({}));
    code = typeof body.q === 'string' ? body.q : '';
    action = typeof body.action === 'string' ? body.action : '';
    if (action !== 'accept' && action !== 'decline') return reply(400, { error: 'Unknown action.' });
  } else {
    return reply(405, { error: 'Method not allowed.' });
  }
  if (!CODE.test(code)) return reply(404, { error: 'not_found' });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const { data, error } = action
    ? await db.rpc('respond_to_quote', { p_token: code, p_accept: action === 'accept' })
    : await db.rpc('quote_public_view', { p_token: code });

  if (error) {
    console.error('quote-page:', error.message);
    return reply(500, { error: 'Something went wrong. Please try again.' });
  }
  if (!data) return reply(404, { error: 'not_found' });
  return reply(200, withTotals(data as QuoteView));
});
