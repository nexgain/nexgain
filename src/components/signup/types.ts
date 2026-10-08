// Everything typed during owner sign-up. Held in memory while the owner moves
// between steps (so going back never loses anything) and saved as the business
// profile at the end. The password is never saved.
import type { EmailApp } from '@/data/business';

export type SelectedIndustry = {
  name: string;
  /** null for a custom industry the owner typed themselves. */
  category: string | null;
};

export type SignupData = {
  // Step 1
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  // Step 2
  businessName: string;
  logo: string | null;
  abn: string;
  industryText: string;
  industry: SelectedIndustry | null;
  // Step 3
  businessType: string;
  teamSize: string;
  vehicles: string;
  yearsOperating: string | null;
  /** Industry the Step 3 defaults were filled in for. */
  prefilledFor: string | null;
  // Step 4
  services: string[];
  /** Industry the Step 4 services were suggested for. */
  servicesFor: string | null;
  // Step 6
  financialYearStartMonth: number;
  gstRegistered: boolean;
  currency: string;
  /** e.g. "AU" (see COUNTRIES). */
  country: string;
  trackGstInReports: boolean;
  // Step 7
  emailApp: EmailApp;
  businessEmail: string;
  bankAccountName: string;
  bankBsb: string;
  bankAccountNumber: string;
};

export const EMPTY_SIGNUP: SignupData = {
  fullName: '',
  email: '',
  password: '',
  confirmPassword: '',
  businessName: '',
  logo: null,
  abn: '',
  industryText: '',
  industry: null,
  businessType: 'Service Business',
  teamSize: '1–5',
  vehicles: '0',
  yearsOperating: null,
  prefilledFor: null,
  services: [],
  servicesFor: null,
  financialYearStartMonth: 7,
  gstRegistered: true,
  currency: 'AUD – Australian Dollar',
  country: 'AU',
  trackGstInReports: true,
  emailApp: 'gmail',
  businessEmail: '',
  bankAccountName: '',
  bankBsb: '',
  bankAccountNumber: '',
};

export type StepProps = {
  data: SignupData;
  update: (changes: Partial<SignupData>) => void;
  onNext: () => void;
};

export const STEP_NAMES = [
  'Create Account',
  'Business Details',
  'Business Type',
  'Services',
  'Subscription',
  'Financial Year',
  'Email & Bank',
  'Team & Payroll',
] as const;
