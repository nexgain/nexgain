// The booking checks in the daily AI health check. FAKE bookings only.
import { describe, expect, it } from '@jest/globals';

import { bookingInsights, type BookingRow } from '../../../../../supabase/functions/_shared/ai/booking-insights';

const NOW = new Date('2026-11-20T02:00:00.000Z');
const DAY = 86_400_000;
const opts = { timeZone: 'Australia/Brisbane', currency: 'AUD', now: NOW };

/** A fake booking `daysAgo` days before NOW. */
const fake = (daysAgo: number, over: Partial<BookingRow> = {}): BookingRow => {
  const start = new Date(NOW.getTime() - daysAgo * DAY);
  return {
    status: 'confirmed',
    price: 50,
    starts_at: start.toISOString(),
    ends_at: new Date(start.getTime() + 30 * 60000).toISOString(),
    cancelled_by: null,
    service_name: 'Haircut',
    ...over,
  };
};
const keys = (list: ReturnType<typeof bookingInsights>) => list.map((i) => i.key);

describe('booking health checks', () => {
  it('finds nothing for a business with no bookings (every service business)', () => {
    expect(bookingInsights([], opts)).toEqual([]);
  });

  it('warns about no-shows, with the money lost', () => {
    const list = [...Array.from({ length: 8 }, (_, i) => fake(i + 1)), fake(2, { status: 'no_show' }), fake(3, { status: 'no_show' }), fake(4, { status: 'no_show' })];
    const found = bookingInsights(list, opts).find((i) => i.key === 'booking_no_shows');
    expect(found).toMatchObject({ severity: 'high', estimatedSaving: 150 });
    expect(found?.summary).toContain('27%');
    expect(found?.placements).toContain('notification');
  });

  it('ignores the odd no-show', () => {
    const list = [...Array.from({ length: 30 }, (_, i) => fake((i % 25) + 1)), fake(2, { status: 'no_show' })];
    expect(keys(bookingInsights(list, opts))).not.toContain('booking_no_shows');
  });

  it('warns about lots of cancellations', () => {
    const list = [...Array.from({ length: 10 }, (_, i) => fake(i + 1)), ...Array.from({ length: 5 }, (_, i) => fake(i + 1, { status: 'cancelled', cancelled_by: 'customer' }))];
    const found = bookingInsights(list, opts).find((i) => i.key === 'booking_cancellations');
    expect(found?.summary).toContain('5 of 15');
  });

  it('spots booking revenue dropping', () => {
    const list = [...Array.from({ length: 10 }, (_, i) => fake(35 + i)), ...Array.from({ length: 4 }, (_, i) => fake(5 + i))];
    const found = bookingInsights(list, opts).find((i) => i.key === 'booking_revenue_drop');
    expect(found).toMatchObject({ area: 'finance', estimatedSaving: 300 });
    expect(found?.title).toBe('Booking revenue down 60%');
  });

  it('spots a quiet day and the most popular service', () => {
    // NOW is a Friday. Lots of Mon-Thu bookings over 8 weeks, very few Fridays.
    const list: BookingRow[] = [];
    for (let week = 0; week < 8; week++) {
      for (const back of [1, 2, 3, 4]) list.push(fake(week * 7 + back, { service_name: week % 2 ? 'Fade' : 'Haircut' }));
    }
    list.push(fake(7));
    const found = bookingInsights(list, opts);
    expect(keys(found)).toContain('booking_quiet_day:4');
    expect(found.find((i) => i.check === 'booking_quiet_day')?.title).toBe('Fridays are quiet');
    expect(found.find((i) => i.key === 'booking_top_service')?.title).toMatch(/is your most booked service/);
  });
});
