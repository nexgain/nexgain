// Pay periods from the business's pay schedule (weekly or fortnightly, any start day).
import { describe, expect, it, jest } from '@jest/globals';

import { DEFAULT_PAY_SCHEDULE, firstPeriod, schedulePeriods, scheduleFor, toKey, type SchedulePeriod } from '@/data/pay-schedule';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const NOW = new Date(2026, 10, 11); // Wed 11 Nov 2026
const span = (p: SchedulePeriod) => `${toKey(p.start)}..${toKey(new Date(p.end.getFullYear(), p.end.getMonth(), p.end.getDate() - 1))}`;

describe('pay periods', () => {
  it('stays weekly, Monday to Sunday, by default', () => {
    expect(schedulePeriods(DEFAULT_PAY_SCHEDULE, NOW, 2).map(span)).toEqual(['2026-11-09..2026-11-15', '2026-11-02..2026-11-08']);
  });

  it('runs Friday to Thursday when Friday is chosen', () => {
    const s = scheduleFor({ frequency: 'weekly', startDay: 5 }, NOW, null);
    expect(schedulePeriods(s, NOW, 2).map(span)).toEqual(['2026-11-06..2026-11-12', '2026-10-30..2026-11-05']);
  });

  it('fortnightly: lets the owner pick which fortnight this is (nothing paid yet)', () => {
    const thisWeek = scheduleFor({ frequency: 'fortnightly', startDay: 5, fortnightOffset: 0 }, NOW, null);
    const lastWeek = scheduleFor({ frequency: 'fortnightly', startDay: 5, fortnightOffset: 1 }, NOW, null);
    expect(span(firstPeriod(thisWeek, NOW))).toBe('2026-11-06..2026-11-19');
    expect(span(firstPeriod(lastWeek, NOW))).toBe('2026-10-30..2026-11-12');
    expect(schedulePeriods(thisWeek, NOW, 2).map(span)).toEqual(['2026-11-06..2026-11-19', '2026-10-23..2026-11-05']);
  });

  it('after a change, starts the day after the last pay with a short catch-up pay (no day paid twice or missed)', () => {
    // Paid weekly Mon-Sun up to Sun 8 Nov; switching to fortnightly Friday-Thursday.
    const s = scheduleFor({ frequency: 'fortnightly', startDay: 5 }, NOW, '2026-11-08');
    const first = firstPeriod(s, NOW);
    expect(first.catchUp).toBe(true);
    expect(span(first)).toBe('2026-11-09..2026-11-12');
    const past = [{ periodStart: '2026-11-02', periodEnd: '2026-11-08' }];
    expect(schedulePeriods(s, NOW, 3, past).map(span)).toEqual(['2026-11-09..2026-11-12', '2026-11-02..2026-11-08']);
    expect(schedulePeriods(s, new Date(2026, 10, 14), 2, past).map(span)).toEqual(['2026-11-13..2026-11-26', '2026-11-09..2026-11-12']);
  });

  it('needs no catch-up when the new start day follows on from the last pay', () => {
    const s = scheduleFor({ frequency: 'fortnightly', startDay: 1 }, NOW, '2026-11-08');
    const first = firstPeriod(s, NOW);
    expect(first.catchUp).toBe(false);
    expect(span(first)).toBe('2026-11-09..2026-11-22');
  });
});
