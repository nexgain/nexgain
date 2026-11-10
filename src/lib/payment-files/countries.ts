// Countries the owner can pick at sign-up, and which bank file each one gets.
import { PAYMENT_FILE_LABEL, type PaymentFileType } from './types';

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

/**
 * New Zealand banks. Each has its own bulk payment layout; NexGain only makes
 * the ones the bank publishes (fileType). Westpac and Kiwibank don't publish theirs.
 */
export const NZ_BANKS: { id: string; name: string; fileType: PaymentFileType | null }[] = [
  { id: 'ANZ', name: 'ANZ', fileType: 'nz_anz' },
  { id: 'ASB', name: 'ASB', fileType: 'nz_asb' },
  { id: 'BNZ', name: 'BNZ', fileType: 'nz_bnz' },
  { id: 'KIWIBANK', name: 'Kiwibank', fileType: null },
  { id: 'WESTPAC', name: 'Westpac', fileType: null },
  { id: 'OTHER', name: 'Another bank', fileType: null },
];

/** True when the owner has to say which bank they use (only New Zealand, for now). */
export const countryNeedsBank = (country: string | null | undefined) => country === 'NZ';

export type PayrollFileFormat =
  | { ok: true; type: PaymentFileType; label: string; /** For the file name, e.g. "AU". */ code: string }
  | {
      ok: false;
      /** no-country / country-not-ready: no file for this country. needs-bank: choose a bank first. bank-not-ready: no file for that bank. */
      reason: 'no-country' | 'country-not-ready' | 'needs-bank' | 'bank-not-ready';
      message: string;
    };

const ready = (type: PaymentFileType, code: string): PayrollFileFormat => ({ ok: true, type, label: PAYMENT_FILE_LABEL[type], code });

/**
 * THE rule for which payroll bank file to make, from the business's country
 * (and, in New Zealand, the owner's bank). Everything that makes or offers a
 * file asks this, so the rule lives in one place.
 */
export function getPayrollFileFormat(business: { country?: string | null } | null | undefined, bank?: string | null): PayrollFileFormat {
  const country = business?.country ?? null;
  if (!country) return { ok: false, reason: 'no-country', message: 'Choose your country in Payroll bank details so NexGain knows which bank file to make.' };
  if (country === 'AU') return ready('aba', 'AU');
  if (country === 'US') return ready('nacha', 'US');
  if (country === 'GB') return ready('bacs18', 'GB');
  if (isEurozone(country)) return ready('sepa', country);
  if (country === 'NZ') {
    const nzBank = NZ_BANKS.find((b) => b.id === bank);
    if (!nzBank) return { ok: false, reason: 'needs-bank', message: 'Choose your bank in Payroll bank details so NexGain knows which file to make.' };
    if (!nzBank.fileType) {
      return {
        ok: false,
        reason: 'bank-not-ready',
        message: `NexGain can't make a ${nzBank.id === 'OTHER' ? 'bank' : nzBank.name} payroll file yet. Pay your team through your internet banking, then press Mark as paid.`,
      };
    }
    return ready(nzBank.fileType, 'NZ');
  }
  return {
    ok: false,
    reason: 'country-not-ready',
    message: `Bank payment files aren't available for ${countryName(country)} yet. Pay your team through your bank, then press Mark as paid.`,
  };
}

/** Which bank details employees enter, by the business's country. */
export type BankFieldSet = 'AU' | 'US' | 'GB' | 'NZ' | 'EU' | 'OTHER';

export function bankFieldSetFor(country: string | null | undefined): BankFieldSet {
  if (country === 'AU' || country === 'US' || country === 'GB' || country === 'NZ') return country;
  if (isEurozone(country)) return 'EU';
  // Unknown (older businesses before country was saved) behave like Australia,
  // which is what sign-up always asked for until now.
  return country ? 'OTHER' : 'AU';
}
