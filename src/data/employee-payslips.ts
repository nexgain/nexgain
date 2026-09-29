// The signed-in employee's payslips, created when their owner approves payroll.
import { fromDateKey } from '@/data/shifts';
import { formatShortDate } from '@/data/employee-roster';
import { usePayslipRecords } from '@/data/payroll';

export type Payslip = {
  id: string;
  payDate: Date;
  label: string;
  amount: number;
};

/** Newest first. `amount` is the net (take-home) pay. */
export function usePayslips(): Payslip[] {
  return [...usePayslipRecords()]
    .sort((a, b) => b.paidAt.localeCompare(a.paidAt))
    .map((p) => ({
      id: p.id,
      payDate: new Date(p.paidAt),
      label: `Pay period ${formatShortDate(fromDateKey(p.periodStart), false)} – ${formatShortDate(fromDateKey(p.periodEnd))}`,
      amount: p.net,
    }));
}

export function formatCurrency(amount: number) {
  const [whole, cents] = amount.toFixed(2).split('.');
  return `$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${cents}`;
}
