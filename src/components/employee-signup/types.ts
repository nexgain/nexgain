// Everything typed during employee sign-up. Held in memory while moving between
// steps; sent to the database when "Create Account" is pressed. The password
// goes to Supabase's login system; bank details and TFN are stored encrypted.

export type FoundBusiness = {
  id: string;
  name: string;
  logo: string | null;
  industry: string | null;
  industryCategory: string | null;
};

export type PickedDocument = {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
};

/** A licence / ticket / certificate added during sign-up; saved once the account exists. */
export type SignupQualification = {
  id: string;
  name: string;
  expiryDate: Date | null;
  file: PickedDocument | null;
};

export const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Casual', 'Contractor'] as const;

/** "51824753556" -> "51 824 753 556" while typing. */
export function formatAbnInput(text: string) {
  const d = text.replace(/\D/g, '').slice(0, 11);
  return [d.slice(0, 2), d.slice(2, 5), d.slice(5, 8), d.slice(8, 11)].filter(Boolean).join(' ');
}

export type EmployeeSignupData = {
  // Step 1
  fullName: string;
  email: string;
  password: string;
  // Step 2
  joinMode: 'code' | 'link';
  code: string;
  link: string;
  business: FoundBusiness | null;
  /** The code that `business` was found with. */
  businessCode: string | null;
  /** Set when they opened their personal invite link from the owner. */
  inviteId: string | null;
  // Step 3
  phone: string;
  dateOfBirth: Date | null;
  address: string;
  position: string;
  employmentType: (typeof EMPLOYMENT_TYPES)[number] | null;
  /** Contractors only. */
  abn: string;
  gstRegistered: boolean | null;
  // Step 4
  accountName: string;
  bsb: string;
  accountNumber: string;
  // Step 5
  tfn: string;
  superFund: string | null;
  superFundOther: string;
  emergencyName: string;
  emergencyPhone: string;
  qualifications: SignupQualification[];
};

export const EMPTY_EMPLOYEE_SIGNUP: EmployeeSignupData = {
  fullName: '',
  email: '',
  password: '',
  joinMode: 'code',
  code: '',
  link: '',
  business: null,
  businessCode: null,
  inviteId: null,
  phone: '',
  dateOfBirth: null,
  address: '',
  position: '',
  employmentType: null,
  abn: '',
  gstRegistered: null,
  accountName: '',
  bsb: '',
  accountNumber: '',
  tfn: '',
  superFund: null,
  superFundOther: '',
  emergencyName: '',
  emergencyPhone: '',
  qualifications: [],
};

export type EmployeeStepProps = {
  data: EmployeeSignupData;
  update: (changes: Partial<EmployeeSignupData>) => void;
  onNext: () => void;
  /** "Next" label: returns to Review when a step was opened from there. */
  nextLabel: string;
};

export const EMPLOYEE_STEP_NAMES = [
  'Create Account',
  'Join Business',
  'Personal Details',
  'Bank Details',
  'Additional Info',
  'Review & Complete',
] as const;

export const SUPER_FUNDS = [
  'AustralianSuper',
  'Australian Retirement Trust',
  'Aware Super',
  'UniSuper',
  'Hostplus',
  'Cbus',
  'Rest',
  'HESTA',
  'CareSuper',
  'Colonial First State',
  'AMP',
  'MLC',
  'Spirit Super',
  'Other',
] as const;

/** Pulls the code out of an invite link like nexgain://join/BUXTON2026. */
export function codeFromLink(link: string) {
  const text = link.trim();
  const match = text.match(/join\/([A-Za-z0-9-]+)/i) ?? text.match(/[?&]code=([A-Za-z0-9-]+)/i);
  return match ? match[1].toUpperCase() : null;
}

/** "123456" -> "123-456" */
export const formatBsb = (t: string) => {
  const d = t.replace(/\D/g, '').slice(0, 6);
  return d.length > 3 ? `${d.slice(0, 3)}-${d.slice(3)}` : d;
};

/** "123456789" -> "123 456 789" */
export const formatTfn = (t: string) => t.replace(/\D/g, '').slice(0, 9).replace(/(\d{3})(?=\d)/g, '$1 ');

export const maskLast4 = (digits: string) => {
  const d = digits.replace(/\D/g, '');
  return d ? `**** ${d.slice(-4)}` : '—';
};
