// Employee bank details by country: which boxes to show, how to tidy what's
// typed, and how to check it. Used by sign-up, the profile screen and the
// payment file check, so the rules are the same everywhere.
import type { BankFieldSet } from './countries';
import { digitsOnly, type PayeeBank } from './types';

/** What the bank boxes hold while being typed (every country uses some of these). */
export type BankForm = {
  accountName: string;
  /** AU: BSB. US: routing number. UK: sort code. Other: bank / branch code. */
  branchCode: string;
  accountNumber: string;
  /** US only. */
  accountType: 'checking' | 'savings' | '';
  /** Eurozone. */
  iban: string;
  bic: string;
};

export const EMPTY_BANK_FORM: BankForm = {
  accountName: '',
  branchCode: '',
  accountNumber: '',
  accountType: '',
  iban: '',
  bic: '',
};

export type BankTextField = 'accountName' | 'branchCode' | 'accountNumber' | 'iban' | 'bic';

export type BankFieldSpec = {
  key: BankTextField;
  label: string;
  placeholder: string;
  hint?: string;
  numeric?: boolean;
  /** Tidies the text as it's typed. */
  format?: (text: string) => string;
};

/** "062000" -> "062-000" */
export function formatBsb(text: string) {
  const d = digitsOnly(text).slice(0, 6);
  return d.length > 3 ? `${d.slice(0, 3)}-${d.slice(3)}` : d;
}

/** "123456" -> "12-34-56" */
export function formatSortCode(text: string) {
  const d = digitsOnly(text).slice(0, 6);
  return d.replace(/(\d{2})(?=\d)/g, '$1-');
}

/** "de89370400440532013000" -> "DE89 3704 0044 0532 0130 00" */
export function formatIban(text: string) {
  return compactIban(text).slice(0, 34).replace(/(.{4})(?=.)/g, '$1 ');
}

export function compactIban(text: string) {
  return text.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

const ACCOUNT_NAME: BankFieldSpec = {
  key: 'accountName',
  label: 'Account name',
  placeholder: 'e.g. Jordan Smith',
  hint: 'The name the account is in, as your bank shows it.',
};

export function bankFieldsFor(set: BankFieldSet): BankFieldSpec[] {
  switch (set) {
    case 'AU':
      return [
        ACCOUNT_NAME,
        { key: 'branchCode', label: 'BSB', placeholder: '062-000', hint: '6 digits.', numeric: true, format: formatBsb },
        {
          key: 'accountNumber',
          label: 'Account number',
          placeholder: '12345678',
          hint: 'Up to 9 digits.',
          numeric: true,
          format: (t) => digitsOnly(t).slice(0, 9),
        },
      ];
    case 'US':
      return [
        ACCOUNT_NAME,
        {
          key: 'branchCode',
          label: 'Routing number',
          placeholder: '021000021',
          hint: '9 digits, printed at the bottom left of a check.',
          numeric: true,
          format: (t) => digitsOnly(t).slice(0, 9),
        },
        {
          key: 'accountNumber',
          label: 'Account number',
          placeholder: '000123456789',
          hint: '4 to 17 digits.',
          numeric: true,
          format: (t) => digitsOnly(t).slice(0, 17),
        },
      ];
    case 'GB':
      return [
        ACCOUNT_NAME,
        { key: 'branchCode', label: 'Sort code', placeholder: '12-34-56', hint: '6 digits.', numeric: true, format: formatSortCode },
        {
          key: 'accountNumber',
          label: 'Account number',
          placeholder: '12345678',
          hint: '8 digits.',
          numeric: true,
          format: (t) => digitsOnly(t).slice(0, 8),
        },
      ];
    case 'EU':
      return [
        ACCOUNT_NAME,
        { key: 'iban', label: 'IBAN', placeholder: 'DE89 3704 0044 0532 0130 00', hint: 'Starts with 2 letters for the country.', format: formatIban },
        {
          key: 'bic',
          label: 'BIC / SWIFT (optional)',
          placeholder: 'COBADEFFXXX',
          hint: '8 or 11 letters and numbers.',
          format: (t) => t.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 11),
        },
      ];
    default:
      return [
        ACCOUNT_NAME,
        { key: 'branchCode', label: 'Bank / branch code (if any)', placeholder: 'e.g. 01-0102' },
        { key: 'accountNumber', label: 'Account number', placeholder: 'Your account number' },
      ];
  }
}

/** US only: checking or savings. */
export function needsAccountType(set: BankFieldSet) {
  return set === 'US';
}

/** US routing numbers have a built-in check digit (weights 3, 7, 1). */
export function isValidRoutingNumber(text: string) {
  const d = digitsOnly(text);
  if (!/^[\d\s-]*$/.test(text) || d.length !== 9 || d === '000000000') return false;
  const n = d.split('').map(Number);
  const sum = 3 * (n[0] + n[3] + n[6]) + 7 * (n[1] + n[4] + n[7]) + (n[2] + n[5] + n[8]);
  return sum % 10 === 0;
}

