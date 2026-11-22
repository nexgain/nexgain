// Supabase Edge Function: sorts the bank transactions NexGain's quick rules
// couldn't place, using Claude (Anthropic's AI).
//
// POST (the owner's NexGain login)
//   -> 200 { sorted, unsure, updates }   how many Claude placed, how many it wasn't sure
//      about, and each change ({ id, category, confidence } or just { id } when unsure)
//   -> 4xx/5xx { error, message }
//
// The app sorts transactions first with fast rules (known merchants, the
// owner's earlier choices, keywords). Ones it isn't sure about (confidence
// under 0.6) come here: Claude reads the description, merchant, amount, date
// and the bank's own category, knowing what kind of business this is, and
// picks a category with a confidence. Sure ones (0.6 or more) are saved and
// leave "Needs review"; unsure ones stay there for the owner. Each transaction
// is only ever sent once (it's marked "claude" either way). Categories the
// owner chose are never touched.
//
// Secret: ANTHROPIC_API_KEY (the same one the receipt reader uses).
// Setup: deploy as "sort-transactions" with "Verify JWT" ON (the default).
import Anthropic from 'npm:@anthropic-ai/sdk@1';

import { HOSPITALITY_CATEGORIES, RETAIL_CATEGORIES } from '../_shared/ai/sorting.ts';
import { ownerBusiness } from '../_shared/banks.ts';
import { adminDb, CORS, reply } from '../_shared/connections.ts';

// Must match the categories in the app (src/data/finance.ts) and _shared/ai/sorting.ts.
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
  'Wages & super',
  'Bank fees',
  'Tax',
  'Transfers',
  'Other',
];

/** NexGain Retail (System 3): its own categories (RETAIL_SCHEME in _shared/ai/sorting.ts). */
const RETAIL = [...RETAIL_CATEGORIES, 'Transfers'];

/** NexGain Hospitality (System 4): its own categories (HOSPITALITY_SCHEME in _shared/ai/sorting.ts). */
const HOSPITALITY = [...HOSPITALITY_CATEGORIES, 'Transfers'];

/** Below this, the owner is asked (same as REVIEW_BELOW in _shared/ai/sorting.ts). */
const SURE = 0.6;
/** Transactions per Claude request, and most handled per call. */
const BATCH = 40;
const MAX = 120;

const schemaFor = (categories: string[]) => ({
  type: 'object',
  additionalProperties: false,
  required: ['results'],
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['n', 'category', 'confidence'],
        properties: {
          n: { type: 'integer', description: 'The transaction number from the list' },
          category: { type: 'string', enum: categories },
          confidence: { type: 'number', description: 'How sure, from 0 to 1' },
        },
      },
    },
  },
});

/** NexGain Retail: shops and brands that sell products. */
function retailPrompt(business: { name: string; industry: string | null }) {
  return `You sort bank transactions (money going out) for an Australian retail shop's bookkeeping app.
The business: "${business.name}"${business.industry ? `, a ${business.industry}` : ''}. It sells physical products and keeps stock.

For each transaction pick the single best category from the list, and a confidence from 0 to 1.
- "Stock purchases" is buying the products the shop sells: wholesalers, suppliers, brands and distributors (e.g. a clothing wholesaler for a boutique, a pharmacy wholesaler like Sigma or API for a chemist).
- "Shipping & postage" is Australia Post, StarTrack, Sendle, couriers and freight. "Packaging" is bags, boxes, mailers, tissue and tags.
- "Marketing" is ads (Google, Facebook, Instagram, TikTok), email marketing, influencers and promotions.
- "Utilities" is power, gas, water, phone and internet. "Rent" is the shop's rent or lease (including shopping centres).
- "Shop fit-out & equipment" is shelving, displays, racks, signage, POS hardware and other shop equipment.
- "Wages" is paying staff or super funds. "Transfers" is moving money between the business's own accounts, or loan/credit card repayments.
- "Other" is for business costs that fit no other category (bank fees, insurance, software, tax).
- Be honest about confidence. Use 0.8 or more only when the merchant or description makes it clear. Use under 0.6 when you're guessing (e.g. a person's name, a vague code, a shop that sells many kinds of things). The owner is asked about anything under 0.6.
Return one result for every transaction number.`;
}

/** NexGain Hospitality: cafes, restaurants, bars and other food businesses. */
function hospitalityPrompt(business: { name: string; industry: string | null }) {
  return `You sort bank transactions (money going out) for an Australian food business's bookkeeping app.
The business: "${business.name}"${business.industry ? `, a ${business.industry}` : ''}. It sells food and drinks (a cafe, restaurant, bar or similar).

For each transaction pick the single best category from the list, and a confidence from 0 to 1.
- "Food & Supplies" is food, coffee beans, milk, bread, meat, fruit and veg, and kitchen ingredients (e.g. Bidfood, PFD, Coles, Woolworths, Costco, a butcher, a coffee roaster).
- "Drinks" is soft drinks, beer, wine and spirits bought to sell (e.g. Coca-Cola, CUB, Lion, Dan Murphy's).
- "Packaging" is takeaway cups, lids, containers, bags and napkins (e.g. BioPak, Detpak, Bunzl).
- "Cleaning" is cleaning products, cleaners, linen, laundry and pest control.
- "Equipment" is kitchen and coffee equipment, furniture, repairs and appliances.
- "Utilities" is power, gas, water, phone and internet. "Rent" is the shop's rent or lease.
- "Wages" is paying staff or super funds. "Transfers" is moving money between the business's own accounts, or loan/credit card repayments.
- "Other" is for business costs that fit no other category (bank fees, insurance, software, tax).
- Be honest about confidence. Use 0.8 or more only when the merchant or description makes it clear. Use under 0.6 when you're guessing (e.g. a person's name, a vague code, a shop that sells many kinds of things). The owner is asked about anything under 0.6.
Return one result for every transaction number.`;
}

