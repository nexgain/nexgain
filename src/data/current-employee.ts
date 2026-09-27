// The signed-in employee. Empty until login and a database are connected;
// it will then be the matching record from the shared employees store.
import type { Employee } from '@/data/employees';

export type { Employee };

export const currentEmployee: Employee | null = null;

export function employeeInitials(employee: Employee | null) {
  return employee ? `${employee.firstName[0]}${employee.lastName[0]}` : undefined;
}
