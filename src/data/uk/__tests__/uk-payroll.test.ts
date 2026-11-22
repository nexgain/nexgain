// UK PAYE and National Insurance for 2026/27, checked against HMRC's own
// method and published figures (Pay Adjustment Tables "Table A" pay
// adjustments and "Tables B to D" bands; NI from "Rates and thresholds for
// employers 2026 to 2027"). FAKE employees only.
import { describe, expect, it } from '@jest/globals';

import { UK_2026_27 } from '@/config/uk-payroll-rates';
import { freePayPerPeriod, parseTaxCode, ukIncomeTax, ukNationalInsurance, ukPay, ukPeriodFor, ukTaxYearFor } from '@/data/uk/payroll';

const code = (text: string) => {
  const r = parseTaxCode(text);
  if (!r.ok) throw new Error(r.message);
  return r.code;
};
const rates = UK_2026_27;
/** Month 1 of 2026/27 (pay day 30 April 2026). */
const MONTH_1 = ukPeriodFor(new Date(2026, 3, 30), 'monthly');

/** A whole year of equal monthly pays, cumulative, like a real payroll. */
function yearOfMonthlyTax(monthly: number, taxCode: string) {
  let grossToDate = 0;
  let taxToDate = 0;
  const each: number[] = [];
  for (let m = 1; m <= 12; m++) {
    const tax = ukIncomeTax({ gross: monthly, code: code(taxCode), period: { basis: 'month', multiplier: 1, number: m, label: `M${m}` }, grossToDate, taxToDate, rates });
    each.push(tax);
    grossToDate += monthly;
    taxToDate = Math.round((taxToDate + tax) * 100) / 100;
  }
  return { each, total: taxToDate };
}

describe('HMRC pay adjustments (tax-free pay) for 1257L', () => {
  it('matches HMRC Table A: £241.91 a week and £1,048.25 a month', () => {
    expect(freePayPerPeriod(1257, 'week')).toBe(241.91);
    expect(freePayPerPeriod(1257, 'month')).toBe(1048.25);
  });
});

describe('£30,000 a year, paid monthly, 1257L', () => {
  const monthly = 2500;
  it('month 1: tax £290.20, employee NI £116.16, employer NI £312.45', () => {
    expect(ukIncomeTax({ gross: monthly, code: code('1257L'), period: MONTH_1, grossToDate: 0, taxToDate: 0, rates })).toBe(290.2);
    expect(ukNationalInsurance(monthly, MONTH_1, rates)).toEqual({ employee: 116.16, employer: 312.45 });
  });
  it('adds up across the year (cumulative): £3,484.20 tax in total', () => {
    const { each, total } = yearOfMonthlyTax(monthly, '1257L');
    // HMRC's tables give £290.20 / £290.40 alternately as the pennies even out.
    expect(each.slice(0, 2)).toEqual([290.2, 290.4]);
    // (£30,000 - £12,579 tax-free) rounded down to pounds = £17,421 x 20%
    expect(total).toBe(3484.2);
  });
});

describe('£60,000 a year, paid monthly, 1257L', () => {
  it('month 1: tax £952.00 (20% and 40%), employee NI £267.50, employer NI £687.45', () => {
    expect(ukIncomeTax({ gross: 5000, code: code('1257L'), period: MONTH_1, grossToDate: 0, taxToDate: 0, rates })).toBe(952);
    expect(ukNationalInsurance(5000, MONTH_1, rates)).toEqual({ employee: 267.5, employer: 687.45 });
  });
  it('whole year: £11,428.40 tax (£60,000 - £12,579 = £47,421: £37,700 at 20% + £9,721 at 40%)', () => {
    expect(yearOfMonthlyTax(5000, '1257L').total).toBe(11428.4);
  });
});

describe('£110,000 a year: the Personal Allowance taper', () => {
  const monthly = 9166.67;
  it('on 1257L, payroll follows the code (as HMRC’s calculators do): £2,618.80 in month 1', () => {
    expect(ukIncomeTax({ gross: monthly, code: code('1257L'), period: MONTH_1, grossToDate: 0, taxToDate: 0, rates })).toBe(2618.8);
  });
  it('on the 757L code HMRC issues (allowance cut by £5,000), tax matches the taper: about £33,432 a year', () => {
    expect(ukIncomeTax({ gross: monthly, code: code('757L'), period: MONTH_1, grossToDate: 0, taxToDate: 0, rates })).toBe(2785.6);
    const { total } = yearOfMonthlyTax(monthly, '757L');
    // £37,700 x 20% + (£110,000 - £7,570 - £37,700) x 40% = £33,432 (within the +£9 code rounding)
    expect(Math.abs(total - 33_432)).toBeLessThan(5);
  });
});

