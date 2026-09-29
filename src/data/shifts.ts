// Rostered shifts. Created on the Owner Roster screen and read by each
// employee's own Roster tab, Home screen and Shift details. Stored online
// ("shifts" table); changes show straight away and save in the background.
// The database tells employees when they're added to, moved or removed from a shift.
import { availabilityFor, availabilityOn, type WeeklyAvailability } from '@/data/availability';
import { businessStore } from '@/data/business';
import { createStore } from '@/data/store';
import { newId, warnSaveFailed } from '@/lib/ids';
import { supabase } from '@/lib/supabase';

export const JOB_TYPES = [
  'House Wash',
  'Office Clean',
  'Roof Clean',
  'Window Clean',
  'Pressure Wash',
  'Gutter Clean',
  'General Maintenance',
  'Other',
] as const;

export type RosterShift = {
  id: string;
  date: string; // "YYYY-MM-DD"
  start: string; // 24h "HH:MM"
  end: string;
  employeeIds: string[];
  jobType: string;
  location: string;
  tasks: string[];
  notes: string;
};

export const shiftsStore = createStore<RosterShift[]>([]);

export function useShifts() {
  return shiftsStore.use();
}

type ShiftRow = {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  employee_ids: string[];
  job_type: string;
  location: string;
  tasks: string[];
  notes: string;
};

function fromRow(row: ShiftRow): RosterShift {
  return {
    id: row.id,
    date: row.date,
    start: row.start_time,
    end: row.end_time,
    employeeIds: row.employee_ids,
    jobType: row.job_type,
    location: row.location,
    tasks: row.tasks,
    notes: row.notes,
  };
}

function toRow(shift: RosterShift) {
  return {
    id: shift.id,
    business_id: businessStore.get()?.id,
    date: shift.date,
    start_time: shift.start,
    end_time: shift.end,
    employee_ids: shift.employeeIds,
    job_type: shift.jobType,
    location: shift.location,
    tasks: shift.tasks,
    notes: shift.notes,
  };
}

/** Loads the shifts this person can see: all of them for the owner, only their own for an employee. */
export async function loadShifts() {
  const { data, error } = await supabase.from('shifts').select('*').order('date');
  if (error) throw error;
  shiftsStore.set((data as ShiftRow[]).map(fromRow));
}

function saveOnline(shifts: RosterShift[]) {
  if (shifts.length === 0) return;
  supabase
    .from('shifts')
    .upsert(shifts.map(toRow))
    .then(({ error }) => warnSaveFailed('shift', error));
}

export function saveShift(shift: Omit<RosterShift, 'id'> & { id?: string }) {
  const saved: RosterShift = { ...shift, id: shift.id ?? newId() };
  shiftsStore.set((all) =>
    shift.id ? all.map((s) => (s.id === shift.id ? saved : s)) : [...all, saved],
  );
  saveOnline([saved]);
}

export function deleteShift(id: string) {
  shiftsStore.set((all) => all.filter((s) => s.id !== id));
  supabase
    .from('shifts')
    .delete()
    .eq('id', id)
    .then(({ error }) => warnSaveFailed('shift', error));
}

export function toDateKey(date: Date) {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

export function fromDateKey(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function shiftHours(shift: Pick<RosterShift, 'start' | 'end'>) {
  const [sh, sm] = shift.start.split(':').map(Number);
  const [eh, em] = shift.end.split(':').map(Number);
  return Math.max(0, eh * 60 + em - (sh * 60 + sm)) / 60;
}

export function sortShifts(shifts: RosterShift[]) {
  return [...shifts].sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}

/** Shifts with a date in [start, end). */
export function shiftsInRange(shifts: RosterShift[], start: Date, end: Date) {
  const from = toDateKey(start);
  const to = toDateKey(end);
  return sortShifts(shifts.filter((s) => s.date >= from && s.date < to));
}

/**
 * Copies last week's shifts into the week starting `weekStart`, skipping any
 * that already exist (same date, times and job). Returns how many were added.
 */
export function copyPreviousWeek(weekStart: Date) {
  const prevStart = new Date(weekStart);
  prevStart.setDate(prevStart.getDate() - 7);
  const all = shiftsStore.get();
  const copies = shiftsInRange(all, prevStart, weekStart)
    .map((s) => {
      const date = fromDateKey(s.date);
      date.setDate(date.getDate() + 7);
      return { ...s, id: newId(), date: toDateKey(date) };
    })
    .filter(
      (c) =>
        !all.some(
          (s) => s.date === c.date && s.start === c.start && s.end === c.end && s.jobType === c.jobType,
        ),
    );
  shiftsStore.set([...all, ...copies]);
  saveOnline(copies);
  return copies.length;
}

/**
 * Basic auto fill: assigns every employee who is available for each unassigned
 * shift in [start, end). Returns how many shifts were filled.
 */
export function autoFillFromAvailability(
  start: Date,
  end: Date,
  employeeIds: string[],
  availability: Record<string, WeeklyAvailability>,
) {
  const filled: RosterShift[] = [];
  const inRange = new Set(shiftsInRange(shiftsStore.get(), start, end).map((s) => s.id));
  shiftsStore.set((all) =>
    all.map((s) => {
      if (!inRange.has(s.id) || s.employeeIds.length > 0) return s;
      const available = employeeIds.filter(
        (id) => availabilityOn(availabilityFor(availability, id), fromDateKey(s.date), s) === 'available',
      );
      if (available.length === 0) return s;
      const updated = { ...s, employeeIds: available };
      filled.push(updated);
      return updated;
    }),
  );
  saveOnline(filled);
  return filled.length;
}
