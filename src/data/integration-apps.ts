// Well-known business apps the owner can say they use (More > Integrations and
// owner sign-up). None of them are connected yet: choosing one tells us which
// connections to build first. Only email actually works today (see src/lib/email.ts).
import type { BrandLogoName } from '@/constants/brand-logos';

export type AppCategory = 'payments' | 'calendar' | 'team' | 'files' | 'marketing' | 'store' | 'jobs' | 'other';

export const CATEGORY_LABEL: Record<AppCategory, string> = {
  payments: 'Payments & accounting',
  calendar: 'Calendar & bookings',
  team: 'Team & rostering',
  files: 'Files',
  marketing: 'Marketing & customers',
  store: 'Online store',
  jobs: 'Job management',
  other: 'Other',
};

export type CatalogApp = {
  name: string;
  category: AppCategory;
  /** Logo in src/constants/brand-logos.ts, if we have one. */
  logo?: BrandLogoName;
};

export const APP_CATALOG: CatalogApp[] = [
  // Payments & accounting
  { name: 'Xero', category: 'payments', logo: 'xero' },
  { name: 'MYOB', category: 'payments', logo: 'myob' },
  { name: 'QuickBooks', category: 'payments', logo: 'quickbooks' },
  { name: 'Stripe', category: 'payments', logo: 'stripe' },
  { name: 'Square', category: 'payments', logo: 'square' },
  { name: 'PayPal', category: 'payments', logo: 'paypal' },
  { name: 'Wise', category: 'payments', logo: 'wise' },
  { name: 'Airwallex', category: 'payments' },
  { name: 'Afterpay', category: 'payments', logo: 'afterpay' },
  { name: 'Zip', category: 'payments' },
  { name: 'Tyro', category: 'payments' },
  { name: 'Zeller', category: 'payments' },
  { name: 'Reckon', category: 'payments' },
  { name: 'FreshBooks', category: 'payments' },
  { name: 'Wave', category: 'payments' },
  { name: 'Sage', category: 'payments', logo: 'sage' },
  { name: 'Hnry', category: 'payments' },
  // Calendar & bookings
  { name: 'Google Calendar', category: 'calendar', logo: 'googleCalendar' },
  { name: 'Outlook Calendar', category: 'calendar', logo: 'outlook' },
  { name: 'Apple Calendar', category: 'calendar' },
  { name: 'Calendly', category: 'calendar', logo: 'calendly' },
  { name: 'Acuity Scheduling', category: 'calendar' },
  // Team & rostering
  { name: 'Deputy', category: 'team' },
  { name: 'Tanda', category: 'team' },
  { name: 'Employment Hero', category: 'team' },
  { name: 'Slack', category: 'team' },
  { name: 'Microsoft Teams', category: 'team' },
  // Files
  { name: 'Google Drive', category: 'files', logo: 'googleDrive' },
  { name: 'Dropbox', category: 'files', logo: 'dropbox' },
  { name: 'OneDrive', category: 'files' },
  // Marketing & customers
  { name: 'Mailchimp', category: 'marketing', logo: 'mailchimp' },
  { name: 'HubSpot', category: 'marketing', logo: 'hubspot' },
  { name: 'Google Business Profile', category: 'marketing' },
  { name: 'Canva', category: 'marketing' },
  // Online store
  { name: 'Shopify', category: 'store', logo: 'shopify' },
  { name: 'WooCommerce', category: 'store', logo: 'woocommerce' },
  { name: 'Squarespace', category: 'store' },
  { name: 'Wix', category: 'store' },
  // Job management
  { name: 'ServiceM8', category: 'jobs' },
  { name: 'Tradify', category: 'jobs' },
  { name: 'simPRO', category: 'jobs' },
  // Automation
  { name: 'Zapier', category: 'other', logo: 'zapier' },
];

export function findCatalogApp(name: string) {
  const key = name.trim().toLowerCase();
  return APP_CATALOG.find((a) => a.name.toLowerCase() === key);
}
