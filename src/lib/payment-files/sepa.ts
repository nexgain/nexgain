// Eurozone: SEPA Credit Transfer file, ISO 20022 pain.001.001.03, following
// the EPC Customer-to-Bank Implementation Guidelines (the version all
// eurozone banks accept). One payment batch, category purpose SALA (salary).
import { compactIban, isValidBic, isValidIban } from './bank-details';
import {
  PaymentFileError,
  payrollDigits,
  payrollReference,
  stripAccents,
  type PayerSettings,
  type PaymentFile,
  type PaymentRun,
} from './types';

/** The SEPA (Latin) character set: a-z A-Z 0-9 / - ? : ( ) . , ' + and space. */
function sepaText(text: string, max: number) {
  return stripAccents(text)
    .replace(/[^A-Za-z0-9/\-?:().,'+ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function xml(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** 12345 -> "123.45" */
export function euros(cents: number) {
  if (!Number.isInteger(cents) || cents <= 0) throw new PaymentFileError('Amounts must be whole cents.');
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

/** Local date and time without a timezone, e.g. "2026-10-08T09:30:00". */
function isoDateTime(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function agent(bic: string | undefined) {
  return bic && isValidBic(bic)
    ? `<FinInstnId><BIC>${bic.toUpperCase()}</BIC></FinInstnId>`
    : '<FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId>';
}

export function buildSepa(run: PaymentRun, payer: PayerSettings): PaymentFile {
  if (run.lines.length === 0) throw new PaymentFileError('There is no one to pay in this pay run.');
  const debtorIban = compactIban(payer.iban);
  if (!isValidIban(debtorIban)) throw new PaymentFileError('Your IBAN is not valid.');

  const digits = payrollDigits(run.payrollNumber);
  const stamp = isoDateTime(run.createdAt);
  // Unique per file (max 35): the payroll number and when the file was made.
  const msgId = sepaText(`PAYROLL${digits}-${stamp.replace(/\D/g, '')}`, 35);
  const total = run.lines.reduce((sum, l) => sum + l.amountCents, 0);
  const debtorName = sepaText(run.businessName || payer.accountName, 70);

  const transactions = run.lines.map((line, i) => {
    const iban = compactIban(line.bank.iban ?? '');
    if (!isValidIban(iban)) throw new PaymentFileError(`${line.employeeName}’s IBAN is not valid.`);
    const creditorAgent = line.bank.bic && isValidBic(line.bank.bic) ? `<CdtrAgt>${agent(line.bank.bic)}</CdtrAgt>` : '';
    return [
      '<CdtTrfTxInf>',
      `<PmtId><EndToEndId>${xml(sepaText(`PAYROLL${digits}-${i + 1}`, 35))}</EndToEndId></PmtId>`,
      `<Amt><InstdAmt Ccy="EUR">${euros(line.amountCents)}</InstdAmt></Amt>`,
      creditorAgent,
      `<Cdtr><Nm>${xml(sepaText(line.bank.accountName, 70))}</Nm></Cdtr>`,
      `<CdtrAcct><Id><IBAN>${iban}</IBAN></Id></CdtrAcct>`,
      '<Purp><Cd>SALA</Cd></Purp>',
      `<RmtInf><Ustrd>${xml(payrollReference(run.payrollNumber))}</Ustrd></RmtInf>`,
      '</CdtTrfTxInf>',
    ]
      .filter(Boolean)
      .join('\n');
  });

  const content = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
    '<CstmrCdtTrfInitn>',
    '<GrpHdr>',
    `<MsgId>${xml(msgId)}</MsgId>`,
    `<CreDtTm>${stamp}</CreDtTm>`,
    `<NbOfTxs>${run.lines.length}</NbOfTxs>`,
    `<CtrlSum>${euros(total)}</CtrlSum>`,
    `<InitgPty><Nm>${xml(debtorName)}</Nm></InitgPty>`,
    '</GrpHdr>',
    '<PmtInf>',
    `<PmtInfId>${xml(sepaText(`PAYROLL${digits}`, 35))}</PmtInfId>`,
    '<PmtMtd>TRF</PmtMtd>',
    '<BtchBookg>true</BtchBookg>',
    `<NbOfTxs>${run.lines.length}</NbOfTxs>`,
    `<CtrlSum>${euros(total)}</CtrlSum>`,
    '<PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl><CtgyPurp><Cd>SALA</Cd></CtgyPurp></PmtTpInf>',
    `<ReqdExctnDt>${run.payDate}</ReqdExctnDt>`,
    `<Dbtr><Nm>${xml(debtorName)}</Nm></Dbtr>`,
    `<DbtrAcct><Id><IBAN>${debtorIban}</IBAN></Id></DbtrAcct>`,
    `<DbtrAgt>${agent(payer.bic)}</DbtrAgt>`,
    '<ChrgBr>SLEV</ChrgBr>',
    ...transactions,
    '</PmtInf>',
    '</CstmrCdtTrfInitn>',
    '</Document>',
    '',
  ].join('\n');

  return { fileType: 'sepa', extension: 'xml', mimeType: 'application/xml', content };
}
