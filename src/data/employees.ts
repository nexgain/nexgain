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

export type EmployeeStatus = 'active' | 'on_leave' | 'inactive';
export type PayType = 'hourly' | 'salary';

export const EMPLOYEE_STATUS_LABEL: Record<EmployeeStatus, string> = {
  active: 'Active',
  on_leave: 'On Leave',
  inactive: 'Inactive',
};

export const PAY_TYPE_LABEL: Record<PayType, string> = {
  hourly: 'per hour',
  salary: 'per year (salary)',
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
  /** Chosen at sign-up: Full-time, Part-time, Casual or Contractor. Decides the contractor features (see isContractor). */
  employmentType: string;
  /** Contractors only: their ABN (11 digits) and whether they charge GST. */
  abn: string;
  gstRegistered: boolean;
  /** Business name (where they work). */
  site: string;
  email: string;
  phone: string;
  dateOfBirth: string | null;
  address: string;
  superFund: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  /** Hourly rate, or yearly salary when payType is 'salary'. Set by the owner; null until set. */
  payRate: number | null;
  payType: PayType;
  /** Custom overtime rate per hour set by the owner; null = Auto (1.5x the pay rate). See overtimeRateOf(). */
  overtimeRate: number | null;
  status: EmployeeStatus;
  /** "YYYY-MM-DD" */
  startDate: string | null;
  /** Private storage path of their profile photo. */
  photoPath: string | null;
  /** Short-lived link for showing the photo. */
  photoUrl: string | null;
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
  abn?: string | null;
  gst_registered?: boolean | null;
  pay_rate: number | string | null;
  super_fund: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  availability: WeeklyAvailability | null;
  status: EmployeeStatus | null;
  pay_type: PayType | null;
  overtime_rate?: number | string | null;
  start_date: string | null;
  photo_path: string | null;
  employee_private?: { account_last4: string | null; has_tfn: boolean } | null;
};

const SELECT = '*, employee_private(account_last4, has_tfn)';

export function fromRow(row: EmployeeRow, businessName = '', photoUrl: string | null = null): Employee {
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
    abn: row.abn ?? '',
    gstRegistered: row.gst_registered ?? false,
    site: businessName,
    email: row.email,
    phone: row.phone ?? '',
    dateOfBirth: row.date_of_birth,
    address: row.address ?? '',
    superFund: row.super_fund ?? '',
    emergencyContactName: row.emergency_contact_name ?? '',
    emergencyContactPhone: row.emergency_contact_phone ?? '',
    payRate: row.pay_rate === null ? null : Number(row.pay_rate),
    payType: row.pay_type ?? 'hourly',
    overtimeRate: row.overtime_rate === null || row.overtime_rate === undefined ? null : Number(row.overtime_rate),
    status: row.status ?? 'active',
    startDate: row.start_date ?? null,
    photoPath: row.photo_path ?? null,
    photoUrl,
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
  const photos = await photoLinks(rows.map((row) => row.photo_path));
  employeesStore.set(rows.map((row) => fromRow(row, businessName, row.photo_path ? (photos[row.photo_path] ?? null) : null)));
  setLoadedAvailability(Object.fromEntries(rows.map((row) => [row.id, row.availability])));
}

/** Loads the signed-in employee's own profile. */
export async function loadOwnProfile(userId: string, businessName: string) {
  const { data, error } = await supabase.from('employees').select(SELECT).eq('user_id', userId).maybeSingle<EmployeeRow>();
  if (error) throw error;
  if (!data) return null;
  setLoadedAvailability({ [data.id]: data.availability });
  const photos = await photoLinks([data.photo_path]);
  return fromRow(data, businessName, data.photo_path ? (photos[data.photo_path] ?? null) : null);
}

/** Private links (valid for a day) for showing profile photos. Missing ones are left out. */
async function photoLinks(paths: (string | null)[]): Promise<Record<string, string>> {
  const wanted = paths.filter((p): p is string => !!p);
  if (wanted.length === 0) return {};
  const { data, error } = await supabase.storage.from('employee-documents').createSignedUrls(wanted, 60 * 60 * 24);
  if (error || !data) return {};
  const links: Record<string, string> = {};
  for (const d of data) if (d.path && d.signedUrl) links[d.path] = d.signedUrl;
  return links;
}

type EditableFields =
  | 'payRate'
  | 'payType'
  | 'overtimeRate'
  | 'role'
  | 'phone'
  | 'employmentType'
  | 'status'
  | 'startDate'
  | 'abn'
  | 'gstRegistered';

/** Owner or employee edits: shows straight away, then saves to the database. */
export async function updateEmployee(id: string, changes: Partial<Pick<Employee, EditableFields>>) {
  employeesStore.set((list) => list.map((e) => (e.id === id ? { ...e, ...changes } : e)));
  currentEmployeeStore.set((me) => (me?.id === id ? { ...me, ...changes } : me));
  const cols: Record<string, unknown> = {};
  if (changes.payRate !== undefined) cols.pay_rate = changes.payRate;
  if (changes.role !== undefined) cols.position = changes.role;
  if (changes.phone !== undefined) cols.phone = changes.phone;
  if (changes.employmentType !== undefined) cols.employment_type = changes.employmentType;
  if (changes.payType !== undefined) cols.pay_type = changes.payType;
  if (changes.overtimeRate !== undefined) cols.overtime_rate = changes.overtimeRate;
  if (changes.abn !== undefined) cols.abn = changes.abn.replace(/\D/g, '') || null;
  if (changes.gstRegistered !== undefined) cols.gst_registered = changes.gstRegistered;
  if (changes.status !== undefined) cols.status = changes.status;
  if (changes.startDate !== undefined) cols.start_date = changes.startDate;
  const { error } = await supabase.from('employees').update(cols).eq('id', id);
  if (error) console.warn('Could not save employee changes:', error.message);
  return !error;
}

