// Builds the bank file getPayrollFileFormat() (countries.ts) picked for the
// business's country and bank. To support a new country or bank: write a
// builder (same shape as the others), add it to BUILDERS, and return its type
// from getPayrollFileFormat().
import { buildAba } from './aba';
import { buildBacs18 } from './bacs';
import { isValidBic, isValidIban, isValidRoutingNumber } from './bank-details';
import { buildNacha } from './nacha';
import { buildAnz, buildAsbMt9, buildBnz, parseNzAccount } from './nz';
import { buildSepa } from './sepa';
import { digitsOnly, payrollDigits, type PayerSettings, type PaymentFile, type PaymentFileType, type PaymentRun } from './types';

export * from './types';
export * from './countries';
export * from './bank-details';
export { formatNzAccount, parseNzAccount } from './nz';

type Builder = (run: PaymentRun, payer: PayerSettings) => PaymentFile;

const BUILDERS: Record<PaymentFileType, Builder> = {
  aba: buildAba,
  nacha: buildNacha,
  bacs18: buildBacs18,
  sepa: buildSepa,
  nz_bnz: buildBnz,
  nz_anz: buildAnz,
  nz_asb: buildAsbMt9,
};

export const EMPTY_PAYER: PayerSettings = {
  country: '',
  accountName: '',
  bankCode: '',
  accountNumber: '',
  iban: '',
  bic: '',
  bankShortName: '',
  userIdNumber: '',
  companyId: '',
  bankName: '',
  abaBalancing: false,
};

export type PayerField = Exclude<keyof PayerSettings, 'country' | 'abaBalancing'>;

export type PayerFieldSpec = {
  key: PayerField;
  label: string;
  placeholder: string;
  hint: string;
  numeric?: boolean;
  optional?: boolean;
};

/** The questions the payroll bank setup asks, for each kind of file. */
export function payerFieldsFor(type: PaymentFileType): PayerFieldSpec[] {
  switch (type) {
    case 'aba':
      return [
        { key: 'accountName', label: 'Account name', placeholder: 'e.g. Smith Cleaning Pty Ltd', hint: 'The name on the account wages are paid from.' },
        { key: 'bankCode', label: 'BSB', placeholder: '062-000', hint: '6 digits.', numeric: true },
        { key: 'accountNumber', label: 'Account number', placeholder: '12345678', hint: 'Up to 9 digits.', numeric: true },
        { key: 'bankShortName', label: 'Bank code', placeholder: 'CBA', hint: '3 letters for your bank, e.g. CBA, WBC, ANZ, NAB. Your bank can tell you.' },
        {
          key: 'userIdNumber',
          label: 'APCA / Direct Entry user ID',
          placeholder: '123456',
          hint: 'A 6-digit number your bank gives you when you set up bulk payments (it may be called your "User ID" or "DE ID").',
          numeric: true,
        },
      ];
    case 'nacha':
      return [
        { key: 'accountName', label: 'Company name', placeholder: 'e.g. Smith Cleaning LLC', hint: 'Your business name as your bank has it.' },
        { key: 'bankName', label: 'Your bank’s name', placeholder: 'e.g. Chase', hint: 'The bank you send the file to.' },
        { key: 'bankCode', label: 'Your bank’s routing number', placeholder: '021000021', hint: '9 digits. Ask your bank which routing number to use for ACH files.', numeric: true },
        {
          key: 'companyId',
          label: 'Company ID',
          placeholder: '1234567890',
          hint: 'Your bank gives you this when you set up ACH payments. It is often "1" followed by your EIN.',
        },
      ];
    case 'bacs18':
      return [
        { key: 'accountName', label: 'Account name', placeholder: 'e.g. Smith Cleaning Ltd', hint: 'The name on the account wages are paid from.' },
        { key: 'bankCode', label: 'Sort code', placeholder: '12-34-56', hint: '6 digits.', numeric: true },
        { key: 'accountNumber', label: 'Account number', placeholder: '12345678', hint: '8 digits.', numeric: true },
        {
          key: 'userIdNumber',
          label: 'Service User Number (SUN)',
          placeholder: '123456',
          hint: 'Only if your bank gave you one for Bacs. You can leave it blank.',
          numeric: true,
          optional: true,
        },
      ];
    case 'sepa':
      return [
        { key: 'accountName', label: 'Account name', placeholder: 'e.g. Smith Reinigung GmbH', hint: 'The name on the account wages are paid from.' },
        { key: 'iban', label: 'IBAN', placeholder: 'DE89 3704 0044 0532 0130 00', hint: 'The account wages are paid from.' },
        { key: 'bic', label: 'BIC / SWIFT', placeholder: 'COBADEFFXXX', hint: '8 or 11 characters. Leave blank if your bank says it isn’t needed.', optional: true },
      ];
    case 'nz_bnz':
    case 'nz_anz':
    case 'nz_asb':
      return [
        { key: 'accountName', label: 'Account name', placeholder: 'e.g. Smith Cleaning Ltd', hint: 'The name on the account wages are paid from.' },
        {
          key: 'accountNumber',
          label: 'Account number',
          placeholder: '12-3456-1234567-00',
          hint: 'The full number: bank, branch, account and suffix.',
          numeric: true,
        },
      ];
  }
}

