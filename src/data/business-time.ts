// Job and calendar times are stored with their timezone and always shown in
// the business's local time (Brisbane: AEST, UTC+10, no daylight saving),
// whatever timezone the phone happens to be in.
const OFFSET_MINUTES = 10 * 60;
const OFFSET_TEXT = '+10:00';

/** "YYYY-MM-DD" + "HH:MM" in Brisbane time -> ISO timestamp for the database. */
export function toTimestamp(dateKey: string, time: string) {
  return new Date(`${dateKey}T${time}:00${OFFSET_TEXT}`).toISOString();
}

/** A database timestamp as a Brisbane date "YYYY-MM-DD" and time "HH:MM". */
export function localParts(iso: string) {
  const shifted = new Date(new Date(iso).getTime() + OFFSET_MINUTES * 60_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`,
    time: `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`,
  };
}

/** A "YYYY-MM-DD" date moved by a number of days. */
export function addDaysKey(dateKey: string, days: number) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/** Today's date in Brisbane, "YYYY-MM-DD". */
export function todayKey(now = new Date()) {
  return localParts(now.toISOString()).date;
}
