// NexGain Bookings: free start times for the owner's Add a Booking / Move
// screens (same rules as the booking link), and the Roster form's checks.
// FAKE people and bookings only.
import { describe, expect, it, jest } from '@jest/globals';

import { bookableWindows, startTimes } from '@/systems/bookings/data/free-times';
import { zonedToIso } from '@/systems/bookings/data/booking-time';
import { rosterProblem } from '@/systems/bookings/components/owner/shift-editor';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const TZ = 'Australia/Brisbane';
const DAY = '2030-03-12'; // a Tuesday
const open = { open: true, start: '09:00', end: '17:00' };
const settings = {
  openingHours: [open, open, open, open, open, { ...open, open: false }, { ...open, open: false }],
  slotMinutes: 15,
  bufferMinutes: 0,
};
const john = { id: 'staff-john', employeeId: 'emp-john', isOwner: false };
const owner = { id: 'staff-owner', employeeId: null, isOwner: true };
const rostered = [{ date: DAY, start: '09:00', end: '17:00', employeeIds: ['emp-john'] }];
const at = (time: string) => zonedToIso(DAY, time, TZ);
const booking = (start: string, minutes: number, extra: Partial<{ id: string; status: 'confirmed' | 'cancelled' }> = {}) => ({
  id: extra.id ?? `b-${start}`,
  staffId: 'staff-john',
  status: extra.status ?? ('confirmed' as const),
  startsAt: at(start),
  blockedUntil: new Date(Date.parse(at(start)) + minutes * 60000).toISOString(),
});
const before = new Date('2030-03-01T00:00:00Z');

function times(opts: Partial<Parameters<typeof startTimes>[0]> = {}) {
  return startTimes({
    staff: john,
    dateKey: DAY,
    timeZone: TZ,
    durationMinutes: 45,
    settings,
    shifts: rostered,
    bookings: [],
    timeOff: [],
    now: before,
    ...opts,
  });
}
const free = (list: ReturnType<typeof times>) => list.filter((t) => t.free).map((t) => t.time);
const taken = (list: ReturnType<typeof times>) => list.filter((t) => !t.free).map((t) => t.time);

describe('bookable times come from the roster', () => {
  it('staff: only while rostered on; the owner: the opening hours', () => {
    expect(bookableWindows(john, DAY, settings, rostered)).toEqual([{ start: 540, end: 1020 }]);
    expect(bookableWindows(john, '2030-03-13', settings, rostered)).toEqual([]);
    expect(bookableWindows(owner, DAY, settings, [])).toEqual([{ start: 540, end: 1020 }]);
    expect(bookableWindows(owner, '2030-03-16', settings, [])).toEqual([]); // Saturday, closed
  });

  it('a shift past midnight carries on into the next day', () => {
    const late = [{ date: DAY, start: '20:00', end: '02:00', employeeIds: ['emp-john'] }];
    expect(bookableWindows(john, DAY, settings, late)).toEqual([{ start: 1200, end: 1440 }]);
    expect(bookableWindows(john, '2030-03-13', settings, late)).toEqual([{ start: 0, end: 120 }]);
  });

  it('not rostered = no times at all', () => {
    expect(times({ shifts: [] })).toEqual([]);
  });
});

describe('no double bookings', () => {
  it('an 11:00 booking for 45 minutes blocks them until 11:45', () => {
    const list = times({ bookings: [booking('11:00', 45)] });
    expect(taken(list)).toEqual(['10:30', '10:45', '11:00', '11:15', '11:30']);
    expect(free(list)).toContain('10:15'); // finishes at 11:00, just in time
    expect(free(list)).toContain('11:45');
  });

  it('offers the time straight after a booking ends, even off the 15-minute grid', () => {
    const list = times({ bookings: [booking('10:00', 40)] });
    expect(free(list)).toContain('10:40');
    expect(taken(list)).toContain('10:30');
  });

  it('cancelled bookings and the booking being moved don’t block', () => {
    expect(taken(times({ bookings: [booking('11:00', 45, { status: 'cancelled' })] }))).toEqual([]);
    expect(taken(times({ bookings: [booking('11:00', 45, { id: 'moving' })], ignoreBookingId: 'moving' }))).toEqual([]);
  });

  it('the gap after a booking blocks too', () => {
    const list = times({ bookings: [booking('11:00', 45)], settings: { ...settings, bufferMinutes: 15 } });
    // A 10:15 start would run into the 11:00 booking once its 15-minute gap is added.
    expect(taken(list)).toContain('10:15');
    expect(free(list)).toContain('10:00');
  });

  it('approved time off is never bookable', () => {
    const off = [{ staffId: 'staff-john', status: 'approved' as const, startsAt: at('13:00'), endsAt: at('14:00') }];
    const list = times({ timeOff: off });
    expect(taken(list)).toContain('13:30');
    expect(free(list)).toContain('14:00');
  });
});

describe('the whole service fits inside the shift', () => {
  it('the last start time lets the service finish by the end of the shift', () => {
    const list = times();
    expect(list.at(-1)?.time).toBe('16:15');
    expect(list.map((t) => t.time)).not.toContain('16:30');
  });

  it('past times today are not offered', () => {
    const list = times({ now: new Date(at('12:05')) });
    expect(list[0].time).toBe('12:15');
  });
});

describe('Roster form', () => {
  const week = (available: boolean) =>
    Array.from({ length: 7 }, () => ({ available, start: '08:00', end: '18:00' }));
  const availability = { 'emp-john': week(true), 'emp-sarah': week(false) } as never;
  const draft = { date: new Date(2030, 2, 12), start: '09:00', end: '17:00', employeeIds: ['emp-john'] };

  it('saves an available person rostered on', () => {
    expect(rosterProblem(draft, [], availability)).toBeNull();
  });

  it('needs someone, a real time, and only people who are available', () => {
    expect(rosterProblem({ ...draft, employeeIds: [] }, [], availability)).toMatch(/Choose who/);
    expect(rosterProblem({ ...draft, end: '08:00' }, [], availability)).toMatch(/end time/);
    expect(rosterProblem({ ...draft, employeeIds: ['emp-sarah'] }, [], availability)).toMatch(/isn’t available/);
    expect(rosterProblem({ ...draft, employeeIds: ['emp-new'] }, [], availability)).toMatch(/availability yet/);
    expect(rosterProblem({ ...draft, end: '19:00' }, [], availability)).toMatch(/isn’t available/);
  });

  it('can’t roster the same person twice at overlapping times', () => {
    const existing = [{ id: 'a', date: DAY, start: '12:00', end: '18:00', employeeIds: ['emp-john'] }];
    expect(rosterProblem(draft, existing, availability)).toMatch(/already rostered/);
    expect(rosterProblem({ ...draft, id: 'a' }, existing, availability)).toBeNull();
  });
});
