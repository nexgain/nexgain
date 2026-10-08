// United Kingdom: Bacs Standard 18 payment records. Each record is exactly
// 100 characters, CR LF line endings: one credit (transaction code 99) per
// employee, then one contra record (code 17) that takes the total from the
// business's own account.
//
// Field positions (Bacs Standard 18 data record):
//   1-6   destination sort code        36-46  amount in pence
//   7-14  destination account number   47-64  originator name / narrative
//   15    account type ("0")           65-82  reference (shown to the employee)
//   16-17 transaction code             83-100 destination account name
//   18-23 originating sort code
//   24-31 originating account number
//   32-35 free format (blank)
//
// Banks that take Standard 18 uploads (Bankline, Lloyds, Barclays, etc.) add
// their own VOL1/HDR1/UHL1 header labels, so this file has data records only.
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

export const BACS_RECORD_LENGTH = 100;

/** Bacs allows uppercase A-Z, 0-9, space and . & / - only. */
function bacsText(text: string) {
  return stripAccents(text)
    .toUpperCase()
    .replace(/[^A-Z0-9 .&/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sortCode(text: string, who: string) {
  const d = digitsOnly(text);
  if (d.length !== 6) throw new PaymentFileError(`${who}’s sort code must have 6 digits.`);
  return d;
}

function account(text: string, who: string) {
  const d = digitsOnly(text);
  if (d.length !== 8) throw new PaymentFileError(`${who}’s account number must have 8 digits.`);
  return d;
}

function pence(amount: number) {
  if (!Number.isInteger(amount) || amount <= 0) throw new PaymentFileError('Amounts must be whole pence.');
  const text = String(amount);
  if (text.length > 11) throw new PaymentFileError('An amount is too large for a Bacs file.');
  return padLeft(text, 11, '0');
}

export function buildBacs18(run: PaymentRun, payer: PayerSettings): PaymentFile {
  if (run.lines.length === 0) throw new PaymentFileError('There is no one to pay in this pay run.');
  const fromSort = sortCode(payer.bankCode, 'Your');
  const fromAccount = account(payer.accountNumber, 'Your');
  const reference = payrollReference(run.payrollNumber); // "PAYROLL 001" (18 allowed)
  const originator = bacsText(run.businessName || payer.accountName);

  const credits = run.lines.map(
    (line) =>
      sortCode(line.bank.sortCode ?? '', line.employeeName) +
      account(line.bank.accountNumber ?? '', line.employeeName) +
      '0' +
      '99' +
      fromSort +
      fromAccount +
      '    ' +
      pence(line.amountCents) +
      padRight(originator, 18) +
      padRight(reference, 18) +
      padRight(bacsText(line.bank.accountName), 18),
  );

  const total = run.lines.reduce((sum, l) => sum + l.amountCents, 0);
  const contra =
    fromSort +
    fromAccount +
    '0' +
    '17' +
    fromSort +
    fromAccount +
    '    ' +
    pence(total) +
    padRight(reference, 18) +
    padRight('CONTRA', 18) +
    padRight(bacsText(payer.accountName), 18);

  const records = [...credits, contra];
  for (const r of records) {
    if (r.length !== BACS_RECORD_LENGTH) throw new PaymentFileError('Internal error: a Bacs record is the wrong length.');
  }
  return {
    fileType: 'bacs18',
    extension: 'txt',
    mimeType: 'text/plain',
    content: records.map((r) => `${r}\r\n`).join(''),
  };
}
