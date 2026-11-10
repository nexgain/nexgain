// New Zealand: each bank has its own bulk payment file. Built only from each
// bank's published layout:
//   BNZ  Internet Banking for Business "Payment file format guide" (10-24),
//        Payroll file format: header 1, transactions 2 (code 52), control 3.
//   ANZ  "Domestic extended format" (anz.co.nz payment upload file types):
//        header 1, transactions 2 (code 50), control 3.
//   ASB  FastNet Business File Formats Technical Guide, "MT9 File Format for
//        Importing Standard Bulk Payments": 160-character header, detail
//        records (code 052 = salary/wages) and trailer.
// Westpac and Kiwibank don't publish theirs, so NexGain doesn't make them.
//
// NZ account numbers: bank (2) - branch (4) - account (7) - suffix (2 or 3),
// e.g. 12-3456-1234567-00. Files use the 16-digit form (3-digit suffix).
import {
  digitsOnly,
  padLeft,
  padRight,
  PaymentFileError,
  payrollReference,
  stripAccents,
  type PayerSettings,
  type PaymentFile,
  type PaymentLine,
  type PaymentRun,
} from './types';

export type NzAccount = { bank: string; branch: string; base: string; suffix: string };

/** Splits a 15- or 16-digit NZ account number, or null if it isn't one. */
export function parseNzAccount(text: string | undefined): NzAccount | null {
  const d = digitsOnly(text);
  if (d.length !== 15 && d.length !== 16) return null;
  return { bank: d.slice(0, 2), branch: d.slice(2, 6), base: d.slice(6, 13), suffix: d.slice(13).padStart(3, '0') };
}

/** The 16-digit form banks' files use, e.g. "1234561234567000". */
export const nzAccount16 = (a: NzAccount) => `${a.bank}${a.branch}${a.base}${a.suffix}`;

/** "1234561234567000" -> "12-3456-1234567-000" while typing. */
export function formatNzAccount(text: string) {
  const d = digitsOnly(text).slice(0, 16);
  return [d.slice(0, 2), d.slice(2, 6), d.slice(6, 13), d.slice(13)].filter(Boolean).join('-');
}

/**
 * The check total all three banks use: add up branch + account (11 digits) of
 * every payment, keep the right-most 11 digits, zero-filled.
 */
export function nzHashTotal(accounts: NzAccount[]) {
  // Keeping only the last 11 digits as we go gives the same answer and never overflows.
  const sum = accounts.reduce((total, a) => (total + Number(`${a.branch}${a.base}`)) % 1e11, 0);
  return padLeft(String(sum), 11, '0');
}

