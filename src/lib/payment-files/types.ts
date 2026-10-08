// The common NexGain pay run format that every bank file builder reads.
// Builders are pure functions (no app or database code) so they can be tested
// on their own, and adding a country only means adding one more builder.

/** An employee's bank account, in the fields their country uses. */
export type PayeeBank = {
  accountName: string;
  /** AU: BSB (6 digits). */
  bsb?: string;
  /** AU, US, UK. */
  accountNumber?: string;
  /** US: ABA routing number (9 digits). */
  routingNumber?: string;
  /** US only. */
  accountType?: 'checking' | 'savings';
  /** UK: sort code (6 digits). */
  sortCode?: string;
  /** Eurozone. */
  iban?: string;
  /** Eurozone, optional. */
  bic?: string;
};

/** One person being paid in a pay run. */
export type PaymentLine = {
  employeeId: string;
  employeeName: string;
  /** Net pay in cents (always a whole number). */
  amountCents: number;
  bank: PayeeBank;
};

export type PaymentRun = {
  /** Counts up per business: 1 = "Payroll 001". */
  payrollNumber: number;
  /** "YYYY-MM-DD": the day the money should arrive / be processed. */
  payDate: string;
  /** When the file is made (used in file headers). */
  createdAt: Date;
  businessName: string;
  lines: PaymentLine[];
};

/** The owner's own paying account and the IDs their bank gave them. */
export type PayerSettings = {
  /** ISO country code, e.g. "AU". */
  country: string;
  /** Name on the paying account. */
  accountName: string;
  /** AU: BSB. US: routing number of your bank. UK: sort code. */
  bankCode: string;
  accountNumber: string;
  /** Eurozone. */
  iban: string;
  bic: string;
  /** AU: 3-letter bank code, e.g. CBA, WBC, ANZ, NAB. */
  bankShortName: string;
  /** AU: APCA / Direct Entry user ID (6 digits). UK: Service User Number (optional). */
  userIdNumber: string;
  /** US: Company ID from your bank (usually "1" + your EIN). */
  companyId: string;
  /** US: your bank's name. */
  bankName: string;
  /** AU: add a balancing line that takes the total from your account (some banks require it). */
  abaBalancing: boolean;
};

export type PaymentFile = {
  fileType: PaymentFileType;
  /** e.g. "aba", "txt", "xml" */
  extension: string;
  mimeType: string;
  content: string;
};

export type PaymentFileType = 'aba' | 'nacha' | 'bacs18' | 'sepa';

export const PAYMENT_FILE_LABEL: Record<PaymentFileType, string> = {
  aba: 'ABA file',
  nacha: 'NACHA file',
  bacs18: 'Bacs Standard 18 file',
  sepa: 'SEPA credit transfer file (pain.001)',
};

/** "001" (3 digits, more when needed). */
export function payrollDigits(n: number) {
  return String(n).padStart(3, '0');
}

/** "Payroll 001" (shown in the app). */
export function payrollLabel(n: number) {
  return `Payroll ${payrollDigits(n)}`;
}

/** "PAYROLL 001" (bank reference), or "PAYROLL001" when space is short. */
export function payrollReference(n: number, compact = false) {
  return compact ? `PAYROLL${payrollDigits(n)}` : `PAYROLL ${payrollDigits(n)}`;
}

/** Left-justify and pad (or cut) to an exact width. */
export function padRight(text: string, width: number, fill = ' ') {
  return text.length >= width ? text.slice(0, width) : text + fill.repeat(width - text.length);
}

/** Right-justify and pad (or keep the rightmost characters) to an exact width. */
export function padLeft(text: string, width: number, fill = ' ') {
  return text.length >= width ? text.slice(text.length - width) : fill.repeat(width - text.length) + text;
}

export const digitsOnly = (text: string | undefined) => (text ?? '').replace(/\D/g, '');

/** Accents removed, e.g. "José Müller" -> "Jose Muller". */
export function stripAccents(text: string) {
  return text.normalize('NFD').replace(COMBINING_MARKS, '');
}

/** Accent marks left over after normalize('NFD') (Unicode U+0300 to U+036F). */
const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');

export class PaymentFileError extends Error {}
