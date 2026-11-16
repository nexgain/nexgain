// NexGain Bookings calendar maths: hours shown, block positions, taps and time
// off. FAKE bookings only.
import { describe, expect, it, jest } from '@jest/globals';

import { blockPosition, bookingSpan, dayWindow, timeAtY, timeOffSpans, weekDays } from '@/systems/bookings/data/booking-calendar';
import type { TimeOff } from '@/systems/bookings/data/bookings';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const TZ = 'Australia/Sydney';

describe('the bookings calendar', () => {
  it('shows a whole week from Monday', () => {
    expect(weekDays('2026-11-19')).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']);
  });

  it('finds a booking’s start and end in business time', () => {
    // 9:30 to 10:15 Sydney time (UTC+11 in November).
    expect(bookingSpan({ startsAt: '2026-11-18T22:30:00.000Z', endsAt: '2026-11-18T23:15:00.000Z' }, TZ)).toEqual({ start: 570, end: 615 });
  });

  it('shows opening hours, widened to fit bookings outside them', () => {
    const open = { open: true, start: '09:00', end: '17:00' };
    expect(dayWindow(open, [])).toEqual({ start: 540, end: 1020 });
    expect(dayWindow(open, [{ start: 7 * 60 + 30, end: 8 * 60 }, { start: 17 * 60 + 30, end: 18 * 60 + 10 }])).toEqual({ start: 420, end: 1140 });
    expect(dayWindow({ open: false, start: '09:00', end: '17:00' }, [])).toEqual({ start: 540, end: 1020 });
    expect(dayWindow({ open: true, start: '09:15', end: '16:45' }, [])).toEqual({ start: 540, end: 1020 });
  });

  it('places blocks and reads taps', () => {
    const window = { start: 540, end: 1020 };
    expect(blockPosition({ start: 600, end: 630 }, window)).toEqual({ top: 64, height: 32 });
    expect(blockPosition({ start: 540, end: 545 }, window).height).toBe(18); // short ones stay tappable
    expect(timeAtY(64 + 40, window)).toBe(630); // 10:37 rounds down to 10:30
    expect(timeAtY(-5, window)).toBe(540);
    expect(timeAtY(9999, window)).toBe(1005); // last 15-minute slot
  });

  it('greys out approved time off for that person or the whole business', () => {
    const off = [
      { staffId: 'a', status: 'approved', startsAt: '2026-11-18T13:00:00.000Z', endsAt: '2026-11-19T13:00:00.000Z' }, // all of 19 Nov
      { staffId: null, status: 'approved', startsAt: '2026-11-19T01:00:00.000Z', endsAt: '2026-11-19T03:00:00.000Z' }, // 12-2pm 19 Nov
      { staffId: 'a', status: 'pending', startsAt: '2026-11-19T22:00:00.000Z', endsAt: '2026-11-19T23:00:00.000Z' },
    ] as TimeOff[];
    expect(timeOffSpans(off, 'a', '2026-11-19', TZ)).toEqual([
      { start: 0, end: 1440 },
      { start: 720, end: 840 },
    ]);
    expect(timeOffSpans(off, 'b', '2026-11-19', TZ)).toEqual([{ start: 720, end: 840 }]);
    expect(timeOffSpans(off, 'a', '2026-11-20', TZ)).toEqual([]);
  });
});
