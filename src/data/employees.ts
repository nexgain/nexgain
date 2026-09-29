// Single source of truth for employee profiles, used by both the Employee
// section (their own profile) and the Owner section (payroll, roster, reports).
// Loaded from the online database ("employees" table): an owner gets their
// whole team, an employee gets only their own profile.
import { setLoadedAvailability, type WeeklyAvailability } from '@/data/availability';
import { currentEmployeeStore } from '@/data/current-employee';
import { createStore } from '@/data/store';
import { supabase } from '@/lib/supabase';

/**
 * Bank details as shown in the app: only the last 4 digits of the account are
 * ever loaded. The full details stay encrypted in the database (payroll only).
 */
export type BankAccount = {
  accountName: string;
  bsb: string;
  /** Last 4 digits only. */
  accountNumber: string;
};

export type Employee = {
  id: string;
  userId: string;
  businessId: string;
  firstName: string;
  lastName: string;
  /** Short reference shown to people, e.g. "NG-3F9A2C". */
  employeeId: string;
  /** Position / job role shown on the roster, e.g. "Cleaner". */
  role: string;
  employmentType: string;
  /** Business name (where they work). */
  site: string;
  email: string;
  phone: string;
  dateOfBirth: string | null;
  address: string;
  superFund: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  /** Hourly rate in dollars, set by the owner. null until set. */
  payRate: number | null;
  bankAccount: BankAccount | null;
  hasTfn: boolean;
};

type EmployeeRow = {
  id: string;
  user_id: string;
  business_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  date_of_birth: string | null;
  address: string | null;
  position: string | null;
  employment_type: string | null;
  pay_rate: number | string | null;
  super_fund: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  availability: WeeklyAvailability | null;
  employee_private?: { account_last4: string | null; has_tfn: boolean } | null;
};

const SELECT = '*, employee_private(account_last4, has_tfn)';

export function fromRow(row: EmployeeRow, businessName = ''): Employee {
  const parts = row.full_name.trim().split(/\s+/);
  const last4 = row.employee_private?.account_last4 ?? null;
  return {
    id: row.id,
    userId: row.user_id,
    businessId: row.business_id,
    firstName: parts[0] ?? '',
    lastName: parts.slice(1).join(' '),
    employeeId: `NG-${row.id.replace(/-/g, '').slice(0, 6).toUpperCase()}`,
    role: row.position ?? '',
    employmentType: row.employment_type ?? '',
    site: businessName,
    email: row.email,
    phone: row.phone ?? '',
    dateOfBirth: row.date_of_birth,
    address: row.address ?? '',
    superFund: row.super_fund ?? '',
    emergencyContactName: row.emergency_contact_name ?? '',
    emergencyContactPhone: row.emergency_contact_phone ?? '',
    payRate: row.pay_rate === null ? null : Number(row.pay_rate),
    bankAccount: last4 ? { accountName: 'On file', bsb: '', accountNumber: last4 } : null,
    hasTfn: row.employee_private?.has_tfn ?? false,
  };
}

/** The owner's team. Empty for employees and signed-out users. */
export const employeesStore = createStore<Employee[]>([]);

export function useEmployees() {
  return employeesStore.use();
}

/** Loads every employee in the owner's business. */
export async function loadTeam(businessId: string, businessName: string) {
  const { data, error } = await supabase
    .from('employees')
    .select(SELECT)
    .eq('business_id', businessId)
    .order('created_at');
  if (error) throw error;
  const rows = data as EmployeeRow[];
  employeesStore.set(rows.map((row) => fromRow(row, businessName)));
  setLoadedAvailability(Object.fromEntries(rows.map((row) => [row.id, row.availability])));
}

/** Loads the signed-in employee's own profile. */
export async function loadOwnProfile(userId: string, businessName: string) {
  const { data, error } = await supabase.from('employees').select(SELECT).eq('user_id', userId).maybeSingle<EmployeeRow>();
  if (error) throw error;
  if (data) setLoadedAvailability({ [data.id]: data.availability });
  return data ? fromRow(data, businessName) : null;
}

/** Owner or employee edits: shows straight away, then saves to the database. */
export async function updateEmployee(id: string, changes: Partial<Pick<Employee, 'payRate' | 'role' | 'phone' | 'employmentType'>>) {
  employeesStore.set((list) => list.map((e) => (e.id === id ? { ...e, ...changes } : e)));
  currentEmployeeStore.set((me) => (me?.id === id ? { ...me, ...changes } : me));
  const cols: Record<string, unknown> = {};
  if (changes.payRate !== undefined) cols.pay_rate = changes.payRate;
  if (changes.role !== undefined) cols.position = changes.role;
  if (changes.phone !== undefined) cols.phone = changes.phone;
  if (changes.employmentType !== undefined) cols.employment_type = changes.employmentType;
  const { error } = await supabase.from('employees').update(cols).eq('id', id);
  if (error) console.warn('Could not save employee changes:', error.message);
  return !error;
}

export type EmployeeDocument = { id: string; kind: string; fileName: string; storagePath: string; createdAt: string };

/** Documents uploaded at sign-up (White Card, licence, etc.). Owner or the employee only. */
export async function loadEmployeeDocuments(employeeId: string): Promise<EmployeeDocument[]> {
  const { data, error } = await supabase
    .from('employee_documents')
    .select('id, kind, file_name, storage_path, created_at')
    .eq('employee_id', employeeId)
    .order('created_at');
  if (error) throw error;
  return data.map((d) => ({ id: d.id, kind: d.kind, fileName: d.file_name, storagePath: d.storage_path, createdAt: d.created_at }));
}

/** A short-lived private link to open a document (expires after 10 minutes). */
export async function documentLink(storagePath: string) {
  const { data, error } = await supabase.storage.from('employee-documents').createSignedUrl(storagePath, 600);
  if (error) throw error;
  return data.signedUrl;
}

/**
 * Full bank details and TFN, decrypted by the database for payroll. Only the
 * employee and their business owner are allowed. Never stored or logged.
 */
export async function revealPrivateDetails(employeeId: string) {
  const { data, error } = await supabase.rpc('get_employee_private', { p_employee_id: employeeId });
  if (error) throw error;
  const row = (data as { account_name: string | null; bsb: string | null; account_number: string | null; tfn: string | null }[])[0];
  return row ?? null;
}

export function employeeFullName(employee: Employee) {
  return `${employee.firstName} ${employee.lastName}`.trim();
}
