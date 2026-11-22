// UK payroll's part of one employee's pay line: PAYE tax (cumulative, from
// this tax year's earlier payslips), employee and employer National
// Insurance, and net pay. Called by src/data/payroll.ts ONLY when the
// business's country is the United Kingdom (GB).
import type { Employee } from '@/data/employees';
import type { PayFrequencyId } from '@/data/pay-schedule';

import { ukPay, ukTaxYearFor, type UkFrequency, type UkPayResult } from './payroll';

const DAY_MS = 86_400_000;
const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Earlier payslips' figures this needs. */
export type UkPastPayslip = { employeeId: string; periodStart: string; periodEnd: string; payDate: string | null; gross: number; tax: number };

/**
 * What kind of UK pay a period is. A normal period follows the schedule; an
 * odd-length catch-up period is treated as that many weeks.
 */
export function ukFrequencyOf(start: Date, end: Date, schedule: PayFrequencyId): { frequency: UkFrequency; weeks: number } {
  const days = Math.round((end.getTime() - start.getTime()) / DAY_MS);
  if (schedule === 'monthly' && start.getDate() === 1 && end.getDate() === 1 && days >= 28) return { frequency: 'monthly', weeks: days / 7 };
  if (days === 7) return { frequency: 'weekly', weeks: 1 };
  if (days === 14) return { frequency: 'fortnightly', weeks: 2 };
  if (days === 28) return { frequency: 'four-weekly', weeks: 4 };
  return { frequency: days <= 10 ? 'weekly' : days <= 20 ? 'fortnightly' : 'four-weekly', weeks: days / 7 };
}

/** A UK salary's share for one pay: /52 a week, /26 a fortnight, /13 four-weekly, /12 a month. */
export function ukSalaryPay(yearly: number, frequency: UkFrequency, weeks: number) {
  const share = frequency === 'monthly' ? yearly / 12 : (yearly / 52) * weeks;
  return Math.round(share * 100) / 100;
}

/** Pay and tax already this tax year, before this period, from the employee's payslips. */
export function ukYearToDate(employeeId: string, periodStart: Date, payDate: Date, payslips: UkPastPayslip[]) {
  const year = ukTaxYearFor(payDate);
  if (!year) return { grossToDate: 0, taxToDate: 0 };
  const startKey = keyOf(periodStart);
  let grossToDate = 0;
  let taxToDate = 0;
  for (const p of payslips) {
    if (p.employeeId !== employeeId || p.periodStart >= startKey) continue;
    const paid = p.payDate ?? p.periodEnd;
    if (paid < year.start || paid > year.end) continue;
    grossToDate += p.gross;
    taxToDate += p.tax;
  }
  return { grossToDate: Math.round(grossToDate * 100) / 100, taxToDate: Math.round(taxToDate * 100) / 100 };
}

/** UK tax, NI and net for one employee's gross pay in a period. */
export function ukPayLine(input: {
  employee: Pick<Employee, 'id' | 'ukTaxCode' | 'scottishTaxpayer'>;
  gross: number;
  periodStart: Date;
  /** Exclusive (the day after the last day). */
  periodEnd: Date;
  /** The pay day; defaults to the period's last day. */
  payDate?: Date;
  schedule: PayFrequencyId;
  payslips: UkPastPayslip[];
}): UkPayResult {
  const payDate = input.payDate ?? new Date(input.periodEnd.getTime() - DAY_MS);
  const { frequency } = ukFrequencyOf(input.periodStart, input.periodEnd, input.schedule);
  const ytd = ukYearToDate(input.employee.id, input.periodStart, payDate, input.payslips);
  return ukPay({
    gross: input.gross,
    employee: { taxCode: input.employee.ukTaxCode, scottishTaxpayer: input.employee.scottishTaxpayer },
    payDate,
    frequency,
    ...ytd,
  });
}
