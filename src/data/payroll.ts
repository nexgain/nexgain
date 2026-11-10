// Payroll calculations. Everything is derived from the shared employees store
// (pay rate, overtime rate, bank details), clock records (hours) and the
// business's overtime rule - nothing is stored twice. Approved weeks use what
// was saved on their payslips, so later changes never alter them.
import {
  businessStore,
  overtimeRulesOf,
  superIncludesOf,
  superRateOf,
  type OvertimeRules,
  type SuperIncludes,
} from '@/data/business';
import { clockStore, type ClockSession } from '@/data/clock-records';
import { formatShortDate } from '@/data/employee-roster';
import { employeesStore, getsSuper, isContractor, overtimeRateOf, type Employee, type PayType } from '@/data/employees';
import { payRunsStore } from '@/data/pay-runs';
import { paySchedule, schedulePeriods } from '@/data/pay-schedule';
import { createStore } from '@/data/store';
import { loadSuperPayments } from '@/data/super-payments';
import { newId, warnSaveFailed } from '@/lib/ids';
import { taxOnPay, taxSetupFor } from '@/data/tax';
import { supabase } from '@/lib/supabase';


/**
 * Qualifying earnings (what super is worked out on): the pay items set to
 * "includes super" in Payroll Settings. By default ordinary pay, commissions
 * and allowances, but not overtime. Commissions and allowances aren't entered
 * anywhere yet, so they're $0 for now.
 */
export function qualifyingEarningsOf(
  pay: { ordinaryPay: number; overtimePay: number; commissions?: number; allowances?: number },
  includes: SuperIncludes,
) {
  return roundCents(
    (includes.ordinary ? pay.ordinaryPay : 0) +
      (includes.overtime ? pay.overtimePay : 0) +
      (includes.commission ? (pay.commissions ?? 0) : 0) +
      (includes.allowance ? (pay.allowances ?? 0) : 0),
  );
}

export type Period = {
  id: string;
  label: string;
  start: Date;
  /** Exclusive. */
  end: Date;
};

/** Pending: not approved yet. Approved: in a pay run, waiting for the bank. Paid: the owner marked the pay run as paid. */
export type PayStatus = 'Pending' | 'Approved' | 'Paid';

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
  /** What super is worked out on (see qualifyingEarningsOf). null for contractors, or when it isn't known (approved weeks: see the super record). */
  qualifyingEarnings: number | null;
  /** Paid by the employer on top of gross: qualifying earnings x the super rate. null for contractors. */
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

/**
 * The business's pay periods (weekly or fortnightly, from its chosen start
 * day; see pay-schedule.ts), most recent first. Payroll uses these; weekly
 * views elsewhere (Analytics, the employee's week) use getPayPeriods().
 */
export function getSchedulePayPeriods(now = new Date(), count = 4): Period[] {
  const schedule = paySchedule();
  const unit = schedule.frequency === 'weekly' ? 'week' : 'fortnight';
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const past = payRunsStore.get();
  let full = 0;
  return schedulePeriods(schedule, now, count, past).map((p) => {
    const last = new Date(p.end.getFullYear(), p.end.getMonth(), p.end.getDate() - 1);
    const span = `${formatShortDate(p.start, false)} – ${formatShortDate(last, false)}`;
    let label: string;
    if (p.catchUp) label = `Catch-up pay (${span})`;
    else if (p.start > today) label = `Next ${unit}`;
    else label = full === 0 ? `This ${unit}` : full === 1 ? `Last ${unit}` : span;
    if (!p.catchUp && p.start <= today) full++;
    return { id: toDateId(p.start), label, start: p.start, end: p.end };
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

/** The shifts that belong to a pay period: the ones that STARTED in it (a shift is never split between two pay periods). */
export function shiftsInPeriod(sessions: ClockSession[], employeeId: string | null, period: Pick<Period, 'start' | 'end'>) {
  return sessions.filter(
    (s) => s.employeeId === employeeId && s.start.getTime() >= period.start.getTime() && s.start.getTime() < period.end.getTime(),
  );
}

/**
 * Splits an employee's clocked hours into normal and overtime hours, day by day
 * (the business's local days, i.e. the owner's phone's time): hours up to the
 * daily limit are normal, the rest overtime. A shift counts in the pay period
 * it started in; a shift that crosses midnight is split between the two days
 * for overtime. Time between clocking out and back in (e.g. an unpaid break)
 * isn't counted. A shift still going counts up to `now`.
 */
export function splitHours(
  sessions: ClockSession[],
  employeeId: string | null,
  period: Pick<Period, 'start' | 'end'>,
  rules: OvertimeRules,
  now = new Date(),
): HoursSplit {
  const msPerDay = new Map<number, number>();
  for (const s of shiftsInPeriod(sessions, employeeId, period)) {
    let from = s.start.getTime();
    const to = Math.max(from, (s.end ?? now).getTime());
    while (from < to) {
      const d = new Date(from);
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
      const chunk = Math.min(to, dayEnd) - from;
      msPerDay.set(dayStart, (msPerDay.get(dayStart) ?? 0) + chunk);
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
 * Tax is estimated from the tax brackets for the business's country, on this
 * pay (none for contractors). Super is the business's super rate on
 * qualifying earnings (not overtime by default); contractors get none.
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
      ordinaryPay: null, overtimePay: null, gross: null, tax: null, net: null, qualifyingEarnings: null, super: null, status,
    };
  }
  const overtimeRate = salaried ? null : overtimeRateOf(employee);
  const ordinaryPay = roundCents(salaried ? (rate / 52) * weeks : ordinaryHours * rate);
  const overtimePay = roundCents(overtimeHours * (overtimeRate ?? 0));
  const gross = roundCents(ordinaryPay + overtimePay);
  const business = businessStore.get();
  // Worked out from this pay (see data/tax.ts). null when the business's country
  // has no tax brackets and no rate has been entered yet.
  const tax = taxOnPay(
    gross,
    taxSetupFor(business),
    { contractor: isContractor(employee), claimsTaxFreeThreshold: employee.taxFreeThreshold },
    weeks,
  );
  // No super outside Australia (getsSuper checks the business's country).
  const qualifyingEarnings = getsSuper(employee, business)
    ? qualifyingEarningsOf({ ordinaryPay, overtimePay }, superIncludesOf(business))
    : null;
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
    net: tax === null ? null : roundCents(gross - tax),
    qualifyingEarnings,
    super: qualifyingEarnings === null ? null : roundCents(qualifyingEarnings * superRateOf(business)),
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
    qualifyingEarnings: null,
    super: p.super,
    status: p.status === 'paid' ? 'Paid' : 'Approved',
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
    .filter((l) => l.employee.status !== 'inactive' || l.hours > 0 || l.status !== 'Pending')
    // Contractors are paid through their invoices, not payroll (no double payments).
    .filter((l) => !isContractor(l.employee) || l.status !== 'Pending');
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
// payments (as part of a numbered pay run, see pay-runs.ts). Stored online
// ("payslips" table). They're "approved" until the owner marks the pay run as
// paid. The owner sees every payslip in their business; an employee sees only their own.
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
  /** When the pay run was marked as paid; null while it's only approved. */
  paidAt: string | null;
  status: 'approved' | 'paid';
  payRunId: string | null;
  /** e.g. 1 = "Payroll 001" (shared by everyone in the same pay run). */
  payrollNumber: number | null;
  /** "YYYY-MM-DD" */
  payDate: string | null;
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
  paid_at: string | null;
  status?: 'approved' | 'paid' | null;
  pay_run_id?: string | null;
  payroll_number?: number | null;
  pay_date?: string | null;
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
      status: row.status ?? 'paid',
      payRunId: row.pay_run_id ?? null,
      payrollNumber: row.payroll_number ?? null,
      payDate: row.pay_date ?? null,
    })),
  );
}

