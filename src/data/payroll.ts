// Payroll calculations. Everything is derived from the shared employees store
// (pay rate, overtime rate, bank details), clock records (hours) and the
// business's overtime rule - nothing is stored twice. Approved weeks use what
// was saved on their payslips, so later changes never alter them.
import { businessStore, overtimeRulesOf, type OvertimeRules } from '@/data/business';
import { clockStore, type ClockSession } from '@/data/clock-records';
import { employeesStore, isContractor, overtimeRateOf, type Employee, type PayType } from '@/data/employees';
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
  /** All hours worked (normal + overtime). */
  hours: number;
  ordinaryHours: number;
  overtimeHours: number;
  /** Normal rate: per hour, or yearly salary for salaried staff. */
  rate: number | null;
  /** Per hour; null for salaried staff (no overtime). */
  overtimeRate: number | null;
  ordinaryPay: number | null;
  overtimePay: number | null;
  gross: number | null;
  tax: number | null;
  net: number | null;
  /** Paid by the employer on top of gross, on normal (ordinary-time) pay only. */
  super: number | null;
  status: PayStatus;
};

export type PayTotals = {
  hours: number;
  ordinaryHours: number;
  overtimeHours: number;
  gross: number;
  tax: number;
  net: number;
  super: number;
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Days are counted in Brisbane time (UTC+10, no daylight saving). */
const BUSINESS_UTC_OFFSET_MS = 10 * HOUR_MS;

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

export type HoursSplit = { total: number; ordinary: number; overtime: number };

/**
 * Splits an employee's clocked hours into normal and overtime hours, day by day
 * (Brisbane days): hours up to the daily limit are normal, the rest overtime.
 * Time between clocking out and back in (e.g. an unpaid break) isn't counted.
 * A shift that crosses midnight is split between the two days.
 */
export function splitHours(
  sessions: ClockSession[],
  employeeId: string | null,
  period: Pick<Period, 'start' | 'end'>,
  rules: OvertimeRules,
  now = new Date(),
): HoursSplit {
  const msPerDay = new Map<number, number>();
  for (const s of sessions) {
    if (s.employeeId !== employeeId) continue;
    let from = Math.max(s.start.getTime(), period.start.getTime());
    const to = Math.min((s.end ?? now).getTime(), period.end.getTime());
    while (from < to) {
      const day = Math.floor((from + BUSINESS_UTC_OFFSET_MS) / DAY_MS);
      const dayEnd = (day + 1) * DAY_MS - BUSINESS_UTC_OFFSET_MS;
      const chunk = Math.min(to, dayEnd) - from;
      msPerDay.set(day, (msPerDay.get(day) ?? 0) + chunk);
      from += chunk;
    }
  }
  const limit = rules.dailyAfterHours;
  let ordinary = 0;
  let overtime = 0;
  for (const ms of msPerDay.values()) {
    const hours = ms / HOUR_MS;
    ordinary += Math.min(hours, limit);
    overtime += Math.max(0, hours - limit);
  }
  return { total: ordinary + overtime, ordinary, overtime };
}

/**
 * One employee's pay for a period.
 * - Hourly staff: (normal hours x pay rate) + (overtime hours x overtime rate).
 * - Salaried staff: yearly salary / 52 per week, whatever hours they clocked; no overtime.
 * Tax is the flat placeholder on gross. Super is on normal (ordinary-time) pay only.
 * Rates always come from the employee's profile, so a changed rate applies straight away.
 */
export function calculatePayLine(employee: Employee, split: HoursSplit, status: PayStatus, weeks = 1): PayLine {
  const rate = employee.payRate;
  const salaried = employee.payType === 'salary';
  const hours = split.total;
  const ordinaryHours = salaried ? split.total : split.ordinary;
  const overtimeHours = salaried ? 0 : split.overtime;
  if (rate === null) {
    return {
      employee, hours, ordinaryHours, overtimeHours, rate, overtimeRate: null,
      ordinaryPay: null, overtimePay: null, gross: null, tax: null, net: null, super: null, status,
    };
  }
  const overtimeRate = salaried ? null : overtimeRateOf(employee);
  const ordinaryPay = roundCents(salaried ? (rate / 52) * weeks : ordinaryHours * rate);
  const overtimePay = roundCents(overtimeHours * (overtimeRate ?? 0));
  const gross = roundCents(ordinaryPay + overtimePay);
  const tax = roundCents(gross * TAX_RATE_PLACEHOLDER);
  return {
    employee,
    hours,
    ordinaryHours,
    overtimeHours,
    rate,
    overtimeRate,
    ordinaryPay,
    overtimePay,
    gross,
    tax,
    net: roundCents(gross - tax),
    super: roundCents(ordinaryPay * SUPER_GUARANTEE_RATE),
    status,
  };
}

/** An approved week, exactly as it was saved on the payslip. */
function lineFromPayslip(employee: Employee, p: PayslipRecord): PayLine {
  return {
    employee,
    hours: p.hours,
    ordinaryHours: p.ordinaryHours,
    overtimeHours: p.overtimeHours,
    rate: p.ordinaryRate,
    overtimeRate: p.payType === 'salary' ? null : p.overtimeRate,
    ordinaryPay: p.ordinaryPay,
    overtimePay: p.overtimePay,
    gross: p.gross,
    tax: p.tax,
    net: p.net,
    super: p.super,
    status: 'Paid',
  };
}

const WEEK_MS = 7 * 24 * HOUR_MS;

/**
 * Inactive employees only appear in payroll if they worked during the period.
 * Employees already paid for the period show what their payslip saved.
 */
function payableLines(
  employees: Employee[],
  sessions: ClockSession[],
  range: Pick<Period, 'start' | 'end'>,
  statuses: Record<string, PayStatus>,
  now: Date,
  paid: PayslipRecord[] = [],
) {
  const weeks = (range.end.getTime() - range.start.getTime()) / WEEK_MS;
  const rules = overtimeRulesOf(businessStore.get());
  const periodId = toDateId(range.start);
  return employees
    .map((employee) => {
      const payslip = paid.find((p) => p.employeeId === employee.id && p.periodStart === periodId);
      if (payslip) return lineFromPayslip(employee, payslip);
      return calculatePayLine(
        employee,
        splitHours(sessions, employee.id, range, rules, now),
        statuses[employee.id] ?? 'Pending',
        weeks,
      );
    })
    .filter((l) => l.employee.status !== 'inactive' || l.hours > 0 || l.status === 'Paid')
    // Contractors are paid through their invoices, not payroll (no double payments).
    .filter((l) => !isContractor(l.employee) || l.status === 'Paid');
}

/** Pay for every employee in a period. Pass the payslips so approved weeks show what was paid. */
export function calculatePayLines(
  employees: Employee[],
  sessions: ClockSession[],
  period: Period,
  statuses: Record<string, PayStatus> = {},
  now = new Date(),
  paid: PayslipRecord[] = [],
): PayLine[] {
  return payableLines(employees, sessions, period, statuses, now, paid);
}

export function payTotals(lines: PayLine[]): PayTotals {
  const totals = lines.reduce(
    (t, l) => ({
      hours: t.hours + l.hours,
      ordinaryHours: t.ordinaryHours + l.ordinaryHours,
      overtimeHours: t.overtimeHours + l.overtimeHours,
      gross: t.gross + (l.gross ?? 0),
      tax: t.tax + (l.tax ?? 0),
      net: t.net + (l.net ?? 0),
      super: t.super + (l.super ?? 0),
    }),
    { hours: 0, ordinaryHours: 0, overtimeHours: 0, gross: 0, tax: 0, net: 0, super: 0 },
  );
  return {
    hours: totals.hours,
    ordinaryHours: totals.ordinaryHours,
    overtimeHours: totals.overtimeHours,
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
  return payTotals(payableLines(employees, sessions, range, {}, now)).gross;
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
  /** All hours (normal + overtime). */
  hours: number;
  /** Normal rate (per hour, or yearly salary). Same as ordinaryRate. */
  rate: number;
  payType: PayType;
  ordinaryHours: number;
  overtimeHours: number;
  ordinaryRate: number;
  overtimeRate: number;
  ordinaryPay: number;
  overtimePay: number;
  /** The daily overtime limit used (null on payslips from before overtime existed). */
  overtimeAfterHours: number | null;
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
  pay_type?: PayType | null;
  ordinary_hours?: number | string | null;
  overtime_hours?: number | string | null;
  ordinary_rate?: number | string | null;
  overtime_rate?: number | string | null;
  ordinary_pay?: number | string | null;
  overtime_pay?: number | string | null;
  overtime_after_hours?: number | string | null;
};

const num = (v: number | string | null | undefined, fallback: number) => (v === null || v === undefined ? fallback : Number(v));

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
      payType: row.pay_type ?? 'hourly',
      ordinaryHours: num(row.ordinary_hours, Number(row.hours)),
      overtimeHours: num(row.overtime_hours, 0),
      ordinaryRate: num(row.ordinary_rate, Number(row.rate)),
      overtimeRate: num(row.overtime_rate, 0),
      ordinaryPay: num(row.ordinary_pay, Number(row.gross)),
      overtimePay: num(row.overtime_pay, 0),
      overtimeAfterHours: row.overtime_after_hours === null || row.overtime_after_hours === undefined ? null : Number(row.overtime_after_hours),
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
  const rules = overtimeRulesOf(businessStore.get());
  const hrs = (h: number) => Math.round(h * 100) / 100;

  const created: PayslipRecord[] = employeesStore
    .get()
    // Contractors are never paid through payroll (they invoice instead).
    .filter((e) => employeeIds.includes(e.id) && !alreadyPaid.has(e.id) && !isContractor(e))
    // Each employee's current rates and the current overtime rule; the payslip
    // keeps them, so later changes don't affect it.
    .map((e) => calculatePayLine(e, splitHours(sessions, e.id, period, rules), 'Pending'))
    .filter((l) => l.rate !== null && l.gross !== null)
    .map((l) => ({
      id: newId(),
      employeeId: l.employee.id,
      periodStart: periodId,
      periodEnd: lastDay,
      hours: hrs(hrs(l.ordinaryHours) + hrs(l.overtimeHours)),
      rate: l.rate!,
      payType: l.employee.payType,
      ordinaryHours: hrs(l.ordinaryHours),
      overtimeHours: hrs(l.overtimeHours),
      ordinaryRate: l.rate!,
      overtimeRate: l.overtimeRate ?? 0,
      ordinaryPay: l.ordinaryPay!,
      overtimePay: l.overtimePay!,
      overtimeAfterHours: rules.dailyAfterHours,
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
        pay_type: p.payType,
        ordinary_hours: p.ordinaryHours,
        overtime_hours: p.overtimeHours,
        ordinary_rate: p.ordinaryRate,
        overtime_rate: p.overtimeRate,
        ordinary_pay: p.ordinaryPay,
        overtime_pay: p.overtimePay,
        overtime_after_hours: p.overtimeAfterHours,
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
