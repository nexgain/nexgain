// The FREE AI Assistant: answers questions about the business without a paid
// AI service. It works out what's being asked (spending, overdue invoices,
// jobs with no staff, biggest supplier, price rises, job costs...), who or
// what it's about (a supplier, category, client, team member or job) and when
// ("last month", "since July", "this financial year"), then answers with the
// same tested lookups the Claude version uses (tools.ts). Pure functions, so
// it runs in the app on the phone, on the server and in tests.
import { addDays, formatDate, monthName, previousPeriod, resolvePeriod, startOfWeek, todayKey } from './dates.ts';
import { money, runHealthCheck } from './insights.ts';
import { buildCard, runTool, TRANSACTIONS_NOT_CONNECTED } from './tools.ts';
import { KNOWN_SUPPLIER_NAMES, merchantOf, squash } from './transactions.ts';
import type { BusinessSnapshot, ResultCard } from './types.ts';

export type FreeAnswer = {
  /** False when the question couldn't be worked out (the reply then suggests questions to try). */
  understood: boolean;
  text: string;
  cards: ResultCard[];
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

const notConnected = (): FreeAnswer => ({ understood: true, text: TRANSACTIONS_NOT_CONNECTED, cards: [] });

function spendAnswer(s: BusinessSnapshot, now: Date, supplier: string | null, category: string | null, period: string | null, jobId: string | null): FreeAnswer {
  if (!s.transactionsConnected) return notConnected();
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

function increaseAnswer(s: BusinessSnapshot, now: Date, supplier: string | null, category: string | null, period: string | null): FreeAnswer {
  if (!s.transactionsConnected) return notConnected();
  const insights = runHealthCheck(s, now);
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
  const rises = insights.filter((i) => ['spending_category_increase', 'same_item_costs_more', 'supplier_costs_more'].includes(i.check));
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

/**
 * Answers a question about the business for free. `understood: false` means
 * it couldn't work out the question (the reply suggests ways to ask instead).
 */
export function answerQuestion(s: BusinessSnapshot, question: string, now = new Date()): FreeAnswer {
  const q = ` ${question.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim()} `.replace(/\?/g, ' ? ');
  const period = findPeriod(q, now);
  const periodCheck = period ? resolvePeriod(period, now, s.financialYearStartMonth) : null;
  if (period && !periodCheck) return { understood: true, text: "I couldn't work out those dates. Try something like 'last month' or 'since July'.", cards: [] };

  const category = findCategory(q, s);
  const supplier = findSupplier(q, s);
  const job = findJob(q, s);
  const client = findPerson(q, s.clients);
  const employee = findPerson(q, s.employees.map((e) => ({ id: e.id, name: e.name })));

  // Greetings and help.
  if (has(q, /^\s*(hi|hello|hey|g'?day|help|what can you do|how do(es)? (this|it) work)\b/)) {
    return {
      understood: true,
      text: `Hi! Ask me about your jobs, invoices, team, payroll, revenue or spending. For example: "${EXAMPLE_QUESTIONS[0]}" or "${EXAMPLE_QUESTIONS[4]}"`,
      cards: [],
    };
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
    return increaseAnswer(s, now, supplier, category, period);
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
  if ((supplier || category) && has(q, spendWords)) return spendAnswer(s, now, supplier, category, period, null);
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
  if (supplier || category) return spendAnswer(s, now, supplier, category, period, null);

  return {
    understood: false,
    text: `I'm not sure what you're asking yet. Try one of these:\n• ${EXAMPLE_QUESTIONS.slice(0, 6).join('\n• ')}`,
    cards: [],
  };
}

/** e.g. "October 2026" for a "month:2026-10" period (used in tests and labels). */
export function periodLabel(period: string, now = new Date()) {
  return resolvePeriod(period, now)?.label ?? monthName(todayKey(now));
}
