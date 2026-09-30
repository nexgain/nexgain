// The signed-in employee's roster, built from shifts created on the Owner
// Roster screen. Dates are generated relative to today so "This Week" always
// matches the calendar.
import type { RosterShift } from '@/data/shifts';

export type Shift = {
  start: string; // 24h "HH:MM"
  end: string;
  role: string;
  location: string;
  tasks: string[];
  /** The job this shift is for, if the owner linked one. */
  jobId?: string | null;
};

export type RosterDay = {
  date: Date;
  shift: Shift | null;
};

/** Where the employee's shifts come from: all rostered shifts, filtered to one employee. */
export type ShiftSource = {
  shifts: RosterShift[];
  employeeId: string | null;
};

const NO_SHIFTS: ShiftSource = { shifts: [], employeeId: null };

/** The employee's first shift on a date (one shift per day is shown). */
function shiftOn(date: Date, { shifts, employeeId }: ShiftSource): Shift | null {
  if (!employeeId) return null;
  const key = dateKey(date);
  const match = shifts
    .filter((s) => s.date === key && s.employeeIds.includes(employeeId))
    .sort((a, b) => a.start.localeCompare(b.start))[0];
  return match
    ? { start: match.start, end: match.end, role: match.jobType, location: match.location, tasks: match.tasks, jobId: match.jobId }
    : null;
}

export function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(date: Date) {
  const d = startOfDay(date);
  const mondayOffset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - mondayOffset);
  return d;
}

export function dateKey(date: Date) {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

/** weekOffset 0 = this week, 1 = next week. */
export function getRosterWeek(
  weekOffset: number,
  today = new Date(),
  source: ShiftSource = NO_SHIFTS,
): RosterDay[] {
  const monday = startOfWeek(today);
  monday.setDate(monday.getDate() + weekOffset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    return { date, shift: shiftOn(date, source) };
  });
}

function allRosterDays(today: Date, source: ShiftSource) {
  return [...getRosterWeek(0, today, source), ...getRosterWeek(1, today, source)];
}

export function getShiftForDate(key: string, today = new Date(), source: ShiftSource = NO_SHIFTS) {
  return allRosterDays(today, source).find((day) => dateKey(day.date) === key) ?? null;
}

export function getNextShift(today = new Date(), source: ShiftSource = NO_SHIFTS) {
  const todayStart = startOfDay(today).getTime();
  return (
    allRosterDays(today, source).find((day) => day.shift && day.date.getTime() > todayStart) ?? null
  );
}

export function shiftDurationMs(shift: Shift) {
  const [sh, sm] = shift.start.split(':').map(Number);
  const [eh, em] = shift.end.split(':').map(Number);
  return (eh * 60 + em - (sh * 60 + sm)) * 60 * 1000;
}

export function format12h(time: string) {
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function formatShiftTime(shift: Shift) {
  return `${format12h(shift.start)} – ${format12h(shift.end)}`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatWeekday(date: Date) {
  return WEEKDAYS[date.getDay()];
}

/** e.g. "12 Sep 2026" */
export function formatShortDate(date: Date, withYear = true) {
  const base = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return withYear ? `${base} ${date.getFullYear()}` : base;
}

export function formatWeekRange(days: RosterDay[]) {
  const first = days[0].date;
  const last = days[days.length - 1].date;
  return `${formatShortDate(first, false)} – ${formatShortDate(last, false)}`;
}

export function isSameDay(a: Date, b: Date) {
  return dateKey(a) === dateKey(b);
}
