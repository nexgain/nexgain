// Superannuation details: where each employee's super is paid (their "choice
// of fund"), and the owner's super settings. Collected and stored only; no
// money is sent from here yet.
//
// Sensitive numbers (SMSF BSB and account number, TFN) are encrypted by the
// database. The app only ever gets the masked versions, except through
// revealSuperNumbers() / revealTfn(), which the database only answers for the
// employee themselves or their business owner. They're never logged.
// See supabase/migrations/20261111000000_super_details.sql.
import { businessStore } from '@/data/business';
import { isContractor, type Employee } from '@/data/employees';
import { createStore } from '@/data/store';
import { supabase } from '@/lib/supabase';

export type SuperChoice = 'default' | 'own' | 'smsf' | 'unsure';
export type Gender = 'female' | 'male' | 'x' | 'not_said';

/**
 * The choices employees are offered. Self-managed funds (SMSFs) aren't offered
 * yet; the database can still hold one for later.
 */
export const SUPER_CHOICES: { id: SuperChoice; label: string; hint: string }[] = [
  { id: 'default', label: 'Use my employer’s fund', hint: 'Your employer’s fund. Nothing to type.' },
  { id: 'own', label: 'Use my own fund', hint: 'A fund you already belong to, like AustralianSuper or Hostplus.' },
  {
    id: 'unsure',
    label: 'I’m not sure / skip for now',
    hint: 'Your employer will check with the ATO for a super fund you already have (a “stapled” fund) before using theirs.',
  },
];

export const GENDERS: { id: Gender; label: string }[] = [
  { id: 'female', label: 'Female' },
  { id: 'male', label: 'Male' },
  { id: 'x', label: 'X' },
  { id: 'not_said', label: 'Prefer not to say' },
];

export const TFN_NOTE =
  'You don’t have to give your TFN, but if you don’t, your super contributions may be taxed at a higher rate.';
export const OWN_FUND_HELP = 'You can find these on your fund’s website/app, your statement, or in myGov under Super.';
export const DECLARATION =
  'I confirm these super details are correct and I choose for my employer to pay my super into this fund.';

/** What's saved for one employee (sensitive numbers only as their last 3 digits). */
export type EmployeeSuper = {
  employeeId: string;
  choice: SuperChoice;
  fundName: string | null;
  fundAbn: string | null;
  usi: string | null;
  memberNumber: string | null;
  accountName: string | null;
  esa: string | null;
  smsfAccountName: string | null;
  smsfBsbLast3: string | null;
  smsfAccountLast3: string | null;
  declaredAt: string;
  choiceReceivedAt: string;
  choiceActionedAt: string | null;
  updatedAt: string;
};

/** What the employee types (full numbers; sent once to the database, never kept). */
export type SuperForm = {
  choice: SuperChoice | null;
  fundName: string;
  fundAbn: string;
  usi: string;
  memberNumber: string;
  accountName: string;
  esa: string;
  smsfAccountName: string;
  smsfBsb: string;
  smsfAccountNumber: string;
  gender: Gender | null;
  declared: boolean;
};

export const EMPTY_SUPER_FORM: SuperForm = {
  choice: null,
  fundName: '',
  fundAbn: '',
  usi: '',
  memberNumber: '',
  accountName: '',
  esa: '',
  smsfAccountName: '',
  smsfBsb: '',
  smsfAccountNumber: '',
  gender: null,
  declared: false,
};

type SuperRow = {
  employee_id: string;
  choice: SuperChoice;
  fund_name: string | null;
  fund_abn: string | null;
  usi: string | null;
  member_number: string | null;
  account_name: string | null;
  esa: string | null;
  smsf_account_name: string | null;
  smsf_bsb_last3: string | null;
  smsf_account_last3: string | null;
  declared_at: string;
  choice_received_at: string;
  choice_actioned_at: string | null;
  updated_at: string;
};

const COLUMNS =
  'employee_id, choice, fund_name, fund_abn, usi, member_number, account_name, esa, smsf_account_name, smsf_bsb_last3, smsf_account_last3, declared_at, choice_received_at, choice_actioned_at, updated_at';

const fromRow = (r: SuperRow): EmployeeSuper => ({
  employeeId: r.employee_id,
  choice: r.choice,
  fundName: r.fund_name,
  fundAbn: r.fund_abn,
  usi: r.usi,
  memberNumber: r.member_number,
  accountName: r.account_name,
  esa: r.esa,
  smsfAccountName: r.smsf_account_name,
  smsfBsbLast3: r.smsf_bsb_last3,
  smsfAccountLast3: r.smsf_account_last3,
  declaredAt: r.declared_at,
  choiceReceivedAt: r.choice_received_at,
  choiceActionedAt: r.choice_actioned_at,
  updatedAt: r.updated_at,
});

