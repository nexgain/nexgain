// Sorting bank transactions, shared by the bank sync (Edge Functions), the app
// and the tests. Pure functions only (no database).
//
// How a transaction gets its category, in order:
//   1. The owner's earlier choice for the same merchant ("learned").
//   2. Known merchant rules: Ampol -> Fuel, Bunnings -> Materials... ("rule").
//   3. A best guess from clues in the bank's text, the bank's own label and
//      repeating payments, with a confidence score ("ai"). Unsure ones go to
//      "Needs review" with a one-tap question.
// It also matches money coming in to unpaid invoices, and suggests which job
// an expense was for (when "Link expenses to jobs" is on).
import { cleanMerchantName } from './transactions.ts';

// Must match the names in the app (src/data/bank.ts and EXPENSE_CATEGORIES in src/data/finance.ts).
export type Category =
  | 'Income'
  | 'Transfers'
  | 'Fuel'
  | 'Materials & supplies'
  | 'Equipment & tools'
  | 'Vehicle'
  | 'Rent'
  | 'Utilities'
  | 'Insurance'
  | 'Phone & internet'
  | 'Software & subscriptions'
  | 'Advertising'
  | 'Wages & super'
  | 'Bank fees'
  | 'Tax'
  | 'Other';

// Checked in order: the first match wins (so "google ads" is Advertising, not Software).
export const RULES: [Category, RegExp][] = [
  ['Tax', /\b(ato|australian taxation|tax office|bas payment)\b/],
  ['Wages & super', /\b(wages?|salary|payroll|superannuation|super fund|clearing house|australiansuper|rest super|hostplus|cbus)\b/],
  ['Advertising', /\b(google\s*\*?\s*ads|facebk|facebook|meta ads|instagram|hipages|airtasker|oneflare|service seeking|yellow pages|advertis\w*|marketing)\b/],
  [
    'Fuel',
    /\b(fuel|petrol|diesel|service station|bp|shell|caltex|ampol|7-eleven|7 eleven|united petroleum|puma energy|metro petroleum|liberty oil|mobil|eg fuel|on the run|otr)\b/,
  ],
  [
    'Materials & supplies',
    /\b(bunnings|mitre 10|home timber|hardware|timber|reece|tradelink|middys|rexel|lawrence and hanson|l&h|beacon lighting|plumbing|electrical wholesal\w*|building supplies|bowens|dulux|taubmans|paint|concrete|cement|boral|officeworks|supplies|materials)\b/,
  ],
  ['Equipment & tools', /\b(total tools|sydney tools|tools?|kennards|coates|equipment|machinery)\b/],
  [
    'Vehicle',
    /\b(rego|registration|service nsw|vicroads|tmr|mechanic|tyres?|tyrepower|bob jane|repco|supercheap|autobarn|car wash|linkt|e-?toll|tolls?|parking|wilson parking|secure parking|motor vehicle|automotive)\b/,
  ],
  ['Insurance', /\b(insurance|insure|nrma|allianz|suncorp|qbe|aami|gio|racv|racq|budget direct|youi|cgu|zurich)\b/],
  ['Phone & internet', /\b(telstra|optus|vodafone|tpg|aussie broadband|belong|iinet|dodo|amaysim|boost mobile|internet|broadband|nbn)\b/],
  [
    'Utilities',
    /\b(agl|origin energy|energyaustralia|energy australia|red energy|alinta|simply energy|electricity|power|gas|water|sydney water|yarra valley water|council rates)\b/,
  ],
  ['Rent', /\b(rent|rental|lease|real estate|property management)\b/],
  [
    'Software & subscriptions',
    /\b(xero|myob|quickbooks|adobe|microsoft|google|apple\.com|dropbox|canva|zoom|slack|software|subscription|app store|itunes)\b/,
  ],
  ['Bank fees', /\b(account fee|monthly fee|bank fee|merchant fee|dishonour fee|overdrawn fee|international transaction fee|fee)\b/],
];

export const INCOME: Category = 'Income';
export const TRANSFERS: Category = 'Transfers';
export const WAGES: Category = 'Wages & super';

// ---------------------------------------------------------------------------
// The six "Expenses by category" groups on the Transactions page
// ---------------------------------------------------------------------------

export type SpendGroupId = 'materials' | 'labour' | 'tools' | 'fuel' | 'vehicle' | 'other';

export type SpendGroup = {
  id: SpendGroupId;
  name: string;
  description: string;
  /** The detailed categories in this group ("other" takes everything else that's money out). */
  categories: Category[];
  /** The category used when the owner picks this group in "Needs review". */
  pick: Category;
};

