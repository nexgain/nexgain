// Payroll calculations. Everything is derived from the shared employees store
// (pay rate, bank details) and clock records (hours) - nothing is stored twice.
import { businessStore } from '@/data/business';
import { clockStore, type ClockSession } from '@/data/clock-records';
import { employeesStore, type Employee } from '@/data/employees';
import { createStore } from '@/data/store';
import { newId, warnSaveFailed } from '@/lib/ids';
import { supabase } from '@/lib/supabase';

/** Flat placeholder until proper PAYG withholding tables are set up. */
export const TAX_RATE_PLACEHOLDER = 0.2;
/** Superannuation Guarantee rate (12% from 1 July 2025), paid by the employer on top of gross. */
export const SUPER_GUARANTEE_RATE = 0.12;

export type Period = {
  id: string;
  label: string;
  start: Date;
  /** Exclusive. */
  end: Date;
};

export type PayStatus = 'Pending' | 'Paid';

export type PayLine = {
  employee: Employee;
  hours: number;
  rate: number | null;
  gross: number | null;
  tax: number | null;
  net: number | null;
  super: number | null;
  status: PayStatus;
};

export type PayTotals = {
  hours: number;
  gross: number;
  tax: number;
  net: number;
  super: number;
};

const HOUR_MS = 60 * 60 * 1000;

function roundCents(amount: number) {
  return Math.round(amount * 100) / 100;
}

