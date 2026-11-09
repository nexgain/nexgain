// Supabase Edge Function: reads a receipt with Claude (Anthropic's AI).
//
// POST { receiptId }
//   -> 200 { status: "ready", crop, rotation }   read and saved (crop/rotation: how to tidy the photo)
//   -> 200 { status: "failed", message }          not a receipt, or unreadable (the owner can type the details)
//   -> 4xx/5xx { error, message }
//
// Reads the supplier, ABN, date, total, GST, line items and a category, saves
// them on the receipt, then links it to the matching bank transaction (or saves
// suggestions). A receipt added from a transaction keeps that link, and its
// category improves the transaction's.
//
// Secret: ANTHROPIC_API_KEY (console.anthropic.com > API Keys).
// Setup: deploy as "read-receipt" with "Verify JWT" ON (the default).
import Anthropic from 'npm:@anthropic-ai/sdk@1';

import { ownerBusiness } from '../_shared/banks.ts';
import { adminDb, CORS, reply, toBase64 } from '../_shared/connections.ts';
import { applyReceiptCategory, matchReceipt, RECEIPT_COLUMNS, type ReceiptRow } from '../_shared/receipts.ts';

// Must match TRANSACTION_CATEGORIES in the app (src/data/bank.ts), minus the ones a receipt can't be.
const CATEGORIES = [
  'Fuel',
  'Materials & supplies',
  'Equipment & tools',
  'Vehicle',
  'Rent',
  'Utilities',
  'Insurance',
  'Phone & internet',
  'Software & subscriptions',
  'Advertising',
  'Bank fees',
  'Other',
];

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['is_receipt', 'supplier', 'abn', 'date', 'total', 'gst', 'line_items', 'category', 'crop', 'rotation'],
  properties: {
    is_receipt: { type: 'boolean', description: 'false if this is not a receipt, invoice or bill' },
    supplier: nullable({ type: 'string', description: 'Business name of the seller as printed' }),
    abn: nullable({ type: 'string', description: "Seller's 11-digit ABN, digits only" }),
    date: nullable({ type: 'string', format: 'date', description: 'Purchase date, YYYY-MM-DD' }),
    total: nullable({ type: 'number', description: 'Total paid in dollars, including GST' }),
    gst: nullable({ type: 'number', description: 'GST amount in dollars, only if printed' }),
    line_items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['description', 'quantity', 'amount'],
        properties: {
          description: { type: 'string' },
          quantity: nullable({ type: 'number' }),
          amount: nullable({ type: 'number', description: 'Line total in dollars' }),
        },
      },
    },
    category: { type: 'string', enum: CATEGORIES },
    crop: nullable({
      type: 'object',
      additionalProperties: false,
      required: ['left', 'top', 'right', 'bottom'],
      description: 'Edges of the receipt paper as fractions (0 to 1) of the image width and height, as the image is now',
      properties: { left: { type: 'number' }, top: { type: 'number' }, right: { type: 'number' }, bottom: { type: 'number' } },
    }),
    rotation: { type: 'integer', enum: [0, 90, 180, 270], description: 'Degrees clockwise to turn the image so the text reads upright' },
  },
} as const;

const SYSTEM = `You read receipts, tax invoices and bills for an Australian small-business bookkeeping app.
Copy what is printed; never guess. Use null for anything that isn't shown or can't be read clearly.
- Dates on Australian receipts are day/month/year: 03/04/2026 is 3 April 2026.
- total is the final amount paid, including GST and any card surcharge.
- gst is the GST amount only when it is printed (e.g. "GST $4.55" or "Includes GST of $4.55"). If it only says "prices include GST" with no amount, use null.
- abn: the seller's ABN as 11 digits with no spaces.
- category: what the purchase is for a trade or service business. Fuel = petrol/diesel at a service station. Materials & supplies = building, plumbing, electrical, hardware and job materials. Equipment & tools = tools and equipment bought or hired. Vehicle = repairs, servicing, tyres, rego, tolls, parking. Use Other if nothing fits.
- crop: where the receipt paper is in the photo, so the photo can be trimmed. Use null for a PDF, a screenshot, or when the receipt already fills the image.
- rotation: 0 if the text already reads upright.`;

type Reading = {
  is_receipt: boolean;
  supplier: string | null;
  abn: string | null;
  date: string | null;
  total: number | null;
  gst: number | null;
  line_items: { description: string; quantity: number | null; amount: number | null }[];
  category: string;
  crop: { left: number; top: number; right: number; bottom: number } | null;
  rotation: 0 | 90 | 180 | 270;
};

const money = (n: number | null) => (n === null || !Number.isFinite(n) ? null : Math.round(Math.abs(n) * 100) / 100);
const validDate = (d: string | null) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) ? d : null);
const validAbn = (abn: string | null) => {
  const digits = (abn ?? '').replace(/\D/g, '');
  return digits.length === 11 ? digits : null;
};