/** Problems with the owner's setup, by field. Empty when the file can be made. */
export function validatePayer(type: PaymentFileType, payer: PayerSettings): Partial<Record<PayerField, string>> {
  const errors: Partial<Record<PayerField, string>> = {};
  if (!payer.accountName.trim()) errors.accountName = 'Enter the name.';
  const code = digitsOnly(payer.bankCode);
  const account = digitsOnly(payer.accountNumber);
  switch (type) {
    case 'aba':
      if (code.length !== 6) errors.bankCode = 'A BSB has 6 digits.';
      if (account.length < 5 || account.length > 9) errors.accountNumber = 'Enter 5 to 9 digits.';
      if (!/^[A-Za-z]{3}$/.test(payer.bankShortName.trim())) errors.bankShortName = 'Enter the 3-letter code, e.g. CBA.';
      if (!/^\d{1,6}$/.test(payer.userIdNumber.trim())) errors.userIdNumber = 'Enter your user ID (up to 6 digits).';
      break;
    case 'nacha':
      if (!payer.bankName.trim()) errors.bankName = 'Enter your bank’s name.';
      if (!isValidRoutingNumber(payer.bankCode)) errors.bankCode = 'Enter a valid 9-digit routing number.';
      if (!/^[A-Za-z0-9]{1,10}$/.test(payer.companyId.trim())) errors.companyId = 'Enter up to 10 letters or numbers.';
      break;
    case 'bacs18':
      if (code.length !== 6) errors.bankCode = 'A sort code has 6 digits.';
      if (account.length !== 8) errors.accountNumber = 'Enter 8 digits.';
      if (payer.userIdNumber.trim() && !/^\d{6}$/.test(payer.userIdNumber.trim())) errors.userIdNumber = 'A SUN has 6 digits.';
      break;
    case 'sepa':
      if (!isValidIban(payer.iban)) errors.iban = 'That IBAN doesn’t look right.';
      if (payer.bic.trim() && !isValidBic(payer.bic)) errors.bic = 'A BIC has 8 or 11 characters.';
      break;
    case 'nz_bnz':
    case 'nz_anz':
    case 'nz_asb': {
      const nz = parseNzAccount(payer.accountNumber);
      if (!nz) errors.accountNumber = 'Enter the full number, e.g. 12-3456-1234567-00.';
      // BNZ and ASB files must be paid from that bank's own account.
      else if (type === 'nz_bnz' && nz.bank !== '02') errors.accountNumber = 'A BNZ account number starts with 02.';
      else if (type === 'nz_asb' && nz.bank !== '12') errors.accountNumber = 'An ASB account number starts with 12.';
      break;
    }
  }
  return errors;
}

/** Builds the chosen bank file (throws PaymentFileError with a plain message). */
export function buildPaymentFile(type: PaymentFileType, run: PaymentRun, payer: PayerSettings) {
  return BUILDERS[type](run, payer);
}

/**
 * e.g. "NexGain_Payroll_AU_2026-11-14_001.aba". The payroll number on the end
 * keeps two pay runs on the same day from getting the same name.
 */
export function paymentFileName(countryCode: string, payrollNumber: number, payDate: string, extension: string) {
  return `NexGain_Payroll_${countryCode}_${payDate}_${payrollDigits(payrollNumber)}.${extension}`;
}
