// NexGain Bookings numbers: revenue, per staff, services, busiest times,
// cancellations and no-shows. FAKE bookings only.
import { describe, expect, it, jest } from '@jest/globals';

import { bookingRevenueEntries, bookingStats, busiestDay, busiestHour, countsAsRevenue, percent } from '@/systems/bookings/data/booking-stats';
import type { Booking, BookingStaff } from '@/systems/bookings/data/bookings';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const TZ = 'Australia/Brisbane'; // UTC+10, no daylight saving
const NOW = new Date('2026-11-20T02:00:00.000Z'); // Fri 20 Nov, 12 pm Brisbane
const fakeStaff = [
  { id: 'alex', name: 'Alex' },
  { id: 'sam', name: 'Sam' },
] as BookingStaff[];

let n = 0;
/** A fake booking at a Brisbane local time. */
function fake(local: string, over: Partial<Booking> = {}): Booking {
  const start = new Date(`${local}:00+10:00`);
  return {
    id: `b${++n}`,
    serviceId: 'cut',
    staffId: 'alex',
    staffChosen: true,
    serviceName: 'Haircut',
    durationMinutes: 30,
    price: 40,
    customerName: `Fake Customer ${n}`,
    customerPhone: '',
    customerEmail: '',
    notes: '',
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 30 * 60000).toISOString(),
    blockedUntil: new Date(start.getTime() + 30 * 60000).toISOString(),
    status: 'confirmed',
    source: 'online',
    cancelledBy: null,
    createdAt: start.toISOString(),
    reminderStatus: null,
    reminderReason: '',
    reminderSentAt: null,
    depositAmount: 0,
    paymentStatus: 'none',
    cancellationFee: 0,
    feeStatus: 'none',
    ...over,
  };
}

const bookings = [
  fake('2026-11-16T09:00'), // Mon, done
  fake('2026-11-16T09:30', { staffId: 'sam', serviceName: 'Beard Trim', price: 20 }),
  fake('2026-11-17T10:00', { status: 'completed' }),
  fake('2026-11-17T10:30', { status: 'no_show' }),
  fake('2026-11-18T10:00', { status: 'cancelled', cancelledBy: 'customer' }),
  fake('2026-11-21T10:00'), // Sat, still to come
  fake('2026-11-21T10:30', { staffId: 'sam', price: null }),
];
const week = { start: new Date('2026-11-16T00:00:00+10:00'), end: new Date('2026-11-23T00:00:00+10:00') };

describe('booking money', () => {
  it('counts a booking once its time has passed or it’s completed, never cancelled or no-shows', () => {
    expect(countsAsRevenue(bookings[0], NOW)).toBe(true);
    expect(countsAsRevenue(bookings[2], NOW)).toBe(true);
    expect(countsAsRevenue(bookings[3], NOW)).toBe(false);
    expect(countsAsRevenue(bookings[4], NOW)).toBe(false);
    expect(countsAsRevenue(bookings[5], NOW)).toBe(false);
  });

  it('turns earned bookings into revenue entries, newest first', () => {
    const entries = bookingRevenueEntries(bookings, fakeStaff, NOW);
    expect(entries.map((e) => e.amount)).toEqual([40, 20, 40]); // Tue 10:00, Mon 9:30, Mon 9:00
    expect(entries[1]).toMatchObject({ source: 'booking', category: 'Booking', subtitle: 'Beard Trim · Sam' });
  });
});

describe('booking numbers for a week', () => {
  const stats = bookingStats(bookings, fakeStaff, week, TZ, NOW);

  it('adds up bookings, revenue and what’s still to come', () => {
    expect(stats.booked).toBe(6);
    expect(stats.revenue).toBe(100);
    expect(stats.upcomingValue).toBe(40);
    expect(stats.averageValue).toBe(33.33);
  });

  it('counts cancellations and no-shows', () => {
    expect(stats.cancelled).toBe(1);
    expect(stats.cancelledByCustomer).toBe(1);
    expect(stats.noShows).toBe(1);
    expect(stats.noShowValue).toBe(40);
    expect(percent(stats.cancellationRate)).toBe('14%'); // 1 of 7
    expect(percent(stats.noShowRate)).toBe('25%'); // 1 of 4 that happened or were missed
  });

  it('splits by staff and service', () => {
    expect(stats.byStaff).toEqual([
      { staffId: 'alex', name: 'Alex', booked: 4, revenue: 80 },
      { staffId: 'sam', name: 'Sam', booked: 2, revenue: 20 },
    ]);
    expect(stats.byService[0]).toEqual({ name: 'Haircut', booked: 5, revenue: 80 });
  });

  it('finds the busiest day and time (business time)', () => {
    expect(stats.byWeekday).toEqual([2, 2, 0, 0, 0, 2, 0]);
    expect(busiestDay(stats)).toBe('Monday');
    expect(busiestHour(stats)).toBe('10 am – 11 am');
    expect(busiestDay({ byWeekday: [0, 0, 0, 0, 0, 0, 0] })).toBeNull();
  });
});