function toDateId(date: Date) {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

function startOfWeek(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

const WEEK_LABELS = ['This week', 'Last week'];

/** Weekly pay periods (Mon–Sun), most recent first. */
export function getPayPeriods(now = new Date(), count = 4): Period[] {
  const thisWeek = startOfWeek(now);
  return Array.from({ length: count }, (_, i) => {
    const start = new Date(thisWeek);
    start.setDate(thisWeek.getDate() - i * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    return {
      id: toDateId(start),
      label: WEEK_LABELS[i] ?? `${i} weeks ago`,
      start,
      end,
    };
  });
}

/** Hours an employee was clocked in during a period. Open sessions count up to `now`. */
export function hoursInPeriod(
  sessions: ClockSession[],
  employeeId: string | null,
  period: Pick<Period, 'start' | 'end'>,
  now = new Date(),
) {
  let ms = 0;
  for (const s of sessions) {
    if (s.employeeId !== employeeId) continue;
    const from = Math.max(s.start.getTime(), period.start.getTime());
    const to = Math.min((s.end ?? now).getTime(), period.end.getTime());
    if (to > from) ms += to - from;
  }
  return ms / HOUR_MS;
}

export function calculatePayLine(employee: Employee, hours: number, status: PayStatus): PayLine {
  const rate = employee.payRate;
  if (rate === null) {
    return { employee, hours, rate, gross: null, tax: null, net: null, super: null, status };
  }
  const gross = roundCents(hours * rate);
  const tax = roundCents(gross * TAX_RATE_PLACEHOLDER);
  return {
    employee,
    hours,
    rate,
    gross,
    tax,
    net: roundCents(gross - tax),
    super: roundCents(gross * SUPER_GUARANTEE_RATE),
    status,
  };
}

export function calculatePayLines(
  employees: Employee[],
  sessions: ClockSession[],
  period: Period,
  statuses: Record<string, PayStatus> = {},
  now = new Date(),
): PayLine[] {
  return employees.map((employee) =>
    calculatePayLine(
      employee,
      hoursInPeriod(sessions, employee.id, period, now),
      statuses[employee.id] ?? 'Pending',
    ),
  );
}

export function payTotals(lines: PayLine[]): PayTotals {
  const totals = lines.reduce(
    (t, l) => ({
      hours: t.hours + l.hours,
      gross: t.gross + (l.gross ?? 0),
      tax: t.tax + (l.tax ?? 0),
      net: t.net + (l.net ?? 0),
      super: t.super + (l.super ?? 0),
    }),
    { hours: 0, gross: 0, tax: 0, net: 0, super: 0 },
  );
  return {
    hours: totals.hours,
    gross: roundCents(totals.gross),
    tax: roundCents(totals.tax),
    net: roundCents(totals.net),
    super: roundCents(totals.super),
  };
}

/** Total gross pay (labour cost) for a date range. */
export function labourCost(
  employees: Employee[],
  sessions: ClockSession[],
  range: Pick<Period, 'start' | 'end'>,
  now = new Date(),
) {
  return payTotals(
    employees.map((e) => calculatePayLine(e, hoursInPeriod(sessions, e.id, range, now), 'Pending')),
  ).gross;
}

// Payslips: one per employee per pay period, created when the owner approves
// payments. Stored online ("payslips" table). An employee is "Paid" for a
// period once they have a payslip for it. The owner sees every payslip in
// their business; an employee sees only their own.
export type PayslipRecord = {
  id: string;
  employeeId: string;
  /** Pay period id ("YYYY-MM-DD" of its Monday). */
  periodStart: string;
  /** Last day of the period, "YYYY-MM-DD". */
  periodEnd: string;
  hours: number;
  rate: number;
  gross: number;
  tax: number;
  net: number;
  super: number;
  paidAt: string;
};

export const payslipsStore = createStore<PayslipRecord[]>([]);

export function usePayslipRecords() {
  return payslipsStore.use();
}

type PayslipRow = {
  id: string;
  employee_id: string;
  period_start: string;
  period_end: string;
  hours: number | string;
  rate: number | string;
  gross: number | string;
  tax: number | string;
  net: number | string;
  super: number | string;
  paid_at: string;
};

export async function loadPayslips() {
  const { data, error } = await supabase.from('payslips').select('*').order('period_start', { ascending: false });
  if (error) throw error;
  payslipsStore.set(
    (data as PayslipRow[]).map((row) => ({
      id: row.id,
      employeeId: row.employee_id,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      hours: Number(row.hours),
      rate: Number(row.rate),
      gross: Number(row.gross),
      tax: Number(row.tax),
      net: Number(row.net),
      super: Number(row.super),
      paidAt: row.paid_at,
    })),
  );
}

export function usePayStatuses(periodId: string): Record<string, PayStatus> {
  const payslips = payslipsStore.use();
  return Object.fromEntries(
    payslips.filter((p) => p.periodStart === periodId).map((p) => [p.employeeId, 'Paid' as const]),
  );
}

/**
 * Marks employees as Paid for a period by creating their payslips (the
 * database then tells each employee "You've been paid!"). No money moves until
 * a payment processor or banking API is connected.
 */
export function approvePayments(periodId: string, employeeIds: string[]) {
  const businessId = businessStore.get()?.id;
  const [y, m, d] = periodId.split('-').map(Number);
  const period = { start: new Date(y, m - 1, d), end: new Date(y, m - 1, d + 7) };
  const lastDay = toDateId(new Date(y, m - 1, d + 6));
  const alreadyPaid = new Set(payslipsStore.get().filter((p) => p.periodStart === periodId).map((p) => p.employeeId));
  const sessions = clockStore.get();

  const created: PayslipRecord[] = employeesStore
    .get()
    .filter((e) => employeeIds.includes(e.id) && !alreadyPaid.has(e.id))
    .map((e) => calculatePayLine(e, hoursInPeriod(sessions, e.id, period), 'Pending'))
    .filter((l) => l.rate !== null && l.gross !== null)
    .map((l) => ({
      id: newId(),
      employeeId: l.employee.id,
      periodStart: periodId,
      periodEnd: lastDay,
      hours: Math.round(l.hours * 100) / 100,
      rate: l.rate!,
      gross: l.gross!,
      tax: l.tax!,
      net: l.net!,
      super: l.super!,
      paidAt: new Date().toISOString(),
    }));
  if (created.length === 0 || !businessId) return;

  payslipsStore.set((all) => [...created, ...all]);
  supabase
    .from('payslips')
    .insert(
      created.map((p) => ({
        id: p.id,
        business_id: businessId,
        employee_id: p.employeeId,
        period_start: p.periodStart,
        period_end: p.periodEnd,
        hours: p.hours,
        rate: p.rate,
        gross: p.gross,
        tax: p.tax,
        net: p.net,
        super: p.super,
      })),
    )
    .then(({ error }) => {
      if (!error) return;
      warnSaveFailed('payslips', error);
      // Show them as Pending again so the owner can retry.
      const ids = new Set(created.map((p) => p.id));
      payslipsStore.set((all) => all.filter((p) => !ids.has(p.id)));
    });
}

export function formatMoney(amount: number, { cents = true } = {}) {
  const [whole, fraction] = Math.abs(amount).toFixed(cents ? 2 : 0).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${amount < 0 ? '-' : ''}$${grouped}${fraction ? `.${fraction}` : ''}`;
}

export function formatHours(hours: number) {
  return `${Math.round(hours * 100) / 100}`;
}

/** e.g. "***** 4587" */
export function maskAccountNumber(accountNumber: string) {
  const digits = accountNumber.replace(/\D/g, '');
  return `***** ${digits.slice(-4)}`;
}
