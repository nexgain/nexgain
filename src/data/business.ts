// The owner's business profile, filled in during owner sign-up and read by the
// Dashboard, Quotes & Invoices and (later) employee sign-up. Saved on the device.
import { loadJSON, saveJSON } from '@/data/device-storage';
import { GST_RATE } from '@/data/invoices';
import { createStore } from '@/data/store';

export type BusinessProfile = {
  ownerName: string;
  email: string;
  businessName: string;
  /** Logo as a data URI so it survives restarts and can be printed on PDFs. */
  logo: string | null;
  abn: string;
  industry: string;
  industryCategory: string | null;
  businessType: string;
  teamSize: string;
  vehicles: string;
  yearsOperating: string;
  services: string[];
  plan: 'basic';
  /** Month the financial year starts (1 = January ... 7 = July). */
  financialYearStartMonth: number;
  gstRegistered: boolean;
  currency: string;
  trackGstInReports: boolean;
  bankConnected: boolean;
  accountingSoftware: string | null;
  /** Code employees will use to join this business. */
  inviteCode: string;
  createdAt: string;
};

const STORAGE_KEY = 'nexgain.business';

export const businessStore = createStore<BusinessProfile | null>(loadJSON<BusinessProfile>(STORAGE_KEY));

export function useBusiness() {
  return businessStore.use();
}

export function saveBusiness(profile: BusinessProfile) {
  businessStore.set(profile);
  saveJSON(STORAGE_KEY, profile);
}

export function updateBusiness(changes: Partial<BusinessProfile>) {
  const current = businessStore.get();
  if (!current) return;
  saveBusiness({ ...current, ...changes });
}

export function ownerFirstName(profile: BusinessProfile | null) {
  return profile?.ownerName.trim().split(/\s+/)[0] ?? null;
}

/** GST rate for new quotes and invoices: none if the business isn't GST registered. */
export function currentGstRate() {
  return businessStore.get()?.gstRegistered === false ? 0 : GST_RATE;
}

/** e.g. "Theo Buxton" in 2026 -> "BUXTON2026". Falls back to the business name. */
export function makeInviteCode(ownerName: string, businessName: string, year = new Date().getFullYear()) {
  const words = ownerName.trim().split(/\s+/).filter(Boolean);
  const base = (words.length > 1 ? words[words.length - 1] : businessName || words[0] || 'TEAM')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 10);
  return `${base || 'TEAM'}${year}`;
}

export function inviteLink(code: string) {
  // Opens the app via its "nexgain" scheme; employee sign-up will read the code later.
  return `nexgain://join/${code}`;
}
