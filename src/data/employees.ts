// Single source of truth for employee profiles, used by both the Employee
// section (their own profile) and the Owner section (payroll, reports).
// Empty until employees are added via login / a database.
import { createStore } from '@/data/store';

/** From the employee's "Payment — Bank account details" section. */
export type BankAccount = {
  accountName: string;
  bsb: string;
  accountNumber: string;
};

export type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  employeeId: string;
  site: string;
  /** Hourly rate in dollars, from the "Employment" section. null until set. */
  payRate: number | null;
  bankAccount: BankAccount | null;
};

export const employeesStore = createStore<Employee[]>([]);

export function useEmployees() {
  return employeesStore.use();
}

export function updateEmployee(id: string, changes: Partial<Omit<Employee, 'id'>>) {
  employeesStore.set((list) => list.map((e) => (e.id === id ? { ...e, ...changes } : e)));
}

export function employeeFullName(employee: Employee) {
  return `${employee.firstName} ${employee.lastName}`;
}