function systemPrompt(business: { name: string; industry: string | null }) {
  return `You sort bank transactions (money going out) for an Australian small business's bookkeeping app.
The business: "${business.name}"${business.industry ? `, a ${business.industry} business` : ''}.

For each transaction pick the single best category from the list, and a confidence from 0 to 1.
- Use what you know about Australian merchants, brands and services (e.g. Bunnings = Materials & supplies, Ampol/BP/7-Eleven fuel = Fuel, Telstra = Phone & internet, AAMI/NRMA insurance = Insurance, ATO = Tax, Xero/Google Workspace = Software & subscriptions).
- Think about what this kind of business buys: a cleaner buying from a chemical supplier is Materials & supplies; a plumber at Reece is Materials & supplies.
- "Wages & super" is paying staff or super funds. "Transfers" is moving money between the business's own accounts, or loan/credit card repayments.
- "Other" is for business costs that fit no other category.
- Be honest about confidence. Use 0.8 or more only when the merchant or description makes it clear. Use under 0.6 when you're guessing (e.g. a person's name, a vague code, a shop that sells many kinds of things). The owner is asked about anything under 0.6.
Return one result for every transaction number.`;
}

type Row = { id: string; date: string; description: string; merchant: string | null; amount: number | string; bank_category: string | null };
type Result = { n: number; category: string; confidence: number };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: 'method', message: 'Use POST.' });

  const db = adminDb();
  const owner = await ownerBusiness(req, db);
  if (!owner) return reply(401, { error: 'auth', message: 'Please log in again.' });

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')?.trim();
  if (!apiKey) {
    console.error('sort-transactions: ANTHROPIC_API_KEY not set');
    return reply(503, { error: 'setup', message: 'AI sorting isn’t set up yet.' });
  }

  const { data: business } = await db.from('businesses').select('name, industry, system_type').eq('id', owner.id).maybeSingle<{
    name: string | null;
    industry: string | null;
    system_type: string | null;
  }>();
  const retail = business?.system_type === 'retail';
  const hospitality = business?.system_type === 'hospitality';
  const categories = retail ? RETAIL : hospitality ? HOSPITALITY : CATEGORIES;
  const prompt = (retail ? retailPrompt : hospitality ? hospitalityPrompt : systemPrompt)({
    name: business?.name || 'this business',
    industry: business?.industry ?? null,
  });

  // Money out that the quick rules weren't sure about, not yet seen by Claude or the owner.
  const { data, error } = await db
    .from('bank_transactions')
    .select('id, date, description, merchant, amount, bank_category')
    .eq('business_id', owner.id)
    .eq('category_source', 'auto')
    .eq('category_method', 'ai')
    .lt('confidence', SURE)
    .lt('amount', 0)
    .eq('category_review_done', false)
    .order('date', { ascending: false })
    .limit(MAX);
  if (error) {
    console.error('sort-transactions load:', error.message);
    return reply(500, { error: 'load', message: 'Couldn’t load your transactions.' });
  }
  const rows = (data ?? []) as Row[];
  if (rows.length === 0) return reply(200, { sorted: 0, unsure: 0, updates: [] });

  const client = new Anthropic({ apiKey });
  let sorted = 0;
  let unsure = 0;
  const updates: { id: string; category?: string; confidence?: number }[] = [];

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const list = batch
      .map((r, n) =>
        [
          `${n + 1}.`,
          r.date,
          `$${Math.abs(Number(r.amount)).toFixed(2)}`,
          `"${r.description}"`,
          r.merchant ? `merchant: ${r.merchant}` : '',
          r.bank_category ? `bank's category: ${r.bank_category}` : '',
        ]
          .filter(Boolean)
          .join(' | '),
      )
      .join('\n');

    let results: Result[] = [];
    try {
      const response = await client.beta.messages.create({
        model: 'claude-sonnet-5-5',
        max_tokens: 8000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low', format: { type: 'json_schema', schema: schemaFor(categories) } },
        system: prompt,
        messages: [{ role: 'user', content: `Sort these transactions:\n${list}` }],
      });
      if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') {
        console.error('sort-transactions stop_reason:', response.stop_reason);
        continue; // leave this batch in Needs review
      }
      const text = response.content.find((b) => b.type === 'text');
      results = (JSON.parse(text && text.type === 'text' ? text.text : '{}') as { results?: Result[] }).results ?? [];
    } catch (e) {
      console.error('sort-transactions Claude:', e instanceof Error ? e.message : e);
      continue;
    }

    for (const [n, row] of batch.entries()) {
      const r = results.find((x) => x.n === n + 1);
      const valid = r && categories.includes(r.category) && Number.isFinite(r.confidence);
      const confidence = valid ? Math.max(0, Math.min(1, Math.round(r.confidence * 100) / 100)) : 0;
      const sure = valid && confidence >= SURE;
      // Marked "claude" either way, so it's never sent twice; only a sure answer changes the category.
      const update = sure
        ? { category: r!.category, confidence, category_method: 'claude' }
        : { category_method: 'claude' };
      const { error: saveError } = await db
        .from('bank_transactions')
        .update(update)
        .eq('id', row.id)
        .eq('business_id', owner.id)
        .eq('category_source', 'auto');
      if (saveError) {
        console.error('sort-transactions save:', saveError.message);
        continue;
      }
      if (sure) sorted++;
      else unsure++;
      updates.push(sure ? { id: row.id, category: r!.category, confidence } : { id: row.id });
    }
  }

  return reply(200, { sorted, unsure, updates });
});