/** Everyone's super details (owner), or just your own (employee). */
export const employeeSuperStore = createStore<EmployeeSuper[]>([]);
export const useEmployeeSuper = () => employeeSuperStore.use();

export async function loadEmployeeSuper() {
  const { data, error } = await supabase.from('employee_super').select(COLUMNS);
  if (error) {
    // The super details database file hasn't been run yet.
    if (error.code === '42P01' || error.code === 'PGRST205') return;
    throw error;
  }
  employeeSuperStore.set((data as SuperRow[]).map(fromRow));
}

export function clearEmployeeSuper() {
  employeeSuperStore.set([]);
  superSettingsStore.set(EMPTY_SUPER_SETTINGS);
}

/** A plain message for a database error, without any of the numbers that were sent. */
function friendly(message: string) {
  if (/declaration/i.test(message)) return 'Please tick the declaration to confirm your super details.';
  if (/ABN/i.test(message)) return 'The fund’s ABN doesn’t look right. Check it and try again.';
  if (/tax file number/i.test(message)) return 'That tax file number doesn’t look right.';
  if (/USI|member number|fund.s name|ESA|BSB|account number/i.test(message)) return message;
  if (/function .* does not exist|could not find the function/i.test(message)) {
    return 'Super details aren’t switched on yet. Ask your employer to finish setting up NexGain.';
  }
  return 'Couldn’t save your super details. Check your internet connection and try again.';
}

/** Saves the signed-in employee's super choice. Returns an error message, or null. */
export async function saveMySuper(form: SuperForm, employeeId: string): Promise<string | null> {
  const { error } = await supabase.rpc('save_my_super', {
    p: {
      choice: form.choice,
      fund_name: form.fundName,
      fund_abn: form.fundAbn,
      usi: form.usi,
      member_number: form.memberNumber,
      account_name: form.accountName,
      esa: form.esa,
      smsf_account_name: form.smsfAccountName,
      smsf_bsb: form.smsfBsb,
      smsf_account_number: form.smsfAccountNumber,
      gender: form.gender ?? '',
      declared: form.declared,
    },
  });
  if (error) return friendly(error.message);
  // Read back what was saved (masked).
  const { data } = await supabase.from('employee_super').select(COLUMNS).eq('employee_id', employeeId).maybeSingle<SuperRow>();
  if (data) employeeSuperStore.set((all) => [fromRow(data), ...all.filter((s) => s.employeeId !== employeeId)]);
  return null;
}

/** Saves (or, when blank, removes) the signed-in employee's TFN. Returns an error message, or null. */
export async function saveMyTfn(tfn: string): Promise<string | null> {
  const { error } = await supabase.rpc('set_my_tfn', { p_tfn: tfn.replace(/\D/g, '') });
  return error ? friendly(error.message) : null;
}

/** The SMSF's full BSB and account number (employee or owner only). */
export async function revealSuperNumbers(employeeId: string) {
  const { data, error } = await supabase.rpc('reveal_employee_super', { p_employee_id: employeeId });
  if (error) throw new Error('Couldn’t show the numbers. Please try again.');
  const row = (data as { smsf_bsb: string | null; smsf_account_number: string | null }[] | null)?.[0];
  return { bsb: row?.smsf_bsb ?? null, accountNumber: row?.smsf_account_number ?? null };
}

/** The employee's full TFN (employee or owner only), or null if they haven't given one. */
export async function revealTfn(employeeId: string) {
  const { data, error } = await supabase.rpc('get_employee_private', { p_employee_id: employeeId });
  if (error) throw new Error('Couldn’t show the TFN. Please try again.');
  return ((data as { tfn: string | null }[] | null)?.[0]?.tfn ?? null) || null;
}

/** Owner: marks an employee's super choice as set up (or not yet). */
export async function markChoiceActioned(employeeId: string, actioned: boolean): Promise<string | null> {
  const { error } = await supabase.rpc('mark_super_choice_actioned', { p_employee_id: employeeId, p_actioned: actioned });
  if (error) return 'Couldn’t save that. Please try again.';
  const at = actioned ? new Date().toISOString() : null;
  employeeSuperStore.set((all) => all.map((s) => (s.employeeId === employeeId ? { ...s, choiceActionedAt: at } : s)));
  return null;
}

// ---------------------------------------------------------------------------
// History (kept at least 5 years)
// ---------------------------------------------------------------------------

