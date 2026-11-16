// NexGain Bookings calendar: which hours a day shows, where each booking sits,
// and which time a tap on an empty spot means. Plain maths (tested).
import { addDays, minutesOf, weekdayOf, zonedParts } from '@/systems/bookings/data/booking-time';
import type { Booking, OpeningDay, TimeOff } from '@/systems/bookings/data/bookings';

/** Height of one hour in the day view. */
export const HOUR_HEIGHT = 64;

/** Monday of the week a date is in. */
export function weekStartOf(dateKey: string) {
  return addDays(dateKey, -weekdayOf(dateKey));
}

/** The seven dates of that week, Monday first. */
export function weekDays(dateKey: string) {
  const monday = weekStartOf(dateKey);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export type Span = { start: number; end: number };

/** A booking's start and end on its day, in minutes since midnight (business time). */
export function bookingSpan(b: Pick<Booking, 'startsAt' | 'endsAt'>, timeZone: string): Span {
  const start = minutesOf(zonedParts(b.startsAt, timeZone).time);
  const endParts = zonedParts(b.endsAt, timeZone);
  const sameDay = endParts.date === zonedParts(b.startsAt, timeZone).date;
  return { start, end: sameDay ? Math.max(start + 5, minutesOf(endParts.time)) : 24 * 60 };
}

/**
 * The hours shown for a day: opening hours (9 to 5 when closed), widened to
 * whole hours so every booking that day fits, even ones added outside hours.
 */
export function dayWindow(opening: OpeningDay | undefined, spans: Span[]): Span {
  let start = opening?.open ? minutesOf(opening.start) : 9 * 60;
  let end = opening?.open ? minutesOf(opening.end) : 17 * 60;
  for (const s of spans) {
    start = Math.min(start, s.start);
    end = Math.max(end, s.end);
  }
  start = Math.floor(start / 60) * 60;
  end = Math.min(24 * 60, Math.ceil(end / 60) * 60);
  if (end - start < 60) end = Math.min(24 * 60, start + 60);
  return { start, end };
}

/** Where a block sits in the day view (pixels from the top, and its height). */
export function blockPosition(span: Span, window: Span, hourHeight = HOUR_HEIGHT) {
  const top = ((Math.max(span.start, window.start) - window.start) / 60) * hourHeight;
  const bottom = ((Math.min(span.end, window.end) - window.start) / 60) * hourHeight;
  return { top, height: Math.max(18, bottom - top) };
}

/** The time a tap at `y` pixels means, rounded down to `step` minutes. */
export function timeAtY(y: number, window: Span, step = 15, hourHeight = HOUR_HEIGHT) {
  const minutes = window.start + Math.floor(((y / hourHeight) * 60) / step) * step;
  return Math.min(Math.max(minutes, window.start), window.end - step);
}

/** Parts of a day covered by time off (one staff member's, or the whole business's). */
export function timeOffSpans(timeOff: TimeOff[], staffId: string, dateKey: string, timeZone: string): Span[] {
  const out: Span[] = [];
  for (const t of timeOff) {
    if (t.status !== 'approved' || (t.staffId !== null && t.staffId !== staffId)) continue;
    const from = zonedParts(t.startsAt, timeZone);
    const to = zonedParts(t.endsAt, timeZone);
    if (to.date < dateKey || from.date > dateKey || (to.date === dateKey && to.time === '00:00')) continue;
    out.push({
      start: from.date < dateKey ? 0 : minutesOf(from.time),
      end: to.date > dateKey ? 24 * 60 : minutesOf(to.time),
    });
  }
  return out;
}
