// Shifts will come from the Owner's Roster section once a database is connected.
// Until then every day is empty. Dates are generated relative to today so
// "This Week" always matches the calendar.

export type Shift = {
  start: string; // 24h "HH:MM"
  end: string;
  role: string;
  location: string;
  tasks: string[];
};

export type RosterDay = {
  date: Date;
  shift: Shift | null;
};

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
export function getRosterWeek(weekOffset: number, today = new Date()): RosterDay[] {
  const monday = startOfWeek(today);
  monday.setDate(monday.getDate() + weekOffset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    return { date, shift: null };
  });
}

function allRosterDays(today = new Date()) {
  return [...getRosterWeek(0, today), ...getRosterWeek(1, today)];
}

export function getShiftForDate(key: string, today = new Date()) {
  return allRosterDays(today).find((day) => dateKey(day.date) === key) ?? null;
}

export function getNextShift(today = new Date()) {
  const todayStart = startOfDay(today).getTime();
  return allRosterDays(today).find((day) => day.shift && day.date.getTime() > todayStart) ?? null;
}

export function shiftDurationMs(shift: Shift) {
  const [sh, sm] = shift.start.split(':').map(Number);
  const [eh, em] = shift.end.split(':').map(Number);
  return (eh * 60 + em - (sh * 60 + sm)) * 60 * 1000;
}

function format12h(time: string) {
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
