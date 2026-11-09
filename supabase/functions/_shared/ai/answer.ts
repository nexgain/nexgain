// The FREE AI Assistant: answers questions about the business without a paid
// AI service. It works out what's being asked (spending, overdue invoices,
// jobs with no staff, biggest supplier, price rises, job costs...), who or
// what it's about (a supplier, category, client, team member or job) and when
// ("last month", "since July", "this financial year"), then answers with the
// same tested lookups the Claude version uses (tools.ts). Pure functions, so
// it runs in the app on the phone, on the server and in tests.
import { addDays, addMonths, dateKeyOf, daysBetween, formatDate, monthName, previousPeriod, resolvePeriod, startOfWeek, todayKey } from './dates.ts';
import { money, runHealthCheck } from './insights.ts';
import { buildCard, runTool, TRANSACTIONS_NOT_CONNECTED } from './tools.ts';
import { KNOWN_SUPPLIER_NAMES, merchantOf, squash } from './transactions.ts';
import type { BusinessSnapshot, DateKey, ResultCard } from './types.ts';

export type FreeAnswer = {
  /** False when the question couldn't be worked out (the reply then suggests questions to try). */
  understood: boolean;
  text: string;
  cards: ResultCard[];
  /** "Roster someone on a job": who can be picked (the app saves it once the owner confirms). */
  roster?: RosterProposal;
  /** A follow-up ("when was the last one?") is answered as this fuller question; the chat keeps it for the next follow-up. */
  asked?: string;
};

/** One team member the owner can roster on a job. */
export type RosterOption = {
  employeeId: string;
  name: string;
  role: string;
  /** Already rostered on another shift at the same time, e.g. "Busy 08:00–12:00 (Office clean)". */
  busy: string | null;
  /** Already on this job (can't be picked again). */
  alreadyOn: boolean;
};

export type RosterProposal = {
  jobId: string;
  /** e.g. "House Wash (Q-4521)" */
  jobLabel: string;
  /** e.g. "11 Nov 2026, 8:00 am–11:00 am" */
  when: string;
  options: RosterOption[];
  /** Ticked to start with (people the owner named, or everyone free for "all employees"). */
  preselected: string[];
};

/** What the chat already knows, e.g. the last job shown, for "this job". */
export type AnswerContext = {
  lastJobId?: string | null;
  /** The previous question in the chat (as it was understood), for follow-ups. */
  previousQuestion?: string | null;
};


