// Clock in / clock out records for all employees. Written by the Employee
// Home screen and read by Owner Payroll, so both always see the same data.
// Stored online ("clock_sessions" table); shown straight away, saved in the background.
import { currentEmployeeStore } from '@/data/current-employee';
import { createStore } from '@/data/store';
import { newId, warnSaveFailed } from '@/lib/ids';
import { supabase } from '@/lib/supabase';

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

type ClockRow = { id: string; employee_id: string; started_at: string; ended_at: string | null };

/** Loads the sessions this person can see: the whole team for the owner, their own for an employee. */
export async function loadClockSessions() {
  const { data, error } = await supabase.from('clock_sessions').select('id, employee_id, started_at, ended_at').order('started_at');
  if (error) throw error;
  clockStore.set(
    (data as ClockRow[]).map((row) => ({
      id: row.id,
      employeeId: row.employee_id,
      start: new Date(row.started_at),
      end: row.ended_at ? new Date(row.ended_at) : null,
    })),
  );
}

export function clockIn(employeeId: string | null, time = new Date()) {
  const id = newId();
  clockStore.set((prev) => [...prev, { id, employeeId, start: time, end: null }]);
  const businessId = currentEmployeeStore.get()?.businessId;
  if (!employeeId || !businessId) return;
  supabase
    .from('clock_sessions')
    .insert({ id, employee_id: employeeId, business_id: businessId, started_at: time.toISOString() })
    .then(({ error }) => warnSaveFailed('clock in', error));
}

/** Ends the employee's open session, if they have one. */
export function clockOut(employeeId: string | null, time = new Date()) {
  const open = clockStore.get().findLast((s) => s.employeeId === employeeId && s.end === null);
  if (!open) return;
  clockStore.set((prev) => prev.map((s) => (s.id === open.id ? { ...s, end: time } : s)));
  if (!employeeId) return;
  supabase
    .from('clock_sessions')
    .update({ ended_at: time.toISOString() })
    .eq('id', open.id)
    .then(({ error }) => warnSaveFailed('clock out', error));
}