/**
 * Uploads a new profile photo (owner, or the employee themselves) and shows it
 * straight away. Returns false if it couldn't be saved.
 */
export async function setEmployeePhoto(employee: Employee, photo: { uri: string; mimeType?: string | null }) {
  try {
    const body = await (await fetch(photo.uri)).arrayBuffer();
    const type = photo.mimeType || 'image/jpeg';
    const ext = type.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
    const path = `${employee.businessId}/${employee.id}/photo-${Date.now()}.${ext}`;
    const upload = await supabase.storage.from('employee-documents').upload(path, body, { contentType: type });
    if (upload.error) throw upload.error;
    const { error } = await supabase.from('employees').update({ photo_path: path }).eq('id', employee.id);
    if (error) throw error;
    if (employee.photoPath) supabase.storage.from('employee-documents').remove([employee.photoPath]).catch(() => {});
    const photoUrl = (await photoLinks([path]))[path] ?? photo.uri;
    const changes = { photoPath: path, photoUrl };
    employeesStore.set((list) => list.map((e) => (e.id === employee.id ? { ...e, ...changes } : e)));
    currentEmployeeStore.set((me) => (me?.id === employee.id ? { ...me, ...changes } : me));
    return true;
  } catch (error) {
    console.warn('Could not save profile photo:', (error as Error).message);
    return false;
  }
}

export type PayRateChange = {
  id: string;
  oldRate: number | null;
  newRate: number | null;
  oldPayType: PayType | null;
  newPayType: PayType | null;
  changedAt: string;
};

/** Every pay rate change for an employee, newest first (recorded by the database). */
export async function loadPayRateHistory(employeeId: string): Promise<PayRateChange[]> {
  const { data, error } = await supabase
    .from('pay_rate_history')
    .select('id, old_rate, new_rate, old_pay_type, new_pay_type, changed_at')
    .eq('employee_id', employeeId)
    .order('changed_at', { ascending: false });
  if (error) throw error;
  const num = (v: number | string | null) => (v === null ? null : Number(v));
  return data.map((r) => ({
    id: r.id,
    oldRate: num(r.old_rate),
    newRate: num(r.new_rate),
    oldPayType: r.old_pay_type,
    newPayType: r.new_pay_type,
    changedAt: r.changed_at,
  }));
}

/**
 * The signed-in worker updates their own bank account (stored encrypted by the
 * database; the app only keeps the last 4 digits). Their TFN is left as it is.
 */
export async function updateMyBankDetails(
  employeeId: string,
  bank: { accountName: string; bsb: string; accountNumber: string },
) {
  const digits = bank.accountNumber.replace(/\D/g, '');
  const { error } = await supabase.rpc('update_my_private_details', {
    p: { account_name: bank.accountName.trim(), bsb: bank.bsb.trim(), account_number: digits },
  });
  if (error) {
    console.warn('Could not save bank details:', error.message);
    return false;
  }
  const bankAccount = { accountName: 'On file', bsb: '', accountNumber: digits.slice(-4) };
  currentEmployeeStore.set((me) => (me?.id === employeeId ? { ...me, bankAccount } : me));
  return true;
}

/** The one value that decides whether someone gets the contractor features. */
export const CONTRACTOR = 'Contractor';

/** Contractors invoice the business instead of getting payslips. */
export function isContractor(employee: Pick<Employee, 'employmentType'> | null | undefined) {
  return employee?.employmentType === CONTRACTOR;
}

/** "51824753556" -> "51 824 753 556" */
export function formatAbn(abn: string) {
  const d = abn.replace(/\D/g, '');
  return d.length === 11 ? `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}` : abn;
}

/** Overtime is paid at 1.5x the normal hourly rate unless the owner sets a custom rate. */
export const AUTO_OVERTIME_MULTIPLIER = 1.5;

/** The automatic overtime rate for an hourly rate (1.5x, to the cent). */
export function autoOvertimeRate(payRate: number | null) {
  return payRate === null ? null : Math.round(payRate * AUTO_OVERTIME_MULTIPLIER * 100) / 100;
}

/** The overtime rate payroll uses: the owner's custom rate, or Auto (1.5x). Salaried staff don't get overtime. */
export function overtimeRateOf(employee: Pick<Employee, 'payRate' | 'payType' | 'overtimeRate'>) {
  if (employee.payType === 'salary') return null;
  return employee.overtimeRate ?? autoOvertimeRate(employee.payRate);
}

/** e.g. "$28.00/hr" or "$75,000/yr". */
export function formatPayRate(rate: number | null, payType: PayType | null) {
  if (rate === null) return 'Not set';
  if (payType === 'salary') {
    return `$${Math.round(rate).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}/yr`;
  }
  return `$${rate.toFixed(2)}/hr`;
}

export function employeeInitialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
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