/** Example questions, shown when a question isn't understood. */
export const EXAMPLE_QUESTIONS = [
  'How much did I spend at Bunnings last month?',
  'What did I spend on fuel this week?',
  "Who's my biggest supplier this year?",
  'Have material costs increased?',
  'Which invoices are overdue?',
  'Which jobs have no staff?',
  "Who's working tomorrow?",
  'What was my profit last month?',
  'What needs my attention?',
  "Who's free Thursday morning?",
  "What's on tomorrow?",
  'Who clocked in late this week?',
  "Whose White Card expires soon?",
  "What's due in the next 2 weeks?",
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Result = Record<string, any>;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const has = (q: string, pattern: RegExp) => pattern.test(q);
const capital = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const cardsOf = (s: BusinessSnapshot, type: ResultCard['type'], ids: string[], now: Date, max = 6) =>
  ids
    .slice(0, max)
    .map((id) => buildCard(s, type, id, now))
    .filter((c): c is ResultCard => c !== null);

// ---------------------------------------------------------------------------
// Understanding the question
// ---------------------------------------------------------------------------

const MONTHS: [RegExp, number][] = [
  [/\bjan(uary)?\b/, 1],
  [/\bfeb(ruary)?\b/, 2],
  [/\bmar(ch)?\b/, 3],
  [/\bapr(il)?\b/, 4],
  [/\bmay\b/, 5],
  [/\bjune?\b/, 6],
  [/\bjuly?\b/, 7],
  [/\baug(ust)?\b/, 8],
  [/\bsep(t|tember)?\b/, 9],
  [/\boct(ober)?\b/, 10],
  [/\bnov(ember)?\b/, 11],
  [/\bdec(ember)?\b/, 12],
];

const pad = (n: number) => String(n).padStart(2, '0');

/** The most recent 1st of that month that isn't in the future. */
function latestMonthStart(month: number, today: string, year?: number) {
  if (year) return `${year}-${pad(month)}-01`;
  const y = Number(today.slice(0, 4));
  const candidate = `${y}-${pad(month)}-01`;
  return candidate <= today ? candidate : `${y - 1}-${pad(month)}-01`;
}

/** A period the lookups understand ("last_month", "since:2026-07-01", ...), or null if none was mentioned. */
export function findPeriod(q: string, now: Date): string | null {
  const today = todayKey(now);
  const range = (start: string, end: string) => `${start}..${end}`;
  if (has(q, /\byesterday\b/)) return 'yesterday';
  if (has(q, /\btomorrow\b/)) return range(addDays(today, 1), addDays(today, 1));
  if (has(q, /\btoday\b|\bso far today\b/)) return 'today';
  if (has(q, /\bnext week\b/)) {
    const monday = addDays(startOfWeek(today), 7);
    return range(monday, addDays(monday, 6));
  }
  if (has(q, /\b(this|current) week\b|\bso far this week\b|\bweek to date\b/)) return 'this_week';
  if (has(q, /\b(last|previous) week\b/)) return 'last_week';
  if (has(q, /\b(this|current) (financial|fiscal|tax) year\b|\bthis fy\b|\bfy to date\b|\bfinancial year to date\b/)) return 'this_financial_year';
  if (has(q, /\b(last|previous) (financial|fiscal|tax) year\b|\blast fy\b/)) return 'last_financial_year';
  if (has(q, /\b(this|current) month\b|\bso far this month\b|\bmonth to date\b/)) return 'this_month';
  if (has(q, /\b(last|previous) month\b/)) return 'last_month';
  if (has(q, /\b(this|current) year\b|\bso far this year\b|\byear to date\b|\bytd\b/)) return 'this_year';
  if (has(q, /\b(last|previous) year\b/)) return 'last_year';
  if (has(q, /\ball time\b|\bever\b|\bin total\b/)) return 'all_time';
  const lastN = /\b(?:last|past|previous)\s+(\d{1,3})\s+(day|week|month)s?\b/.exec(q);
  if (lastN) {
    const n = Number(lastN[1]);
    const days = lastN[2] === 'day' ? n : lastN[2] === 'week' ? n * 7 : n * 30;
    return range(addDays(today, -(days - 1)), today);
  }
  if (has(q, /\b(past|last) (fortnight)\b/)) return range(addDays(today, -13), today);

  // "since July", "since 1 August", "in October", "October 2026"
  for (const [pattern, month] of MONTHS) {
    const m = pattern.exec(q);
    if (!m) continue;
    // "may" is usually the verb ("may I...") unless it's clearly a month.
    const before = q.slice(0, m.index);
    const after = q.slice(m.index + m[0].length);
    const year = /^\s*(20\d{2})\b/.exec(after)?.[1];
    if (month === 5 && !/\b(in|since|during|for|of|from)\s*$/.test(before) && !year) continue;
    const day = /\b(\d{1,2})(st|nd|rd|th)?\s*(of\s*)?$/.exec(before)?.[1];
    if (/\bsince\s+((the\s+)?(start|beginning)\s+of\s+)?(\d{1,2}(st|nd|rd|th)?\s*(of\s*)?)?$/.test(before)) {
      const start = latestMonthStart(month, today, year ? Number(year) : undefined);
      return `since:${day ? `${start.slice(0, 8)}${pad(Number(day))}` : start}`;
    }
    const start = latestMonthStart(month, today, year ? Number(year) : undefined);
    return `month:${start.slice(0, 7)}`;
  }
  return null;
}

const CATEGORY_WORDS: [RegExp, string][] = [
  [/\b(fuel|petrol|diesel|unleaded|servo)\b/, 'fuel'],
  [/\b(materials?|supplies|timber|paint|hardware|chemicals?)\b/, 'materials'],
  [/\b(tools?|equipment)\b/, 'tools'],
  [/\b(labou?r|subcontract(or|ors|ing)?|labour hire)\b/, 'labour'],
  [/\b(subscriptions?|software|apps?)\b/, 'subscriptions'],
  [/\b(vehicles?|car|ute|van|rego|registration|tyres?)\b/, 'vehicle'],
];

function findCategory(q: string, s: BusinessSnapshot): string | null {
  for (const [pattern, key] of CATEGORY_WORDS) if (pattern.test(q)) return key;
  // A category name used in the business's own transactions.
  const own = [...new Set(s.transactions.map((t) => t.category?.toLowerCase().trim()).filter(Boolean))] as string[];
  return own.find((c) => c.length > 2 && new RegExp(`\\b${c.replace(/[^a-z0-9 ]/g, '')}\\b`).test(q)) ?? null;
}

/** A supplier named in the question: one the business has bought from, a well-known one, or "at <name>". */
function findSupplier(q: string, s: BusinessSnapshot): string | null {
  const names = [...new Set([...s.transactions.map(merchantOf), ...KNOWN_SUPPLIER_NAMES])];
  const flat = squash(q);
  const exact = names
    .filter((n) => squash(n).length >= 3 && flat.includes(squash(n)))
    .sort((a, b) => squash(b).length - squash(a).length)[0];
  if (exact) return exact;
  // First word of a multi-word supplier, e.g. "bayside" for "Bayside Labour Hire".
  const firstWord = names.find((n) => {
    const w = n.toLowerCase().split(' ')[0];
    return w.length >= 5 && new RegExp(`\\b${w.replace(/[^a-z0-9]/g, '')}\\b`).test(q);
  });
  if (firstWord) return firstWord;
  const at = /\b(?:at|from)\s+([a-z0-9&' .-]+?)(?=\s+(?:last|this|in|since|during|over|for|so|today|yesterday|on|the past|past|between|compared|vs)\b|[?.!,]|$)/.exec(q);
  const name = at?.[1]?.trim();
  if (name && name.length >= 3 && !/^(the|a|my|all|least|most|home|work|once)\b/.test(name)) return name;
  return null;
}

const STOPWORDS = new Set(['the', 'and', 'for', 'job', 'jobs', 'with', 'what', 'when', 'where', 'show', 'find', 'next', 'last', 'this', 'from', 'have', 'does', 'much', 'many', 'cost', 'costs', 'spent', 'spend', 'materials', 'material', 'invoice', 'invoices', 'quote', 'quotes', 'client', 'customer', 'week', 'month', 'year', 'today', 'tomorrow', 'working', 'hours', 'shifts', 'roster', 'paid', 'owe', 'owes', 'overdue', 'unpaid', 'about', 'tell', 'more', 'details', 'contact', 'phone', 'email', 'number', 'address']);

/** A client or team member named in the question (full name, or a distinctive first/last name). */
function findPerson<T extends { id: string; name: string }>(q: string, people: T[]): T | null {
  const full = people.find((p) => p.name.length > 2 && q.includes(p.name.toLowerCase()));
  if (full) return full;
  const words = new Set(q.split(/[^a-z0-9']+/).filter((w) => w.length >= 3 && !STOPWORDS.has(w)));
  const matches = people.filter((p) => p.name.toLowerCase().split(/\s+/).some((part) => part.length >= 3 && words.has(part)));
  return matches.length === 1 ? matches[0] : null;
}

/** A job named in the question: "#4521", "job 4521", "Q-4521", or its address / title. */
function findJob(q: string, s: BusinessSnapshot) {
  const ref = /#\s?(\d{3,})|\bjob\s*(?:no\.?|number)?\s*#?\s*(\d{3,})\b|\bq-?(\d{3,})\b/.exec(q);
  const number = ref?.[1] ?? ref?.[2] ?? ref?.[3];
  if (number) return s.jobs.find((j) => (j.quoteNumber ?? '').replace(/\D/g, '') === number || j.id.startsWith(number)) ?? null;
  const address = s.jobs.find((j) => {
    const street = j.address.toLowerCase().split(',')[0].trim();
    return street.length >= 6 && q.includes(street);
  });
  if (address) return address;
  return s.jobs.find((j) => j.title.length >= 5 && q.includes(j.title.toLowerCase())) ?? null;
}

// ---------------------------------------------------------------------------
// Answering
// ---------------------------------------------------------------------------

function comparisonText(change: number | null, label: string, previous: number) {
  if (previous <= 0) return '';
  if (change === null || change === 0) return ` That's about the same as ${label} (${money(previous)}).`;
  return ` That's ${Math.abs(Math.round(change))}% ${change > 0 ? 'more' : 'less'} than ${label} (${money(previous)}).`;
}

/** A period label as it reads after a verb: "in October 2026", "this week (...)", "between 1 Nov and 8 Nov". */
export function inPeriod(label: string) {
  if (/^(this|the|since|today|yesterday|all time|on |last)/.test(label)) return label;
  if (label.includes(' – ')) return `between ${label.replace(' – ', ' and ')}`;
  return `in ${label}`;
}

/** "When was the last one?", "the latest", "most recent": the newest one, ignoring dates. */
const LATEST = /\b(the )?(last|latest|most recent|previous) (one|time|incident|report|purchase|visit|job)\b|\bwhen was the last\b|\bmost recent\b|\blatest\b/;

const notConnected = (): FreeAnswer => ({ understood: true, text: TRANSACTIONS_NOT_CONNECTED, cards: [] });

function spendAnswer(
  s: BusinessSnapshot,
  now: Date,
  supplier: string | null,
  category: string | null,
  period: string | null,
  jobId: string | null,
  latest = false,
): FreeAnswer {
  if (!s.transactionsConnected) return notConnected();
  if (latest) {
    const r: Result = runTool(s, 'search_transactions', { supplier, category, job_id: jobId, limit: 1 }, now).result as Result;
    const t = r.transactions?.[0];
    const what = [category, supplier ? `at ${t?.supplier ?? capital(supplier)}` : null].filter(Boolean).join(' ');
    if (!t) return { understood: true, text: `I couldn't find any ${what ? `${what} ` : ''}purchases.`, cards: [] };
    return {
      understood: true,
      text: `Your last ${category ? `${category} ` : ''}purchase${supplier ? ` at ${t.supplier}` : ''} was ${money(t.amount)} on ${formatDate(t.date)}${t.description ? ` (${t.description})` : supplier ? '' : ` at ${t.supplier}`}.`,
      cards: cardsOf(s, 'transaction', [t.id], now),
    };
  }
  const r: Result = runTool(s, 'get_spend_by_supplier', { supplier, category, job_id: jobId, period }, now).result as Result;
  if (r.error) return { understood: true, text: r.error, cards: [] };
  const what = [category, supplier ? `at ${r.supplier ?? capital(supplier)}` : null].filter(Boolean).join(' ');
  const when = period ? ` ${inPeriod(r.period)}` : '';
  if (r.purchases === 0) {
    return { understood: true, text: `I couldn't find any ${category ?? ''} purchases${supplier ? ` at ${capital(supplier)}` : ''}${when || ' yet'}.`.replace(/\s+/g, ' '), cards: [] };
  }
  const comparison = r.compared_with ? comparisonText(r.compared_with.change_percent, r.compared_with.period, r.compared_with.total) : '';
  return {
    understood: true,
    text: `You spent ${money(r.total)}${what ? ` ${what.startsWith('at') ? '' : 'on '}${what}` : ''}${when} across ${plural(r.purchases, 'purchase')}.${comparison}`,
    cards: cardsOf(s, 'transaction', r.transactions.map((t: Result) => t.id), now),
  };
}

function biggestSupplierAnswer(s: BusinessSnapshot, now: Date, period: string | null, category: string | null): FreeAnswer {
  if (!s.transactionsConnected) return notConnected();
  const r: Result = runTool(s, 'get_spending_trends', { group_by: 'supplier', period: period ?? 'this_year', category }, now).result as Result;
  if (r.error) return { understood: true, text: r.error, cards: [] };
  const groups = (r.groups as Result[]).filter((g) => g.total > 0);
  if (groups.length === 0) return { understood: true, text: `I couldn't find any ${category ?? ''} spending ${inPeriod(r.period)}.`.replace(/\s+/g, ' '), cards: [] };
  const [top, ...rest] = groups;
  const next = rest.slice(0, 2).map((g) => `${g.name} (${money(g.total)})`);
  return {
    understood: true,
    text: `Your biggest ${category ? `${category} ` : ''}supplier ${inPeriod(r.period)} is ${top.name}: ${money(top.total)} across ${plural(top.purchases, 'purchase')}.${next.length ? ` Next ${next.length === 1 ? 'is' : 'are'} ${next.join(' and ')}.` : ''}`,
    cards: [],
  };
}

function increaseAnswer(s: BusinessSnapshot, now: Date, supplier: string | null, category: string | null, period: string | null, q = ''): FreeAnswer {
  const insights = runHealthCheck(s, now);

  // Materials and products: the same product costing more than last time (from receipts), not total spending.
  const productRises = insights.filter((i) => i.check === 'product_price_increase');
  const named = productRises.filter((i) =>
    String(i.metrics.product ?? '')
      .toLowerCase()
      .split(/[^a-z]+/)
      .some((w) => w.length >= 4 && q.includes(w)),
  );
  if (named.length > 0 || (category === 'materials' && !supplier)) {
    const list = named.length > 0 ? named : productRises;
    const cards = list.slice(0, 6).map((i) => ({ type: 'insight' as const, id: i.key, title: i.title, summary: i.summary, severity: i.severity }));
    if (list.length === 0) {
      return {
        understood: true,
        text:
          (s.purchases ?? []).length > 0
            ? 'No. The products on your recent receipts cost the same as last time, or less.'
            : 'I check material prices product by product from your receipts, and there aren’t any yet. Add receipts with the camera button on the Transactions page and I’ll compare what you pay for the same product each time.',
        cards: [],
      };
    }
    const first = list[0]!;
    return {
      understood: true,
      text: `Yes, ${plural(list.length, 'product')} cost${list.length === 1 ? 's' : ''} more than last time: ${list.map((i) => i.title).join('; ')}. ${first.suggestion}`,
      cards,
    };
  }

  if (!s.transactionsConnected) return notConnected();
  if (supplier || category) {
    const r: Result = runTool(s, 'get_spending_trends', { group_by: 'category', category, supplier, period: period ?? 'last_month' }, now).result as Result;
    if (r.error) return { understood: true, text: r.error, cards: [] };
    const label = supplier ? `at ${capital(supplier)}` : `on ${category}`;
    const total = (r.groups as Result[]).reduce((t, g) => t + g.total, 0);
    const before = (r.groups as Result[]).reduce((t, g) => t + g.previous_period_total, 0);
    const change = before > 0 ? Math.round(((total - before) / before) * 100) : null;
    const range = resolvePeriod(period ?? 'last_month', now, s.financialYearStartMonth);
    const beforeLabel = range ? previousPeriod(range).label : 'the period before';
    const thisMonth = monthName(todayKey(now));
    const months = (r.monthly_totals_last_6_months as Result[]).filter((m) => m.total > 0);
    const history = months.length >= 2 ? ` Month by month: ${months.map((m) => `${m.month.split(' ')[0].slice(0, 3)}${m.month === thisMonth ? ' so far' : ''} ${money(m.total, false)}`).join(', ')}.` : '';
    // Matching insights (e.g. a category or item price increase) bring the suggested fix.
    const related = insights.filter(
      (i) =>
        i.area === 'spending' &&
        ((category && String(i.metrics.category ?? '').toLowerCase().includes(category)) ||
          (supplier && i.title.toLowerCase().includes(supplier.toLowerCase()))),
    );
    const verdict =
      change === null
        ? `I can't compare yet: there was no spending ${label} ${r.period ? `before ${r.period}` : 'earlier'}.`
        : change > 2
          ? `Yes. You spent ${money(total)} ${label} ${inPeriod(r.period)}, ${change}% more than ${beforeLabel} (${money(before)}).`
          : change < -2
            ? `No, it's down. You spent ${money(total)} ${label} ${inPeriod(r.period)}, ${Math.abs(change)}% less than ${beforeLabel} (${money(before)}).`
            : `Not really. Spending ${label} was ${money(total)} ${inPeriod(r.period)}, about the same as ${beforeLabel} (${money(before)}).`;
    const fix = related[0] ? ` ${related[0].suggestion}` : '';
    return {
      understood: true,
      text: `${verdict}${history}${fix}`,
      cards: related.map((i) => ({ type: 'insight' as const, id: i.key, title: i.title, summary: i.summary, severity: i.severity })),
    };
  }
  // "Have my costs gone up?" without saying which: list what has.
  const rises = insights.filter((i) =>
    ['product_price_increase', 'spending_category_increase', 'same_item_costs_more', 'supplier_costs_more'].includes(i.check),
  );
  if (rises.length === 0) return { understood: true, text: "I can't see any costs that have gone up noticeably lately.", cards: [] };
  return {
    understood: true,
    text: `Yes, ${plural(rises.length, 'cost')} ${rises.length === 1 ? 'has' : 'have'} gone up: ${rises.map((i) => i.title).join('; ')}.`,
    cards: rises.slice(0, 6).map((i) => ({ type: 'insight' as const, id: i.key, title: i.title, summary: i.summary, severity: i.severity })),
  };
}

function overdueAnswer(s: BusinessSnapshot, now: Date, client: { name: string } | null): FreeAnswer {
  const r: Result = runTool(s, 'search_invoices', { status: 'overdue', client: client?.name ?? null }, now).result as Result;
  if (r.count === 0) {
    const unpaid: Result = runTool(s, 'search_invoices', { status: 'unpaid', client: client?.name ?? null }, now).result as Result;
    return {
      understood: true,
      text: `No invoices are overdue${client ? ` for ${client.name}` : ''}.${unpaid.count > 0 ? ` ${plural(unpaid.count, 'invoice')} (${money(unpaid.total)}) ${unpaid.count === 1 ? 'is' : 'are'} unpaid but not due yet.` : ''}`,
      cards: cardsOf(s, 'invoice', unpaid.invoices.map((i: Result) => i.id), now),
    };
  }
  const list = (r.invoices as Result[]).slice(0, 3).map((i) => `${i.number} (${i.client || 'no client'}, ${money(i.total)}, ${plural(i.days_overdue, 'day')} overdue)`);
  return {
    understood: true,
    text: `${plural(r.count, 'invoice')} ${r.count === 1 ? 'is' : 'are'} overdue${client ? ` for ${client.name}` : ''}, totalling ${money(r.total)}: ${list.join('; ')}${r.count > 3 ? ' and more' : ''}. Open each one to send a reminder.`,
    cards: cardsOf(s, 'invoice', r.invoices.map((i: Result) => i.id), now),
  };
}

function quotesAnswer(s: BusinessSnapshot, now: Date, q: string): FreeAnswer {
  const status = has(q, /accept/) ? 'accepted' : has(q, /declin|reject/) ? 'declined' : has(q, /book/) ? 'booked' : 'sent';
  const r: Result = runTool(s, 'search_invoices', { kind: 'quote', status }, now).result as Result;
  const label = status === 'sent' ? 'waiting on a reply' : status;
  if (r.count === 0) return { understood: true, text: `You have no quotes ${label}.`, cards: [] };
  const list = (r.quotes as Result[]).slice(0, 3).map((x) => `${x.number}${x.client ? ` for ${x.client}` : ''} (${money(x.total)}, sent ${x.sent})`);
  return {
    understood: true,
    text: `${plural(r.count, 'quote')} ${r.count === 1 ? 'is' : 'are'} ${label}, worth ${money(r.total)}: ${list.join('; ')}${r.count > 3 ? ' and more' : ''}.${status === 'sent' ? ' A quick follow-up call often wins the job.' : ''}`,
    cards: cardsOf(s, 'invoice', r.quotes.map((x: Result) => x.id), now),
  };
}

function jobsAnswer(s: BusinessSnapshot, now: Date, input: Result, intro: (count: number) => string, none: string): FreeAnswer {
  const r: Result = runTool(s, 'search_jobs', input, now).result as Result;
  if (r.error) return { understood: true, text: r.error, cards: [] };
  if (r.count === 0) return { understood: true, text: none, cards: [] };
  const list = (r.jobs as Result[]).slice(0, 3).map((j) => `${j.title}${j.quote_number ? ` (${j.quote_number})` : ''} on ${j.date}${j.address ? ` at ${j.address}` : ''}`);
  return {
    understood: true,
    text: `${intro(r.count)}: ${list.join('; ')}${r.count > 3 ? ' and more' : ''}.`,
    cards: cardsOf(s, 'job', r.jobs.map((j: Result) => j.id), now),
  };
}

function scheduleAnswer(s: BusinessSnapshot, now: Date, period: string | null, employee: { id: string; name: string } | null): FreeAnswer {
  const r: Result = runTool(s, 'get_team_and_schedule', { period: period ?? 'this_week', employee: employee?.name ?? null }, now).result as Result;
  if (r.error) return { understood: true, text: r.error, cards: [] };
  const team = r.team as Result[];
  const working = team.filter((t) => t.shifts.length > 0);
  if (employee) {
    const me = team[0];
    if (!me || me.shifts.length === 0) return { understood: true, text: `${employee.name} has no shifts ${inPeriod(r.period)}.`, cards: cardsOf(s, 'team_member', [employee.id], now) };
    const shifts = (me.shifts as Result[]).slice(0, 4).map((sh) => `${formatDate(sh.date)} ${sh.start}–${sh.end} (${sh.job})`);
    return {
      understood: true,
      text: `${me.name} has ${plural(me.shifts.length, 'shift')} ${inPeriod(r.period)}, ${me.hours} hours in total: ${shifts.join('; ')}${me.shifts.length > 4 ? ' and more' : ''}.`,
      cards: cardsOf(s, 'team_member', [employee.id], now),
    };
  }
  const gaps = (r.jobs_without_staff as Result[]).length;
  const clashes = (r.clashes as string[]).length;
  const people = working.map((t) => `${t.name} ${t.hours}h`);
  return {
    understood: true,
    text: `${working.length === 0 ? `No one is rostered ${inPeriod(r.period)}.` : `Working ${inPeriod(r.period)}: ${people.join(', ')}.`}${(r.not_rostered as string[]).length && working.length ? ` Not rostered: ${(r.not_rostered as string[]).join(', ')}.` : ''}${gaps ? ` ${plural(gaps, 'job')} still ${gaps === 1 ? 'has' : 'have'} no staff.` : ''}${clashes ? ` Watch out: ${(r.clashes as string[]).join('; ')}.` : ''}`,
    cards: cardsOf(s, 'team_member', working.map((t) => t.id), now),
  };
}

function payrollAnswer(s: BusinessSnapshot, now: Date, period: string | null): FreeAnswer {
  const r: Result = runTool(s, 'get_payroll_summary', { period: period ?? 'this_month' }, now).result as Result;
  if (r.error) return { understood: true, text: r.error, cards: [] };
  const superText = r.super_overdue_total > 0 ? ` ${money(r.super_overdue_total)} of super is overdue.` : r.super_unpaid_total > 0 ? ` ${money(r.super_unpaid_total)} of super is still to be paid.` : '';
  if (r.payslips === 0) return { understood: true, text: `No payroll has been approved ${inPeriod(r.period)}.${superText}`, cards: [] };
  return {
    understood: true,
    text: `Payroll ${inPeriod(r.period)}: ${money(r.total_wages_gross)} in wages, ${money(r.total_tax)} tax (an estimate), ${money(r.total_net)} take-home pay and ${money(r.total_super)} super, across ${plural(r.people.length, 'person', 'people')}.${superText}`,
    cards: cardsOf(s, 'team_member', r.people.map((p: Result) => p.id), now),
  };
}

function moneyAnswer(s: BusinessSnapshot, now: Date, period: string | null, q: string): FreeAnswer {
  const r: Result = runTool(s, 'get_revenue_and_profit', { period: period ?? 'this_month' }, now).result as Result;
  if (r.error) return { understood: true, text: r.error, cards: [] };
  const c = r.compared_with;
  const change = c.revenue_change_percent;
  const focusProfit = has(q, /profit|margin|make money|net\b/);
  const headline = focusProfit
    ? `Your profit ${inPeriod(r.period)} was ${money(r.profit)}: ${money(r.revenue)} revenue less ${money(r.wages_and_super)} wages and super and ${money(r.expenses)} expenses.`
    : `Your revenue ${inPeriod(r.period)} was ${money(r.revenue)} (paid invoices).`;
  const compare =
    change === null
      ? ''
      : ` Revenue is ${change >= 0 ? 'up' : 'down'} ${Math.abs(Math.round(change))}% on ${c.period} (${money(c.revenue)}).`;
  return { understood: true, text: `${headline}${compare}${focusProfit ? '' : ` Profit: ${money(r.profit)}.`}`, cards: [] };
}

function insightsAnswer(s: BusinessSnapshot, now: Date): FreeAnswer {
  const insights = runHealthCheck(s, now);
  if (insights.length === 0) return { understood: true, text: 'Nothing needs your attention right now. Your business looks healthy.', cards: [] };
  const top = insights.slice(0, 4);
  return {
    understood: true,
    text: `${plural(insights.length, 'thing')} to look at. The most important: ${top.map((i) => i.title).join('; ')}. Tap a card for the suggested fix.`,
    cards: top.map((i) => ({ type: 'insight' as const, id: i.key, title: i.title, summary: `${i.summary} ${i.suggestion}`, severity: i.severity })),
  };
}

function transactionsAnswer(s: BusinessSnapshot, now: Date, supplier: string | null, category: string | null, period: string | null): FreeAnswer {
  if (!s.transactionsConnected) return notConnected();
  const r: Result = runTool(s, 'search_transactions', { supplier, category, period, limit: 10 }, now).result as Result;
  if (r.error) return { understood: true, text: r.error, cards: [] };
  if (r.count === 0) return { understood: true, text: 'I couldn’t find any transactions that match.', cards: [] };
  return {
    understood: true,
    text: `${plural(r.count, 'transaction')}${supplier ? ` at ${capital(supplier)}` : ''}${category ? ` for ${category}` : ''} ${r.period === 'all time' ? 'so far' : inPeriod(r.period)}, totalling ${money(r.total)}. ${r.count > 6 ? 'Here are the most recent.' : ''}`.trim(),
    cards: cardsOf(s, 'transaction', r.transactions.map((t: Result) => t.id), now),
  };
}

function clientAnswer(s: BusinessSnapshot, now: Date, client: { id: string; name: string }): FreeAnswer {
  const r: Result = runTool(s, 'search_clients', { query: client.name }, now).result as Result;
  const c = (r.clients as Result[]).find((x) => x.id === client.id) ?? r.clients[0];
  if (!c) return { understood: true, text: `I couldn't find ${client.name}.`, cards: [] };
  const owing = c.overdue_total > 0 ? ` They have ${money(c.overdue_total)} overdue.` : c.unpaid_total > 0 ? ` They have ${money(c.unpaid_total)} unpaid (not due yet).` : ' They have nothing owing.';
  return {
    understood: true,
    text: `${c.name}: ${[c.phone, c.email].filter(Boolean).join(' · ') || 'no contact details saved'}${c.address ? `, ${c.address}` : ''}. ${plural(c.jobs, 'job')} so far, ${money(c.paid_total)} paid in total.${owing}`,
    cards: cardsOf(s, 'client', [c.id], now),
  };
}

// ---------------------------------------------------------------------------
// Rostering staff on a job
// ---------------------------------------------------------------------------

/** Business-time "HH:MM" of a timestamp. */
const hhmm = (iso: string) => new Date(new Date(iso).getTime() + 10 * 3600_000).toISOString().slice(11, 16);
const dayOf = (iso: string) => new Date(new Date(iso).getTime() + 10 * 3600_000).toISOString().slice(0, 10);
const minutesOf = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
};
const ampm = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};

type JobInfo = BusinessSnapshot['jobs'][number];

export function jobLabelOf(job: JobInfo) {
  return `${job.title}${job.quoteNumber ? ` (${job.quoteNumber})` : ''}`;
}

export function jobWhenOf(job: JobInfo) {
  return `${formatDate(dayOf(job.startsAt))}, ${ampm(hhmm(job.startsAt))}–${ampm(hhmm(job.endsAt))}`;
}

/** Everyone who could go on the job, with who's busy at that time and who's already on it. */
export function rosterProposal(s: BusinessSnapshot, job: JobInfo, preselected: string[] = []): RosterProposal {
  const day = dayOf(job.startsAt);
  const start = minutesOf(hhmm(job.startsAt));
  const end = minutesOf(hhmm(job.endsAt)) || 24 * 60;
  const onJob = new Set([...job.assignedEmployeeIds, ...s.shifts.filter((sh) => sh.jobId === job.id).flatMap((sh) => sh.employeeIds)]);
  const options = s.employees
    .filter((e) => e.status !== 'inactive')
    .map((e) => {
      const clash = s.shifts.find(
        (sh) =>
          sh.jobId !== job.id &&
          sh.date === day &&
          sh.employeeIds.includes(e.id) &&
          minutesOf(sh.start) < end &&
          minutesOf(sh.end) > start,
      );
      return {
        employeeId: e.id,
        name: e.name,
        role: e.role,
        busy: clash ? `Busy ${clash.start}–${clash.end} (${clash.jobType})` : null,
        alreadyOn: onJob.has(e.id),
      };
    })
    // Free people first, then busy ones, then those already on the job.
    .sort((a, b) => Number(a.alreadyOn) - Number(b.alreadyOn) || Number(!!a.busy) - Number(!!b.busy) || a.name.localeCompare(b.name));
  return {
    jobId: job.id,
    jobLabel: jobLabelOf(job),
    when: jobWhenOf(job),
    options,
    preselected: preselected.filter((id) => options.some((o) => o.employeeId === id && !o.alreadyOn)),
  };
}

/** "roster/assign someone", "put Mia on the job", "add Jake to job #4521"... */
const ROSTER_REQUEST =
  /\b(roster|re-?roster|assign|allocate)\b(?!ed\b)|\b(put|send|add|book|get|schedule)\b.{0,30}\b(on|to|onto|for)\b.{0,25}\b(job|it|this|that|shift)\b/;
/** ...but not "who's rostered tomorrow?" (that's a schedule question). */
const ROSTER_QUESTION = /\bwho('?s| is| are| was)\b.{0,20}\b(rostered|assigned|working|on)\b|\b(is|are)\b.{0,20}\brostered\b/;

function rosterAnswer(s: BusinessSnapshot, q: string, now: Date, context: AnswerContext): FreeAnswer {
  // The job asked about, or the last job shown in the chat ("this job").
  const job = findJob(q, s) ?? s.jobs.find((j) => j.id === context.lastJobId) ?? null;

  if (!job) {
    const upcoming = s.jobs
      .filter((j) => j.status !== 'cancelled' && j.status !== 'completed' && new Date(j.endsAt).getTime() > now.getTime())
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    if (upcoming.length === 0) return { understood: true, text: "You don't have any upcoming jobs to roster anyone on.", cards: [] };
    return {
      understood: true,
      text: 'Sure. Which job? Tap "Roster staff" on one of your upcoming jobs below, or tell me the job number (like #4521) or the address.',
      cards: cardsOf(s, 'job', upcoming.map((j) => j.id), now),
    };
  }
  if (job.status === 'cancelled') {
    return { understood: true, text: `${jobLabelOf(job)} has been cancelled, so I can't roster anyone on it.`, cards: cardsOf(s, 'job', [job.id], now) };
  }
  if (job.status === 'completed' || new Date(job.endsAt).getTime() <= now.getTime()) {
    return { understood: true, text: `${jobLabelOf(job)} has already finished, so there's no one to roster.`, cards: cardsOf(s, 'job', [job.id], now) };
  }
  if (!s.employees.some((e) => e.status !== 'inactive')) {
    return { understood: true, text: "You don't have any team members yet. Add them on the Employees page, then I can roster them.", cards: [] };
  }

  // People named in the request, or everyone who's free for "all employees".
  const everyone = /\b(all|every|whole)\b.{0,12}\b(employees?|staff|team|people|workers?|one|body)\b|\beveryone\b|\beverybody\b/.test(q);
  const words = new Set(q.split(/[^a-z0-9']+/).filter((w) => w.length >= 3));
  const namedPeople = s.employees.filter(
    (e) => q.includes(e.name.toLowerCase()) || e.name.toLowerCase().split(/\s+/).some((part) => part.length >= 3 && words.has(part)),
  );
  const draft = rosterProposal(s, job);
  const pick = everyone ? draft.options.filter((o) => !o.alreadyOn && !o.busy).map((o) => o.employeeId) : namedPeople.map((e) => e.id);
  const proposal = rosterProposal(s, job, pick);
  if (!proposal.options.some((o) => !o.alreadyOn)) {
    return { understood: true, text: `Everyone in your team is already rostered on ${proposal.jobLabel}.`, cards: cardsOf(s, 'job', [job.id], now) };
  }

  const chosen = proposal.options.filter((o) => proposal.preselected.includes(o.employeeId));
  const busyChosen = chosen.filter((o) => o.busy);
  let text: string;
  if (chosen.length > 0) {
    text = `Roster ${chosen.map((o) => o.name).join(', ')} on ${proposal.jobLabel}, ${proposal.when}? Check the list below and tap Roster to confirm.`;
    if (busyChosen.length > 0) text += ` Heads up: ${busyChosen.map((o) => `${o.name.split(' ')[0]} is ${o.busy!.toLowerCase()}`).join('; ')}.`;
  } else if (namedPeople.length > 0) {
    text = `${namedPeople.map((e) => e.name).join(', ')} ${namedPeople.length === 1 ? 'is' : 'are'} already on ${proposal.jobLabel}. Who else do you want to roster? Tick them below.`;
  } else {
    text = `Yes. Who do you want to roster on ${proposal.jobLabel}, ${proposal.when}? Tick the people below, or choose All employees.`;
  }
  return { understood: true, text, cards: cardsOf(s, 'job', [job.id], now), roster: proposal };
}


// ---------------------------------------------------------------------------
// Team: who's free, clock-ins, qualifications, job reports, daily briefing
// ---------------------------------------------------------------------------

const WEEKDAY_WORDS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

/** Monday = 0 ... Sunday = 6. */
const weekdayIndex = (day: DateKey) => (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;

/** A single day mentioned in the question: today, tomorrow, or a weekday (the next one coming up). */
export function findDay(q: string, now: Date): DateKey | null {
  const today = todayKey(now);
  if (has(q, /\btomorrow\b/)) return addDays(today, 1);
  if (has(q, /\btoday\b|\btonight\b|\bthis (morning|afternoon|arvo)\b/)) return today;
  for (let i = 0; i < WEEKDAY_WORDS.length; i++) {
    if (new RegExp(`\\b${WEEKDAY_WORDS[i]}\\b|\\b${WEEKDAY_WORDS[i].slice(0, 3)}\\b`).test(q)) {
      const next = has(q, new RegExp(`\\bnext ${WEEKDAY_WORDS[i]}\\b`));
      let offset = (i - weekdayIndex(today) + 7) % 7;
      if (next && offset < 7) offset += offset === 0 ? 7 : 0;
      return addDays(today, offset);
    }
  }
  return null;
}

/** A time of day mentioned: "morning", "afternoon", "at 9", "9:30am", "from 8 to 11". */
export function findTimeWindow(q: string): { start: string; end: string; label: string } | null {
  const t = (h: number, m = 0) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const toHour = (h: number, suffix?: string) => (suffix === 'pm' && h < 12 ? h + 12 : suffix === 'am' && h === 12 ? 0 : h < 6 && !suffix ? h + 12 : h);
  const range = /\b(?:from |between )?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|to|and|until|till)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/.exec(q);
  if (range) {
    const sh = toHour(Number(range[1]), range[3] ?? range[6]);
    const eh = toHour(Number(range[4]), range[6]);
    const start = t(sh, Number(range[2] ?? 0));
    const end = t(eh, Number(range[5] ?? 0));
    return { start, end, label: `${ampm(start)}–${ampm(end)}` };
  }
  const at = /\b(?:at|from|for)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b|\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/.exec(q);
  if (at) {
    const h = toHour(Number(at[1] ?? at[4]), at[3] ?? at[6]);
    const m = Number(at[2] ?? at[5] ?? 0);
    const hours = Number(/\bfor (\d{1,2}) hours?\b/.exec(q)?.[1] ?? 2);
    const start = t(h, m);
    const end = t(Math.min(h + hours, 23), m);
    return { start, end, label: `from ${ampm(start)}` };
  }
  if (has(q, /\bmorning\b/)) return { start: '07:00', end: '12:00', label: 'in the morning' };
  if (has(q, /\b(afternoon|arvo)\b/)) return { start: '12:00', end: '17:00', label: 'in the afternoon' };
  if (has(q, /\b(evening|tonight)\b/)) return { start: '17:00', end: '21:00', label: 'in the evening' };
  return null;
}

const dayText = (day: DateKey, now: Date) => {
  const days = daysBetween(todayKey(now), day);
  const name = WEEKDAY_WORDS[weekdayIndex(day)];
  const label = `${capital(name)} ${formatDate(day)}`;
  return days === 0 ? `today (${label})` : days === 1 ? `tomorrow (${label})` : label;
};

const activeEmployees = (s: BusinessSnapshot) => s.employees.filter((e) => e.status !== 'inactive');
const firstName = (name: string) => name.split(' ')[0];

/** 1. "Who's free Thursday morning?" — availability plus the roster, then offers to roster them. */
function freeAnswer(s: BusinessSnapshot, q: string, now: Date, context: AnswerContext): FreeAnswer {
  const contextJob = s.jobs.find((j) => j.id === context.lastJobId);
  const job = findJob(q, s) ?? (has(q, /\b(this|that|the) job\b/) ? contextJob : undefined) ?? null;
  const day = findDay(q, now) ?? (job ? dayOf(job.startsAt) : todayKey(now));
  const window = findTimeWindow(q) ?? (job && dayOf(job.startsAt) === day ? { start: hhmm(job.startsAt), end: hhmm(job.endsAt), label: `${ampm(hhmm(job.startsAt))}–${ampm(hhmm(job.endsAt))}` } : { start: '07:00', end: '17:00', label: 'during the day' });
  const ws = minutesOf(window.start);
  const we = minutesOf(window.end);

  const free: string[] = [];
  const busy: string[] = [];
  const off: string[] = [];
  const notSet: string[] = [];
  const freeIds: string[] = [];
  for (const e of activeEmployees(s)) {
    const week = s.availability[e.id];
    const shift = s.shifts.find(
      (sh) => sh.date === day && sh.employeeIds.includes(e.id) && sh.jobId !== job?.id && minutesOf(sh.start) < we && minutesOf(sh.end) > ws,
    );
    if (shift) {
      busy.push(`${e.name} (${shift.start}–${shift.end} ${shift.jobType})`);
      continue;
    }
    const today = week?.[weekdayIndex(day)];
    if (!today) notSet.push(e.name);
    else if (!today.available || minutesOf(today.start) > ws || minutesOf(today.end) < we) {
      off.push(today.available ? `${e.name} (only ${today.start}–${today.end})` : e.name);
    } else {
      free.push(e.name);
      freeIds.push(e.id);
    }
  }
  if (free.length + busy.length + off.length + notSet.length === 0) {
    return { understood: true, text: "You don't have any team members yet. Add them on the Employees page.", cards: [] };
  }
  const when = `${dayText(day, now)} ${window.label}`;
  const lines = [
    free.length ? `Free ${when}: ${free.join(', ')}.` : `Nobody is free ${when}.`,
    busy.length ? `Already rostered: ${busy.join('; ')}.` : '',
    off.length ? `Not available: ${off.join(', ')}.` : '',
    notSet.length ? `Availability not set yet: ${notSet.join(', ')} (they can add it in their app).` : '',
  ].filter(Boolean);

  // A job on that day that still needs people: offer to roster whoever's free.
  const target =
    job ??
    s.jobs
      .filter((j) => dayOf(j.startsAt) === day && j.status !== 'cancelled' && j.status !== 'completed' && new Date(j.endsAt).getTime() > now.getTime())
      .find((j) => j.assignedEmployeeIds.length === 0 && minutesOf(hhmm(j.startsAt)) < we && minutesOf(hhmm(j.endsAt)) > ws);
  if (target && freeIds.length > 0 && target.status !== 'cancelled' && target.status !== 'completed') {
    const proposal = rosterProposal(s, target, freeIds);
    lines.push(`${jobLabelOf(target)} (${proposal.when}) ${target.assignedEmployeeIds.length ? 'is on that day' : 'still needs staff'}. Want to roster them? Tick who you want and tap Roster.`);
    return { understood: true, text: lines.join(' '), cards: cardsOf(s, 'job', [target.id], now), roster: proposal };
  }
  return { understood: true, text: lines.join(' '), cards: cardsOf(s, 'team_member', freeIds, now) };
}

/** Hours between two timestamps (or until now if still clocked in). */
const sessionHours = (c: { start: string; end: string | null }, now: Date) =>
  Math.max(0, ((c.end ? new Date(c.end) : now).getTime() - new Date(c.start).getTime()) / 3600_000);
const round1 = (n: number) => Math.round(n * 10) / 10;

/** 2. Clock-ins: who was late, hours worked vs rostered, who's clocked in now. */
function clockAnswer(s: BusinessSnapshot, q: string, now: Date, employee: { id: string; name: string } | null, period: string | null): FreeAnswer {
  const people = activeEmployees(s).filter((e) => !employee || e.id === employee.id);
  const today = todayKey(now);

  if (has(q, /\b(right now|currently|at the moment)\b|\b(who'?s|who is|anyone) (clocked|on the clock|working right now)\b/)) {
    const on = people.filter((e) => s.clockSessions.some((c) => c.employeeId === e.id && !c.end));
    const text = on.length
      ? `Clocked in right now: ${on.map((e) => {
          const c = s.clockSessions.find((x) => x.employeeId === e.id && !x.end)!;
          return `${e.name} (since ${ampm(hhmm(c.start))})`;
        }).join(', ')}.`
      : 'Nobody is clocked in right now.';
    return { understood: true, text, cards: cardsOf(s, 'team_member', on.map((e) => e.id), now) };
  }

  const range = resolvePeriod(period ?? 'this_week', now, s.financialYearStartMonth)!;
  const end = range.end < addDays(today, 1) ? range.end : addDays(today, 1); // up to today only
  const inRange = (day: DateKey) => day >= range.start && day < end;

  if (has(q, /\b(late|lateness|on time|punctual)\b/)) {
    const lates: string[] = [];
    for (const e of people) {
      const days = [...new Set(s.shifts.filter((sh) => sh.employeeIds.includes(e.id) && inRange(sh.date)).map((sh) => sh.date))];
      for (const day of days.sort()) {
        const shiftStart = s.shifts.filter((sh) => sh.date === day && sh.employeeIds.includes(e.id)).map((sh) => sh.start).sort()[0];
        const firstIn = s.clockSessions.filter((c) => c.employeeId === e.id && dateKeyOf(c.start) === day).map((c) => hhmm(c.start)).sort()[0];
        if (!firstIn) continue;
        const late = minutesOf(firstIn) - minutesOf(shiftStart);
        if (late > 5) lates.push(`${e.name}, ${late} min late on ${formatDate(day)} (rostered ${shiftStart}, clocked in ${firstIn})`);
      }
    }
    return {
      understood: true,
      text: lates.length
        ? `${plural(lates.length, 'late clock-in')} ${inPeriod(range.label)}: ${lates.join('; ')}.`
        : `No late clock-ins ${inPeriod(range.label)}${employee ? ` for ${employee.name}` : ''}. Everyone started on time.`,
      cards: cardsOf(s, 'team_member', people.filter((e) => lates.some((l) => l.startsWith(e.name))).map((e) => e.id), now),
    };
  }

  const rows = people
    .map((e) => {
      const worked = round1(s.clockSessions.filter((c) => c.employeeId === e.id && inRange(dateKeyOf(c.start))).reduce((t, c) => t + sessionHours(c, now), 0));
      const rostered = round1(
        s.shifts.filter((sh) => sh.employeeIds.includes(e.id) && inRange(sh.date)).reduce((t, sh) => t + Math.max(0, minutesOf(sh.end) - minutesOf(sh.start)) / 60, 0),
      );
      const stillOn = s.clockSessions.some((c) => c.employeeId === e.id && !c.end);
      return { e, worked, rostered, stillOn };
    })
    .filter((r) => employee || r.worked > 0 || r.rostered > 0);
  if (rows.length === 0) return { understood: true, text: `No hours worked or rostered ${inPeriod(range.label)}.`, cards: [] };
  const text = rows
    .map((r) => {
      const diff = round1(r.worked - r.rostered);
      const compare = r.rostered > 0 ? `, against ${r.rostered} rostered so far (${diff >= 0 ? `${diff} more` : `${Math.abs(diff)} fewer`})` : ', with no shifts rostered';
      return `${r.e.name} worked ${r.worked} hours${compare}${r.stillOn ? ', and is still clocked in' : ''}`;
    })
    .join('. ');
  return { understood: true, text: `${capital(inPeriod(range.label))}: ${text}.`, cards: cardsOf(s, 'team_member', rows.map((r) => r.e.id), now) };
}

const QUALIFICATION_WORDS = /\b(white card|blue card|first aid|cpr|police check|working with children|wwcc|forklift|drivers? licen[cs]e|licen[cs]es?|tickets?|certificates?|certifications?|qualifications?|inductions?)\b/;

/** 3. Licences and tickets: what's expired or expiring, or who holds one. */
function qualificationsAnswer(s: BusinessSnapshot, q: string, now: Date, employee: { id: string; name: string } | null): FreeAnswer {
  const today = todayKey(now);
  const names = new Map(activeEmployees(s).map((e) => [e.id, e.name]));
  const specific = /\b(white card|blue card|first aid|cpr|police check|working with children|wwcc|forklift|drivers? licen[cs]e)\b/.exec(q)?.[0];
  const list = s.qualifications.filter(
    (x) => names.has(x.employeeId) && (!employee || x.employeeId === employee.id) && (!specific || x.name.toLowerCase().includes(specific.replace(/s$/, ''))),
  );
  const describe = (x: (typeof list)[number]) => {
    if (!x.expiryDate) return `${names.get(x.employeeId)}'s ${x.name} (no expiry)`;
    const days = daysBetween(today, x.expiryDate);
    return `${names.get(x.employeeId)}'s ${x.name} ${days < 0 ? `expired ${formatDate(x.expiryDate)}` : `expires ${formatDate(x.expiryDate)} (in ${plural(days, 'day')})`}`;
  };
  const askingExpiry = has(q, /\b(expir\w*|renew\w*|out of date|due|soon|valid|current|up to date)\b/) || (!specific && !employee);
  if (askingExpiry) {
    const soon = list
      .filter((x) => x.expiryDate && daysBetween(today, x.expiryDate) <= 60)
      .sort((a, b) => (a.expiryDate ?? '').localeCompare(b.expiryDate ?? ''));
    if (soon.length === 0) {
      return {
        understood: true,
        text: list.length ? `Nothing ${specific ? `(${specific}) ` : ''}has expired or expires in the next 60 days.` : `I can't find any ${specific ?? 'qualifications'}${employee ? ` for ${employee.name}` : ''} saved in NexGain.`,
        cards: [],
      };
    }
    return {
      understood: true,
      text: `${plural(soon.length, 'licence or ticket', 'licences or tickets')} ${soon.length === 1 ? 'needs' : 'need'} attention: ${soon.map(describe).join('; ')}. Ask them to renew and upload the new one in their profile.`,
      cards: cardsOf(s, 'team_member', [...new Set(soon.map((x) => x.employeeId))], now),
    };
  }
  if (list.length === 0) {
    return { understood: true, text: `I can't find any ${specific ?? 'qualifications'}${employee ? ` for ${employee.name}` : ''} saved in NexGain.`, cards: [] };
  }
  return { understood: true, text: `${capital(list.map(describe).join('; '))}.`, cards: cardsOf(s, 'team_member', [...new Set(list.map((x) => x.employeeId))], now) };
}

/** 4. Job reports: incidents, or what someone wrote about a job. */
function reportsAnswer(
  s: BusinessSnapshot,
  q: string,
  now: Date,
  employee: { id: string; name: string } | null,
  client: { id: string; name: string } | null,
  period: string | null,
): FreeAnswer {
  const names = new Map(s.employees.map((e) => [e.id, e.name]));
  const job = findJob(q, s);
  const clientAddresses = client ? s.jobs.filter((j) => j.clientId === client.id).map((j) => j.address.toLowerCase().split(',')[0]) : [];
  const latest = has(q, LATEST);
  const range = period && !latest ? resolvePeriod(period, now, s.financialYearStartMonth) : null;
  const incidentsOnly = has(q, /\b(incidents?|issues?|problems?|damage|damaged|injur\w*|accidents?|broke|broken|complain\w*)\b/);
  // Words from job names and places in the question, e.g. "deck" in "the deck job".
  const reportWords = (r: { jobTitle: string; location: string }) =>
    `${r.jobTitle} ${r.location.split(',')[0]}`.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOPWORDS.has(w));
  const asked = new Set(q.split(/[^a-z0-9]+/).filter((w) => w.length >= 4));
  const mentioned = new Set(s.jobReports.flatMap(reportWords).filter((w) => asked.has(w)));
  const reports = s.jobReports
    .filter((r) => !employee || r.employeeId === employee.id)
    .filter((r) => !range || (r.date >= range.start && r.date < range.end))
    .filter((r) => !job || r.jobTitle.toLowerCase() === job.title.toLowerCase() || r.location.toLowerCase().includes(job.address.toLowerCase().split(',')[0]))
    .filter((r) => job || !mentioned.size || reportWords(r).some((w) => mentioned.has(w)))
    .filter((r) => !client || clientAddresses.some((a) => a && r.location.toLowerCase().includes(a)))
    .filter((r) => !incidentsOnly || r.outcome !== 'Went well' || r.issues.trim().length > 0)
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  const scope = [job ? `on ${jobLabelOf(job)}` : client ? `for ${client.name}'s jobs` : '', employee ? `from ${employee.name}` : '', range ? inPeriod(range.label) : '']
    .filter(Boolean)
    .join(' ');
  if (reports.length === 0) {
    return { understood: true, text: `No ${incidentsOnly ? 'incidents' : 'job reports'}${scope ? ` ${scope}` : latest ? ' have been recorded yet' : ''}.`, cards: [] };
  }
  if (latest) {
    const r = reports[0];
    const ago = daysBetween(r.date, todayKey(now));
    return {
      understood: true,
      text: `The last ${incidentsOnly ? 'incident' : 'job report'}${scope ? ` ${scope}` : ''} was on ${formatDate(r.date)}${ago > 0 ? ` (${plural(ago, 'day')} ago)` : ''}: ${r.jobTitle || 'a job'}${r.location ? ` at ${r.location}` : ''}, reported by ${names.get(r.employeeId) ?? 'someone'} (${r.outcome}). Notes: "${r.notes.trim() || 'none'}"${r.issues.trim() ? `. Issue: "${r.issues.trim()}"` : ''}.`,
      cards: job ? cardsOf(s, 'job', [job.id], now) : [],
    };
  }
  const shown = reports.slice(0, 3).map((r) => {
    const who = names.get(r.employeeId) ?? 'Someone';
    const issue = r.issues.trim() ? ` Issue: "${r.issues.trim()}"` : '';
    return `${formatDate(r.date)}, ${r.jobTitle || 'a job'}${r.location ? ` at ${r.location}` : ''} (${who}, ${r.outcome}): "${r.notes.trim() || 'no notes'}"${issue}`;
  });
  return {
    understood: true,
    text: `${plural(reports.length, incidentsOnly ? 'incident' : 'job report')}${scope ? ` ${scope}` : ''}. ${reports.length > 3 ? 'The latest: ' : ''}${shown.join(' | ')}`,
    cards: job ? cardsOf(s, 'job', [job.id], now) : [],
  };
}

/** 5. "What's on tomorrow?" — jobs and who's on them, shifts, deliveries and reminders. */
function briefingAnswer(s: BusinessSnapshot, q: string, now: Date): FreeAnswer {
  const day = findDay(q, now) ?? todayKey(now);
  const names = new Map(s.employees.map((e) => [e.id, firstName(e.name)]));
  const jobs = s.jobs.filter((j) => dayOf(j.startsAt) === day && j.status !== 'cancelled').sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const otherShifts = s.shifts.filter((sh) => sh.date === day && !jobs.some((j) => j.id === sh.jobId)).sort((a, b) => a.start.localeCompare(b.start));
  const events = s.events.filter((e) => e.date === day).sort((a, b) => a.start.localeCompare(b.start));
  if (jobs.length + otherShifts.length + events.length === 0) {
    return { understood: true, text: `Nothing is booked for ${dayText(day, now)}: no jobs, shifts or deliveries.`, cards: [] };
  }
  const parts: string[] = [];
  if (jobs.length) {
    parts.push(
      `${plural(jobs.length, 'job')}: ${jobs
        .map((j) => {
          const staff = j.assignedEmployeeIds.map((id) => names.get(id) ?? 'someone').join(' & ');
          return `${ampm(hhmm(j.startsAt))} ${jobLabelOf(j)}${j.address ? ` at ${j.address}` : ''} (${staff || 'NO STAFF YET'})`;
        })
        .join('; ')}.`,
    );
  }
  if (otherShifts.length) {
    parts.push(`Shifts: ${otherShifts.map((sh) => `${sh.employeeIds.map((id) => names.get(id) ?? 'someone').join(' & ')} ${sh.start}–${sh.end} ${sh.jobType}${sh.location ? ` (${sh.location})` : ''}`).join('; ')}.`);
  }
  if (events.length) {
    parts.push(
      `${events.some((e) => e.type === 'delivery') ? 'Deliveries & reminders' : 'Reminders'}: ${events
        .map((e) => `${e.allDay ? '' : `${ampm(e.start)} `}${e.title}${e.deliveryItems ? ` (${e.deliveryItems})` : ''}${e.address ? ` at ${e.address}` : ''}`)
        .join('; ')}.`,
    );
  }
  // Double-bookings that day (keys are "clash:<employee>:<date>").
  const warnings = runHealthCheck(s, now).filter((i) => i.check === 'schedule_clash' && i.key.endsWith(`:${day}`));
  const unstaffed = jobs.filter((j) => j.assignedEmployeeIds.length === 0 && j.status !== 'completed');
  if (unstaffed.length) parts.push(`Heads up: ${plural(unstaffed.length, 'job')} still ${unstaffed.length === 1 ? 'needs' : 'need'} staff. Tap "Roster staff" on the card.`);
  if (warnings.length) parts.push(warnings.map((w) => w.title).join('; ') + '.');
  return { understood: true, text: `Here's ${dayText(day, now)}. ${parts.join(' ')}`, cards: cardsOf(s, 'job', jobs.map((j) => j.id), now) };
}

// ---------------------------------------------------------------------------
// Clients and money: client history, best clients, quote win rate, cash flow,
// GST estimate, contractor invoices
// ---------------------------------------------------------------------------

const paidIn = (s: BusinessSnapshot, start: DateKey, end: DateKey) =>
  s.invoices.filter((i) => i.status === 'Paid' && i.paidAt && dateKeyOf(i.paidAt) >= start && dateKeyOf(i.paidAt) < end);

/** 6a. "When did I last do a job for Sarah?" */
function clientHistoryAnswer(s: BusinessSnapshot, now: Date, client: { id: string; name: string }): FreeAnswer {
  const jobs = s.jobs.filter((j) => j.clientId === client.id && j.status !== 'cancelled').sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const past = jobs.filter((j) => new Date(j.startsAt).getTime() <= now.getTime());
  const next = jobs.find((j) => new Date(j.startsAt).getTime() > now.getTime());
  const paid = s.invoices.filter((i) => i.clientId === client.id && i.status === 'Paid').reduce((t, i) => t + i.total, 0);
  const owing = s.invoices.filter((i) => i.clientId === client.id && i.status === 'Pending').reduce((t, i) => t + i.total, 0);
  const last = past[past.length - 1];
  const lastInvoice = s.invoices
    .filter((i) => i.clientId === client.id && i.status === 'Paid' && i.paidAt)
    .sort((a, b) => (b.paidAt ?? '').localeCompare(a.paidAt ?? ''))[0];
  const lines = [
    last
      ? `Your last job for ${client.name} was ${jobLabelOf(last)} on ${formatDate(dayOf(last.startsAt))}.`
      : lastInvoice
        ? `There are no past jobs for ${client.name} on the calendar, but their last paid invoice was ${lastInvoice.number} on ${formatDate(dateKeyOf(lastInvoice.paidAt!))}.`
        : `You haven't done a job for ${client.name} yet.`,
    next ? `Next one: ${jobLabelOf(next)} on ${formatDate(dayOf(next.startsAt))}.` : '',
    `${plural(jobs.length, 'job')} in total, ${money(paid)} paid${owing > 0 ? `, ${money(owing)} still owing` : ''}.`,
  ];
  return {
    understood: true,
    text: lines.filter(Boolean).join(' '),
    cards: [...cardsOf(s, 'client', [client.id], now), ...cardsOf(s, 'job', [last?.id, next?.id].filter((x): x is string => !!x), now)],
  };
}

/** 6b. "Who are my best clients this year?" — by money paid. */
function bestClientsAnswer(s: BusinessSnapshot, now: Date, period: string | null): FreeAnswer {
  const range = resolvePeriod(period ?? 'this_year', now, s.financialYearStartMonth)!;
  const totals = new Map<string, { name: string; total: number; count: number; id: string | null }>();
  for (const i of paidIn(s, range.start, range.end)) {
    const key = i.clientId ?? i.clientName.toLowerCase();
    const row = totals.get(key) ?? { name: i.clientName || 'Unknown client', total: 0, count: 0, id: i.clientId };
    row.total += i.total;
    row.count += 1;
    totals.set(key, row);
  }
  const top = [...totals.values()].sort((a, b) => b.total - a.total).slice(0, 5);
  if (top.length === 0) return { understood: true, text: `No invoices have been paid ${inPeriod(range.label)} yet.`, cards: [] };
  return {
    understood: true,
    text: `Your best clients ${inPeriod(range.label)} (by money paid): ${top.map((c, i) => `${i + 1}. ${c.name} ${money(c.total)} (${plural(c.count, 'invoice')})`).join('; ')}.`,
    cards: cardsOf(s, 'client', top.map((c) => c.id).filter((x): x is string => !!x), now, 3),
  };
}

/** 7. "How many quotes did I win this month?" / "What's my average quote?" */
function quoteStatsAnswer(s: BusinessSnapshot, now: Date, period: string | null): FreeAnswer {
  const range = resolvePeriod(period ?? 'this_month', now, s.financialYearStartMonth)!;
  const quotes = s.quotes.filter((x) => x.status !== 'Draft' && dateKeyOf(x.createdAt) >= range.start && dateKeyOf(x.createdAt) < range.end);
  if (quotes.length === 0) return { understood: true, text: `You haven't sent any quotes ${inPeriod(range.label)}.`, cards: [] };
  const won = quotes.filter((x) => x.status === 'Accepted' || x.status === 'Booked');
  const lost = quotes.filter((x) => x.status === 'Declined');
  const waiting = quotes.filter((x) => x.status === 'Sent');
  const decided = won.length + lost.length;
  const average = quotes.reduce((t, x) => t + x.total, 0) / quotes.length;
  const wonValue = won.reduce((t, x) => t + x.total, 0);
  return {
    understood: true,
    text: `${capital(inPeriod(range.label))} you sent ${plural(quotes.length, 'quote')}: ${won.length} won (${money(wonValue)}), ${lost.length} declined, ${waiting.length} still waiting.${decided ? ` That's a ${Math.round((won.length / decided) * 100)}% win rate on the ones decided.` : ''} Average quote: ${money(average)}.`,
    cards: [],
  };
}

/** 8. "What's due in the next 2 weeks?" — money coming in vs going out. */
function cashFlowAnswer(s: BusinessSnapshot, q: string, now: Date): FreeAnswer {
  const today = todayKey(now);
  const n = /\b(?:next|coming|following)\s+(\d{1,3})\s+(day|week|month)s?\b/.exec(q);
  const fortnight = has(q, /\bfortnight\b/);
  const days = n ? Number(n[1]) * (n[2] === 'week' ? 7 : n[2] === 'month' ? 30 : 1) : fortnight ? 14 : has(q, /\b(this|next) week\b/) ? 7 : has(q, /\bmonth\b/) ? 30 : 14;
  const end = addDays(today, days);
  const inWindow = (d: DateKey | null) => !!d && d >= today && d < end;

  const dueIn = s.invoices.filter((i) => i.status === 'Pending' && inWindow(i.dueDate));
  const overdue = s.invoices.filter((i) => i.status === 'Pending' && i.dueDate && i.dueDate < today);
  const moneyIn = dueIn.reduce((t, i) => t + i.total, 0);

  // Wages: from the shifts rostered in that time (hourly staff), plus 12% super.
  let wages = 0;
  for (const sh of s.shifts.filter((x) => inWindow(x.date))) {
    const hours = Math.max(0, minutesOf(sh.end) - minutesOf(sh.start)) / 60;
    for (const id of sh.employeeIds) {
      const e = s.employees.find((x) => x.id === id);
      if (e?.payType === 'hourly' && e.payRate && e.employmentType !== 'Contractor') wages += hours * e.payRate;
    }
  }
  const superDue = s.superPayments.filter((p) => p.status !== 'paid' && p.dueDate < end).reduce((t, p) => t + p.amount, 0);
  const contractors = s.contractorInvoices.filter((i) => (i.status === 'approved' || i.status === 'sent') && (!i.dueDate || i.dueDate < end)).reduce((t, i) => t + i.total, 0);
  const moneyOut = wages * 1.12 + superDue + contractors;
  const label = `the next ${days === 7 ? 'week' : days === 14 ? '2 weeks' : `${days} days`} (to ${formatDate(addDays(end, -1))})`;
  const out = [
    wages > 0 ? `wages about ${money(wages * 1.12)} incl. super (from the roster)` : '',
    superDue > 0 ? `unpaid super ${money(superDue)}` : '',
    contractors > 0 ? `contractor invoices ${money(contractors)}` : '',
  ].filter(Boolean);
  return {
    understood: true,
    text: `Over ${label}: coming in ${money(moneyIn)} from ${plural(dueIn.length, 'invoice')} due${overdue.length ? `, plus ${money(overdue.reduce((t, i) => t + i.total, 0))} already overdue` : ''}. Going out about ${money(moneyOut)}${out.length ? `: ${out.join(', ')}` : ''}. ${moneyIn >= moneyOut ? `That leaves about ${money(moneyIn - moneyOut)}` : `That's about ${money(moneyOut - moneyIn)} more going out than coming in`}${overdue.length ? ' (better if the overdue invoices are paid)' : ''}. Wages are an estimate from rostered hours; expenses and bills aren't included.`,
    cards: cardsOf(s, 'invoice', [...overdue, ...dueIn].map((i) => i.id), now, 4),
  };
}

/** The BAS quarter a date is in: Jul–Sep, Oct–Dec, Jan–Mar, Apr–Jun. */
function quarterOf(day: DateKey) {
  const y = Number(day.slice(0, 4));
  const m = Number(day.slice(5, 7));
  const startMonth = m - ((m - 1) % 3);
  const start = `${y}-${String(startMonth).padStart(2, '0')}-01`;
  return { start, end: addMonths(start, 3) };
}

/** 9. "How much GST will I owe this quarter?" — a rough estimate. */
function gstAnswer(s: BusinessSnapshot, q: string, now: Date, period: string | null): FreeAnswer {
  if (!s.gstRegistered) {
    return { understood: true, text: "Your business isn't set up as registered for GST in NexGain, so you don't charge or owe GST. If that's changed, update it in your Business Profile.", cards: [] };
  }
  const today = todayKey(now);
  let range = quarterOf(today);
  if (has(q, /\b(last|previous) quarter\b/)) range = quarterOf(addDays(range.start, -1));
  else if (period) {
    const r = resolvePeriod(period, now, s.financialYearStartMonth);
    if (r) range = { start: r.start, end: r.end };
  }
  const label = `${formatDate(range.start)} – ${formatDate(addDays(range.end, -1))}`;
  const collected = paidIn(s, range.start, range.end).reduce((t, i) => t + i.gst, 0);
  const useBank = s.transactionsConnected && s.transactions.length > 0;
  const purchases = useBank
    ? s.transactions.filter((t) => t.amount > 0 && t.date >= range.start && t.date < range.end).reduce((t, x) => t + x.amount, 0)
    : s.expenses.filter((e) => e.date >= range.start && e.date < range.end).reduce((t, e) => t + e.amount, 0);
  const contractorGst = s.contractorInvoices.filter((i) => i.paidAt && dateKeyOf(i.paidAt) >= range.start && dateKeyOf(i.paidAt) < range.end).reduce((t, i) => t + i.gst, 0);
  const credits = purchases / 11 + contractorGst;
  const net = collected - credits;
  return {
    understood: true,
    text: `Rough GST estimate for ${label}: ${money(collected)} GST collected on paid invoices, less about ${money(credits)} in GST credits (1/11 of ${money(purchases)} of ${useBank ? 'bank purchases' : 'expenses entered'}${contractorGst ? `, plus ${money(contractorGst)} on contractor invoices paid` : ''}). That's about ${money(Math.abs(net))} ${net >= 0 ? 'to pay' : 'to get back'}. This is only an estimate (cash basis, assumes your purchases include GST). Check with your accountant or BAS agent before you lodge.`,
    cards: [],
  };
}

/** 10. "Any contractor invoices waiting for me?" */
function contractorInvoicesAnswer(s: BusinessSnapshot, now: Date): FreeAnswer {
  const names = new Map(s.employees.map((e) => [e.id, e.name]));
  const toReview = s.contractorInvoices.filter((i) => i.status === 'sent');
  const toPay = s.contractorInvoices.filter((i) => i.status === 'approved');
  if (toReview.length + toPay.length === 0) return { understood: true, text: 'No contractor invoices are waiting for you.', cards: [] };
  const describe = (i: (typeof toPay)[number]) => `${i.number} from ${names.get(i.employeeId) ?? 'a contractor'} (${money(i.total)}${i.dueDate ? `, due ${formatDate(i.dueDate)}` : ''})`;
  const parts = [
    toReview.length ? `${plural(toReview.length, 'invoice')} to review: ${toReview.map(describe).join('; ')}.` : '',
    toPay.length ? `${plural(toPay.length, 'approved invoice')} to pay: ${toPay.map(describe).join('; ')}.` : '',
  ].filter(Boolean);
  return {
    understood: true,
    text: `${parts.join(' ')} Open More > Contractor invoices to review or pay them.`,
    cards: cardsOf(s, 'team_member', [...new Set([...toReview, ...toPay].map((i) => i.employeeId))], now),
  };
}

/**
 * Answers one question on its own (answerQuestion below adds follow-ups).
 * `understood: false` means it couldn't work out the question.
 */
function answerOne(s: BusinessSnapshot, question: string, now: Date, context: AnswerContext): FreeAnswer {
  const q = ` ${question.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim()} `.replace(/\?/g, ' ? ');
  const period = findPeriod(q, now);
  const periodCheck = period ? resolvePeriod(period, now, s.financialYearStartMonth) : null;
  if (period && !periodCheck) return { understood: true, text: "I couldn't work out those dates. Try something like 'last month' or 'since July'.", cards: [] };

  const category = findCategory(q, s);
  const supplier = findSupplier(q, s);
  const job = findJob(q, s);
  const client = findPerson(q, s.clients);
  const employee = findPerson(q, s.employees.map((e) => ({ id: e.id, name: e.name })));

  if (has(q, /^\s*(thanks|thank you|cheers|ta|great|awesome|perfect|nice one|legend)\b/)) {
    return { understood: true, text: "You're welcome! Ask me anything else about the business whenever you like.", cards: [] };
  }

  // Greetings and help.
  if (has(q, /^\s*(hi|hello|hey|g'?day|help|what can you do|how do(es)? (this|it) work)\b/)) {
    return {
      understood: true,
      text: `Hi! Ask me about your jobs, invoices, team, payroll, revenue or spending. For example: "${EXAMPLE_QUESTIONS[0]}" or "${EXAMPLE_QUESTIONS[4]}"`,
      cards: [],
    };
  }

  // Roster staff on a job ("can you roster someone on this job", "put Mia on job #4521").
  if (has(q, ROSTER_REQUEST) && !has(q, ROSTER_QUESTION)) return rosterAnswer(s, q, now, context);

  // Contractor invoices waiting for the owner.
  if (has(q, /\bcontractors?\b/) && has(q, /\b(invoices?|bills?|waiting|pay|owe|review|approve)\b/)) return contractorInvoicesAnswer(s, now);

  // GST / BAS estimate.
  if (has(q, /\b(gst|bas)\b/)) return gstAnswer(s, q, now, period);

  // Money coming in and going out.
  if (
    has(q, /\b(cash ?flow|what'?s (due|coming)|due (in|over) the|coming (in|up)|upcoming (bills|payments)|money (coming|going)|bills? (due|coming))\b/) ||
    (has(q, /\b(next|coming) (\d+ )?(days?|weeks?|fortnight)\b/) && has(q, /\b(due|pay|owe|money|bills?|coming in)\b/))
  ) {
    return cashFlowAnswer(s, q, now);
  }

  // Quote win rate and average quote.
  if (has(q, /\bquotes?\b/) && has(q, /\b(win|won|winning|wins|conversion|strike rate|success|average|how many|convert\w*)\b/)) {
    return quoteStatsAnswer(s, now, period);
  }

  // Clients who pay late.
  if (has(q, /\b(pays?|paying|payers?) (late|slow\w*|on time)\b|\blate pay\w*|\bslow pay\w*/)) {
    const late = runHealthCheck(s, now).filter((i) => i.check === 'late_payers' && (!client || i.related.some((r) => r.id === client.id)));
    if (late.length === 0) {
      return { understood: true, text: client ? `${client.name} usually pays on time.` : 'None of your clients stand out as paying late.', cards: client ? cardsOf(s, 'client', [client.id], now) : [] };
    }
    return {
      understood: true,
      text: `${late.map((i) => `${i.title}: ${i.summary}`).join(' ')} ${late[0].suggestion}`,
      cards: cardsOf(s, 'client', late.flatMap((i) => i.related.map((r) => r.id)), now),
    };
  }

  // Best clients, and a client's history.
  if (has(q, /\b(best|top|biggest|most valuable|main)\b.{0,15}\b(clients?|customers?)\b/)) return bestClientsAnswer(s, now, period);
  if (client && has(q, /\b(last|when did|history|how many jobs|next job|been|visited|worked for|done for|how long)\b/)) {
    return clientHistoryAnswer(s, now, client);
  }

  // Licences, tickets and certificates.
  if (has(q, QUALIFICATION_WORDS) || has(q, /\bexpir\w*\b/)) return qualificationsAnswer(s, q, now, employee);

  // Job reports and incidents.
  if (has(q, /\b(incidents?|job reports?|reports?|damage|injur\w*|accidents?)\b|\bwhat did .{1,30} (write|note|say|report|put)\b|\bnotes? (on|from|for|about)\b/)) {
    return reportsAnswer(s, q, now, employee, client, period);
  }

  // Who's free (and offer to roster them).
  if (has(q, /\b(who'?s free|who is free|who'?s available|who is available|anyone (free|available)|is anyone free|free to work|can (do|work|take|cover)|available (to|on|for|at))\b/)) {
    return freeAnswer(s, q, now, context);
  }

  // Clock-ins: lateness, hours worked vs rostered, who's on now (not "pays late").
  if (
    !has(q, /\b(pay|pays|paid|paying|payer|payers|invoices?)\b/) &&
    has(q, /\b(clock(ed|ing)?( in| on| out)?|late|lateness|on time|punctual|actually work\w*|worked)\b|\bhours (did|has|have) .{1,25} work\w*/)
  ) {
    return clockAnswer(s, q, now, employee, period);
  }

  // Daily briefing.
  if (has(q, /\b(what'?s on|what is on|briefing|my day|plan for (today|tomorrow)|run ?down|what have (i|we) got|what do (i|we) have (on|today|tomorrow)|agenda)\b/)) {
    return briefingAnswer(s, q, now);
  }

  // How much did a job cost?
  if (job && has(q, /\b(cost|costs|spent|spend|spending|materials?|expenses?|purchases?|margin|profit)\b/)) {
    if (!s.transactionsConnected) return notConnected();
    const answer = spendAnswer(s, now, null, category, period, job.id);
    const name = `${job.title}${job.quoteNumber ? ` (${job.quoteNumber})` : ''}`;
    const jobCard = cardsOf(s, 'job', [job.id], now);
    if (answer.cards.length === 0) return { understood: true, text: `I couldn't find any ${category ?? ''} purchases linked to ${name}.`.replace(/\s+/g, ' '), cards: jobCard };
    const r: Result = runTool(s, 'get_spend_by_supplier', { job_id: job.id, category, period }, now).result as Result;
    const value = job.value ? ` The job is worth ${money(job.value)}, so that's ${Math.round((r.total / job.value) * 100)}% of its price.` : '';
    return { understood: true, text: `${name} has cost you ${money(r.total)}${category ? ` in ${category}` : ''} across ${plural(r.purchases, 'purchase')}.${value}`, cards: [...jobCard, ...answer.cards] };
  }

  // Biggest / top supplier.
  if (has(q, /\b(biggest|top|largest|main|most expensive|highest)\b.{0,20}\b(suppliers?|vendors?|merchants?|stores?|shops?)\b|\bwho (do|did) (i|we) (spend|pay) the most\b|\bspend (the )?most (money )?(at|with)\b/)) {
    return biggestSupplierAnswer(s, now, period, category);
  }

  // Costs or prices going up.
  if (has(q, /\b(increas\w*|gone up|went up|going up|risen|rising|rise|more expensive|cost(ing)? more|price (rise|hike|increase)|prices? (up|higher)|dearer|higher)\b/)) {
    return increaseAnswer(s, now, supplier, category, period, q);
  }

  // Overdue / unpaid invoices.
  if (has(q, /\b(overdue|outstanding|unpaid|owe[sd]?|owing|hasn'?t paid|haven'?t paid|not paid|late pay\w*|debtors?|chase|money owed)\b/)) {
    return overdueAnswer(s, now, client);
  }

  // Quotes.
  if (has(q, /\bquotes?\b/)) return quotesAnswer(s, now, q);

  // Jobs with no one on them.
  if (has(q, /\b(no (one|staff|body|workers?|employees?)|nobody|unassigned|not assigned|without (staff|anyone|workers?)|unstaffed|need(s)? staff)\b/)) {
    return jobsAnswer(
      s,
      now,
      { unassigned_only: true, status: 'upcoming', period },
      (n) => `${plural(n, 'upcoming job')} ${n === 1 ? 'has' : 'have'} no staff yet`,
      'Every upcoming job has someone rostered on it.',
    );
  }

  // Spending.
  const spendWords = /\b(spen[dt]|spending|cost|costs|costing|paid|pay|paying|purchases?|purchased|bought|buy|expenses?|outgoings?)\b/;
  if ((supplier || category) && has(q, spendWords)) return spendAnswer(s, now, supplier, category, period, null, has(q, LATEST));
  if (has(q, /\b(how much|what) (did|have) (i|we) (spen[dt]|pa(id|y))\b|\btotal (spend|spending)\b/)) return spendAnswer(s, now, supplier, category, period, null);

  // Transactions.
  if (has(q, /\b(transactions?|bank|purchases?|payments? (out|made))\b/)) return transactionsAnswer(s, now, supplier, category, period);

  // Team and roster.
  if (has(q, /\b(who'?s working|who is working|who'?s on|roster|rostered|schedule|shifts?|working (today|tomorrow|this|next)|hours)\b/) || (employee && !client)) {
    return scheduleAnswer(s, now, period, employee);
  }

  // Payroll.
  if (has(q, /\b(payroll|wages?|pay ?runs?|super(annuation)?|payslips?|pay slips?|tax)\b/)) return payrollAnswer(s, now, period);

  // Revenue and profit.
  if (has(q, /\b(revenue|income|earn\w*|made|make|profit\w*|sales|turnover|takings|money (in|coming in)|how('?s| is) (the )?business|margin)\b/)) {
    return moneyAnswer(s, now, period, q);
  }

  // What needs attention / problems / ways to save.
  if (has(q, /\b(attention|problems?|issues?|risks?|health|save|saving|savings|wrong|improve|advice|tips?|insights?|worry|concern)\b|\bwhat should (i|we)\b/)) {
    return insightsAnswer(s, now);
  }

  // A particular client.
  if (client) return clientAnswer(s, now, client);

  // Finding jobs.
  if (job) {
    return { understood: true, text: `${job.title}${job.quoteNumber ? ` (${job.quoteNumber})` : ''}${job.address ? ` at ${job.address}` : ''}.`, cards: cardsOf(s, 'job', [job.id], now) };
  }
  if (has(q, /\b(jobs?|bookings?|appointments?)\b/)) {
    const upcoming = !period && has(q, /\b(next|upcoming|coming up|soon)\b/);
    const text = q.match(/\b(?:job|jobs) (?:at|for|on) ([a-z0-9 ]{3,})/)?.[1]?.trim();
    return jobsAnswer(
      s,
      now,
      { period: upcoming ? null : period, status: upcoming || !period ? 'upcoming' : 'any', query: text ?? null, limit: upcoming && has(q, /\bnext\b/) && !has(q, /\bjobs\b/) ? 1 : 10 },
      (n) => (upcoming && has(q, /\bnext\b/) && !has(q, /\bjobs\b/) ? 'Your next job' : `${plural(n, 'job')}${period ? ` ${inPeriod(periodCheck?.label ?? '')}` : ' coming up'}`),
      period ? `You have no jobs ${inPeriod(periodCheck?.label ?? '')}.` : 'You have no upcoming jobs.',
    );
  }

  // Invoices in general.
  if (has(q, /\binvoices?\b/)) {
    const r: Result = runTool(s, 'search_invoices', { status: has(q, /\bpaid\b/) ? 'paid' : 'unpaid', period }, now).result as Result;
    const label = has(q, /\bpaid\b/) ? 'paid' : 'unpaid';
    return {
      understood: true,
      text: r.count === 0 ? `You have no ${label} invoices${period ? ` ${inPeriod(periodCheck?.label ?? '')}` : ''}.` : `You have ${plural(r.count, `${label} invoice`)}${period ? ` ${inPeriod(periodCheck?.label ?? '')}` : ''}, totalling ${money(r.total)}.`,
      cards: cardsOf(s, 'invoice', (r.invoices ?? []).map((i: Result) => i.id), now),
    };
  }

  // A supplier or category on its own ("bunnings last month?").
  if (supplier || category) return spendAnswer(s, now, supplier, category, period, null, has(q, LATEST));

  return {
    understood: false,
    text: `I'm not sure what you're asking yet. Try one of these:\n• ${EXAMPLE_QUESTIONS.slice(0, 6).join('\n• ')}`,
    cards: [],
  };
}

// ---------------------------------------------------------------------------
// Follow-up questions ("When was the last one?", "What about last month?",
// "And Mia?"): answered together with the previous question in the chat.
// ---------------------------------------------------------------------------

/** Starts like a follow-up: "and...", "what about...", "when was...", "show me...". */
const FOLLOW_UP_START =
  /^\s*(and|but|so|ok(ay)?|what about|how about|what of|same (for|but|with)|when was|when did|what was|where was|who was|who did|which (one|ones)|how much was|how many was|show me|list them|tell me more|more (details|info)|what were they|why)\b/;
/** Points back at what was just talked about. */
const REFERS_BACK = /\b(the last one|last one|latest one|that one|those( ones)?|them|it|that|the same|this one|the one)\b/;
/** Words that give a question its own topic (so it isn't a follow-up). */
const TOPIC_WORDS =
  /\b(spen[dt]|spending|cost|costs|paid|purchas\w*|bought|expenses?|invoices?|quotes?|jobs?|roster\w*|shifts?|working|hours|wages?|payroll|super|tax|gst|bas|revenue|income|profit\w*|sales|clients?|customers?|suppliers?|incidents?|reports?|licen[cs]es?|tickets?|white card|qualifications?|expir\w*|overdue|owe[sd]?|owing|unpaid|free|available|clock\w*|late|transactions?|attention|problems?|insights?|briefing|due|cash ?flow|contractors?|hi|hello|hey|help|thanks|thank|what'?s on|agenda|schedule|plan)\b/;

const PERIOD_PHRASES = [
  /\b(so far )?(today|tonight|tomorrow|yesterday)\b/g,
  /\b(this|last|next|previous|current) (week|fortnight|month|quarter|year|financial year|fiscal year|tax year|fy)\b/g,
  /\b(so far this|month to date|year to date|week to date|ytd|fy to date|all time|ever|in total)\b/g,
  /\b(last|past|previous|next|coming) \d{1,3} (days?|weeks?|months?)\b/g,
  /\b(since|in|during|for|from) (the )?(start|beginning)?( of )?(\d{1,2}(st|nd|rd|th)? )?(of )?(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*( 20\d{2})?\b/g,
  /\b(january|february|march|april|june|july|august|september|october|november|december)( 20\d{2})?\b/g,
  /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/g,
];

const normal = (text: string) => ` ${text.toLowerCase().replace(/[’‘]/g, "'").replace(/\?/g, ' ').replace(/\s+/g, ' ').trim()} `;
const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Removes these names (full names and their parts) from a question. */
function withoutNames(text: string, names: string[]) {
  let out = text;
  for (const name of names) {
    const lower = name.toLowerCase().trim();
    if (!lower) continue;
    for (const part of [lower, ...lower.split(/\s+/).filter((w) => w.length >= 3)]) {
      out = out.replace(new RegExp(`\\b${escapeRe(part)}('s)?\\b`, 'g'), ' ');
    }
  }
  return out;
}

/**
 * The previous question with the follow-up's changes: a new date, person,
 * client, supplier or category replaces the old one. "The last one" drops the dates.
 */
export function mergeQuestions(s: BusinessSnapshot, previous: string, followUp: string, now = new Date()) {
  let base = normal(previous);
  const add = normal(followUp).replace(FOLLOW_UP_START, ' ');
  if (findPeriod(add, now) !== null || findDay(add, now) !== null || has(add, LATEST)) {
    for (const pattern of PERIOD_PHRASES) base = base.replace(pattern, ' ');
  }
  if (findPerson(add, s.employees)) base = withoutNames(base, s.employees.map((e) => e.name));
  if (findPerson(add, s.clients)) base = withoutNames(base, s.clients.map((c) => c.name));
  if (findSupplier(add, s)) {
    base = withoutNames(base, [...new Set([...s.transactions.map(merchantOf), ...KNOWN_SUPPLIER_NAMES])]);
    base = base.replace(/\b(at|from)\s+(?=(at|from|last|this|in|since|during|over|for|so|today|yesterday|on|the|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\b|\s*$)/g, ' ');
  }
  const ticket = /\b(white card|blue card|first aid|cpr|police check|working with children|wwcc|forklift|drivers? licen[cs]e)\b/;
  if (ticket.test(add)) base = base.replace(new RegExp(ticket.source, 'g'), ' ');
  if (findCategory(add, s)) {
    for (const [pattern] of CATEGORY_WORDS) base = base.replace(new RegExp(pattern.source, 'g'), ' ');
  }
  return `${base} ${add}`.replace(/\s+/g, ' ').trim();
}

/**
 * Answers a question about the business for free. `understood: false` means
 * it couldn't work out the question (the reply then suggests ways to ask).
 * Follow-ups ("when was the last one?") are answered with the previous question.
 */
export function answerQuestion(s: BusinessSnapshot, question: string, now = new Date(), context: AnswerContext = {}): FreeAnswer {
  const direct = answerOne(s, question, now, context);
  const previous = context.previousQuestion?.trim();
  if (!previous) return direct;

  const q = normal(question);
  const wordCount = q.trim().split(' ').length;
  const followUp =
    !direct.understood ||
    has(q, FOLLOW_UP_START) ||
    (wordCount <= 7 && has(q, REFERS_BACK)) ||
    (wordCount <= 4 && !has(q, TOPIC_WORDS));
  if (!followUp) return direct;

  const merged = mergeQuestions(s, previous, question, now);
  const answer = answerOne(s, merged, now, context);
  // If the follow-up still doesn't make sense, answer the question on its own.
  if (!answer.understood) return direct;
  return { ...answer, asked: merged };
}

/** e.g. "October 2026" for a "month:2026-10" period (used in tests and labels). */
export function periodLabel(period: string, now = new Date()) {
  return resolvePeriod(period, now)?.label ?? monthName(todayKey(now));
}