export const SPEND_GROUPS: SpendGroup[] = [
  { id: 'materials', name: 'Materials', description: 'Timber, fixings and supplies', categories: ['Materials & supplies'], pick: 'Materials & supplies' },
  { id: 'labour', name: 'Labour', description: 'Wages and contractor payments', categories: ['Wages & super'], pick: 'Wages & super' },
  { id: 'tools', name: 'Tools', description: 'Tools and equipment hire', categories: ['Equipment & tools'], pick: 'Equipment & tools' },
  { id: 'fuel', name: 'Fuel', description: 'Petrol and diesel', categories: ['Fuel'], pick: 'Fuel' },
  { id: 'vehicle', name: 'Vehicle', description: 'Rego, servicing, tolls and parking', categories: ['Vehicle'], pick: 'Vehicle' },
  {
    id: 'other',
    name: 'Other',
    description: 'Phone, insurance, software and more',
    categories: ['Rent', 'Utilities', 'Insurance', 'Phone & internet', 'Software & subscriptions', 'Advertising', 'Bank fees', 'Tax', 'Other'],
    pick: 'Other',
  },
];

/** Which group a category belongs to. Income and transfers aren't spending (null). */
export function groupOf(category: string): SpendGroupId | null {
  if (category === INCOME || category === TRANSFERS) return null;
  return SPEND_GROUPS.find((g) => g.id !== 'other' && (g.categories as string[]).includes(category))?.id ?? 'other';
}

export const groupById = (id: string) => SPEND_GROUPS.find((g) => g.id === id) ?? null;

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

export type SortMethod = 'rule' | 'learned' | 'ai' | 'owner';

export type Sorting = {
  category: Category;
  /** 0 to 1: how sure NexGain is. */
  confidence: number;
  method: SortMethod;
  /** Why, in plain English (shown on the transaction). */
  reason: string;
};

/** Below this, the owner is asked to check the category ("Needs review"). */
export const REVIEW_BELOW = 0.6;

export type SortInput = {
  /** Money in positive, money out negative. */
  amount: number;
  description: string;
  merchant: string | null;
  /** The bank's own label for the kind of spending, when it has one. */
  bankCategory?: string | null;
  /** "YYYY-MM-DD" */
  date: string;
};

export type SortContext = {
  /** The owner's remembered choices: merchant key -> category. */
  learned: Map<string, string>;
  /** Contractors' names (payments to them are Labour). */
  contractorNames: string[];
  /** Other money-out transactions, to spot repeating payments (subscriptions). */
  history: SortInput[];
};

/** The merchant's name as the owner's remembered choices are saved under, e.g. "bunnings". */
export function merchantKey(t: Pick<SortInput, 'merchant' | 'description'>) {
  return cleanMerchantName(t.merchant?.trim() || t.description || '')
    .toLowerCase()
    .trim();
}

const TRANSFER_WORDS = /\b(transfer (to|from)|internal transfer|tfr|own account|to savings|from savings|between accounts)\b/;

/** Clues for the best guess: words in the bank's text or label, by category. */
const CLUES: [Category, RegExp, number][] = [
  ['Materials & supplies', /\b(brick|bricks|sand|gravel|soil|mulch|landscap\w*|nursery|garden centre|fencing|roofing|plaster\w*|gyprock|tiles?|tiling|glass|steel|metal|fastener\w*|fixings?|screws?|nails|bolts|hinges|sealant|silicone|adhesive|chemicals?|cleaning supplies|janitorial|pool supplies|irrigation|pipe|cable|wholesal\w*|trade (centre|depot|supplies)|building|construction)\b/, 0.75],
  ['Equipment & tools', /\b(hire|rental equipment|power tools|makita|milwaukee|dewalt|ryobi|stihl|husqvarna|ladder|compressor|generator|blower|mower|trailer hire)\b/, 0.7],
  ['Fuel', /\b(servo|petroleum|gas station|truck stop|roadhouse|lpg|adblue)\b/, 0.75],
  ['Vehicle', /\b(auto|motors?|smash|panel ?beat\w*|car service|service centre|transmission|windscreen|towing|roadside|green slip|ctp|toll|parking|park)\b/, 0.7],
  ['Wages & super', /\b(contract(or|ing)?|labour hire|labou?r|subbie|sub-?contract\w*|staffing|recruitment)\b/, 0.7],
  ['Phone & internet', /\b(mobile|telco|telecom\w*|sim|data plan)\b/, 0.65],
  ['Software & subscriptions', /\b(\.com|\.io|app|cloud|online|digital|saas|hosting|domain|website)\b/, 0.6],
  ['Insurance', /\b(underwrit\w*|policy|cover)\b/, 0.6],
  ['Advertising', /\b(ads|promo\w*|signage|printing|flyers?|business cards)\b/, 0.6],
];

