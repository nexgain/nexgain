// Payslips will come from the Owner's Payroll section once a database is connected.

export type Payslip = {
  id: string;
  payDate: Date;
  label: string;
  amount: number;
};

export function getPayslips(): Payslip[] {
  return [];
}

export function formatCurrency(amount: number) {
  const [whole, cents] = amount.toFixed(2).split('.');
  return `$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${cents}`;
}
