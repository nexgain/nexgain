// Locks in Australian and US payroll exactly as it was before UK payroll was
// added (the numbers below were taken from the app before that work). If any
// of these change, UK code has leaked into other countries. FAKE people only.
import { describe, expect, it, jest } from '@jest/globals';

import { businessStore, type BusinessProfile } from '@/data/business';
import type { Employee } from '@/data/employees';
import { calculatePayLine } from '@/data/payroll';
import { businessUsesSuper } from '@/data/super-rules';
import { TAX_ESTIMATE_NOTE, taxSetupFor } from '@/data/tax';
import { frequenciesFor } from '@/data/pay-schedule';
import { employeeStatusSubtitle, isUkBusiness, superWord } from '@/data/uk/wording';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const person = (changes: Partial<Employee> = {}): Employee =>
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
const fortyHours = { total: 40, ordinary: 38, overtime: 2 };

/** Only the money (the employee object itself isn't compared). */
const money = (l: ReturnType<typeof calculatePayLine>) => ({
  gross: l.gross,
  tax: l.tax,
  net: l.net,
  super: l.super,
  ordinaryPay: l.ordinaryPay,
  overtimePay: l.overtimePay,
});

describe('Australia (unchanged)', () => {
  it('hourly, a week of 38 + 2 overtime hours at $30', () => {
    businessStore.set({ id: 'b1', country: 'AU' } as BusinessProfile);
    expect(money(calculatePayLine(person(), fortyHours, 'Pending', 1))).toEqual({
      gross: 1230,
      tax: 211.29,
      net: 1018.71,
      super: 136.8,
      ordinaryPay: 1140,
      overtimePay: 90,
    });
  });

  it('salary $78,000, a fortnight, no tax-free threshold', () => {
    businessStore.set({ id: 'b1', country: 'AU' } as BusinessProfile);
    const line = calculatePayLine(person({ payType: 'salary', employmentType: 'Salary', payRate: 78_000, taxFreeThreshold: false }), fortyHours, 'Pending', 2);
    expect(money(line)).toEqual({ gross: 3000, tax: 700.38, net: 2299.62, super: 360, ordinaryPay: 3000, overtimePay: 0 });
  });

  it('keeps "Super", its brackets and the tax note', () => {
    expect(businessUsesSuper({ country: 'AU' })).toBe(true);
    expect(taxSetupFor({ country: 'AU' }).kind).toBe('brackets');
    expect(TAX_ESTIMATE_NOTE).toBe('Tax is an estimate based on current tax brackets.');
  });
});

describe('USA (unchanged)', () => {
  it('still asks for a flat tax rate (no built-in brackets)', () => {
    expect(taxSetupFor({ country: 'US' })).toEqual({ kind: 'missing', country: 'US' });
    expect(taxSetupFor({ country: 'US', manualTaxRate: 0.22 })).toEqual({ kind: 'manual', rate: 0.22 });
  });

  it('works out pay with the flat rate the owner entered, and no super', () => {
    businessStore.set({ id: 'b1', country: 'US', manualTaxRate: 0.22 } as BusinessProfile);
    expect(money(calculatePayLine(person(), fortyHours, 'Pending', 1))).toEqual({
      gross: 1230,
      tax: 270.6,
      net: 959.4,
      super: null,
      ordinaryPay: 1140,
      overtimePay: 90,
    });
  });

  it("can't work out tax until a rate is entered", () => {
    businessStore.set({ id: 'b1', country: 'US' } as BusinessProfile);
    const line = calculatePayLine(person(), fortyHours, 'Pending', 1);
    expect(line.tax).toBeNull();
    expect(line.net).toBeNull();
  });
});

describe('wording and screen options outside the UK (unchanged)', () => {
  it('keeps "Super" and the old Employee Status subtitle for Australia and the USA', () => {
    for (const country of ['AU', 'US', 'NZ', null]) {
      expect(superWord({ country })).toBe('Super');
      expect(employeeStatusSubtitle({ country })).toBe('Hours, pay, tax and super by employee');
      expect(isUkBusiness({ country })).toBe(false);
    }
  });

  it('only offers weekly and fortnightly pay outside the UK', () => {
    expect(frequenciesFor('AU')).toEqual(['weekly', 'fortnightly']);
    expect(frequenciesFor('US')).toEqual(['weekly', 'fortnightly']);
  });

  it('UK gets its own wording (and only the UK)', () => {
    expect(superWord({ country: 'GB' })).toBe('Pension');
    expect(employeeStatusSubtitle({ country: 'GB' })).toBe('Hours, pay, tax, NI and pension by employee');
  });

  it('Australian and US pay lines have no UK fields filled in', () => {
    for (const country of ['AU', 'US']) {
      businessStore.set({ id: 'b1', country, manualTaxRate: 0.2 } as BusinessProfile);
      const line = calculatePayLine(person(), fortyHours, 'Pending', 1);
      expect(line.employeeNi ?? null).toBeNull();
      expect(line.employerNi ?? null).toBeNull();
      expect(line.ukProblem ?? null).toBeNull();
    }
  });
});
