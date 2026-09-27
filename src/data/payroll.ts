// Payroll calculations. Everything is derived from the shared employees store
// (pay rate, bank details) and clock records (hours) - nothing is stored twice.
import type { ClockSession } from '@/data/clock-records';
import type { Employee } from '@/data/employees';
import { createStore } from '@/data/store';

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

// Paid status per pay period (keyed by period id, then employee id).
export const payStatusStore = createStore<Record<string, Record<string, PayStatus>>>({});

export function usePayStatuses(periodId: string) {
  return payStatusStore.use()[periodId] ?? {};
}

/**
 * Marks employees as Paid for a period. This only updates app data - no money
 * moves until a payment processor or banking API is connected.
 */
export function approvePayments(periodId: string, employeeIds: string[]) {
  payStatusStore.set((all) => ({
    ...all,
    [periodId]: {
      ...all[periodId],
      ...Object.fromEntries(employeeIds.map((id) => [id, 'Paid' as const])),
    },
  }));
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
