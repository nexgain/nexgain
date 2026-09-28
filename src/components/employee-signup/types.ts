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

export const DOCUMENT_KINDS = ['White Card', "Driver's Licence", 'Other Qualifications'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Casual', 'Contractor'] as const;

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
  // Step 3
  phone: string;
  dateOfBirth: Date | null;
  address: string;
  position: string;
  employmentType: (typeof EMPLOYMENT_TYPES)[number] | null;
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
  documents: Partial<Record<DocumentKind, PickedDocument>>;
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
  phone: '',
  dateOfBirth: null,
  address: '',
  position: '',
  employmentType: null,
  accountName: '',
  bsb: '',
  accountNumber: '',
  tfn: '',
  superFund: null,
  superFundOther: '',
  emergencyName: '',
  emergencyPhone: '',
  documents: {},
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