export type SuperHistoryEntry = {
  id: string;
  /** The details as they were (numbers masked). */
  choice: SuperChoice;
  fundName: string | null;
  replacedAt: string;
  choiceReceivedAt: string | null;
  choiceActionedAt: string | null;
};

export async function loadSuperHistory(employeeId: string): Promise<SuperHistoryEntry[]> {
  const { data, error } = await supabase
    .from('employee_super_history')
    .select('id, details, replaced_at, choice_received_at, choice_actioned_at')
    .eq('employee_id', employeeId)
    .order('replaced_at', { ascending: false })
    .limit(50);
  if (error) return [];
  return (data as { id: string; details: { choice: SuperChoice; fund_name: string | null }; replaced_at: string; choice_received_at: string | null; choice_actioned_at: string | null }[]).map(
    (r) => ({
      id: r.id,
      choice: r.details.choice,
      fundName: r.details.fund_name,
      replacedAt: r.replaced_at,
      choiceReceivedAt: r.choice_received_at,
      choiceActionedAt: r.choice_actioned_at,
    }),
  );
}

// ---------------------------------------------------------------------------
// Status (owner's Employees list)
// ---------------------------------------------------------------------------

export type SuperStatus = 'Ready' | 'Stapled fund check needed' | 'Not chosen yet' | 'Missing details' | 'Not needed';

/**
 * Ready, Stapled fund check needed ("I'm not sure"), Not chosen yet, or Missing
 * details. Contractors don't get super through payroll.
 */
export function superStatusOf(employee: Pick<Employee, 'employmentType'>, record: EmployeeSuper | undefined): SuperStatus {
  if (isContractor(employee)) return 'Not needed';
  if (!record) return 'Not chosen yet';
  if (record.choice === 'unsure') return 'Stapled fund check needed';
  if (record.choice === 'own' && !(record.fundName && record.fundAbn && record.usi && record.memberNumber)) return 'Missing details';
  if (record.choice === 'smsf' && !(record.fundName && record.fundAbn && record.esa && record.smsfAccountLast3)) return 'Missing details';
  return 'Ready';
}

/** Where an employee's super should be paid. */
export type SuperFund =
  | { kind: 'employer'; fundName: string; usi: string; abn: string; employerNumber: string }
  | { kind: 'own'; fundName: string; usi: string; abn: string; memberNumber: string; accountName: string | null }
  | { kind: 'smsf'; fundName: string; abn: string; esa: string }
  | { kind: 'none'; reason: 'stapled_check_needed' | 'not_chosen' };

/**
 * THE answer to "which fund do we pay this employee's super into?":
 * - option a (employer's fund): the business's default fund
 * - option b (own fund): their fund
 * - option c (not sure) or no choice yet: none yet; for "not sure" the employer
 *   must check with the ATO for a stapled fund first (never the default fund).
 */
export function getEmployeeSuperFund(
  employee: Pick<Employee, 'id'>,
  records: EmployeeSuper[] = employeeSuperStore.get(),
  settings: SuperSettings = superSettingsStore.get(),
): SuperFund {
  const r = records.find((x) => x.employeeId === employee.id);
  if (!r) return { kind: 'none', reason: 'not_chosen' };
  switch (r.choice) {
    case 'default':
      return {
        kind: 'employer',
        fundName: settings.defaultFundName,
        usi: settings.defaultFundUsi,
        abn: settings.defaultFundAbn,
        employerNumber: settings.employerNumber,
      };
    case 'own':
      return { kind: 'own', fundName: r.fundName ?? '', usi: r.usi ?? '', abn: r.fundAbn ?? '', memberNumber: r.memberNumber ?? '', accountName: r.accountName };
    case 'smsf':
      return { kind: 'smsf', fundName: r.fundName ?? '', abn: r.fundAbn ?? '', esa: r.esa ?? '' };
    case 'unsure':
      return { kind: 'none', reason: 'stapled_check_needed' };
  }
}

/** How a choice reads, e.g. "Own fund: AustralianSuper". */
export function choiceText(choice: SuperChoice, fundName: string | null, defaultFund = superSettingsStore.get().defaultFundName) {
  switch (choice) {
    case 'default':
      return `Employer's fund${defaultFund ? `: ${defaultFund}` : ''}`;
    case 'own':
      return `Own fund${fundName ? `: ${fundName}` : ''}`;
    case 'smsf':
      return `SMSF${fundName ? `: ${fundName}` : ''}`;
    case 'unsure':
      return 'Not sure yet (stapled fund check needed)';
  }
}

