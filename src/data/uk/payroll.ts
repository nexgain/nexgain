// UK PAYE income tax and Class 1 National Insurance (England, Wales &
// Northern Ireland), worked out the way HMRC's payroll specification does it.
// ONLY used for businesses whose country is the United Kingdom (GB): every
// other country's payroll never calls this file. Rates live in
// src/config/uk-payroll-rates.ts. Tested in __tests__/uk-payroll.test.ts.
//
// How PAYE works (the "cumulative" method):
//   1. The tax code says how much pay is tax-free in a year (1257L = £12,579).
//   2. Each pay day, NexGain adds up the pay so far this tax year (6 April on)
//      and the tax-free pay so far, and works out the tax due so far.
//   3. This pay's tax = tax due so far - tax already taken this year.
//   So tax evens out across the year even if pay goes up and down.
// "W1"/"M1" codes (emergency, non-cumulative) look at this pay on its own.
import { UK_TAX_YEARS, type UkTaxYearRates } from '@/config/uk-payroll-rates';

const round2 = (n: number) => Math.round(n * 100) / 100;
/** Round up to the next penny. */
const upToPenny = (n: number) => Math.ceil(Math.round(n * 1e6) / 1e4) / 100;
/** Round down to the penny. */
const downToPenny = (n: number) => Math.floor(Math.round(n * 1e6) / 1e4) / 100;

// ---------------------------------------------------------------------------
// Tax codes
// ---------------------------------------------------------------------------

export type TaxCode =
  /** e.g. 1257L: £12,579 tax-free a year. */
  | { kind: 'allowance'; number: number; nonCumulative: boolean; text: string }
  /** BR: all pay at the basic rate. D0: higher rate. D1: additional rate. */
  | { kind: 'flat'; band: 'BR' | 'D0' | 'D1'; nonCumulative: boolean; text: string }
  /** 0T: no tax-free pay, normal bands. */
  | { kind: 'zero'; nonCumulative: boolean; text: string }
  /** NT: no tax at all. */
  | { kind: 'none'; nonCumulative: boolean; text: string };

export type TaxCodeResult = { ok: true; code: TaxCode } | { ok: false; message: string };

/**
 * Reads a tax code like "1257L", "1257L M1", "BR", "D0", "0T W1" or "NT".
 * Unsupported ones (Scottish S, Welsh C, K codes...) get a clear message, never a guess.
 */
export function parseTaxCode(raw: string): TaxCodeResult {
  const text = raw.toUpperCase().replace(/\s+/g, ' ').trim();
  if (!text) return { ok: false, message: 'Enter the employee’s tax code (usually 1257L).' };
  const m = text.match(/^(.*?)\s*(W1|M1|X)?$/);
  const body = (m?.[1] ?? text).replace(/\s/g, '');
  const nonCumulative = !!m?.[2];
  if (/^S/.test(body)) return { ok: false, message: `${text} is a Scottish tax code. Scottish income tax isn’t supported yet.` };
  if (/^C/.test(body)) return { ok: false, message: `${text} is a Welsh (C) tax code. NexGain doesn’t support C codes yet.` };
  if (/^K/.test(body)) return { ok: false, message: `${text} is a K code. NexGain doesn’t support K codes yet.` };
  if (body === 'BR' || body === 'D0' || body === 'D1') return { ok: true, code: { kind: 'flat', band: body, nonCumulative, text } };
  if (body === '0T') return { ok: true, code: { kind: 'zero', nonCumulative, text } };
  if (body === 'NT') return { ok: true, code: { kind: 'none', nonCumulative, text } };
  const l = body.match(/^(\d{1,4})L$/);
  if (l) return { ok: true, code: { kind: 'allowance', number: Number(l[1]), nonCumulative, text } };
  return { ok: false, message: `NexGain doesn’t support the tax code “${text}” yet. Supported: L codes (e.g. 1257L), BR, D0, D1, 0T and NT, with or without W1/M1.` };
}

// ---------------------------------------------------------------------------
// Tax years and periods
// ---------------------------------------------------------------------------

const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The UK tax year a pay date is in, or null when NexGain has no rates for it. */
export function ukTaxYearFor(payDate: Date): UkTaxYearRates | null {
  const key = keyOf(payDate);
  return UK_TAX_YEARS.find((y) => y.start <= key && key <= y.end) ?? null;
}

