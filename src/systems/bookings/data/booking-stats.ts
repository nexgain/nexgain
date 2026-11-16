// NexGain Bookings: the numbers for the dashboard, analytics and revenue pages.
// A booking counts as money earned once its time has passed (or it's marked
// Completed), unless it was cancelled or a no-show. Plain maths (tested).
import type { MoneyEntry } from '@/data/finance';
import { zonedParts } from '@/systems/bookings/data/booking-time';
import type { Booking, BookingStaff } from '@/systems/bookings/data/bookings';

const round = (n: number) => Math.round(n * 100) / 100;

/** Earned: completed, or booked and already finished. */
export function countsAsRevenue(b: Booking, now = new Date()) {
  return b.status === 'completed' || (b.status === 'confirmed' && new Date(b.endsAt) <= now);
}

/** Bookings as revenue entries (for the revenue page, dashboard and analytics). */
export function bookingRevenueEntries(bookings: Booking[], staff: BookingStaff[], now = new Date()): MoneyEntry[] {
  const names = new Map(staff.map((s) => [s.id, s.name]));
  return bookings
    .filter((b) => countsAsRevenue(b, now) && (b.price ?? 0) > 0)
    .map((b) => ({
      id: `booking-${b.id}`,
      date: new Date(b.startsAt),
      amount: b.price ?? 0,
      title: b.customerName,
      subtitle: [b.serviceName, names.get(b.staffId)].filter(Boolean).join(' · '),
      category: 'Booking',
      source: 'booking' as const,
      bookingId: b.id,
    }))
    .sort((a, b) => b.date.getTime() - a.date.getTime());
}

export type BookingStats = {
  /** Bookings in the period (not cancelled). */
  booked: number;
  /** Earned so far in the period. */
  revenue: number;
  /** Still to come in the period (booked, not finished). */
  upcomingValue: number;
  cancelled: number;
  cancelledByCustomer: number;
  noShows: number;
  /** Of all bookings made for the period, the share cancelled (0 to 1). */
  cancellationRate: number;
  /** Of the appointments that happened or were missed, the share missed (0 to 1). */
  noShowRate: number;
  /** Money lost to no-shows. */
  noShowValue: number;
  averageValue: number;
  byStaff: { staffId: string; name: string; booked: number; revenue: number }[];
  byService: { name: string; booked: number; revenue: number }[];
  /** Bookings by weekday, Monday first. */
  byWeekday: number[];
  /** Bookings by start hour (0 to 23). */
  byHour: number[];
};

/** The numbers for bookings starting in [start, end). */
export function bookingStats(
  bookings: Booking[],
  staff: BookingStaff[],
  range: { start: Date; end: Date },
  timeZone: string,
  now = new Date(),
): BookingStats {
  const inRange = bookings.filter((b) => {
    const t = new Date(b.startsAt);
    return t >= range.start && t < range.end;
  });
  const live = inRange.filter((b) => b.status !== 'cancelled');
  const earned = live.filter((b) => countsAsRevenue(b, now));
  const noShows = live.filter((b) => b.status === 'no_show');
  const happened = earned.length + noShows.length;
  const revenue = round(earned.reduce((s, b) => s + (b.price ?? 0), 0));

  const staffMap = new Map<string, { staffId: string; name: string; booked: number; revenue: number }>();
  for (const s of staff) staffMap.set(s.id, { staffId: s.id, name: s.name, booked: 0, revenue: 0 });
  const serviceMap = new Map<string, { name: string; booked: number; revenue: number }>();
  const byWeekday = Array(7).fill(0) as number[];
  const byHour = Array(24).fill(0) as number[];

  for (const b of live) {
    const person = staffMap.get(b.staffId) ?? { staffId: b.staffId, name: 'Former staff', booked: 0, revenue: 0 };
    person.booked++;
    const service = serviceMap.get(b.serviceName) ?? { name: b.serviceName, booked: 0, revenue: 0 };
    service.booked++;
    if (countsAsRevenue(b, now)) {
      person.revenue = round(person.revenue + (b.price ?? 0));
      service.revenue = round(service.revenue + (b.price ?? 0));
    }
    staffMap.set(b.staffId, person);
    serviceMap.set(b.serviceName, service);
    const local = zonedParts(b.startsAt, timeZone);
    byWeekday[local.weekday]++;
    byHour[Number(local.time.slice(0, 2))]++;
  }

  return {
    booked: live.length,
    revenue,
    upcomingValue: round(live.filter((b) => b.status === 'confirmed' && new Date(b.endsAt) > now).reduce((s, b) => s + (b.price ?? 0), 0)),
    cancelled: inRange.length - live.length,
    cancelledByCustomer: inRange.filter((b) => b.status === 'cancelled' && b.cancelledBy === 'customer').length,
    noShows: noShows.length,
    cancellationRate: inRange.length ? (inRange.length - live.length) / inRange.length : 0,
    noShowRate: happened ? noShows.length / happened : 0,
    noShowValue: round(noShows.reduce((s, b) => s + (b.price ?? 0), 0)),
    averageValue: earned.length ? round(revenue / earned.length) : 0,
    byStaff: [...staffMap.values()].filter((s) => s.booked > 0).sort((a, b) => b.revenue - a.revenue || b.booked - a.booked),
    byService: [...serviceMap.values()].sort((a, b) => b.booked - a.booked || b.revenue - a.revenue),
    byWeekday,
    byHour,
  };
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** "Saturday" (the busiest day), or null with no bookings. */
export function busiestDay(stats: Pick<BookingStats, 'byWeekday'>) {
  const max = Math.max(...stats.byWeekday);
  return max > 0 ? DAY_NAMES[stats.byWeekday.indexOf(max)] : null;
}

/** "10 am – 11 am" (the busiest start hour), or null with no bookings. */
export function busiestHour(stats: Pick<BookingStats, 'byHour'>) {
  const max = Math.max(...stats.byHour);
  if (max <= 0) return null;
  const h = stats.byHour.indexOf(max);
  const label = (x: number) => `${x % 12 === 0 ? 12 : x % 12} ${x < 12 || x === 24 ? 'am' : 'pm'}`;
  return `${label(h)} – ${label(h + 1)}`;
}

/** e.g. "12%" for 0.123. */
export const percent = (rate: number) => `${Math.round(rate * 100)}%`;
