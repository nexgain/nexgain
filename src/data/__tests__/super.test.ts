// Super calculations: qualifying earnings, the 12% rate, contractors and due-date warnings.
import { describe, expect, it, jest } from '@jest/globals';

import { DEFAULT_SUPER_INCLUDES } from '@/data/business';
import type { Employee } from '@/data/employees';
import { calculatePayLine, qualifyingEarningsOf } from '@/data/payroll';
import { dueStateOf } from '@/data/super-payments';

// No database in tests (jest moves this above the imports).
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const worker = (employmentType: string): Employee =>
  ({ id: 'e1', employmentType, payRate: 30, payType: 'hourly', overtimeRate: null }) as Employee;

describe('super', () => {
  it('counts ordinary pay but not overtime by default', () => {
    expect(qualifyingEarningsOf({ ordinaryPay: 1000, overtimePay: 200 }, DEFAULT_SUPER_INCLUDES)).toBe(1000);
    expect(qualifyingEarningsOf({ ordinaryPay: 1000, overtimePay: 200 }, { ...DEFAULT_SUPER_INCLUDES, overtime: true })).toBe(1200);
    expect(qualifyingEarningsOf({ ordinaryPay: 1000, overtimePay: 0, commissions: 50, allowances: 25 }, DEFAULT_SUPER_INCLUDES)).toBe(1075);
  });

  it('is 12% of qualifying earnings for employees, part-time and casual', () => {
    // 38 normal hours + 2 overtime hours at $30/hr: ordinary pay $1,140, overtime $90.
    for (const type of ['Full-time', 'Part-time', 'Casual']) {
      const line = calculatePayLine(worker(type), { total: 40, ordinary: 38, overtime: 2 }, 'Pending');
      expect(line.qualifyingEarnings).toBe(1140);
      expect(line.super).toBe(136.8);
    }
  });

  it('gives contractors no super', () => {
    const line = calculatePayLine(worker('Contractor'), { total: 40, ordinary: 38, overtime: 2 }, 'Pending');
    expect(line.super).toBeNull();
    expect(line.qualifyingEarnings).toBeNull();
  });

  it('warns when super is close to or past its due date', () => {
    const today = '2026-11-10';
    expect(dueStateOf({ status: 'unpaid', dueDate: '2026-11-09' }, today)).toBe('overdue');
    expect(dueStateOf({ status: 'unpaid', dueDate: '2026-11-12' }, today)).toBe('soon');
    expect(dueStateOf({ status: 'unpaid', dueDate: '2026-11-20' }, today)).toBe('ok');
    expect(dueStateOf({ status: 'paid', dueDate: '2026-11-01' }, today)).toBe('paid');
  });
});