/** Same merchant charging about the same amount in 3 or more different months. */
function isRepeating(t: SortInput, history: SortInput[]) {
  const key = merchantKey(t);
  if (!key) return false;
  const same = history.filter((h) => h.amount < 0 && merchantKey(h) === key && Math.abs(h.amount - t.amount) <= Math.abs(t.amount) * 0.1);
  return new Set(same.map((h) => h.date.slice(0, 7))).size >= 3;
}

/** The category for one bank transaction, how sure NexGain is, and why. */
export function sortTransaction(t: SortInput, ctx: SortContext): Sorting {
  const text = [t.merchant, t.description, t.bankCategory].filter(Boolean).join(' ').toLowerCase();
  if (TRANSFER_WORDS.test(text)) return { category: TRANSFERS, confidence: 0.9, method: 'rule', reason: 'Looks like a transfer between accounts.' };
  if (t.amount > 0) return { category: INCOME, confidence: 0.95, method: 'rule', reason: 'Money coming in.' };

  const key = merchantKey(t);
  const learned = key ? ctx.learned.get(key) : undefined;
  if (learned) {
    return { category: learned as Category, confidence: 1, method: 'learned', reason: `You sorted ${cleanMerchantName(t.merchant || t.description)} as ${learned} before.` };
  }

  const contractor = ctx.contractorNames.find((name) => name.trim().length >= 4 && text.includes(name.toLowerCase().trim()));
  if (contractor) return { category: WAGES, confidence: 0.9, method: 'rule', reason: `A payment to your contractor ${contractor}.` };

  for (const [category, pattern] of RULES) {
    if (pattern.test(text)) {
      return { category, confidence: 0.95, method: 'rule', reason: `${cleanMerchantName(t.merchant || t.description)} is a known ${category.toLowerCase()} merchant.` };
    }
  }

  // Best guess from clues, more sure when several point the same way.
  let best: { category: Category; score: number; word: string } | null = null;
  for (const [category, pattern, weight] of CLUES) {
    const hits = text.match(new RegExp(pattern.source, 'g')) ?? [];
    if (hits.length === 0) continue;
    const score = Math.min(0.9, weight + (hits.length - 1) * 0.08);
    if (!best || score > best.score) best = { category, score, word: hits[0] ?? '' };
  }
  if (isRepeating(t, ctx.history) && (!best || best.score < 0.65)) {
    return { category: 'Software & subscriptions', confidence: 0.65, method: 'ai', reason: 'The same amount is charged every month, so it looks like a subscription.' };
  }
  if (best) return { category: best.category, confidence: best.score, method: 'ai', reason: `The bank's description mentions "${best.word}".` };
  return { category: 'Other', confidence: 0.3, method: 'ai', reason: 'NexGain couldn’t tell what this was for.' };
}

// ---------------------------------------------------------------------------
// Money in -> unpaid invoices
// ---------------------------------------------------------------------------

export type UnpaidInvoice = {
  id: string;
  number: string;
  clientName: string;
  total: number;
  /** The payment reference printed on the invoice, if any. */
  reference: string;
};

export type PaymentMatch =
  | { kind: 'one'; invoice: UnpaidInvoice; why: string }
  | { kind: 'several'; invoices: UnpaidInvoice[] }
  | { kind: 'none' };

const digits = (s: string) => s.replace(/\D/g, '');
const words = (s: string) => s.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 3);

/**
 * Which unpaid invoice a payment is for: the amount first, then (if several
 * have that amount) the payment reference or invoice number, then the payer's name.
 */
export function matchPayment(t: Pick<SortInput, 'amount' | 'description' | 'merchant'>, invoices: UnpaidInvoice[]): PaymentMatch {
  if (t.amount <= 0) return { kind: 'none' };
  const cents = Math.round(t.amount * 100);
  const sameAmount = invoices.filter((i) => Math.round(i.total * 100) === cents);
  if (sameAmount.length === 0) return { kind: 'none' };
  const text = `${t.merchant ?? ''} ${t.description}`.toLowerCase();

  // The payment reference, or the invoice's number (e.g. "1042" for INV-1042), in the bank's text.
  const byRef = sameAmount.filter((i) => {
    const ref = i.reference.trim().toLowerCase();
    const num = digits(i.number).replace(/^0+/, '');
    return (ref.length >= 3 && text.includes(ref)) || (num.length >= 3 && new RegExp(`(^|\\D)0*${num}(\\D|$)`).test(text));
  });
  if (byRef.length === 1) return { kind: 'one', invoice: byRef[0], why: `same amount and the reference ${byRef[0].reference || byRef[0].number}` };

  const payer = new Set(words(text));
  const byName = (byRef.length > 1 ? byRef : sameAmount).filter((i) => words(i.clientName).some((w) => payer.has(w)));
  // A first name AND surname match, or a unique surname match.
  if (byName.length === 1) return { kind: 'one', invoice: byName[0], why: `same amount and the payer's name (${byName[0].clientName})` };
  if (sameAmount.length === 1) return { kind: 'one', invoice: sameAmount[0], why: 'the same amount (the only unpaid invoice for it)' };
  return { kind: 'several', invoices: byName.length > 1 ? byName : sameAmount };
}

