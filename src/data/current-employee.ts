// The signed-in employee. Empty until login and a database are connected.
export type Employee = {
  firstName: string;
  lastName: string;
  employeeId: string;
  site: string;
};

export const currentEmployee: Employee | null = null;

export function employeeInitials(employee: Employee | null) {
  return employee ? `${employee.firstName[0]}${employee.lastName[0]}` : undefined;
}
