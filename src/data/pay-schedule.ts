// How often the business pays (weekly or fortnightly) and which day pay
// periods start (e.g. Friday to Thursday). Saved on the business
// (businesses.pay_schedule); payroll works its pay periods out from it.
//
// Changing the schedule never pays a day twice or skips one: the new schedule
// starts the day after the last approved pay period. If that day isn't the new
// start day, there's one short "catch-up" pay period to line them up.
import { businessStore, updateBusiness, type BusinessProfile } from '@/data/business';
import { payslipsStore } from '@/data/payroll';
import { payRunsStore } from '@/data/pay-runs';

export type PayFrequencyId = 'weekly' | 'fortnightly';

export type PaySchedule = {
  frequency: PayFrequencyId;
  /** The day pay periods start: 0 = Sunday, 1 = Monday ... 6 = Saturday. */
  startDay: number;
  /** "YYYY-MM-DD": a day a full pay period starts. Periods repeat every 7 or 14 days from it. */
  anchor: string;
  /** "YYYY-MM-DD": the first day under this schedule (the day after the last approved period), or null. */
  from: string | null;
};

/** Weekly, Monday to Sunday (how NexGain always worked). 1 Jan 2024 was a Monday. */
export const DEFAULT_PAY_SCHEDULE: PaySchedule = { frequency: 'weekly', startDay: 1, anchor: '2024-01-01', from: null };

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** Start days in the order they're offered (Monday first). */
export const START_DAYS = [1, 2, 3, 4, 5, 6, 0];

export const paySchedule = (profile: BusinessProfile | null = businessStore.get()) => profile?.paySchedule ?? DEFAULT_PAY_SCHEDULE;

/** "Friday to Thursday" */
export const daysText = (startDay: number) => `${DAY_NAMES[startDay]} to ${DAY_NAMES[(startDay + 6) % 7]}`;

/** "Weekly" / "Fortnightly", as printed on payslips and reports. */
export const frequencyLabel = (f: PayFrequencyId) => (f === 'weekly' ? 'Weekly' : 'Fortnightly');

/** "Weekly", "Fortnightly", or e.g. "6-day" for a catch-up period, from a period's first and last day. */
export function frequencyForDates(start: string, lastDay: string) {
  const days = daysBetween(fromKey(start), fromKey(lastDay)) + 1;
  return days === 7 ? 'Weekly' : days === 14 ? 'Fortnightly' : `${days}-day`;
}

// ---------------------------------------------------------------------------
// Dates (local days, no times)
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0');
export const toKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const dayOnly = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const daysBetween = (a: Date, b: Date) => Math.round((dayOnly(b).getTime() - dayOnly(a).getTime()) / 86_400_000);

// ---------------------------------------------------------------------------
// Pay periods
// ---------------------------------------------------------------------------

export type SchedulePeriod = {
  start: Date;
  /** Exclusive (the day after the last day). */
  end: Date;
  /** A short period lining up an old schedule with a new one. */
  catchUp: boolean;
};

type PastRun = { periodStart: string; periodEnd: string };

const lengthOf = (s: PaySchedule) => (s.frequency === 'weekly' ? 7 : 14);

/** The pay period a day falls in. */
function periodOn(day: Date, s: PaySchedule, past: PastRun[]): SchedulePeriod | null {
  const anchor = fromKey(s.anchor);
  const from = s.from ? fromKey(s.from) : null;
  if (!from || day >= anchor) {
    const length = lengthOf(s);
    const start = addDays(anchor, Math.floor(daysBetween(anchor, day) / length) * length);
    return { start, end: addDays(start, length), catchUp: false };
  }
  if (day >= from) return { start: from, end: anchor, catchUp: true };
  // Before this schedule: the pay periods that were actually paid.
  const key = toKey(day);
  const run = past.find((r) => r.periodStart <= key && key <= r.periodEnd) ?? past.find((r) => r.periodEnd < key);
  return run ? { start: fromKey(run.periodStart), end: addDays(fromKey(run.periodEnd), 1), catchUp: false } : null;
}

/**
 * Pay periods, most recent first: the one today is in (or, if that's already
 * approved early, the next one), then earlier ones.
 */
export function schedulePeriods(s: PaySchedule, now: Date, count: number, past: PastRun[] = []): SchedulePeriod[] {
  const runs = [...past].sort((a, b) => b.periodStart.localeCompare(a.periodStart));
  const today = dayOnly(now);
  const first = s.from && fromKey(s.from) > today ? fromKey(s.from) : today;
  const out: SchedulePeriod[] = [];
  let day: Date = first;
  while (out.length < count) {
    const p = periodOn(day, s, runs);
    if (!p || out.some((x) => x.start.getTime() === p.start.getTime())) break;
    out.push(p);
    day = addDays(p.start, -1);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Choosing a new schedule
// ---------------------------------------------------------------------------

/** The last day already approved for pay (any pay run or payslip), or null. */
export function lastApprovedDay(): string | null {
  const ends = [...payRunsStore.get().map((r) => r.periodEnd), ...payslipsStore.get().map((p) => p.periodEnd)];
  return ends.length ? ends.sort().at(-1)! : null;
}

export type ScheduleChoice = {
  frequency: PayFrequencyId;
  startDay: number;
  /** Fortnightly with nothing paid yet: does the current fortnight start this week (0) or last week (1)? */
  fortnightOffset?: 0 | 1;
};

/**
 * The schedule for what the owner picked. With pay already approved, it starts
 * the day after (so no day is paid twice or missed); otherwise from the most
 * recent start day.
 */
export function scheduleFor(choice: ScheduleChoice, now = new Date(), lastApproved = lastApprovedDay()): PaySchedule {
  const today = dayOnly(now);
  if (lastApproved) {
    const from = addDays(fromKey(lastApproved), 1);
    const anchor = addDays(from, (choice.startDay - from.getDay() + 7) % 7);
    return { frequency: choice.frequency, startDay: choice.startDay, anchor: toKey(anchor), from: toKey(from) };
  }
  const recent = addDays(today, -((today.getDay() - choice.startDay + 7) % 7));
  const anchor = choice.frequency === 'fortnightly' && choice.fortnightOffset === 1 ? addDays(recent, -7) : recent;
  return { frequency: choice.frequency, startDay: choice.startDay, anchor: toKey(anchor), from: null };
}

/** Saves the new schedule (only if it's different from the current one). */
export function setPaySchedule(choice: ScheduleChoice) {
  const current = paySchedule();
  const next = scheduleFor(choice);
  const same =
    current.frequency === next.frequency &&
    current.startDay === next.startDay &&
    (next.frequency === 'weekly' || next.from !== null || current.anchor === next.anchor);
  if (!same) updateBusiness({ paySchedule: next });
}

/** The first pay period under a schedule: the catch-up one when there is one, otherwise the one today is in. */
export function firstPeriod(s: PaySchedule, now = new Date()): SchedulePeriod {
  const day = s.from ? fromKey(s.from) : dayOnly(now);
  return periodOn(day, s, [])!;
}

/** "Fri 13 Nov" */
export const shortDay = (d: Date) => `${DAY_NAMES[d.getDay()].slice(0, 3)} ${d.getDate()} ${d.toLocaleDateString([], { month: 'short' })}`;

/** "Fri 13 Nov – Thu 26 Nov" for a period. */
export const spanText = (p: SchedulePeriod) => `${shortDay(p.start)} – ${shortDay(addDays(p.end, -1))}`;

/** How many days a period covers. */
export const periodDays = (p: SchedulePeriod) => daysBetween(p.start, p.end);