/** The tax year's label for a pay date, e.g. "2027/28" (also for years NexGain has no rates for). */
export function ukTaxYearLabel(payDate: Date) {
  const startYear = payDate.getMonth() > 3 || (payDate.getMonth() === 3 && payDate.getDate() >= 6) ? payDate.getFullYear() : payDate.getFullYear() - 1;
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, '0')}`;
}

export type UkFrequency = 'weekly' | 'fortnightly' | 'four-weekly' | 'monthly';

export type UkPeriod = {
  /** Weekly-type pay (weekly, fortnightly, four-weekly) or monthly. */
  basis: 'week' | 'month';
  /** How many weeks (or months) this pay covers: weekly 1, fortnightly 2, four-weekly 4, monthly 1. */
  multiplier: number;
  /** Tax week (1-53) or tax month (1-12) of the pay date. */
  number: number;
  /** e.g. "M3" or "W14" (shown on the payslip). */
  label: string;
};

/** The tax week or month a pay date falls in (week 1 = 6-12 April; month 1 = 6 April - 5 May). */
export function ukPeriodFor(payDate: Date, frequency: UkFrequency): UkPeriod {
  const year = payDate.getMonth() > 3 || (payDate.getMonth() === 3 && payDate.getDate() >= 6) ? payDate.getFullYear() : payDate.getFullYear() - 1;
  const start = new Date(year, 3, 6);
  if (frequency === 'monthly') {
    let month = (payDate.getFullYear() - year) * 12 + payDate.getMonth() - 3;
    if (payDate.getDate() < 6) month -= 1;
    const number = month + 1;
    return { basis: 'month', multiplier: 1, number, label: `M${number}` };
  }
  const days = Math.round((new Date(payDate.getFullYear(), payDate.getMonth(), payDate.getDate()).getTime() - start.getTime()) / 86_400_000);
  const number = Math.floor(days / 7) + 1;
  const multiplier = frequency === 'fortnightly' ? 2 : frequency === 'four-weekly' ? 4 : 1;
  return { basis: 'week', multiplier, number, label: `W${number}` };
}

// ---------------------------------------------------------------------------
// PAYE income tax
// ---------------------------------------------------------------------------

/** Tax-free pay for one week or month on an L code (HMRC: (number x 10 + 9) / 52 or / 12, rounded up to the penny). */
export function freePayPerPeriod(code: number, basis: 'week' | 'month') {
  return upToPenny((code * 10 + 9) / (basis === 'week' ? 52 : 12));
}

/** Tax on taxable pay (whole pounds), using band limits for the period (annual x n / periods, rounded up to the pound). */
function taxOnTaxable(taxable: number, n: number, basis: 'week' | 'month', rates: UkTaxYearRates) {
  const periods = basis === 'week' ? 52 : 12;
  let tax = 0;
  let below = 0;
  for (const band of rates.incomeTaxBands) {
    const limit = band.upTo === null ? Infinity : Math.ceil((band.upTo * n) / periods);
    const portion = Math.min(taxable, limit) - below;
    if (portion > 0) tax += portion * band.rate;
    below = limit;
    if (taxable <= limit) break;
  }
  return downToPenny(tax);
}

export type UkTaxInput = {
  /** This pay's gross. */
  gross: number;
  code: TaxCode;
  period: UkPeriod;
  /** Pay and tax already this tax year, before this pay (from earlier payslips). */
  grossToDate: number;
  taxToDate: number;
  rates: UkTaxYearRates;
};

/** PAYE income tax on one pay. Negative = a refund (cumulative codes only). */
export function ukIncomeTax({ gross, code, period, grossToDate, taxToDate, rates }: UkTaxInput): number {
  if (code.kind === 'none') return 0;
  // Non-cumulative (W1/M1) codes, and week 53, look at this pay on its own.
  const nonCumulative = code.nonCumulative || (period.basis === 'week' && period.number > 52);
  const n = nonCumulative ? period.multiplier : period.number;
  const payToDate = nonCumulative ? gross : grossToDate + gross;
  const paidToDate = nonCumulative ? 0 : taxToDate;

  let dueToDate: number;
  if (code.kind === 'flat') {
    const rate = code.band === 'BR' ? rates.basicRate : code.band === 'D0' ? rates.higherRate : rates.additionalRate;
    dueToDate = downToPenny(Math.floor(Math.max(0, payToDate)) * rate);
  } else {
    const free = code.kind === 'allowance' ? round2(freePayPerPeriod(code.number, period.basis) * n) : 0;
    const taxable = Math.max(0, Math.floor(payToDate - free));
    dueToDate = taxOnTaxable(taxable, n, period.basis, rates);
  }
  let tax = round2(dueToDate - paidToDate);
  // The overriding limit: never more than half of this pay.
  tax = Math.min(tax, downToPenny(gross * rates.overridingLimit));
  return tax;
}

// ---------------------------------------------------------------------------
// Class 1 National Insurance (category A, worked out on each pay)
// ---------------------------------------------------------------------------

export type UkNi = { employee: number; employer: number };

/** Employee and employer NI on one pay (the "exact percentage" method). */
export function ukNationalInsurance(gross: number, period: Pick<UkPeriod, 'basis' | 'multiplier'>, rates: UkTaxYearRates): UkNi {
  const t = (x: { week: number; month: number }) => (period.basis === 'month' ? x.month : x.week) * period.multiplier;
  const pt = t(rates.ni.pt);
  const uel = t(rates.ni.uel);
  const st = t(rates.ni.st);
  const main = Math.max(0, Math.min(gross, uel) - pt) * rates.ni.employeeMainRate;
  const upper = Math.max(0, gross - uel) * rates.ni.employeeUpperRate;
  const employer = Math.max(0, gross - st) * rates.ni.employerRate;
  return { employee: round2(main + upper), employer: round2(employer) };
}

// ---------------------------------------------------------------------------
// One UK pay
// ---------------------------------------------------------------------------

export type UkEmployeeTax = {
  /** e.g. "1257L" (defaults to the year's usual code). */
  taxCode: string | null;
  /** Scottish taxpayers (S codes) can't be paid yet. */
  scottishTaxpayer: boolean;
};

export type UkPayResult =
  | {
      ok: true;
      tax: number;
      employeeNi: number;
      employerNi: number;
      /** gross - tax - employee NI */
      net: number;
      taxCode: string;
      /** e.g. "M3" */
      period: string;
      taxYear: string;
    }
  | { ok: false; message: string };

/** Everything for one UK employee's pay: tax, both NI amounts and net pay. */
export function ukPay(input: {
  gross: number;
  employee: UkEmployeeTax;
  payDate: Date;
  frequency: UkFrequency;
  /** Earlier pay and tax this tax year (from this employee's payslips). */
  grossToDate: number;
  taxToDate: number;
}): UkPayResult {
  const rates = ukTaxYearFor(input.payDate);
  if (!rates) {
    return { ok: false, message: `NexGain doesn’t have UK tax rates for the ${ukTaxYearLabel(input.payDate)} tax year yet.` };
  }
  if (input.employee.scottishTaxpayer) {
    return { ok: false, message: 'This employee is a Scottish taxpayer. Scottish income tax isn’t supported yet, so NexGain can’t pay them.' };
  }
  const parsed = parseTaxCode(input.employee.taxCode?.trim() || rates.defaultTaxCode);
  if (!parsed.ok) return parsed;
  const period = ukPeriodFor(input.payDate, input.frequency);
  const tax = ukIncomeTax({ gross: input.gross, code: parsed.code, period, grossToDate: input.grossToDate, taxToDate: input.taxToDate, rates });
  const ni = ukNationalInsurance(input.gross, period, rates);
  return {
    ok: true,
    tax,
    employeeNi: ni.employee,
    employerNi: ni.employer,
    net: round2(input.gross - tax - ni.employee),
    taxCode: parsed.code.text,
    period: period.label,
    taxYear: rates.label,
  };
}

/** Over £100,000 a year HMRC usually gives a lower tax code; payroll follows the code it's given. */
export const TAPER_NOTE =
  'For pay over £100,000 a year the tax-free allowance shrinks. HMRC does this by sending you a new, lower tax code (e.g. 757L): enter it on the employee and NexGain uses it.';