/** Letters, digits and the punctuation the banks allow; never commas (they split the fields). */
function nzText(text: string, max: number) {
  return stripAccents(text)
    .replace(/[^A-Za-z0-9 \-'&/#?:_.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim();
}

function payeeAccount(line: PaymentLine) {
  const a = parseNzAccount(line.bank.nzAccount);
  if (!a) throw new PaymentFileError(`${line.employeeName}’s account number isn’t a full NZ account number.`);
  return a;
}

function payerAccount(payer: PayerSettings, bankName: string, bankCode?: string) {
  const a = parseNzAccount(payer.accountNumber);
  if (!a) throw new PaymentFileError('Your account number isn’t a full NZ account number (e.g. 12-3456-1234567-00).');
  if (bankCode && a.bank !== bankCode) throw new PaymentFileError(`Wages must be paid from your ${bankName} account (it starts with ${bankCode}).`);
  return a;
}

function cents(amount: number, width: number, who: string) {
  if (!Number.isInteger(amount) || amount <= 0) throw new PaymentFileError(`${who} has nothing to pay.`);
  const text = String(amount);
  if (text.length > width) throw new PaymentFileError('An amount is too large for this bank file.');
  return text;
}

const yymmdd = (key: string) => key.slice(2, 4) + key.slice(5, 7) + key.slice(8, 10);
const yyyymmdd = (key: string) => key.replace(/-/g, '');
const localKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const total = (run: PaymentRun) => run.lines.reduce((sum, l) => sum + l.amountCents, 0);
const lines = (records: string[]) => records.map((r) => `${r}\r\n`).join('');

function start(run: PaymentRun) {
  if (run.lines.length === 0) throw new PaymentFileError('There is no one to pay in this pay run.');
  return { reference: payrollReference(run.payrollNumber), from: nzText(run.businessName, 20) };
}

/** BNZ payroll file (comma separated, .txt). Kiwibank isn't included: it doesn't publish a format. */
export function buildBnz(run: PaymentRun, payer: PayerSettings): PaymentFile {
  const { reference, from } = start(run);
  const fromAccount = payerAccount(payer, 'BNZ', '02');
  const accounts = run.lines.map(payeeAccount);
  const header = ['1', '', '', '', nzAccount16(fromAccount), '7', yymmdd(run.payDate), yymmdd(localKey(run.createdAt)), ''].join(',');
  const transactions = run.lines.map((line, i) =>
    [
      '2',
      nzAccount16(accounts[i]),
      '52', // payroll
      cents(line.amountCents, 12, line.employeeName),
      nzText(line.bank.accountName || line.employeeName, 20),
      reference, // other party reference (on the employee's statement)
      '', // other party code
      '', // alpha reference (unused)
      'WAGES', // other party particulars
      from || nzText(payer.accountName, 20),
      '', // your code
      reference, // your reference
      'WAGES', // your particulars
    ].join(','),
  );
  const control = ['3', String(total(run)), String(run.lines.length), nzHashTotal(accounts)].join(',');
  return { fileType: 'nz_bnz', extension: 'txt', mimeType: 'text/plain', content: lines([header, ...transactions, control]) };
}

/** ANZ domestic extended format (comma separated, .csv). */
export function buildAnz(run: PaymentRun, payer: PayerSettings): PaymentFile {
  const { reference, from } = start(run);
  const accounts = run.lines.map(payeeAccount);
  if (run.lines.length > 99999) throw new PaymentFileError('Too many payments for one ANZ file.');
  const header = ['1', '', '', '', '', '', yyyymmdd(run.payDate), yyyymmdd(localKey(run.createdAt)), ''].join(',');
  const transactions = run.lines.map((line, i) =>
    [
      '2',
      nzAccount16(accounts[i]),
      '50', // standard credit (the only code ANZ lists)
      cents(line.amountCents, 11, line.employeeName),
      nzText(line.bank.accountName || line.employeeName, 20),
      reference, // other party reference
      'WAGES', // other party analysis code
      '', // alpha reference (not used)
      'WAGES', // other party particulars
      from || nzText(payer.accountName, 20),
      'WAGES', // subscriber analysis code
      reference, // subscriber reference
      '', // subscriber particulars
    ].join(','),
  );
  const sum = String(total(run));
  if (sum.length > 11) throw new PaymentFileError('This pay run is too large for one ANZ file.');
  const control = ['3', sum, String(run.lines.length), nzHashTotal(accounts)].join(',');
  return { fileType: 'nz_anz', extension: 'csv', mimeType: 'text/csv', content: lines([header, ...transactions, control]) };
}

export const MT9_RECORD_LENGTH = 160;

/** ASB-allowed characters for MT9 text fields, padded to the exact width. */
function mt9Text(text: string, width: number) {
  const clean = stripAccents(text)
    .replace(/[^A-Za-z0-9 ()*+\-=?[\]_{}~/&,.']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return padRight(clean, width);
}

/** ASB MT9 standard bulk payment (fixed width, 160 characters a line, .txt). */
export function buildAsbMt9(run: PaymentRun, payer: PayerSettings): PaymentFile {
  const { reference } = start(run);
  const fromAccount = payerAccount(payer, 'ASB', '12');
  if (fromAccount.suffix[0] !== '0') throw new PaymentFileError('ASB account suffixes have 2 digits. Check your account number.');
  const accounts = run.lines.map(payeeAccount);
  const header =
    '12' +
    fromAccount.bank +
    fromAccount.branch +
    fromAccount.base +
    fromAccount.suffix.slice(1) + ' ' + // 2-digit suffix padded right with a space
    yyyymmdd(run.payDate) + ' '.repeat(5) + // due date CCYYMMDD
    mt9Text(run.businessName || payer.accountName, 20) +
    ' '.repeat(109);
  const details = run.lines.map((line, i) => {
    const a = accounts[i];
    return (
      '13' +
      a.bank +
      a.branch +
      a.base +
      a.suffix + // 3 characters, 2-digit suffixes padded left with 0
      '052' + // salary / wages
      padLeft(cents(line.amountCents, 10, line.employeeName), 10, '0') +
      mt9Text(line.bank.accountName || line.employeeName, 20) +
      mt9Text(reference, 12) + // internal reference
      mt9Text('WAGES', 12) + // payee code
      mt9Text(reference, 12) + // payee reference
      mt9Text('WAGES', 12) + // payee particulars
      ' ' +
      mt9Text(run.businessName || payer.accountName, 20) +
      mt9Text('WAGES', 12) + // payer code
      mt9Text(reference, 12) + // payer reference
      mt9Text('WAGES', 12) + // payer particulars
      ' '.repeat(4)
    );
  });
  const sum = String(total(run));
  if (sum.length > 10) throw new PaymentFileError('This pay run is too large for one ASB file.');
  const trailer = '13' + '99' + nzHashTotal(accounts) + ' '.repeat(6) + padLeft(sum, 10, '0') + ' '.repeat(129);
  const records = [header, ...details, trailer];
  for (const r of records) {
    if (r.length !== MT9_RECORD_LENGTH) throw new PaymentFileError('Internal error: an ASB record is the wrong length.');
  }
  return { fileType: 'nz_asb', extension: 'txt', mimeType: 'text/plain', content: lines(records) };
}
