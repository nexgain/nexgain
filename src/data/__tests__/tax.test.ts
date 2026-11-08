// Tax estimates from the Australian 2026–27 brackets plus the 2% Medicare levy.
import { describe, expect, it, jest } from '@jest/globals';

import { TAX_BRACKETS } from '@/config/tax-brackets';
import { businessStore, type BusinessProfile } from '@/data/business';
import type { Employee } from '@/data/employees';
import { calculatePayLine } from '@/data/payroll';
import { taxForPay, taxOnPay, taxSetupFor, yearlyTax } from '@/data/tax';

// No database in tests (jest moves this above the imports).
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const AU = TAX_BRACKETS.AU;

describe('weekly tax (Australia)', () => {
  it('$500/week: $26,000 a year -> $32.50 a week', () => {
    // (26,000 - 18,200) x 15% = 1,170, + Medicare 2% of 26,000 = 520 -> 1,690 / 52
    expect(taxForPay(500, AU)).toBe(32.5);
  });

  it('$1,000/week: $52,000 a year -> $137.69 a week', () => {
    // 26,800 x 15% = 4,020, + 7,000 x 30% = 2,100, + Medicare 1,040 -> 7,160 / 52
    expect(taxForPay(1000, AU)).toBe(137.69);
  });

  it('$2,000/week: $104,000 a year -> $457.69 a week', () => {
    // 4,020 + 59,000 x 30% = 17,700, + Medicare 2,080 -> 23,800 / 52
    expect(taxForPay(2000, AU)).toBe(457.69);
  });

  it('a bigger week means more tax that week', () => {
    expect(taxForPay(1500, AU)).toBeGreaterThan(taxForPay(1000, AU));
  });

  it('without the tax-free threshold the first bracket is taxed too', () => {
    // + 18,200 x 15% = 2,730 more a year -> (1,690 + 2,730) / 52 = 85.00
    expect(taxForPay(500, AU, false)).toBe(85);
  });

  it('fortnightly and monthly pay use 26 and 12 pays a year', () => {
    expect(taxForPay(2000, AU, true, 'Fortnightly')).toBe(275.38); // 7,160 / 26
    expect(yearlyTax(52000, AU)).toBeCloseTo(7160, 6);
    expect(taxForPay(52000 / 12, AU, true, 'Monthly')).toBe(596.67); // 7,160 / 12
  });

  it('top bracket: $250,000 a year', () => {
    // 4,020 + 27,000 + 55,000 x 37% = 20,350 + 60,000 x 45% = 27,000 -> 78,370, + Medicare 5,000
    expect(yearlyTax(250000, AU)).toBeCloseTo(83370, 6);
  });
});

describe('who pays tax and how', () => {
  const employee = { contractor: false, claimsTaxFreeThreshold: true };

  it('contractors have no tax taken out', () => {
    expect(taxOnPay(1000, taxSetupFor({ country: 'AU' }), { contractor: true, claimsTaxFreeThreshold: true })).toBe(0);
  });

  it('a country without brackets needs a rate from the owner (no guessing)', () => {
    expect(taxSetupFor({ country: 'GB' })).toEqual({ kind: 'missing', country: 'GB' });
    expect(taxOnPay(1000, taxSetupFor({ country: 'GB' }), employee)).toBeNull();
    expect(taxOnPay(1000, taxSetupFor({ country: 'GB', manualTaxRate: 0.2 }), employee)).toBe(200);
  });

  it('payroll uses the brackets and gives contractors no tax', () => {
    businessStore.set({ country: 'AU' } as BusinessProfile);
    const person = (employmentType: string) =>
      ({ id: 'e1', employmentType, payRate: 25, payType: 'hourly', overtimeRate: null, taxFreeThreshold: true }) as Employee;
    // 40 hours x $25 = $1,000 for the week.
    const split = { total: 40, ordinary: 40, overtime: 0 };
    const casual = calculatePayLine(person('Casual'), split, 'Pending');
    expect(casual.tax).toBe(137.69);
    expect(casual.net).toBe(862.31);
    const contractor = calculatePayLine(person('Contractor'), split, 'Pending');
    expect(contractor.tax).toBe(0);
    businessStore.set(null);
  });
});
