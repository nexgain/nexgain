// Employee qualifications (licences, tickets, certificates). Stored online
// ("employee_qualifications" table) so the employee and their owner both see
// them. Either of them can add or remove one. Files go to private storage.
import { createStore } from '@/data/store';
import { supabase } from '@/lib/supabase';

export const QUALIFICATION_TYPES = [
  'White Card',
  'Blue Card',
  'Forklift Licence',
  'First Aid Certificate',
  'Working at Heights',
  'Chemical Handling',
  'RSA (Responsible Service of Alcohol)',
  'Food Safety Supervisor Certificate',
  "Driver's Licence",
  'Police Check',
  'Working with Children Check',
  'Other',
] as const;

/** A file picked on the phone, before it's uploaded. */
export type QualificationDocument = {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
  kind: 'image' | 'pdf';
};

export type Qualification = {
  id: string;
  employeeId: string;
  name: string;
  issueDate: Date | null;
  expiryDate: Date | null;
  document: {
    name: string;
    kind: 'image' | 'pdf';
    storagePath: string;
    /** Short-lived link for showing / opening the file. */
    uri: string | null;
  } | null;
};

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

type QualificationRow = {
  id: string;
  employee_id: string;
  name: string;
  issue_date: string | null;
  expiry_date: string | null;
  file_name: string | null;
  storage_path: string | null;
  mime_type: string | null;
};

const pad = (n: number) => String(n).padStart(2, '0');
const toDateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromDateKey = (key: string | null) => {
  if (!key) return null;
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export function documentKind(name: string, mimeType: string | null): 'image' | 'pdf' {
  return mimeType === 'application/pdf' || name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'image';
}

/** Qualifications per employee id. */
export const qualificationsStore = createStore<Record<string, Qualification[]>>({});

export function useQualifications(employeeId: string | null | undefined): Qualification[] | null {
  const all = qualificationsStore.use();
  return employeeId ? (all[employeeId] ?? null) : null;
}

export async function loadQualifications(employeeId: string) {
  const { data, error } = await supabase
    .from('employee_qualifications')
    .select('id, employee_id, name, issue_date, expiry_date, file_name, storage_path, mime_type')
    .eq('employee_id', employeeId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const rows = data as QualificationRow[];
  const paths = rows.map((r) => r.storage_path).filter((p): p is string => !!p);
  const links: Record<string, string> = {};
  if (paths.length > 0) {
    const signed = await supabase.storage.from('employee-documents').createSignedUrls(paths, 60 * 60);
    for (const d of signed.data ?? []) if (d.path && d.signedUrl) links[d.path] = d.signedUrl;
  }
  const list: Qualification[] = rows.map((r) => ({
    id: r.id,
    employeeId: r.employee_id,
    name: r.name,
    issueDate: fromDateKey(r.issue_date),
    expiryDate: fromDateKey(r.expiry_date),
    document: r.storage_path
      ? {
          name: r.file_name ?? 'Document',
          kind: documentKind(r.file_name ?? '', r.mime_type),
          storagePath: r.storage_path,
          uri: links[r.storage_path] ?? null,
        }
      : null,
  }));
  qualificationsStore.set((all) => ({ ...all, [employeeId]: list }));
  return list;
}

/**
 * Saves a qualification (and uploads its file, if any) for an employee. Used by
 * the employee, their owner, and employee sign-up. Throws if it couldn't be saved.
 */
export async function addQualification(
  employee: { id: string; businessId: string },
  qualification: { name: string; issueDate: Date | null; expiryDate: Date | null; document: Omit<QualificationDocument, 'kind'> | null },
) {
  let storagePath: string | null = null;
  const doc = qualification.document;
  if (doc) {
    const body = await (await fetch(doc.uri)).arrayBuffer();
    const safeName = doc.name.replace(/[^A-Za-z0-9._-]+/g, '_');
    storagePath = `${employee.businessId}/${employee.id}/qualifications/${Date.now()}-${safeName}`;
    const upload = await supabase.storage
      .from('employee-documents')
      .upload(storagePath, body, { contentType: doc.mimeType || undefined });
    if (upload.error) throw upload.error;
  }
  const { error } = await supabase.from('employee_qualifications').insert({
    employee_id: employee.id,
    business_id: employee.businessId,
    name: qualification.name.trim(),
    issue_date: qualification.issueDate ? toDateKey(qualification.issueDate) : null,
    expiry_date: qualification.expiryDate ? toDateKey(qualification.expiryDate) : null,
    file_name: doc?.name ?? null,
    storage_path: storagePath,
    mime_type: doc?.mimeType || null,
  });
  if (error) {
    if (storagePath) supabase.storage.from('employee-documents').remove([storagePath]).catch(() => {});
    throw error;
  }
  await loadQualifications(employee.id).catch(() => {});
}

export async function deleteQualification(qualification: Qualification) {
  const { error } = await supabase.from('employee_qualifications').delete().eq('id', qualification.id);
  if (error) throw error;
  if (qualification.document) {
    supabase.storage.from('employee-documents').remove([qualification.document.storagePath]).catch(() => {});
  }
  qualificationsStore.set((all) => ({
    ...all,
    [qualification.employeeId]: (all[qualification.employeeId] ?? []).filter((q) => q.id !== qualification.id),
  }));
}

export type QualificationStatus = {
  tone: 'valid' | 'expiring' | 'expired';
  label: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRING_SOON_DAYS = 90;

/** "Valid", "Expires in X months/days" (within 90 days), or "Expired". */
export function getQualificationStatus(
  expiryDate: Date | null,
  today = new Date(),
): QualificationStatus {
  if (!expiryDate) return { tone: 'valid', label: 'Valid' };

  const startOfToday = new Date(today);
  startOfToday.setHours(0, 0, 0, 0);
  const days = Math.round((expiryDate.getTime() - startOfToday.getTime()) / DAY_MS);

  if (days < 0) return { tone: 'expired', label: 'Expired' };
  if (days > EXPIRING_SOON_DAYS) return { tone: 'valid', label: 'Valid' };
  if (days === 0) return { tone: 'expiring', label: 'Expires today' };
  if (days < 31) return { tone: 'expiring', label: `Expires in ${days} day${days === 1 ? '' : 's'}` };

  const months = Math.round(days / 30.44);
  return { tone: 'expiring', label: `Expires in ${months} month${months === 1 ? '' : 's'}` };
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