describe('other tax codes', () => {
  it('BR: everything at 20%, no tax-free pay', () => {
    expect(ukIncomeTax({ gross: 2500, code: code('BR'), period: MONTH_1, grossToDate: 0, taxToDate: 0, rates })).toBe(500);
  });
  it('D0 at 40% and D1 at 45% (limited to half the pay)', () => {
    expect(ukIncomeTax({ gross: 1000, code: code('D0'), period: MONTH_1, grossToDate: 0, taxToDate: 0, rates })).toBe(400);
    expect(ukIncomeTax({ gross: 1000, code: code('D1'), period: MONTH_1, grossToDate: 0, taxToDate: 0, rates })).toBe(450);
  });
  it('0T: no tax-free pay, normal bands; NT: no tax', () => {
    expect(ukIncomeTax({ gross: 2500, code: code('0T'), period: MONTH_1, grossToDate: 0, taxToDate: 0, rates })).toBe(500);
    expect(ukIncomeTax({ gross: 2500, code: code('NT'), period: MONTH_1, grossToDate: 0, taxToDate: 0, rates })).toBe(0);
  });
  it('W1/M1 (emergency, non-cumulative) ignore earlier pay', () => {
    const month6 = { basis: 'month' as const, multiplier: 1, number: 6, label: 'M6' };
    // Cumulative: nothing earned in months 1-5, so a lot of tax-free pay has built up.
    expect(ukIncomeTax({ gross: 2500, code: code('1257L'), period: month6, grossToDate: 0, taxToDate: 0, rates })).toBe(0);
    // M1: taxed as if it were month 1.
    expect(ukIncomeTax({ gross: 2500, code: code('1257L M1'), period: month6, grossToDate: 0, taxToDate: 0, rates })).toBe(290.2);
  });
  it('gives a clear message for codes it doesn’t support (never a guess)', () => {
    expect(parseTaxCode('S1257L')).toMatchObject({ ok: false });
    expect(parseTaxCode('K475')).toMatchObject({ ok: false });
    expect(parseTaxCode('C1257L')).toMatchObject({ ok: false });
    expect(parseTaxCode('ABC')).toMatchObject({ ok: false });
  });
});

describe('weekly pay and National Insurance thresholds', () => {
  it('£500 a week in week 1: tax £51.60 and NI on the part above £242', () => {
    const week1 = ukPeriodFor(new Date(2026, 3, 10), 'weekly');
    expect(week1).toMatchObject({ basis: 'week', number: 1 });
    // £500 - £241.91 = £258.09 -> £258 x 20% = £51.60
    expect(ukIncomeTax({ gross: 500, code: code('1257L'), period: week1, grossToDate: 0, taxToDate: 0, rates })).toBe(51.6);
    // Employee 8% of (£500 - £242) = £20.64; employer 15% of (£500 - £96) = £60.60
    expect(ukNationalInsurance(500, week1, rates)).toEqual({ employee: 20.64, employer: 60.6 });
  });
  it('no NI below the thresholds', () => {
    expect(ukNationalInsurance(90, { basis: 'week', multiplier: 1 }, rates)).toEqual({ employee: 0, employer: 0 });
  });
  it('fortnightly and four-weekly use 2x and 4x the weekly thresholds', () => {
    expect(ukNationalInsurance(1000, { basis: 'week', multiplier: 2 }, rates).employee).toBe(41.28); // (1000 - 484) x 8%
    expect(ukNationalInsurance(2000, { basis: 'week', multiplier: 4 }, rates).employee).toBe(82.56); // (2000 - 968) x 8%
  });
});

describe('tax years and pay periods', () => {
  it('knows 2026/27 (6 April 2026 to 5 April 2027) and nothing else yet', () => {
    expect(ukTaxYearFor(new Date(2026, 3, 6))?.id).toBe('uk-2026-27');
    expect(ukTaxYearFor(new Date(2027, 3, 5))?.id).toBe('uk-2026-27');
    expect(ukTaxYearFor(new Date(2027, 3, 6))).toBeNull();
    expect(ukTaxYearFor(new Date(2026, 3, 5))).toBeNull();
  });
  it('works out tax months and weeks', () => {
    expect(ukPeriodFor(new Date(2026, 4, 5), 'monthly').number).toBe(1);
    expect(ukPeriodFor(new Date(2026, 4, 6), 'monthly').number).toBe(2);
    expect(ukPeriodFor(new Date(2027, 2, 31), 'monthly').number).toBe(12);
    expect(ukPeriodFor(new Date(2026, 3, 13), 'weekly').number).toBe(2);
  });
});

describe('one UK pay', () => {
  it('£30,000 monthly on 1257L: net = gross - tax - employee NI', () => {
    const r = ukPay({ gross: 2500, employee: { taxCode: '1257L', scottishTaxpayer: false }, payDate: new Date(2026, 3, 30), frequency: 'monthly', grossToDate: 0, taxToDate: 0 });
    expect(r).toMatchObject({ ok: true, tax: 290.2, employeeNi: 116.16, employerNi: 312.45, net: 2093.64, taxCode: '1257L', period: 'M1', taxYear: '2026/27' });
  });
  it('uses 1257L when no code has been entered', () => {
    const r = ukPay({ gross: 2500, employee: { taxCode: null, scottishTaxpayer: false }, payDate: new Date(2026, 3, 30), frequency: 'monthly', grossToDate: 0, taxToDate: 0 });
    expect(r).toMatchObject({ ok: true, taxCode: '1257L' });
  });
  it('blocks Scottish taxpayers with a clear message (never English rates)', () => {
    const r = ukPay({ gross: 2500, employee: { taxCode: '1257L', scottishTaxpayer: true }, payDate: new Date(2026, 3, 30), frequency: 'monthly', grossToDate: 0, taxToDate: 0 });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toMatch(/Scottish/);
  });
  it('blocks a tax year it has no rates for', () => {
    const r = ukPay({ gross: 2500, employee: { taxCode: '1257L', scottishTaxpayer: false }, payDate: new Date(2027, 4, 1), frequency: 'monthly', grossToDate: 0, taxToDate: 0 });
    expect(!r.ok && r.message).toMatch(/2027\/28/);
  });
});
