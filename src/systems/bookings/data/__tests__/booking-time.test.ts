// NexGain Bookings: times in the business's own time zone, link names and
// prices in the business's currency. FAKE values only.
import { describe, expect, it, jest } from '@jest/globals';

import {
  addDays,
  format12h,
  formatDayKey,
  formatDuration,
  todayIn,
  weekdayOf,
  zonedParts,
  zonedToIso,
} from '@/systems/bookings/data/booking-time';
import { bookingLink, cleanSlug, currencyCode, formatPrice, staffForService, type BookingStaff } from '@/systems/bookings/data/bookings';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

describe('business time zones', () => {
  it('turns a local time into the exact moment, with daylight saving', () => {
    expect(zonedToIso('2027-01-04', '09:00', 'Australia/Sydney')).toBe('2027-01-03T22:00:00.000Z'); // summer, UTC+11
    expect(zonedToIso('2027-07-05', '09:00', 'Australia/Sydney')).toBe('2027-07-04T23:00:00.000Z'); // winter, UTC+10
    expect(zonedToIso('2027-01-04', '09:00', 'Australia/Brisbane')).toBe('2027-01-03T23:00:00.000Z'); // no daylight saving
    expect(zonedToIso('2026-11-23', '09:00', 'America/New_York')).toBe('2026-11-23T14:00:00.000Z');
    expect(zonedToIso('2027-07-05', '09:00', 'Europe/London')).toBe('2027-07-05T08:00:00.000Z'); // British Summer Time
  });

  it('shows an exact moment as the business’s local date and time', () => {
    expect(zonedParts('2027-01-03T22:00:00.000Z', 'Australia/Sydney')).toMatchObject({ date: '2027-01-04', time: '09:00', weekday: 0 });
    expect(zonedParts('2026-11-23T14:30:00.000Z', 'America/New_York')).toMatchObject({ date: '2026-11-23', time: '09:30' });
    // Same moment, different day in London.
    expect(zonedParts('2027-01-03T22:00:00.000Z', 'Europe/London').date).toBe('2027-01-03');
  });

  it('works out today in the business’s time zone', () => {
    const lateUtc = new Date('2026-11-16T20:00:00.000Z');
    expect(todayIn('Australia/Sydney', lateUtc)).toBe('2026-11-17');
    expect(todayIn('Europe/London', lateUtc)).toBe('2026-11-16');
  });

  it('formats days, times and lengths', () => {
    expect(weekdayOf('2026-11-16')).toBe(0); // Monday
    expect(weekdayOf('2026-11-22')).toBe(6); // Sunday
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(formatDayKey('2026-11-17')).toBe('Tue 17 Nov');
    expect(format12h('00:15')).toBe('12:15 am');
    expect(format12h('13:05')).toBe('1:05 pm');
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(90)).toBe('1 hr 30 min');
  });
});

describe('booking links', () => {
  it('makes a clean link name from what the owner types', () => {
    expect(cleanSlug("Jo's Cuts & Colour!")).toBe('jos-cuts-colour');
    expect(cleanSlug('  --Fade  Lab-- ')).toBe('fade-lab');
    expect(cleanSlug('!!!')).toBe('');
    expect(bookingLink('fade-lab')).toBe('https://nexgain.github.io/nexgain/book/?b=fade-lab');
  });
});

describe('prices in the business’s currency', () => {
  it('uses AUD, GBP or USD', () => {
    expect(currencyCode('AUD – Australian Dollar')).toBe('AUD');
    expect(currencyCode('GBP – British Pound')).toBe('GBP');
    expect(currencyCode(undefined)).toBe('AUD');
    expect(formatPrice(40, { currency: 'AUD' })).toBe('$40.00');
    expect(formatPrice(40, { currency: 'GBP' })).toBe('£40.00');
    expect(formatPrice(1234.5, { currency: 'USD', whole: true })).toBe('$1,235');
  });
});

describe('who does a service', () => {
  const fakeStaff = [
    { id: 'a', name: 'Alex', active: true },
    { id: 'b', name: 'Blake', active: true },
    { id: 'c', name: 'Casey', active: false },
  ] as BookingStaff[];
  it('is everyone bookable, or only the chosen staff', () => {
    expect(staffForService({ staffIds: [] } as never, fakeStaff).map((s) => s.id)).toEqual(['a', 'b']);
    expect(staffForService({ staffIds: ['b', 'c'] } as never, fakeStaff).map((s) => s.id)).toEqual(['b']);
  });
});
