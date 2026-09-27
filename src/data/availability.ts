// Each employee's weekly availability, set on the Employee "Availability"
// screen and read by the Owner Roster when choosing who to roster.
import { createStore } from '@/data/store';
import { toMinutes } from '@/data/time';

export type DayAvailability = {
  available: boolean;
  start: string; // 24h "HH:MM"
  end: string;
};

/** Index 0 = Monday ... 6 = Sunday. */
export type WeeklyAvailability = DayAvailability[];

export const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export function defaultAvailability(): WeeklyAvailability {
  return WEEKDAY_NAMES.map(() => ({ available: false, start: '08:00', end: '17:00' }));
}

// Keyed by employee id. Records saved while nobody is signed in use NO_EMPLOYEE.
const NO_EMPLOYEE = '__none__';
export const availabilityStore = createStore<Record<string, WeeklyAvailability>>({});

export function useAvailability() {
  return availabilityStore.use();
}

export function saveAvailability(employeeId: string | null, week: WeeklyAvailability) {
  availabilityStore.set((all) => ({ ...all, [employeeId ?? NO_EMPLOYEE]: week }));
}

export function availabilityFor(
  all: Record<string, WeeklyAvailability>,
  employeeId: string | null,
): WeeklyAvailability | null {
  return all[employeeId ?? NO_EMPLOYEE] ?? null;
}

export type AvailabilityStatus = 'available' | 'unavailable' | 'not-set';

/**
 * Whether an employee can work on `date`. When shift times are given, their
 * available hours must cover the whole shift.
 */
export function availabilityOn(
  week: WeeklyAvailability | null,
  date: Date,
  shift?: { start: string; end: string },
): AvailabilityStatus {
  if (!week) return 'not-set';
  const day = week[(date.getDay() + 6) % 7];
  if (!day.available) return 'unavailable';
  if (shift && (toMinutes(shift.start) < toMinutes(day.start) || toMinutes(shift.end) > toMinutes(day.end))) {
    return 'unavailable';
  }
  return 'available';
}