export function usePayStatuses(periodId: string): Record<string, PayStatus> {
  const payslips = payslipsStore.use();
  return Object.fromEntries(
    payslips
      .filter((p) => p.periodStart === periodId)
      .map((p) => [p.employeeId, p.status === 'paid' ? ('Paid' as const) : ('Approved' as const)]),
  );
}

/**
 * Approves payments for a period: the database makes one pay run with the
 * business's next payroll number, plus a payslip for each employee (status
 * approved), and an Unpaid super record for each person. Nobody is told they've been paid until the owner marks the pay
 * run as paid. Returns the new pay run's id, or throws with a plain message.
 */
export async function approvePayments(payPeriod: Pick<Period, 'start' | 'end'>, employeeIds: string[], payDate: string) {
  const businessId = businessStore.get()?.id;
  const periodId = toDateId(payPeriod.start);
  const period = { start: payPeriod.start, end: payPeriod.end };
  const lastDay = toDateId(new Date(payPeriod.end.getFullYear(), payPeriod.end.getMonth(), payPeriod.end.getDate() - 1));
  const weeks = (period.end.getTime() - period.start.getTime()) / WEEK_MS;
  const alreadyPaid = new Set(payslipsStore.get().filter((p) => p.periodStart === periodId).map((p) => p.employeeId));
  const sessions = clockStore.get();
  const rules = overtimeRulesOf(businessStore.get());
  const hrs = (h: number) => Math.round(h * 100) / 100;
  const superRate = superRateOf(businessStore.get());

  const lines = employeesStore
    .get()
    // Contractors are never paid through payroll (they invoice instead).
    .filter((e) => employeeIds.includes(e.id) && !alreadyPaid.has(e.id) && !isContractor(e))
    // Each employee's current rates and the current overtime rule; the payslip
    // keeps them, so later changes don't affect it.
    .map((e) => calculatePayLine(e, splitHours(sessions, e.id, period, rules), 'Pending', weeks))
    // No pay rate, or tax can't be worked out yet (no brackets or rate for the country).
    .filter((l) => l.rate !== null && l.gross !== null && l.tax !== null);
  // What each person's super was worked out on, for their super record.
  const qualifying = new Map(lines.map((l) => [l.employee.id, l.qualifyingEarnings ?? 0]));

  const created: PayslipRecord[] = lines.map((l) => ({
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
    super: l.super ?? 0,
    paidAt: null,
    status: 'approved' as const,
    payRunId: null,
    payrollNumber: null,
    payDate,
  }));
  if (created.length === 0 || !businessId) throw new Error('There is no one to pay.');

  const { data, error } = await supabase.rpc('approve_pay_run', {
    p_period_start: periodId,
    p_period_end: lastDay,
    p_pay_date: payDate,
    p_payslips: created.map((p) => ({
      id: p.id,
      employee_id: p.employeeId,
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
      // The database makes an Unpaid super record from these (see super_payments).
      qualifying_earnings: qualifying.get(p.employeeId) ?? 0,
      super_rate: superRate,
    })),
  });
  if (error) {
    warnSaveFailed('payslips', error);
    throw new Error(error.message);
  }
  const run = data as { id: string; payroll_number: number; pay_date: string };
  payslipsStore.set((all) => [
    ...created.map((p) => ({ ...p, payRunId: run.id, payrollNumber: run.payroll_number, payDate: run.pay_date })),
    ...all,
  ]);
  loadSuperPayments().catch(() => {});
  return run.id;
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