/** A form filled in from what's saved (numbers left blank: they're never sent back to the app). */
export function formFrom(record: EmployeeSuper | undefined, gender: Gender | null): SuperForm {
  if (!record) return { ...EMPTY_SUPER_FORM, gender };
  return {
    ...EMPTY_SUPER_FORM,
    choice: record.choice,
    fundName: record.fundName ?? '',
    fundAbn: record.fundAbn ?? '',
    usi: record.usi ?? '',
    memberNumber: record.memberNumber ?? '',
    accountName: record.accountName ?? '',
    esa: record.esa ?? '',
    smsfAccountName: record.smsfAccountName ?? '',
    gender,
  };
}

// ---------------------------------------------------------------------------
// The owner's super settings (Business Profile). Owner only: staff just see
// the default fund's name (useDefaultFund).
// ---------------------------------------------------------------------------

export type SuperSettings = {
  legalName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  defaultFundName: string;
  defaultFundAbn: string;
  defaultFundUsi: string;
  /** The employer's number with the default fund (optional). */
  employerNumber: string;
  /** Super payment provider / clearing house. */
  providerName: string;
  providerNotes: string;
};

export const EMPTY_SUPER_SETTINGS: SuperSettings = {
  legalName: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  defaultFundName: '',
  defaultFundAbn: '',
  defaultFundUsi: '',
  employerNumber: '',
  providerName: '',
  providerNotes: '',
};

const SETTING_COLUMNS: [keyof SuperSettings, string][] = [
  ['legalName', 'legal_name'],
  ['contactName', 'contact_name'],
  ['contactEmail', 'contact_email'],
  ['contactPhone', 'contact_phone'],
  ['defaultFundName', 'default_fund_name'],
  ['defaultFundAbn', 'default_fund_abn'],
  ['defaultFundUsi', 'default_fund_usi'],
  ['employerNumber', 'employer_number'],
  ['providerName', 'provider_name'],
  ['providerNotes', 'provider_notes'],
];

/** The owner's settings, or the default fund's name for staff. */
export const superSettingsStore = createStore<SuperSettings>(EMPTY_SUPER_SETTINGS);
export const useSuperSettings = () => superSettingsStore.use();

export async function loadSuperSettings() {
  const business = businessStore.get();
  if (!business?.id) return;
  const { data, error } = await supabase.from('business_super_settings').select('settings').eq('business_id', business.id).maybeSingle();
  if (!error && data) {
    const saved = (data as { settings: Record<string, unknown> }).settings ?? {};
    const out = { ...EMPTY_SUPER_SETTINGS };
    for (const [key, col] of SETTING_COLUMNS) if (typeof saved[col] === 'string') out[key] = saved[col] as string;
    superSettingsStore.set(out);
    return;
  }
  // Staff (or nothing saved yet): just the default fund.
  const { data: fund } = await supabase.rpc('my_default_super_fund');
  const row = (fund as { fund_name: string | null; usi: string | null }[] | null)?.[0];
  superSettingsStore.set({ ...EMPTY_SUPER_SETTINGS, defaultFundName: row?.fund_name ?? '', defaultFundUsi: row?.usi ?? '' });
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

/** Owner: changes the super settings (saved a moment after typing stops). */
export function updateSuperSettings(changes: Partial<SuperSettings>) {
  const next = { ...superSettingsStore.get(), ...changes };
  superSettingsStore.set(next);
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const businessId = businessStore.get()?.id;
    if (!businessId) return;
    const settings = Object.fromEntries(SETTING_COLUMNS.map(([key, col]) => [col, next[key].slice(0, key === 'providerNotes' ? 1000 : 200)]));
    const { error } = await supabase
      .from('business_super_settings')
      .upsert({ business_id: businessId, settings, updated_at: new Date().toISOString() }, { onConflict: 'business_id' });
    if (error) console.warn('Could not save super settings.');
  }, 600);
}

/** Saves the default fund straight away (owner sign-up, once the business exists). Returns false if it couldn't. */
export async function saveDefaultFund(businessId: string, fund: { name: string; usi: string; abn: string }) {
  const next = { ...superSettingsStore.get(), defaultFundName: fund.name.trim(), defaultFundUsi: fund.usi.trim().toUpperCase(), defaultFundAbn: fund.abn.replace(/\D/g, '') };
  superSettingsStore.set(next);
  const settings = Object.fromEntries(SETTING_COLUMNS.map(([key, col]) => [col, next[key]]));
  const { error } = await supabase
    .from('business_super_settings')
    .upsert({ business_id: businessId, settings, updated_at: new Date().toISOString() }, { onConflict: 'business_id' });
  return !error;
}