/** IBAN check (ISO 13616): country letters, check digits and the mod-97 test. */
export function isValidIban(text: string) {
  const iban = compactIban(text);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const moved = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of moved) {
    const value = ch >= 'A' && ch <= 'Z' ? String(ch.charCodeAt(0) - 55) : ch;
    for (const digit of value) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

export function isValidBic(text: string) {
  return /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(text.trim().toUpperCase());
}

export type BankErrors = Partial<Record<keyof BankForm, string>>;

/** Problems with what was typed, by box. Empty when it's all fine. */
export function validateBankForm(set: BankFieldSet, form: BankForm): BankErrors {
  const errors: BankErrors = {};
  if (!form.accountName.trim()) errors.accountName = 'Enter the account name.';
  const branch = digitsOnly(form.branchCode);
  const account = digitsOnly(form.accountNumber);
  switch (set) {
    case 'AU':
      if (branch.length !== 6) errors.branchCode = 'A BSB has 6 digits, e.g. 062-000.';
      if (account.length < 5 || account.length > 9) errors.accountNumber = 'Enter your account number (5 to 9 digits).';
      break;
    case 'US':
      if (!isValidRoutingNumber(form.branchCode)) errors.branchCode = 'Enter a valid 9-digit routing number.';
      if (account.length < 4 || account.length > 17) errors.accountNumber = 'Enter your account number (4 to 17 digits).';
      if (!form.accountType) errors.accountType = 'Choose checking or savings.';
      break;
    case 'GB':
      if (branch.length !== 6) errors.branchCode = 'A sort code has 6 digits, e.g. 12-34-56.';
      if (account.length !== 8) errors.accountNumber = 'A UK account number has 8 digits.';
      break;
    case 'EU':
      if (!isValidIban(form.iban)) errors.iban = 'That IBAN doesn’t look right. Check it against your bank app.';
      if (form.bic.trim() && !isValidBic(form.bic)) errors.bic = 'A BIC has 8 or 11 letters and numbers.';
      break;
    default:
      if (!form.accountNumber.trim()) errors.accountNumber = 'Enter your account number.';
  }
  return errors;
}

/** What gets saved (encrypted) for the bank details just typed. */
export function bankFormToColumns(set: BankFieldSet, form: BankForm) {
  const eu = set === 'EU';
  const other = set === 'OTHER';
  return {
    bank_country: set,
    account_name: form.accountName.trim(),
    // BSB / routing number / sort code, stored as digits (other countries: as typed).
    bsb: eu ? '' : other ? form.branchCode.trim() : digitsOnly(form.branchCode),
    account_number: eu ? '' : other ? form.accountNumber.trim() : digitsOnly(form.accountNumber),
    account_type: set === 'US' ? form.accountType : '',
    iban: eu ? compactIban(form.iban) : '',
    bic: eu ? form.bic.trim().toUpperCase() : '',
  };
}

/** Saved details, as decrypted for payroll. */
export type SavedBankRow = {
  bank_country: string | null;
  account_name: string | null;
  bsb: string | null;
  account_number: string | null;
  account_type: string | null;
  iban: string | null;
  bic: string | null;
};

/**
 * Turns saved details into the pay run format, or explains what's wrong.
 * Details saved before countries existed have no bank country and are Australian.
 */
export function payeeBankFromSaved(
  set: BankFieldSet,
  row: SavedBankRow | null,
): { bank: PayeeBank; problem: null } | { bank: null; problem: string } {
  if (!row || !(row.account_name || row.account_number || row.iban)) {
    return { bank: null, problem: 'No bank details added' };
  }
  const savedSet = row.bank_country ?? 'AU';
  if (savedSet !== set) return { bank: null, problem: 'Bank details are for a different country' };
  const form: BankForm = {
    accountName: row.account_name ?? '',
    branchCode: row.bsb ?? '',
    accountNumber: row.account_number ?? '',
    accountType: row.account_type === 'checking' || row.account_type === 'savings' ? row.account_type : '',
    iban: row.iban ?? '',
    bic: row.bic ?? '',
  };
  const errors = validateBankForm(set, form);
  const first = Object.values(errors)[0];
  if (first) return { bank: null, problem: first.replace(/^Enter (your|the) /, 'Missing ').replace(/\.$/, '') };
  const branch = digitsOnly(form.branchCode);
  const account = digitsOnly(form.accountNumber);
  switch (set) {
    case 'AU':
      return { bank: { accountName: form.accountName, bsb: branch, accountNumber: account }, problem: null };
    case 'US':
      return {
        bank: { accountName: form.accountName, routingNumber: branch, accountNumber: account, accountType: form.accountType || undefined },
        problem: null,
      };
    case 'GB':
      return { bank: { accountName: form.accountName, sortCode: branch, accountNumber: account }, problem: null };
    case 'EU':
      return { bank: { accountName: form.accountName, iban: compactIban(form.iban), bic: form.bic || undefined }, problem: null };
    default:
      return { bank: { accountName: form.accountName, accountNumber: form.accountNumber }, problem: null };
  }
}

/** e.g. "BSB 062-000 · Account ••••5678" for showing saved details to the owner or employee. */
export function describeBank(set: BankFieldSet, row: SavedBankRow) {
  const last4 = (text: string | null) => `••••${(text ?? '').slice(-4)}`;
  switch (set) {
    case 'US':
      return `Routing ${row.bsb ?? '—'} · ${row.account_type === 'savings' ? 'Savings' : 'Checking'} ${last4(row.account_number)}`;
    case 'GB':
      return `Sort code ${formatSortCode(row.bsb ?? '')} · Account ${last4(row.account_number)}`;
    case 'EU':
      return `IBAN ${last4(row.iban)}`;
    case 'AU':
      return `BSB ${formatBsb(row.bsb ?? '')} · Account ${last4(row.account_number)}`;
    default:
      return `Account ${last4(row.account_number)}`;
  }
}
