// Employee qualifications. Saved in memory only (cleared when the app restarts)
// until a database is connected and linked to the Owner dashboard.
import { useSyncExternalStore } from 'react';

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

export type QualificationDocument = {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
  kind: 'image' | 'pdf';
};

export type Qualification = {
  id: string;
  name: string;
  issueDate: Date | null;
  expiryDate: Date | null;
  document: QualificationDocument | null;
};

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

let qualifications: Qualification[] = [];
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function addQualification(qualification: Omit<Qualification, 'id'>) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  qualifications = [{ ...qualification, id }, ...qualifications];
  listeners.forEach((listener) => listener());
}

export function useQualifications() {
  return useSyncExternalStore(
    subscribe,
    () => qualifications,
    () => qualifications,
  );
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
