// Australia: ABA ("Cemtex" / Direct Entry) file, as set out in the APCA
// (now AusPayNet) BECS Procedures, Appendix C. Every record is exactly 120
// characters and ends with CR LF.
//   0  Descriptive record (one, first)
//   1  Detail record (one per employee, code 53 = pay; optional balancing
//      line with code 13 that takes the total from the business's account)
//   7  File total record (one, last)
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

export const ABA_RECORD_LENGTH = 120;

/** Only these characters are allowed in an ABA file (BECS character set). */
function abaText(text: string) {
  return stripAccents(text)
    .replace(/[^A-Za-z0-9 &'()*+,\-./]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "062000" -> "062-000" */
function bsbField(bsb: string) {
  const d = digitsOnly(bsb);
  if (d.length !== 6) throw new PaymentFileError(`A BSB must have 6 digits (got "${d.length}" digits).`);
  return `${d.slice(0, 3)}-${d.slice(3)}`;
}

function accountField(account: string) {
  const d = digitsOnly(account);
  if (d.length < 1 || d.length > 9) throw new PaymentFileError('ABA account numbers can have at most 9 digits.');
  return padLeft(d, 9);
}

/** "2026-10-08" -> "081026" (DDMMYY) */
function abaDate(dateKey: string) {
  const [y, m, d] = dateKey.split('-');
  return `${d}${m}${y.slice(2)}`;
}

function cents(amount: number, width: number) {
  if (!Number.isInteger(amount) || amount < 0) throw new PaymentFileError('Amounts must be whole cents.');
  const text = String(amount);
  if (text.length > width) throw new PaymentFileError('An amount is too large for an ABA file.');
  return padLeft(text, width, '0');
}

function detail(opts: {
  bsb: string;
  account: string;
  code: '53' | '13';
  amount: number;
  title: string;
  reference: string;
  traceBsb: string;
  traceAccount: string;
  remitter: string;
}) {
  return (
    '1' +
    bsbField(opts.bsb) +
    accountField(opts.account) +
    ' ' + // indicator: blank for a new item
    opts.code +
    cents(opts.amount, 10) +
    padRight(abaText(opts.title), 32) +
    padRight(abaText(opts.reference), 18) +
    bsbField(opts.traceBsb) +
    accountField(opts.traceAccount) +
    padRight(abaText(opts.remitter), 16) +
    '00000000' // withholding tax
  );
}

export function buildAba(run: PaymentRun, payer: PayerSettings): PaymentFile {
  if (run.lines.length === 0) throw new PaymentFileError('There is no one to pay in this pay run.');
  const userId = digitsOnly(payer.userIdNumber);
  if (userId.length === 0 || userId.length > 6) throw new PaymentFileError('The APCA user ID must be up to 6 digits.');
  const bankCode = abaText(payer.bankShortName).toUpperCase();
  if (!/^[A-Z]{3}$/.test(bankCode)) throw new PaymentFileError('The bank code must be 3 letters, e.g. CBA.');

  const reference = payrollReference(run.payrollNumber); // "PAYROLL 001" (18 allowed)
  const remitter = run.businessName || payer.accountName;

  const header =
    '0' +
    ' '.repeat(17) +
    '01' + // reel sequence number
    bankCode +
    ' '.repeat(7) +
    padRight(abaText(payer.accountName).toUpperCase(), 26) +
    padLeft(userId, 6, '0') +
    padRight(reference, 12) + // description of entries
    abaDate(run.payDate) +
    ' '.repeat(40);

  const details = run.lines.map((line) => {
    if (line.amountCents <= 0) throw new PaymentFileError(`${line.employeeName} has nothing to pay.`);
    return detail({
      bsb: line.bank.bsb ?? '',
      account: line.bank.accountNumber ?? '',
      code: '53',
      amount: line.amountCents,
      title: line.bank.accountName,
      reference,
      traceBsb: payer.bankCode,
      traceAccount: payer.accountNumber,
      remitter,
    });
  });

  const credit = run.lines.reduce((sum, l) => sum + l.amountCents, 0);
  let debit = 0;
  if (payer.abaBalancing) {
    debit = credit;
    details.push(
      detail({
        bsb: payer.bankCode,
        account: payer.accountNumber,
        code: '13',
        amount: credit,
        title: payer.accountName,
        reference,
        traceBsb: payer.bankCode,
        traceAccount: payer.accountNumber,
        remitter,
      }),
    );
  }

  const trailer =
    '7' +
    '999-999' +
    ' '.repeat(12) +
    cents(Math.abs(credit - debit), 10) +
    cents(credit, 10) +
    cents(debit, 10) +
    ' '.repeat(24) +
    padLeft(String(details.length), 6, '0') +
    ' '.repeat(40);

  const records = [header, ...details, trailer];
  for (const r of records) {
    if (r.length !== ABA_RECORD_LENGTH) throw new PaymentFileError('Internal error: an ABA record is the wrong length.');
  }
  return {
    fileType: 'aba',
    extension: 'aba',
    mimeType: 'text/plain',
    content: records.map((r) => `${r}\r\n`).join(''),
  };
}
