// The signed-in employee's payslips, created when their owner approves payroll.
// Everything shown comes from what was saved on the payslip at approval, so a
// payslip never changes afterwards. (The database only lets employees read
// their own payslips.)
import { formatShortDate } from '@/data/employee-roster';
import { usePayslipRecords, type PayslipRecord } from '@/data/payroll';
import { fromDateKey } from '@/data/shifts';
import { payrollLabel } from '@/lib/payment-files/types';

/** Pay periods are Monday to Sunday. */
export const PAY_FREQUENCY = 'Weekly';

export type Payslip = {
  id: string;
  payDate: Date;
  label: string;
  amount: number;
};

/** Everything on one payslip (screen and PDF). */
export type PayslipView = {
  id: string;
  record: PayslipRecord;
  frequency: string;
  /** e.g. "29 Sep – 5 Oct 2026" */
  rangeLabel: string;
  /** e.g. "Payslip_29-Sep-2026_to_05-Oct-2026.pdf" */
  fileName: string;
  /** False while the pay run is approved but not yet marked as paid by the owner. */
  paid: boolean;
  /** When it was paid, or the expected pay date while it's still processing. */
  paidAt: Date;
  /** e.g. "Payroll 004" (null on very old payslips). */
  payrollLabel: string | null;
  salaried: boolean;
  ordinaryHours: number;
  overtimeHours: number;
  totalHours: number;
  /** Per hour for hourly staff; yearly salary for salaried staff. */
  ordinaryRate: number;
  overtimeRate: number;
  ordinaryPay: number;
  overtimePay: number;
  /** Not tracked yet. */
  allowances: number;
  totalEarnings: number;
  tax: number;
  /** Not tracked yet. */
  otherDeductions: number;
  /** Taken out of pay: tax + other deductions. */
  totalDeductions: number;
  /** Paid by the employer on top of pay (not deducted). */
  super: number;
  net: number;
  /** Total earnings / total hours, or null with no hours. */
  avgHourlyRate: number | null;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fileDate = (key: string) => {
  const d = fromDateKey(key);
  return `${String(d.getDate()).padStart(2, '0')}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
};
const round = (n: number) => Math.round(n * 100) / 100;

export function payslipView(p: PayslipRecord): PayslipView {
  const totalEarnings = p.gross;
  const tax = p.tax;
  const otherDeductions = 0;
  return {
    id: p.id,
    record: p,
    frequency: PAY_FREQUENCY,
    rangeLabel: `${formatShortDate(fromDateKey(p.periodStart), false)} – ${formatShortDate(fromDateKey(p.periodEnd))}`,
    fileName: `Payslip_${fileDate(p.periodStart)}_to_${fileDate(p.periodEnd)}.pdf`,
    paid: p.status === 'paid',
    paidAt: p.paidAt ? new Date(p.paidAt) : fromDateKey(p.payDate ?? p.periodEnd),
    payrollLabel: p.payrollNumber ? payrollLabel(p.payrollNumber) : null,
    salaried: p.payType === 'salary',
    ordinaryHours: p.ordinaryHours,
    overtimeHours: p.overtimeHours,
    totalHours: round(p.ordinaryHours + p.overtimeHours),
    ordinaryRate: p.ordinaryRate,
    overtimeRate: p.overtimeRate,
    ordinaryPay: p.ordinaryPay,
    overtimePay: p.overtimePay,
    allowances: 0,
    totalEarnings,
    tax,
    otherDeductions,
    totalDeductions: round(tax + otherDeductions),
    super: p.super,
    net: p.net,
    avgHourlyRate: p.hours > 0 ? round(totalEarnings / p.hours) : null,
  };
}

/** The employee's payslips, newest first. */
export function usePayslipViews(): PayslipView[] {
  return [...usePayslipRecords()]
    .sort((a, b) => b.periodStart.localeCompare(a.periodStart) || (b.payrollNumber ?? 0) - (a.payrollNumber ?? 0))
    .map(payslipView);
}

/** Newest first. `amount` is the net (take-home) pay. */
export function usePayslips(): Payslip[] {
  return usePayslipViews().map((v) => ({ id: v.id, payDate: v.paidAt, label: `Pay period ${v.rangeLabel}`, amount: v.net }));
}

export function formatCurrency(amount: number) {
  const [whole, cents] = Math.abs(amount).toFixed(2).split('.');
  return `${amount < 0 ? '-' : ''}$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${cents}`;
}

/** e.g. "38" or "7.5" */
export function formatHrs(hours: number) {
  return `${Math.round(hours * 100) / 100}`;
}
