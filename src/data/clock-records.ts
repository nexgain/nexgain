// Clock in / clock out records for all employees. Written by the Employee
// Home screen and read by Owner Payroll, so both always see the same data.
import { createStore } from '@/data/store';

export type ClockSession = {
  id: string;
  /** null while nobody is signed in (no login yet). */
  employeeId: string | null;
  start: Date;
  end: Date | null;
};

export const clockStore = createStore<ClockSession[]>([]);

export function useClockSessions() {
  return clockStore.use();
}

export function clockIn(employeeId: string | null, time = new Date()) {
  const id = `${time.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
  clockStore.set((prev) => [...prev, { id, employeeId, start: time, end: null }]);
}

/** Ends the employee's open session, if they have one. */
export function clockOut(employeeId: string | null, time = new Date()) {
  clockStore.set((prev) => {
    const openIndex = prev.findLastIndex((s) => s.employeeId === employeeId && s.end === null);
    if (openIndex === -1) return prev;
    return prev.map((s, i) => (i === openIndex ? { ...s, end: time } : s));
  });
}
