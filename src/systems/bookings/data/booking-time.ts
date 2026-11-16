// NexGain Bookings: times in the business's own time zone (businesses.timezone,
// e.g. "Europe/London"), whatever time zone the phone is in. System 1 assumes
// Brisbane (src/data/business-time.ts); booking businesses can be anywhere, so
// these work for any time zone, including daylight saving changes.

export const DEFAULT_TIME_ZONE = 'Australia/Brisbane';

/** Time zones offered in Bookings settings (Australia, the UK, the USA and New Zealand). */
export const TIME_ZONES: { id: string; label: string }[] = [
  { id: 'Australia/Sydney', label: 'Sydney, Canberra (NSW, ACT)' },
  { id: 'Australia/Melbourne', label: 'Melbourne (VIC)' },
  { id: 'Australia/Brisbane', label: 'Brisbane (QLD)' },
  { id: 'Australia/Adelaide', label: 'Adelaide (SA)' },
  { id: 'Australia/Darwin', label: 'Darwin (NT)' },
  { id: 'Australia/Perth', label: 'Perth (WA)' },
  { id: 'Australia/Hobart', label: 'Hobart (TAS)' },
  { id: 'Europe/London', label: 'United Kingdom' },
  { id: 'America/New_York', label: 'US Eastern (New York)' },
  { id: 'America/Chicago', label: 'US Central (Chicago)' },
  { id: 'America/Denver', label: 'US Mountain (Denver)' },
  { id: 'America/Phoenix', label: 'Arizona (Phoenix)' },
  { id: 'America/Los_Angeles', label: 'US Pacific (Los Angeles)' },
  { id: 'America/Anchorage', label: 'Alaska' },
  { id: 'Pacific/Honolulu', label: 'Hawaii' },
  { id: 'Pacific/Auckland', label: 'New Zealand' },
];

export function timeZoneLabel(id: string) {
  return TIME_ZONES.find((z) => z.id === id)?.label ?? id.replace(/_/g, ' ');
}

const pad = (n: number) => String(n).padStart(2, '0');
const formatters = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(timeZone: string) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** A moment as the business's local date "YYYY-MM-DD", time "HH:MM" and weekday (0 = Monday). */
export function zonedParts(moment: string | number | Date, timeZone: string) {
  const parts: Record<string, string> = {};
  for (const p of partsFormatter(timeZone).formatToParts(new Date(moment))) parts[p.type] = p.value;
  const hour = parts.hour === '24' ? '00' : parts.hour;
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return { date, time: `${hour}:${parts.minute}`, weekday: weekdayOf(date), seconds: Number(parts.second) };
}

/** Monday = 0 ... Sunday = 6, for a "YYYY-MM-DD" date. */
export function weekdayOf(dateKey: string) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** Minutes the time zone is ahead of UTC at that moment (e.g. +600 for Brisbane). */
function offsetMinutes(utcMs: number, timeZone: string) {
  const p = zonedParts(utcMs, timeZone);
  const [y, m, d] = p.date.split('-').map(Number);
  const [h, mi] = p.time.split(':').map(Number);
  return Math.round((Date.UTC(y, m - 1, d, h, mi, p.seconds) - Math.floor(utcMs / 1000) * 1000) / 60000);
}

/** The business's local date and time as an exact moment (ISO string). */
export function zonedToIso(dateKey: string, time: string, timeZone: string) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const first = offsetMinutes(guess, timeZone);
  let result = guess - first * 60000;
  const second = offsetMinutes(result, timeZone);
  if (second !== first) result = guess - second * 60000;
  return new Date(result).toISOString();
}

/** Today's date in the business's time zone, "YYYY-MM-DD". */
export function todayIn(timeZone: string, now = new Date()) {
  return zonedParts(now, timeZone).date;
}

/** A "YYYY-MM-DD" date moved by a number of days. */
export function addDays(dateKey: string, days: number) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** "9:30 am" in the business's time zone. */
export function formatTimeIn(moment: string, timeZone: string) {
  return format12h(zonedParts(moment, timeZone).time);
}

/** "09:30" -> "9:30 am". */
export function format12h(time: string) {
  const [h, m] = time.split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${pad(m)} ${h < 12 ? 'am' : 'pm'}`;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const LONG_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Mon 17 Nov" for a "YYYY-MM-DD" date. */
export function formatDayKey(dateKey: string, long = false) {
  const [, m, d] = dateKey.split('-').map(Number);
  return `${(long ? LONG_DAYS : DAYS)[weekdayOf(dateKey)]} ${d} ${MONTHS[m - 1]}`;
}

/** Minutes since midnight for "HH:MM". */
export const minutesOf = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

/** "HH:MM" for minutes since midnight. */
export const timeOfMinutes = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

/** "30 min", "1 hr", "1 hr 15 min". */
export function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return `${Math.floor(minutes / 60)} hr${rest ? ` ${rest} min` : ''}`;
}
