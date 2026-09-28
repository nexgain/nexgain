// The signed-in employee (their own profile from the database). Empty for
// owners and when nobody is signed in.
import type { Employee } from '@/data/employees';
import { createStore } from '@/data/store';

export type { Employee };

export const currentEmployeeStore = createStore<Employee | null>(null);

export function useCurrentEmployee() {
  return currentEmployeeStore.use();
}

export function employeeInitials(employee: Employee | null) {
  return employee ? `${employee.firstName[0] ?? ''}${employee.lastName[0] ?? ''}` || undefined : undefined;
}