/** Only keeps a crop that's sensible and actually trims something. */
function sensibleCrop(crop: Reading['crop']) {
  if (!crop) return null;
  const c = { left: Math.max(0, crop.left), top: Math.max(0, crop.top), right: Math.min(1, crop.right), bottom: Math.min(1, crop.bottom) };
  const width = c.right - c.left;
  const height = c.bottom - c.top;
  if (width < 0.15 || height < 0.15) return null;
  if (width * height > 0.9) return null;
  return c;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: 'Method not allowed.' });

  const body = await req.json().catch(() => ({}));
  if (typeof body.receiptId !== 'string') return reply(400, { error: 'bad_request', message: 'Which receipt?' });

  const db = adminDb();
  const business = await ownerBusiness(req, db).catch(() => null);
  if (!business) return reply(403, { error: 'forbidden', message: 'Only a business owner can add receipts.' });

  const { data: receipt } = await db
    .from('receipts')
    .select(`${RECEIPT_COLUMNS}, file_path, file_type`)
    .eq('id', body.receiptId)
    .eq('business_id', business.id)
    .maybeSingle<ReceiptRow & { file_path: string; file_type: 'image' | 'pdf' }>();
  if (!receipt) return reply(404, { error: 'not_found', message: 'That receipt isn’t in NexGain any more.' });

  const fail = async (message: string, status = 200) => {
    await db.from('receipts').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', receipt.id);
    return reply(status, status === 200 ? { status: 'failed', message } : { error: 'failed', message });
  };

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')?.trim();
  if (!apiKey) {
    console.error('read-receipt: ANTHROPIC_API_KEY not set');
    return fail('Receipt reading isn’t set up yet. You can type the details in yourself.', 503);
  }

  try {
    const { data: file, error: downloadError } = await db.storage.from('business-files').download(receipt.file_path);
    if (downloadError || !file) throw downloadError ?? new Error('Receipt file missing.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length > 20 * 1024 * 1024) return fail('This file is too big to read. Try a photo instead.');
    const data = toBase64(bytes);

    const fileBlock =
      receipt.file_type === 'pdf'
        ? ({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } } as const)
        : ({ type: 'image', source: { type: 'base64', media_type: file.type === 'image/png' ? 'image/png' : 'image/jpeg', data } } as const);

    const client = new Anthropic({ apiKey });
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      // If Claude declines (a false positive), Anthropic's recommended fallback model reads it instead.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: 'Read this receipt.' }] }],
    });

    if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') {
      console.error('read-receipt stop_reason:', response.stop_reason);
      return fail('Couldn’t read this receipt. You can type the details in yourself.');
    }
    const text = response.content.find((b) => b.type === 'text');
    const reading = JSON.parse(text && text.type === 'text' ? text.text : '{}') as Reading;
    if (!reading.is_receipt) return fail('This doesn’t look like a receipt. Try another photo, or type the details in yourself.');

    const fields = {
      status: 'ready',
      supplier: reading.supplier?.trim() || null,
      abn: validAbn(reading.abn),
      receipt_date: validDate(reading.date),
      total: money(reading.total),
      gst: money(reading.gst),
      line_items: (reading.line_items ?? []).slice(0, 100).map((l) => ({
        description: String(l.description ?? '').trim(),
        quantity: l.quantity,
        amount: money(l.amount),
      })),
      category: CATEGORIES.includes(reading.category) ? reading.category : 'Other',
      updated_at: new Date().toISOString(),
    };
    const { error: saveError } = await db.from('receipts').update(fields).eq('id', receipt.id);
    if (saveError) throw saveError;

    const saved: ReceiptRow = { ...receipt, ...fields, status: 'ready' };
    if (receipt.bank_transaction_id) await applyReceiptCategory(db, receipt.bank_transaction_id, fields.category);
    else await matchReceipt(db, saved);

    const isImage = receipt.file_type === 'image';
    return reply(200, {
      status: 'ready',
      crop: isImage ? sensibleCrop(reading.crop) : null,
      rotation: isImage && [90, 180, 270].includes(reading.rotation) ? reading.rotation : 0,
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) {
      console.error('read-receipt: rate limited');
      return fail('Lots of receipts are being read right now. Tap “Read again” in a minute.');
    }
    if (e instanceof Anthropic.AuthenticationError) {
      console.error('read-receipt: ANTHROPIC_API_KEY was not accepted');
      return fail('Receipt reading isn’t set up properly (the AI key wasn’t accepted). You can type the details in yourself.');
    }
    if (e instanceof Anthropic.APIError) {
      console.error(`read-receipt: Anthropic ${e.status}:`, e.message);
      return fail('The AI couldn’t read this receipt just now. Tap “Read again” to try again.');
    }
    console.error('read-receipt:', e instanceof Error ? e.message : e);
    return fail('Couldn’t read this receipt. Tap “Read again” to try again, or type the details in yourself.');
  }
});
