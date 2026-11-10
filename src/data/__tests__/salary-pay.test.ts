// Salaried workers get a fixed part of their yearly salary each pay run,
// whatever hours they clock; contractors are never in payroll.
import { describe, expect, it, jest } from '@jest/globals';

import { businessStore, type BusinessProfile } from '@/data/business';
import type { ClockSession } from '@/data/clock-records';
import { isSalaried, type Employee } from '@/data/employees';
import { calculatePayLine, calculatePayLines } from '@/data/payroll';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

businessStore.set({ id: 'b1', country: 'AU' } as BusinessProfile);

const person = (changes: Partial<Employee>): Employee =>
  ({
    id: 'e1',
    firstName: 'Fake',
    lastName: 'Person',
    employmentType: 'Full-time',
    payType: 'hourly',
    payRate: 30,
    overtimeRate: null,
    status: 'active',
    taxFreeThreshold: true,
    ...changes,
  }) as Employee;
const noHours = { total: 0, ordinary: 0, overtime: 0 };
const fortyHours = { total: 40, ordinary: 38, overtime: 2 };

describe('salary pay', () => {
  const salaried = person({ employmentType: 'Salary', payType: 'salary', payRate: 52000 });

  it('pays salary ÷ 52 a week and ÷ 26 a fortnight, whatever hours are clocked', () => {
    expect(calculatePayLine(salaried, noHours, 'Pending', 1).gross).toBe(1000);
    expect(calculatePayLine(salaried, fortyHours, 'Pending', 1).gross).toBe(1000);
    expect(calculatePayLine(salaried, noHours, 'Pending', 2).gross).toBe(2000);
  });

  it('has no overtime, and gets super (12% in Australia) on the salary payment', () => {
    const line = calculatePayLine(salaried, fortyHours, 'Pending', 1);
    expect(line.overtimePay).toBe(0);
    expect(line.super).toBe(120);
  });

  it('is left out of the pay until a salary is set', () => {
    const line = calculatePayLine(person({ employmentType: 'Salary', payType: 'salary', payRate: null }), noHours, 'Pending', 1);
    expect(line.gross).toBeNull();
  });

  it('knows who is salaried', () => {
    expect(isSalaried(person({ employmentType: 'Salary' }))).toBe(true);
    expect(isSalaried(person({ payType: 'salary' }))).toBe(true);
    expect(isSalaried(person({}))).toBe(false);
  });

  it('keeps hourly pay exactly as before', () => {
    const line = calculatePayLine(person({}), fortyHours, 'Pending', 1);
    expect(line.ordinaryPay).toBe(38 * 30);
    expect(line.overtimePay).toBe(2 * 45); // 1.5x
  });
});

describe('contractors', () => {
  it('are never in a pay run', () => {
    const week = { id: '2025-11-06', label: 'This week', start: new Date(2025, 10, 6), end: new Date(2025, 10, 13) };
    const sessions: ClockSession[] = [{ id: 's', employeeId: 'c1', start: new Date(2025, 10, 7, 9), end: new Date(2025, 10, 7, 17) }];
    const lines = calculatePayLines(
      [person({ id: 'c1', employmentType: 'Contractor' }), person({ id: 'e2' })],
      sessions,
      week,
      {},
      new Date(2025, 10, 8),
    );
    expect(lines.map((l) => l.employee.id)).toEqual(['e2']);
  });
});
