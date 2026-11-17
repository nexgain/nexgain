// NexGain Bookings: the start times one person can be booked at on one day, for
// the owner's "Add a Booking" and "Move" screens. The same rules as the booking
// link (private.free_slots in the database), and the database checks them again
// when the booking is saved:
//   * Staff can only be booked inside the times they're rostered on that day
//     (a shift past midnight carries on into the next day). The owner (who isn't
//     on the roster) can be booked in the opening hours.
//   * The whole service has to finish by the end of their shift.
//   * A booking blocks that person for the whole service plus the gap after it
//     (blocked_until), so a 45-minute booking at 11:00 frees them at 11:45.
//   * Approved time off and closed days are never bookable.
// Times that are taken are still listed (free: false) so the screen can grey them out.
import type { RosterShift } from '@/data/shifts';
import { minutesOf, timeOfMinutes, weekdayOf, addDays, zonedToIso } from '@/systems/bookings/data/booking-time';
import type { Booking, BookingSettings, BookingStaff, TimeOff } from '@/systems/bookings/data/bookings';

export type StartTime = {
  /** "HH:MM" in the business's time zone. */
  time: string;
  /** The exact moment (ISO). */
  startsAt: string;
  /** false = overlaps a booking or time off (shown greyed out). */
  free: boolean;
};

type Window = { start: number; end: number };

const BUSY_STATUSES = new Set<Booking['status']>(['confirmed', 'completed', 'no_show']);
const isTime = (t: string) => /^\d{1,2}:\d{2}$/.test(t);

/** When this person can be booked that day, as minutes since midnight (end can be 1440 = midnight). */
export function bookableWindows(
  staff: Pick<BookingStaff, 'employeeId' | 'isOwner'>,
  dateKey: string,
  settings: Pick<BookingSettings, 'openingHours'>,
  shifts: Pick<RosterShift, 'date' | 'start' | 'end' | 'employeeIds'>[],
): Window[] {
  if (staff.isOwner) {
    const day = settings.openingHours[weekdayOf(dateKey)];
    return day?.open ? [{ start: minutesOf(day.start), end: minutesOf(day.end) }] : [];
  }
  if (!staff.employeeId) return [];
  const mine = shifts.filter((s) => s.employeeIds.includes(staff.employeeId!) && isTime(s.start) && isTime(s.end));
  const windows: Window[] = [];
  for (const s of mine) {
    const start = minutesOf(s.start);
    const end = minutesOf(s.end);
    // Today's shifts (one past midnight runs to the end of today).
    if (s.date === dateKey) windows.push({ start, end: end > start ? end : 1440 });
    // The rest of last night's shift, after midnight.
    if (s.date === addDays(dateKey, -1) && end <= start && end > 0) windows.push({ start: 0, end });
  }
  return windows.sort((a, b) => a.start - b.start);
}

/**
 * Every start time for this person on this day: each `slotMinutes` through
 * their bookable times, plus straight after each of their bookings ends. Past
 * times are left out. Taken times are kept with free: false.
 */
export function startTimes(opts: {
  staff: Pick<BookingStaff, 'id' | 'employeeId' | 'isOwner'>;
  dateKey: string;
  timeZone: string;
  durationMinutes: number;
  settings: Pick<BookingSettings, 'openingHours' | 'slotMinutes' | 'bufferMinutes'>;
  shifts: Pick<RosterShift, 'date' | 'start' | 'end' | 'employeeIds'>[];
  bookings: Pick<Booking, 'id' | 'staffId' | 'status' | 'startsAt' | 'blockedUntil'>[];
  timeOff: Pick<TimeOff, 'staffId' | 'status' | 'startsAt' | 'endsAt'>[];
  /** The booking being moved (it doesn't block itself). */
  ignoreBookingId?: string | null;
  now?: Date;
}): StartTime[] {
  const { staff, dateKey, timeZone, durationMinutes, settings } = opts;
  if (!(durationMinutes > 0)) return [];
  const step = Math.max(5, settings.slotMinutes || 15);
  const at = (minutes: number) => Date.parse(zonedToIso(dateKey, timeOfMinutes(minutes), timeZone));
  const now = (opts.now ?? new Date()).getTime();

  const busy = opts.bookings
    .filter((b) => b.staffId === staff.id && BUSY_STATUSES.has(b.status) && b.id !== opts.ignoreBookingId)
    .map((b) => ({ start: Date.parse(b.startsAt), end: Date.parse(b.blockedUntil) }));
  const away = opts.timeOff
    .filter((t) => t.status === 'approved' && (t.staffId === null || t.staffId === staff.id))
    .map((t) => ({ start: Date.parse(t.startsAt), end: Date.parse(t.endsAt) }));

  const result = new Map<number, StartTime>();
  for (const w of bookableWindows(staff, dateKey, settings, opts.shifts)) {
    const starts = new Set<number>();
    for (let m = w.start; m + durationMinutes <= w.end; m += step) starts.add(m);
    // Straight after each booking (and its gap) ends.
    for (const b of busy) {
      const startOfDay = at(0);
      const m = Math.round((b.end - startOfDay) / 60000);
      if (m >= w.start && m + durationMinutes <= w.end) starts.add(m);
    }
    for (const m of starts) {
      const start = at(m);
      if (start < now) continue;
      const serviceEnd = start + durationMinutes * 60000;
      const blockedEnd = serviceEnd + settings.bufferMinutes * 60000;
      const free =
        !busy.some((b) => b.start < blockedEnd && start < b.end) && !away.some((t) => t.start < serviceEnd && start < t.end);
      result.set(m, { time: timeOfMinutes(m), startsAt: new Date(start).toISOString(), free });
    }
  }
  return [...result.entries()].sort((a, b) => a[0] - b[0]).map(([, t]) => t);
}
