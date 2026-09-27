// Rostered shifts. Created on the Owner Roster screen and read by each
// employee's own Roster tab, Home screen and Shift details.
import { availabilityFor, availabilityOn, type WeeklyAvailability } from '@/data/availability';
import { createStore } from '@/data/store';

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

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function saveShift(shift: Omit<RosterShift, 'id'> & { id?: string }) {
  shiftsStore.set((all) =>
    shift.id
      ? all.map((s) => (s.id === shift.id ? { ...s, ...shift, id: s.id } : s))
      : [...all, { ...shift, id: newId() }],
  );
}

export function deleteShift(id: string) {
  shiftsStore.set((all) => all.filter((s) => s.id !== id));
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
  let filled = 0;
  const inRange = new Set(shiftsInRange(shiftsStore.get(), start, end).map((s) => s.id));
  shiftsStore.set((all) =>
    all.map((s) => {
      if (!inRange.has(s.id) || s.employeeIds.length > 0) return s;
      const available = employeeIds.filter(
        (id) => availabilityOn(availabilityFor(availability, id), fromDateKey(s.date), s) === 'available',
      );
      if (available.length === 0) return s;
      filled += 1;
      return { ...s, employeeIds: available };
    }),
  );
  return filled;
}
