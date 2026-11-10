// A shift counts in the pay period it STARTED in, days are the business's local
// days, and a shift still going counts up to now.
import { describe, expect, it, jest } from '@jest/globals';

import { shiftsInPeriod, splitHours } from '@/data/payroll';
import type { ClockSession } from '@/data/clock-records';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

// A Thursday-to-Wednesday week: Thu 6 Nov 2025 to Wed 12 Nov (end is the next Thursday).
const week = { start: new Date(2025, 10, 6), end: new Date(2025, 10, 13) };
const at = (day: number, hour: number) => new Date(2025, 10, day, hour);
const shift = (id: string, from: Date, to: Date | null, employeeId = 'e1'): ClockSession => ({ id, employeeId, start: from, end: to });
const rules = { dailyAfterHours: 8 };

describe('pay period hours', () => {
  it('counts a shift in the period it started in, even if it ends in the next one', () => {
    const late = shift('a', at(12, 20), at(13, 4)); // Wed 8pm to Thu 4am
    expect(shiftsInPeriod([late], 'e1', week)).toHaveLength(1);
    expect(splitHours([late], 'e1', week, rules).total).toBe(8);
    // ...and not in the next period at all.
    const next = { start: week.end, end: new Date(2025, 10, 20) };
    expect(splitHours([late], 'e1', next, rules).total).toBe(0);
  });

  it('only counts this person, this period', () => {
    const sessions = [shift('a', at(6, 9), at(6, 17)), shift('b', at(6, 9), at(6, 12), 'e2'), shift('c', at(5, 9), at(5, 17))];
    expect(splitHours(sessions, 'e1', week, rules).total).toBe(8);
  });

  it('splits overtime by the local day', () => {
    const long = shift('a', at(7, 6), at(7, 17)); // 11 hours on Friday
    expect(splitHours([long], 'e1', week, rules)).toEqual({ total: 11, ordinary: 8, overtime: 3 });
  });

  it('counts an open shift up to now', () => {
    const open = shift('a', at(8, 9), null);
    expect(splitHours([open], 'e1', week, rules, at(8, 12)).total).toBe(3);
  });
});
