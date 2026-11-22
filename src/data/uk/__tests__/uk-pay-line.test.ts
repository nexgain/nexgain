// UK payroll through the app's real pay calculation, and the UK-only pay
// schedules (four-weekly, monthly). FAKE people only.
import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

/* eslint-disable import/first */
import { businessStore, type BusinessProfile } from '@/data/business';
import type { Employee } from '@/data/employees';
import { frequenciesFor, frequencyForDates, scheduleFor, schedulePeriods } from '@/data/pay-schedule';
import { calculatePayLine, payslipsStore, type PayslipRecord } from '@/data/payroll';
import { ukYearToDate } from '@/data/uk/pay-line';
/* eslint-enable import/first */

const person = (changes: Partial<Employee> = {}): Employee =>
  ({
    id: 'e1',
    firstName: 'Fake',
    lastName: 'Person',
    employmentType: 'Full-time',
    payType: 'salary',
    payRate: 30_000,
    overtimeRate: null,
    status: 'active',
    taxFreeThreshold: true,
    ukTaxCode: '1257L',
    scottishTaxpayer: false,
    ...changes,
  }) as Employee;
const noHours = { total: 0, ordinary: 0, overtime: 0 };
const ukMonthly = { id: 'b1', country: 'GB', paySchedule: { frequency: 'monthly', startDay: 1, anchor: '2026-04-01', from: null } } as unknown as BusinessProfile;
// April 2026 pay, paid on 30 April (tax month 1).
const april = { start: new Date(2026, 3, 1), end: new Date(2026, 4, 1), payDate: new Date(2026, 3, 30) };

describe('a UK pay line', () => {
  it('£30,000 salary, monthly, 1257L: £2,500 gross, tax £290.20, NI £116.16 (+ employer £312.45), net £2,093.64', () => {
    businessStore.set(ukMonthly);
    payslipsStore.set([]);
    const line = calculatePayLine(person(), noHours, 'Pending', 30 / 7, april);
    expect(line).toMatchObject({ gross: 2500, tax: 290.2, employeeNi: 116.16, employerNi: 312.45, net: 2093.64, super: null, ukTaxCode: '1257L', ukTaxPeriod: 'M1' });
  });

  it('uses earlier payslips this tax year (cumulative): month 2 is £290.40', () => {
    businessStore.set(ukMonthly);
    payslipsStore.set([{ employeeId: 'e1', periodStart: '2026-04-01', periodEnd: '2026-04-30', payDate: '2026-04-30', gross: 2500, tax: 290.2 } as PayslipRecord]);
    const may = { start: new Date(2026, 4, 1), end: new Date(2026, 5, 1), payDate: new Date(2026, 4, 29) };
    expect(calculatePayLine(person(), noHours, 'Pending', 31 / 7, may).tax).toBe(290.4);
    payslipsStore.set([]);
  });

  it("blocks a Scottish taxpayer's pay with a clear message", () => {
    businessStore.set(ukMonthly);
    const line = calculatePayLine(person({ scottishTaxpayer: true }), noHours, 'Pending', 30 / 7, april);
    expect(line.tax).toBeNull();
    expect(line.net).toBeNull();
    expect(line.ukProblem).toMatch(/Scottish/);
  });

  it('only counts payslips from the same tax year, before this period', () => {
    const past = [
      { employeeId: 'e1', periodStart: '2026-03-01', periodEnd: '2026-03-31', payDate: '2026-03-31', gross: 999, tax: 99 }, // 2025/26
      { employeeId: 'e1', periodStart: '2026-04-01', periodEnd: '2026-04-30', payDate: '2026-04-30', gross: 2500, tax: 290.2 },
      { employeeId: 'e2', periodStart: '2026-04-01', periodEnd: '2026-04-30', payDate: '2026-04-30', gross: 4000, tax: 600 },
    ];
    expect(ukYearToDate('e1', new Date(2026, 4, 1), new Date(2026, 4, 29), past)).toEqual({ grossToDate: 2500, taxToDate: 290.2 });
  });
});

describe('UK-only pay schedules', () => {
  it('offers four-weekly and monthly only to UK businesses', () => {
    expect(frequenciesFor('GB')).toEqual(['weekly', 'fortnightly', 'four-weekly', 'monthly']);
    expect(frequenciesFor('AU')).toEqual(['weekly', 'fortnightly']);
    expect(frequenciesFor('US')).toEqual(['weekly', 'fortnightly']);
  });

  it('monthly pay periods are calendar months', () => {
    const s = scheduleFor({ frequency: 'monthly', startDay: 1 }, new Date(2026, 5, 15), null);
    const [june, may] = schedulePeriods(s, new Date(2026, 5, 15), 2);
    expect(june.start).toEqual(new Date(2026, 5, 1));
    expect(june.end).toEqual(new Date(2026, 6, 1));
    expect(may.start).toEqual(new Date(2026, 4, 1));
    expect(frequencyForDates('2026-06-01', '2026-06-30')).toBe('Monthly');
  });

  it('four-weekly pay periods are 28 days', () => {
    const s = scheduleFor({ frequency: 'four-weekly', startDay: 1 }, new Date(2026, 5, 15), null);
    const [p] = schedulePeriods(s, new Date(2026, 5, 15), 1);
    expect((p.end.getTime() - p.start.getTime()) / 86_400_000).toBe(28);
    expect(frequencyForDates('2026-06-01', '2026-06-28')).toBe('Four-weekly');
  });

  it('weekly and fortnightly are exactly as before', () => {
    expect(frequencyForDates('2026-06-01', '2026-06-07')).toBe('Weekly');
    expect(frequencyForDates('2026-06-01', '2026-06-14')).toBe('Fortnightly');
    expect(frequencyForDates('2026-06-01', '2026-06-05')).toBe('5-day');
  });
});
