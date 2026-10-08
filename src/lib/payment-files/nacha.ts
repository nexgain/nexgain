// United States: NACHA (ACH) file, as set out in the Nacha Operating Rules,
// Appendix Three. Every record is exactly 94 characters, CR LF line endings,
// padded with "9" records to a multiple of 10 lines (blocking factor 10).
//   1  File Header
//   5  Batch Header (service class 220 = credits only, SEC code PPD)
//   6  Entry Detail (one per employee: 22 = checking credit, 32 = savings credit)
//   8  Batch Control
//   9  File Control
import {
  digitsOnly,
  padLeft,
  padRight,
  PaymentFileError,
  payrollReference,
  stripAccents,
  type PayerSettings,
  type PaymentFile,
  type PaymentRun,
} from './types';
import { isValidRoutingNumber } from './bank-details';

export const NACHA_RECORD_LENGTH = 94;
export const NACHA_BLOCKING_FACTOR = 10;

/** Uppercase letters, digits and basic punctuation only. */
function achText(text: string) {
  return stripAccents(text)
    .toUpperCase()
    .replace(/[^A-Z0-9 &'()*+,\-./]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function amountField(cents: number, width: number) {
  if (!Number.isInteger(cents) || cents < 0) throw new PaymentFileError('Amounts must be whole cents.');
  const text = String(cents);
  if (text.length > width) throw new PaymentFileError('An amount is too large for a NACHA file.');
  return padLeft(text, width, '0');
}

/** "2026-10-08" -> "261008" */
function yymmdd(dateKey: string) {
  const [y, m, d] = dateKey.split('-');
  return `${y.slice(2)}${m}${d}`;
}

function two(n: number) {
  return String(n).padStart(2, '0');
}

export function buildNacha(run: PaymentRun, payer: PayerSettings): PaymentFile {
  if (run.lines.length === 0) throw new PaymentFileError('There is no one to pay in this pay run.');
  const odfi = digitsOnly(payer.bankCode);
  if (!isValidRoutingNumber(odfi)) throw new PaymentFileError('Your bank’s routing number is not valid.');
  const companyId = achText(payer.companyId).replace(/ /g, '');
  if (!companyId || companyId.length > 10) throw new PaymentFileError('The Company ID must be 1 to 10 characters.');

  const created = run.createdAt;
  const createdDate = `${two(created.getFullYear() % 100)}${two(created.getMonth() + 1)}${two(created.getDate())}`;
  const createdTime = `${two(created.getHours())}${two(created.getMinutes())}`;
  const companyName = achText(run.businessName || payer.accountName);
  const reference = payrollReference(run.payrollNumber, true); // "PAYROLL001"
  const odfi8 = odfi.slice(0, 8);
  const batchNumber = '0000001';

  const fileHeader =
    '1' +
    '01' + // priority code
    ' ' + odfi + // immediate destination: your bank's routing number
    padLeft(companyId, 10) + // immediate origin
    createdDate +
    createdTime +
    'A' + // file ID modifier
    '094' + // record size
    '10' + // blocking factor
    '1' + // format code
    padRight(achText(payer.bankName), 23) +
    padRight(companyName, 23) +
    padRight('', 8); // reference code (optional)

  const batchHeader =
    '5' +
    '220' + // credits only
    padRight(companyName, 16) +
    padRight(payrollReference(run.payrollNumber), 20) + // company discretionary data
    padRight(companyId, 10) +
    'PPD' +
    // Nacha rules (from March 2026) say wage payments must use exactly
    // "PAYROLL" here, so the payroll number goes in the company
    // discretionary data above and in each entry's identification number.
    padRight('PAYROLL', 10) + // company entry description
    yymmdd(run.payDate) + // company descriptive date
    yymmdd(run.payDate) + // effective entry date
    '   ' + // settlement date (the ACH operator fills this in)
    '1' + // originator status code
    odfi8 +
    batchNumber;

  let entryHash = 0;
  const entries = run.lines.map((line, i) => {
    if (line.amountCents <= 0) throw new PaymentFileError(`${line.employeeName} has nothing to pay.`);
    const routing = digitsOnly(line.bank.routingNumber);
    if (!isValidRoutingNumber(routing)) throw new PaymentFileError(`${line.employeeName}’s routing number is not valid.`);
    const account = digitsOnly(line.bank.accountNumber);
    if (account.length < 1 || account.length > 17) throw new PaymentFileError(`${line.employeeName}’s account number is not valid.`);
    entryHash += Number(routing.slice(0, 8));
    return (
      '6' +
      (line.bank.accountType === 'savings' ? '32' : '22') +
      routing.slice(0, 8) +
      routing[8] + // check digit
      padRight(account, 17) +
      amountField(line.amountCents, 10) +
      padRight(reference, 15) + // individual identification number
      padRight(achText(line.bank.accountName), 22) +
      '  ' + // discretionary data
      '0' + // no addenda
      odfi8 +
      padLeft(String(i + 1), 7, '0') // trace number
    );
  });

  const hash = padLeft(String(entryHash).slice(-10), 10, '0');
  const credit = run.lines.reduce((sum, l) => sum + l.amountCents, 0);

  const batchControl =
    '8' +
    '220' +
    padLeft(String(entries.length), 6, '0') +
    hash +
    amountField(0, 12) + // total debits
    amountField(credit, 12) + // total credits
    padRight(companyId, 10) +
    ' '.repeat(19) + // message authentication code
    ' '.repeat(6) + // reserved
    odfi8 +
    batchNumber;

  const recordCount = 1 + 1 + entries.length + 1 + 1;
  const blockCount = Math.ceil(recordCount / NACHA_BLOCKING_FACTOR);

  const fileControl =
    '9' +
    padLeft('1', 6, '0') + // batch count
    padLeft(String(blockCount), 6, '0') +
    padLeft(String(entries.length), 8, '0') +
    hash +
    amountField(0, 12) +
    amountField(credit, 12) +
    ' '.repeat(39);

  const records = [fileHeader, batchHeader, ...entries, batchControl, fileControl];
  while (records.length % NACHA_BLOCKING_FACTOR !== 0) records.push('9'.repeat(NACHA_RECORD_LENGTH));
  for (const r of records) {
    if (r.length !== NACHA_RECORD_LENGTH) throw new PaymentFileError('Internal error: a NACHA record is the wrong length.');
  }
  return {
    fileType: 'nacha',
    extension: 'txt',
    mimeType: 'text/plain',
    content: records.map((r) => `${r}\r\n`).join(''),
  };
}
