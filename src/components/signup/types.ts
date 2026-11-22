// Everything typed during owner sign-up. Held in memory while the owner moves
// between steps (so going back never loses anything) and saved as the business
// profile at the end. The password is never saved.
import type { EmailApp } from '@/data/business';
import type { ChosenApp } from '@/data/business-apps';
import type { SystemType } from '@/data/systems';
import type { ServiceDraft } from '@/systems/bookings/constants/booking-business-types';
import type { CategoryDraft } from '@/systems/retail/constants/retail-business-types';

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
  /** Jobs & quotes (System 1), customer bookings (NexGain Bookings) or retail & stock (NexGain Retail). Blank until chosen. */
  systemType: SystemType | null;
  industryText: string;
  industry: SelectedIndustry | null;
  /** NexGain Bookings only: the business types chosen (ids from booking-business-types.ts), main one first. */
  bookingTypes: string[];
  /** NexGain Hospitality only: the food business type (an id from hospitality-types.ts). */
  hospitalityType: string | null;
  /** NexGain Retail only: the business type picked (an id from retail-business-types.ts). */
  retailType: string | null;
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
  /** NexGain Bookings only: the services customers can book (name, length, price). */
  bookingServices: ServiceDraft[];
  /** The booking types the services were suggested for. */
  bookingServicesFor: string | null;
  /** NexGain Bookings only: "Do you do the work yourself?" (null until answered). */
  ownerWorks: boolean | null;
  /** NexGain Hospitality only: the starter menu categories (editable). */
  menuCategories: string[];
  /** The hospitality type the menu categories were suggested for. */
  menuCategoriesFor: string | null;
  /** NexGain Retail only: the product categories the shop starts with. */
  retailCategories: CategoryDraft[];
  /** The retail type the categories were suggested for. */
  retailCategoriesFor: string | null;
  // Step 6
  financialYearStartMonth: number;
  gstRegistered: boolean;
  currency: string;
  /** e.g. "AU" (see COUNTRIES). Required; blank until chosen. */
  country: string;
  /** Australian businesses only: the default super fund for staff who choose it. */
  superFundName: string;
  superFundUsi: string;
  superFundAbn: string;
  /** New Zealand only: the owner's bank (see NZ_BANKS), which decides the payroll file. */
  bank: string;
  trackGstInReports: boolean;
  // Step 7
  emailApp: EmailApp;
  businessEmail: string;
  bankAccountName: string;
  bankBsb: string;
  bankAccountNumber: string;
  /** Apps the owner uses (not connected yet), saved once the business is created. */
  apps: ChosenApp[];
};

export const EMPTY_SIGNUP: SignupData = {
  fullName: '',
  email: '',
  password: '',
  confirmPassword: '',
  businessName: '',
  logo: null,
  abn: '',
  systemType: null,
  industryText: '',
  industry: null,
  bookingTypes: [],
  hospitalityType: null,
  retailType: null,
  // The business structure (Sole Trader, Company...): empty until the owner picks one.
  businessType: '',
  teamSize: '1–5',
  vehicles: '0',
  yearsOperating: null,
  prefilledFor: null,
  services: [],
  servicesFor: null,
  bookingServices: [],
  bookingServicesFor: null,
  ownerWorks: null,
  menuCategories: [],
  menuCategoriesFor: null,
  retailCategories: [],
  retailCategoriesFor: null,
  financialYearStartMonth: 7,
  gstRegistered: true,
  currency: 'AUD – Australian Dollar',
  country: '',
  superFundName: '',
  superFundUsi: '',
  superFundAbn: '',
  bank: '',
  trackGstInReports: true,
  emailApp: 'gmail',
  businessEmail: '',
  bankAccountName: '',
  bankBsb: '',
  bankAccountNumber: '',
  apps: [],
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
