// One pay period's hours and pay for everyone, for the Employee Status screens.
// Uses the same calculation as the Payroll page (calculatePayLines), so the
// numbers always agree, and only counts shifts that started in the period.
// Updates by itself when anyone clocks in or out (the clock records are live),
// and once a minute while someone is on shift so their hours count up.
import { useEffect, useState } from 'react';

import { useClockSessions } from '@/data/clock-records';
import { useEmployees } from '@/data/employees';
import { usePayRuns } from '@/data/pay-runs';
import { calculatePayLines, getSchedulePayPeriods, payTotals, usePayslipRecords, usePayStatuses } from '@/data/payroll';

/** How many pay periods the period picker offers (this one and earlier ones). */
const PERIODS_SHOWN = 12;

export function usePeriodPay(periodId?: string) {
  const [now, setNow] = useState(() => new Date());
  const sessions = useClockSessions();
  const employees = useEmployees();
  const payslips = usePayslipRecords();
  // Re-worked out when the pay schedule or pay runs change.
  usePayRuns();

  const onShift = sessions.some((s) => s.end === null);
  useEffect(() => {
    if (!onShift) return;
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, [onShift]);

  const periods = getSchedulePayPeriods(now, PERIODS_SHOWN);
  const period = periods.find((p) => p.id === periodId) ?? periods[0];
  const statuses = usePayStatuses(period.id);
  const lines = calculatePayLines(employees, sessions, period, statuses, now, payslips);
  return { now, periods, period, lines, totals: payTotals(lines), sessions };
}

/** "Thu 6 – Wed 12 Nov" for a period (the end is exclusive). */
export function periodDates(period: { start: Date; end: Date }) {
  const last = new Date(period.end.getFullYear(), period.end.getMonth(), period.end.getDate() - 1);
  const day = (d: Date) => d.toLocaleDateString([], { weekday: 'short' });
  const month = (d: Date) => d.toLocaleDateString([], { month: 'short' });
  const sameMonth = period.start.getMonth() === last.getMonth();
  return `${day(period.start)} ${period.start.getDate()}${sameMonth ? '' : ` ${month(period.start)}`} – ${day(last)} ${last.getDate()} ${month(last)}`;
}

