// Countries the owner can pick at sign-up, and which bank file each one gets.
import type { PaymentFileType } from './types';

/** Euro area members (21 from 1 January 2026, when Bulgaria joined). */
export const EUROZONE = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'EE', 'FI', 'FR', 'DE', 'GR', 'IE',
  'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PT', 'SK', 'SI', 'ES',
] as const;

export const COUNTRIES: { code: string; name: string }[] = [
  { code: 'AU', name: 'Australia' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'IE', name: 'Ireland' },
  { code: 'AT', name: 'Austria' },
  { code: 'BE', name: 'Belgium' },
  { code: 'BG', name: 'Bulgaria' },
  { code: 'HR', name: 'Croatia' },
  { code: 'CY', name: 'Cyprus' },
  { code: 'EE', name: 'Estonia' },
  { code: 'FI', name: 'Finland' },
  { code: 'FR', name: 'France' },
  { code: 'DE', name: 'Germany' },
  { code: 'GR', name: 'Greece' },
  { code: 'IT', name: 'Italy' },
  { code: 'LV', name: 'Latvia' },
  { code: 'LT', name: 'Lithuania' },
  { code: 'LU', name: 'Luxembourg' },
  { code: 'MT', name: 'Malta' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'PT', name: 'Portugal' },
  { code: 'SK', name: 'Slovakia' },
  { code: 'SI', name: 'Slovenia' },
  { code: 'ES', name: 'Spain' },
  { code: 'SG', name: 'Singapore' },
  { code: 'IN', name: 'India' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'OTHER', name: 'Other' },
];

export function countryName(code: string | null | undefined) {
  return COUNTRIES.find((c) => c.code === code)?.name ?? 'Not set';
}

export function isEurozone(code: string | null | undefined) {
  return !!code && (EUROZONE as readonly string[]).includes(code);
}

/** The bank file for a country, or null if NexGain can't make one there yet. */
export function paymentFileTypeFor(country: string | null | undefined): PaymentFileType | null {
  if (country === 'AU') return 'aba';
  if (country === 'US') return 'nacha';
  if (country === 'GB') return 'bacs18';
  if (isEurozone(country)) return 'sepa';
  return null;
}

/** Which bank details employees enter, by the business's country. */
export type BankFieldSet = 'AU' | 'US' | 'GB' | 'EU' | 'OTHER';

export function bankFieldSetFor(country: string | null | undefined): BankFieldSet {
  if (country === 'AU' || country === 'US' || country === 'GB') return country;
  if (isEurozone(country)) return 'EU';
  // Unknown (older businesses before country was saved) behave like Australia,
  // which is what sign-up always asked for until now.
  return country ? 'OTHER' : 'AU';
}
