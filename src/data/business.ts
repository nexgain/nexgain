// The owner's business profile, created during owner sign-up and read by the
// Dashboard, Quotes & Invoices, Business Profile and employee sign-up.
// Stored online (Supabase "businesses" table) and loaded after logging in.
import { createStore } from '@/data/store';
import { supabase } from '@/lib/supabase';

/** Australian GST rate, charged on quotes and invoices when GST registered. */
export const GST_RATE = 0.1;

export type BusinessProfile = {
  /** Database id; null only while sign-up is still in progress. */
  id: string | null;
  ownerName: string;
  email: string;
  businessName: string;
  /** Logo as a data URI so it can be shown anywhere and printed on PDFs. */
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

type BusinessRow = {
  id: string;
  owner_name: string;
  owner_email: string;
  name: string;
  logo: string | null;
  abn: string | null;
  industry: string | null;
  industry_category: string | null;
  business_type: string | null;
  team_size: string | null;
  vehicles: string | null;
  years_operating: string | null;
  services: string[];
  financial_year_start_month: number;
  gst_registered: boolean;
  currency: string;
  track_gst_in_reports: boolean;
  invite_code: string;
  created_at: string;
};

export function fromRow(row: BusinessRow): BusinessProfile {
  return {
    id: row.id,
    ownerName: row.owner_name,
    email: row.owner_email,
    businessName: row.name,
    logo: row.logo,
    abn: row.abn ?? '',
    industry: row.industry ?? '',
    industryCategory: row.industry_category,
    businessType: row.business_type ?? '',
    teamSize: row.team_size ?? '',
    vehicles: row.vehicles ?? '',
    yearsOperating: row.years_operating ?? '',
    services: row.services ?? [],
    plan: 'basic',
    financialYearStartMonth: row.financial_year_start_month,
    gstRegistered: row.gst_registered,
    currency: row.currency,
    trackGstInReports: row.track_gst_in_reports,
    // Not connected yet (no bank / accounting integrations exist).
    bankConnected: false,
    accountingSoftware: null,
    inviteCode: row.invite_code,
    createdAt: row.created_at,
  };
}

/** Columns the owner can change after sign-up (invite code and owner stay fixed). */
function toColumns(p: Partial<BusinessProfile>) {
  const cols: Record<string, unknown> = {};
  if (p.ownerName !== undefined) cols.owner_name = p.ownerName;
  if (p.email !== undefined) cols.owner_email = p.email;
  if (p.businessName !== undefined) cols.name = p.businessName;
  if (p.logo !== undefined) cols.logo = p.logo;
  if (p.abn !== undefined) cols.abn = p.abn;
  if (p.industry !== undefined) cols.industry = p.industry;
  if (p.industryCategory !== undefined) cols.industry_category = p.industryCategory;
  if (p.businessType !== undefined) cols.business_type = p.businessType;
  if (p.teamSize !== undefined) cols.team_size = p.teamSize;
  if (p.vehicles !== undefined) cols.vehicles = p.vehicles;
  if (p.yearsOperating !== undefined) cols.years_operating = p.yearsOperating;
  if (p.services !== undefined) cols.services = p.services;
  if (p.financialYearStartMonth !== undefined) cols.financial_year_start_month = p.financialYearStartMonth;
  if (p.gstRegistered !== undefined) cols.gst_registered = p.gstRegistered;
  if (p.currency !== undefined) cols.currency = p.currency;
  if (p.trackGstInReports !== undefined) cols.track_gst_in_reports = p.trackGstInReports;
  return cols;
}

export const businessStore = createStore<BusinessProfile | null>(null);

export function useBusiness() {
  return businessStore.use();
}

/** Loads the signed-in person's business (an owner's own, or an employee's employer). */
export async function loadMyBusiness() {
  const { data, error } = await supabase.from('businesses').select('*').limit(1).maybeSingle<BusinessRow>();
  if (error) throw error;
  businessStore.set(data ? fromRow(data) : null);
  return businessStore.get();
}

export function clearBusiness() {
  pendingChanges = {};
  if (saveTimer) clearTimeout(saveTimer);
  businessStore.set(null);
}

/**
 * Creates the business online at the end of owner sign-up (the owner must be
 * signed in). The database picks a unique invite code, e.g. BUXTON2026.
 */
export async function createBusinessOnline(profile: Omit<BusinessProfile, 'id' | 'inviteCode' | 'createdAt'>) {
  const { data, error } = await supabase.rpc('create_business', {
    p: {
      ...toColumns(profile),
      name: profile.businessName,
      invite_base: inviteBase(profile.ownerName, profile.businessName),
    },
  });
  if (error) throw error;
  const saved = fromRow(data as BusinessRow);
  businessStore.set(saved);
  return saved;
}

// Edits show straight away and are saved online shortly after typing stops,
// so a field edited letter by letter doesn't send a request per keystroke.
let pendingChanges: Record<string, unknown> = {};
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function updateBusiness(changes: Partial<BusinessProfile>) {
  const current = businessStore.get();
  if (!current) return;
  businessStore.set({ ...current, ...changes });
  if (!current.id) return;

  pendingChanges = { ...pendingChanges, ...toColumns(changes) };
  if (saveTimer) clearTimeout(saveTimer);
  const id = current.id;
  saveTimer = setTimeout(async () => {
    const cols = pendingChanges;
    pendingChanges = {};
    const { error } = await supabase.from('businesses').update(cols).eq('id', id);
    if (error) console.warn('Could not save business changes:', error.message);
  }, 700);
}

/** Owner only: makes a new invite code. The old code stops working straight away. */
export async function regenerateInviteCode() {
  const { data, error } = await supabase.rpc('regenerate_invite_code');
  if (error) throw error;
  const code = data as string;
  businessStore.set((b) => (b ? { ...b, inviteCode: code } : b));
  return code;
}

export function ownerFirstName(profile: BusinessProfile | null) {
  return profile?.ownerName.trim().split(/\s+/)[0] ?? null;
}

/** GST rate for new quotes and invoices: none if the business isn't GST registered. */
export function currentGstRate() {
  return businessStore.get()?.gstRegistered === false ? 0 : GST_RATE;
}

/** Letters the invite code starts with: the owner's surname, or the business name. */
export function inviteBase(ownerName: string, businessName: string) {
  const words = ownerName.trim().split(/\s+/).filter(Boolean);
  const base = (words.length > 1 ? words[words.length - 1] : businessName || words[0] || 'TEAM')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 10);
  return base || 'TEAM';
}

/** Preview of the invite code, e.g. "Theo Buxton" in 2026 -> "BUXTON2026". */
export function makeInviteCode(ownerName: string, businessName: string, year = new Date().getFullYear()) {
  return `${inviteBase(ownerName, businessName)}${year}`;
}

export function inviteLink(code: string) {
  // Opens the app via its "nexgain" scheme; employee sign-up reads the code from it.
  return `nexgain://join/${code}`;
}