// ---------------------------------------------------------------------------
// Expense -> job (when "Link expenses to jobs" is on)
// ---------------------------------------------------------------------------

export type JobOption = {
  id: string;
  /** e.g. "Smith deck" */
  label: string;
  /** "YYYY-MM-DD" */
  date: string;
  status: string;
  /** e.g. "Ipswich" (from the job's address), for travel costs. */
  suburb?: string | null;
};

/** Expense groups that are usually bought for a particular job (not wages: those cover many jobs). */
const JOB_GROUPS: SpendGroupId[] = ['materials', 'tools', 'fuel'];

const dayDiff = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** The job an expense was most likely for: a job on the same day, or within 3 days after the purchase. */
export function suggestJob(t: Pick<SortInput, 'amount' | 'date'> & { category: string }, jobs: JobOption[]): JobOption | null {
  const group = groupOf(t.category);
  if (t.amount >= 0 || !group || !JOB_GROUPS.includes(group)) return null;
  const near = jobs
    .filter((j) => j.status !== 'cancelled')
    .map((j) => ({ job: j, days: dayDiff(t.date, j.date) }))
    .filter((x) => x.days >= -1 && x.days <= 3)
    .sort((a, b) => Math.abs(a.days) - Math.abs(b.days));
  if (near.length === 0) return null;
  // Two jobs equally close: don't guess.
  if (near.length > 1 && Math.abs(near[0].days) === Math.abs(near[1].days)) return null;
  return near[0].job;
}

/** "12 Smith St, Ipswich QLD 4305" -> "Ipswich". */
export function suburbOf(address: string | null | undefined): string | null {
  if (!address) return null;
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const last = parts[parts.length - 1] ?? '';
  // "Ipswich QLD 4305": drop the state and postcode.
  const suburb = last.replace(/\b(QLD|NSW|VIC|SA|WA|TAS|NT|ACT)\b/gi, '').replace(/\d{4}/g, '').replace(/\s+/g, ' ').trim();
  return suburb || (parts.length > 2 ? (parts[parts.length - 2] ?? null) : null);
}

export type TravelCost = { suburb: string; jobs: number; fuel: number };

/**
 * Fuel bought in the same suburb as jobs, around the job days, e.g. two jobs in
 * Ipswich and about $120 of fuel from Ipswich servos. Suburbs where fuel is also
 * bought on ordinary days (the local servo near home) don't count. Biggest first.
 */
export function travelCosts(
  fuel: Pick<SortInput, 'amount' | 'description' | 'date'>[],
  jobs: Pick<JobOption, 'suburb' | 'date' | 'status'>[],
): TravelCost[] {
  const bySuburb = new Map<string, { name: string; jobs: number; dates: string[] }>();
  for (const j of jobs) {
    if (!j.suburb || j.status === 'cancelled') continue;
    const key = j.suburb.toLowerCase();
    const entry = bySuburb.get(key) ?? { name: j.suburb, jobs: 0, dates: [] };
    entry.jobs++;
    entry.dates.push(j.date);
    bySuburb.set(key, entry);
  }
  const out: TravelCost[] = [];
  for (const [key, entry] of bySuburb) {
    const word = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    const there = fuel.filter((f) => f.amount < 0 && word.test(f.description));
    const nearAJob = (f: (typeof there)[number]) => !!f.date && entry.dates.some((d) => Math.abs(dayDiff(f.date, d)) <= 2);
    if (there.length === 0 || !there.every(nearAJob)) continue;
    const spent = there.reduce((sum, f) => sum - f.amount, 0);
    if (spent > 0) out.push({ suburb: entry.name, jobs: entry.jobs, fuel: Math.round(spent * 100) / 100 });
  }
  return out.sort((a, b) => b.fuel - a.fuel);
}
