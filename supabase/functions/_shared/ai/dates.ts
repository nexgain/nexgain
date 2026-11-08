// Dates in the business's time zone. NexGain businesses are on Brisbane time
// (AEST, UTC+10, no daylight saving), the same as src/data/business-time.ts.
// Ranges are "YYYY-MM-DD" keys: start is included, end is NOT (like [start, end)).
import type { DateKey } from './types.ts';

const OFFSET_MS = 10 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT_MONTHS = MONTHS.map((m) => m.slice(0, 3));

export type DateRange = { start: DateKey; end: DateKey; label: string };

/** Today in the business's time zone. */
export function todayKey(now = new Date()): DateKey {
  return new Date(now.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

/** The business-time date of a timestamp. */
export function dateKeyOf(iso: string): DateKey {
  return todayKey(new Date(iso));
}

const parse = (key: DateKey) => {
  const [y, m, d] = key.split('-').map(Number);
  return { y, m, d };
};
const fromUtc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);

export function addDays(key: DateKey, days: number): DateKey {
  const { y, m, d } = parse(key);
  return fromUtc(y, m, d + days);
}

export function addMonths(key: DateKey, months: number): DateKey {
  const { y, m } = parse(key);
  return fromUtc(y, m + months, 1);
}

export function daysBetween(from: DateKey, to: DateKey) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** Monday of the week. */
export function startOfWeek(key: DateKey): DateKey {
  const day = new Date(`${key}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(key, -((day + 6) % 7));
}

export function startOfMonth(key: DateKey): DateKey {
  return `${key.slice(0, 7)}-01`;
}

/** The start of the financial year a date is in (Australia: 1 July). */
export function financialYearStart(key: DateKey, startMonth = 7): DateKey {
  const { y, m } = parse(key);
  const year = m >= startMonth ? y : y - 1;
  return `${year}-${String(startMonth).padStart(2, '0')}-01`;
}

/** e.g. "3 Nov 2026" */
export function formatDate(key: DateKey) {
  const { y, m, d } = parse(key);
  return `${d} ${SHORT_MONTHS[m - 1]} ${y}`;
}

/** e.g. "October 2026" */
export function monthName(key: DateKey) {
  const { y, m } = parse(key);
  return `${MONTHS[m - 1]} ${y}`;
}

export function inRange(key: DateKey, range: Pick<DateRange, 'start' | 'end'>) {
  return key >= range.start && key < range.end;
}

/**
 * The periods the AI can ask for. Anything else (e.g. "since July") is turned
 * into "since:YYYY-MM-DD" or "month:YYYY-MM" by the AI, which knows today's date.
 */
export const PERIODS = [
  'today',
  'yesterday',
  'this_week',
  'last_week',
  'this_month',
  'last_month',
  'last_7_days',
  'last_30_days',
  'last_90_days',
  'this_year',
  'last_year',
  'this_financial_year',
  'last_financial_year',
  'all_time',
] as const;

/**
 * Turns a period into exact dates. Accepts the names above, "since:YYYY-MM-DD"
 * (up to and including today), "month:YYYY-MM", or "YYYY-MM-DD..YYYY-MM-DD"
 * (both days included). Returns null if it can't be understood.
 */
export function resolvePeriod(period: string, now = new Date(), fyStartMonth = 7): DateRange | null {
  const today = todayKey(now);
  const tomorrow = addDays(today, 1);
  const p = period.trim().toLowerCase();

  const since = /^since:(\d{4}-\d{2}-\d{2})$/.exec(p);
  if (since) return { start: since[1], end: tomorrow, label: `since ${formatDate(since[1])}` };
  const month = /^month:(\d{4}-\d{2})$/.exec(p);
  if (month) {
    const start = `${month[1]}-01`;
    return { start, end: addMonths(start, 1), label: monthName(start) };
  }
  const between = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/.exec(p);
  if (between) {
    const label = between[1] === between[2] ? `on ${formatDate(between[1])}` : `${formatDate(between[1])} – ${formatDate(between[2])}`;
    return { start: between[1], end: addDays(between[2], 1), label };
  }

  const week = startOfWeek(today);
  const monthStart = startOfMonth(today);
  const fy = financialYearStart(today, fyStartMonth);
  const fyYear = Number(fy.slice(0, 4));
  switch (p) {
    case 'today':
      return { start: today, end: tomorrow, label: 'today' };
    case 'yesterday':
      return { start: addDays(today, -1), end: today, label: 'yesterday' };
    case 'this_week':
      return { start: week, end: tomorrow, label: `this week (since ${formatDate(week)})` };
    case 'last_week':
      return { start: addDays(week, -7), end: week, label: `last week (${formatDate(addDays(week, -7))} – ${formatDate(addDays(week, -1))})` };
    case 'this_month':
      return { start: monthStart, end: tomorrow, label: `this month (${monthName(monthStart)})` };
    case 'last_month': {
      const start = addMonths(monthStart, -1);
      return { start, end: monthStart, label: monthName(start) };
    }
    case 'last_7_days':
      return { start: addDays(today, -6), end: tomorrow, label: 'the last 7 days' };
    case 'last_30_days':
      return { start: addDays(today, -29), end: tomorrow, label: 'the last 30 days' };
    case 'last_90_days':
      return { start: addDays(today, -89), end: tomorrow, label: 'the last 90 days' };
    case 'this_year':
      return { start: `${today.slice(0, 4)}-01-01`, end: tomorrow, label: `this year (${today.slice(0, 4)})` };
    case 'last_year': {
      const y = Number(today.slice(0, 4)) - 1;
      return { start: `${y}-01-01`, end: `${y + 1}-01-01`, label: `${y}` };
    }
    case 'this_financial_year':
      return { start: fy, end: tomorrow, label: `this financial year (FY${String(fyYear + 1).slice(2)}, since ${formatDate(fy)})` };
    case 'last_financial_year': {
      const start = `${fyYear - 1}${fy.slice(4)}`;
      return { start, end: fy, label: `last financial year (FY${String(fyYear).slice(2)})` };
    }
    case 'all_time':
      return { start: '2000-01-01', end: tomorrow, label: 'all time' };
    default:
      return null;
  }
}

/**
 * The period just before, for comparisons: the month before a calendar month,
 * otherwise a period of the same length immediately before it.
 */
export function previousPeriod(range: DateRange): DateRange {
  const isWholeMonth = range.start.endsWith('-01') && range.end === addMonths(range.start, 1);
  if (isWholeMonth) {
    const start = addMonths(range.start, -1);
    return { start, end: range.start, label: monthName(start) };
  }
  const length = daysBetween(range.start, range.end);
  // Month so far (e.g. 1–8 Nov): the same days of last month (1–8 Oct).
  if (range.start.endsWith('-01') && length < 31) {
    const start = addMonths(range.start, -1);
    return { start, end: addDays(start, length), label: `the same days of ${monthName(start)}` };
  }
  const start = addDays(range.start, -length);
  return { start, end: range.start, label: `the ${length} days before` };
}
