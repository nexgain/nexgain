import { describe, expect, it } from '@jest/globals';

import {
  buildPaymentFile,
  EMPTY_PAYER,
  isValidIban,
  isValidRoutingNumber,
  paymentFileName,
  paymentFileTypeFor,
  payeeBankFromSaved,
  pickPaymentFileBuilder,
  payrollLabel,
  payrollReference,
  validateBankForm,
  EMPTY_BANK_FORM,
  type PaymentLine,
  type PaymentRun,
  type PayerSettings,
} from '..';
import { buildAba } from '../aba';
import { buildBacs18 } from '../bacs';
import { buildNacha } from '../nacha';
import { buildSepa } from '../sepa';

const lines = (content: string) => content.split('\r\n').slice(0, -1);

function run(payrollNumber: number, payees: PaymentLine[]): PaymentRun {
  return {
    payrollNumber,
    payDate: '2026-10-09',
    createdAt: new Date(2026, 9, 8, 14, 5, 30),
    businessName: 'Nexgain Test Cleaning Co',
    lines: payees,
  };
}

// ---------------------------------------------------------------------------
// Australia: ABA
// ---------------------------------------------------------------------------

const auPayer: PayerSettings = {
  ...EMPTY_PAYER,
  country: 'AU',
  accountName: 'Nexgain Test Cleaning',
  bankCode: '062-000',
  accountNumber: '12345678',
  bankShortName: 'CBA',
  userIdNumber: '301500',
};

const auPayees: PaymentLine[] = [
  { employeeId: 'a', employeeName: 'Emma Testworker', amountCents: 72000, bank: { accountName: 'Emma Testworker', bsb: '082-001', accountNumber: '987654321' } },
  { employeeId: 'b', employeeName: 'José Müller', amountCents: 123456, bank: { accountName: 'José Müller', bsb: '033000', accountNumber: '4455' } },
];

describe('ABA (Australia)', () => {
  const file = buildAba(run(1, auPayees), auPayer);
  const recs = lines(file.content);

  it('has 120-character records ending in CR LF', () => {
    expect(file.content.endsWith('\r\n')).toBe(true);
    for (const r of recs) expect(r).toHaveLength(120);
    expect(recs.map((r) => r[0])).toEqual(['0', '1', '1', '7']);
  });

  it('fills the descriptive record correctly', () => {
    const h = recs[0];
    expect(h.slice(18, 20)).toBe('01');
    expect(h.slice(20, 23)).toBe('CBA');
    expect(h.slice(30, 56)).toBe('NEXGAIN TEST CLEANING'.padEnd(26));
    expect(h.slice(56, 62)).toBe('301500');
    expect(h.slice(62, 74)).toBe('PAYROLL 001 ');
    expect(h.slice(74, 80)).toBe('091026');
  });

  it('fills each detail record, with the payroll number as the lodgement reference', () => {
    const d = recs[1];
    expect(d.slice(1, 8)).toBe('082-001');
    expect(d.slice(8, 17)).toBe('987654321');
    expect(d.slice(18, 20)).toBe('53');
    expect(d.slice(20, 30)).toBe('0000072000');
    expect(d.slice(30, 62)).toBe('Emma Testworker'.padEnd(32));
    expect(d.slice(62, 80)).toBe('PAYROLL 001'.padEnd(18));
    expect(d.slice(80, 87)).toBe('062-000');
    expect(d.slice(87, 96)).toBe(' 12345678');
    expect(d.slice(96, 112)).toBe('Nexgain Test Cle');
    expect(d.slice(112, 120)).toBe('00000000');
    // Accents are removed, short account numbers are right-justified.
    expect(recs[2].slice(30, 62).trim()).toBe('Jose Muller');
    expect(recs[2].slice(8, 17)).toBe('     4455');
  });

  it('totals and counts match', () => {
    const t = recs[3];
    expect(t.slice(1, 8)).toBe('999-999');
    expect(t.slice(20, 30)).toBe('0000195456'); // net
    expect(t.slice(30, 40)).toBe('0000195456'); // credits
    expect(t.slice(40, 50)).toBe('0000000000'); // debits
    expect(t.slice(74, 80)).toBe('000002');
  });

  it('adds a balancing debit when the bank needs one', () => {
    const recs2 = lines(buildAba(run(12, auPayees), { ...auPayer, abaBalancing: true }).content);
    expect(recs2).toHaveLength(5);
    const bal = recs2[3];
    expect(bal.slice(18, 20)).toBe('13');
    expect(bal.slice(20, 30)).toBe('0000195456');
    expect(bal.slice(62, 80).trim()).toBe('PAYROLL 012');
    const t = recs2[4];
    expect(t.slice(20, 30)).toBe('0000000000');
    expect(t.slice(30, 40)).toBe('0000195456');
    expect(t.slice(40, 50)).toBe('0000195456');
    expect(t.slice(74, 80)).toBe('000003');
  });

  it('rejects bad details instead of making a broken file', () => {
    expect(() => buildAba(run(1, [{ ...auPayees[0], bank: { accountName: 'X', bsb: '12', accountNumber: '1' } }]), auPayer)).toThrow();
    expect(() => buildAba(run(1, [{ ...auPayees[0], bank: { accountName: 'X', bsb: '082001', accountNumber: '1234567890' } }]), auPayer)).toThrow();
    expect(() => buildAba(run(1, []), auPayer)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// United States: NACHA
// ---------------------------------------------------------------------------

const usPayer: PayerSettings = {
  ...EMPTY_PAYER,
  country: 'US',
  accountName: 'Nexgain Test LLC',
  bankName: 'Test Bank',
  bankCode: '021000021',
  companyId: '1234567890',
};

const usPayees: PaymentLine[] = [
  { employeeId: 'a', employeeName: 'Ann', amountCents: 150025, bank: { accountName: 'Ann Lee', routingNumber: '011000015', accountNumber: '000123456789', accountType: 'checking' } },
  { employeeId: 'b', employeeName: 'Bob', amountCents: 99, bank: { accountName: 'Bob Ray', routingNumber: '021000021', accountNumber: '5555', accountType: 'savings' } },
];

describe('NACHA (United States)', () => {
  const file = buildNacha(run(7, usPayees), usPayer);
  const recs = lines(file.content);

  it('has 94-character records padded to a block of 10', () => {
    for (const r of recs) expect(r).toHaveLength(94);
    expect(recs.length % 10).toBe(0);
    expect(recs.map((r) => r[0]).join('')).toBe('1566899999');
    expect(recs[9]).toBe('9'.repeat(94));
  });

  it('fills the file and batch headers', () => {
    const fh = recs[0];
    expect(fh.slice(1, 3)).toBe('01');
    expect(fh.slice(3, 13)).toBe(' 021000021');
    expect(fh.slice(13, 23)).toBe('1234567890');
    expect(fh.slice(23, 29)).toBe('261008');
    expect(fh.slice(29, 33)).toBe('1405');
    expect(fh.slice(33, 40)).toBe('A094101');
    const bh = recs[1];
    expect(bh.slice(1, 4)).toBe('220');
    expect(bh.slice(4, 20)).toBe('NEXGAIN TEST CLE');
    expect(bh.slice(20, 40)).toBe('PAYROLL 007'.padEnd(20));
    expect(bh.slice(40, 50)).toBe('1234567890');
    expect(bh.slice(50, 53)).toBe('PPD');
    expect(bh.slice(53, 63)).toBe('PAYROLL   ');
    expect(bh.slice(69, 75)).toBe('261009');
    expect(bh.slice(78, 79)).toBe('1');
    expect(bh.slice(79, 87)).toBe('02100002');
    expect(bh.slice(87, 94)).toBe('0000001');
  });

  it('fills each entry, with the payroll number as the identification number', () => {
    const e1 = recs[2];
    expect(e1.slice(1, 3)).toBe('22');
    expect(e1.slice(3, 11)).toBe('01100001');
    expect(e1.slice(11, 12)).toBe('5');
    expect(e1.slice(12, 29)).toBe('000123456789     ');
    expect(e1.slice(29, 39)).toBe('0000150025');
    expect(e1.slice(39, 54)).toBe('PAYROLL007     ');
    expect(e1.slice(54, 76)).toBe('ANN LEE'.padEnd(22));
    expect(e1.slice(78, 79)).toBe('0');
    expect(e1.slice(79, 94)).toBe('021000020000001');
    expect(recs[3].slice(1, 3)).toBe('32');
    expect(recs[3].slice(79, 94)).toBe('021000020000002');
  });

  it('totals, counts and entry hash match', () => {
    const hash = String(1100001 + 2100002).padStart(10, '0');
    const bc = recs[4];
    expect(bc.slice(1, 4)).toBe('220');
    expect(bc.slice(4, 10)).toBe('000002');
    expect(bc.slice(10, 20)).toBe(hash);
    expect(bc.slice(20, 32)).toBe('000000000000');
    expect(bc.slice(32, 44)).toBe('000000150124');
    expect(bc.slice(44, 54)).toBe('1234567890');
    const fc = recs[5];
    expect(fc.slice(1, 7)).toBe('000001');
    expect(fc.slice(7, 13)).toBe('000001'); // 6 records -> 1 block
    expect(fc.slice(13, 21)).toBe('00000002');
    expect(fc.slice(21, 31)).toBe(hash);
    expect(fc.slice(43, 55)).toBe('000000150124');
  });

  it('counts blocks correctly when there are more than 10 records', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ ...usPayees[0], employeeId: String(i), amountCents: 100 + i }));
    const recs2 = lines(buildNacha(run(1, many), usPayer).content);
    expect(recs2).toHaveLength(20); // 16 records + 4 filler
    expect(recs2[15].slice(7, 13)).toBe('000002');
  });

  it('rejects a bad routing number', () => {
    expect(() => buildNacha(run(1, [{ ...usPayees[0], bank: { ...usPayees[0].bank, routingNumber: '123456789' } }]), usPayer)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// United Kingdom: Bacs Standard 18
// ---------------------------------------------------------------------------

const gbPayer: PayerSettings = { ...EMPTY_PAYER, country: 'GB', accountName: 'Nexgain Test Ltd', bankCode: '20-00-00', accountNumber: '55779911' };
const gbPayees: PaymentLine[] = [
  { employeeId: 'a', employeeName: 'Amy', amountCents: 100050, bank: { accountName: 'Amy O’Neil', sortCode: '40-11-62', accountNumber: '31926819' } },
  { employeeId: 'b', employeeName: 'Ben', amountCents: 25000, bank: { accountName: 'Ben Smith', sortCode: '601613', accountNumber: '12345678' } },
];

describe('Bacs Standard 18 (United Kingdom)', () => {
  const file = buildBacs18(run(3, gbPayees), gbPayer);
  const recs = lines(file.content);

  it('has 100-character records: one credit each plus a contra', () => {
    expect(recs).toHaveLength(3);
    for (const r of recs) expect(r).toHaveLength(100);
  });

  it('fills each credit, with the payroll number as the reference', () => {
    const c = recs[0];
    expect(c.slice(0, 6)).toBe('401162');
    expect(c.slice(6, 14)).toBe('31926819');
    expect(c.slice(14, 15)).toBe('0');
    expect(c.slice(15, 17)).toBe('99');
    expect(c.slice(17, 23)).toBe('200000');
    expect(c.slice(23, 31)).toBe('55779911');
    expect(c.slice(31, 35)).toBe('    ');
    expect(c.slice(35, 46)).toBe('00000100050');
    expect(c.slice(46, 64)).toBe('NEXGAIN TEST CLEAN');
    expect(c.slice(64, 82)).toBe('PAYROLL 003'.padEnd(18));
    expect(c.slice(82, 100)).toBe('AMY O NEIL'.padEnd(18));
  });

  it('the contra takes the total from the business account', () => {
    const k = recs[2];
    expect(k.slice(0, 14)).toBe('20000055779911');
    expect(k.slice(15, 17)).toBe('17');
    expect(k.slice(35, 46)).toBe('00000125050');
    expect(k.slice(46, 64).trim()).toBe('PAYROLL 003');
    expect(k.slice(64, 82).trim()).toBe('CONTRA');
  });

  it('rejects a 7-digit account number', () => {
    expect(() => buildBacs18(run(1, [{ ...gbPayees[0], bank: { ...gbPayees[0].bank, accountNumber: '1234567' } }]), gbPayer)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Eurozone: SEPA pain.001.001.03
// ---------------------------------------------------------------------------

const euPayer: PayerSettings = { ...EMPTY_PAYER, country: 'DE', accountName: 'Nexgain GmbH', iban: 'DE89 3704 0044 0532 0130 00', bic: 'COBADEFFXXX' };
const euPayees: PaymentLine[] = [
  { employeeId: 'a', employeeName: 'Zoë', amountCents: 210000, bank: { accountName: 'Zoë Dupont', iban: 'FR1420041010050500013M02606' } },
  { employeeId: 'b', employeeName: 'Jan', amountCents: 5, bank: { accountName: 'Jan de Vries & Zn', iban: 'NL91ABNA0417164300', bic: 'ABNANL2A' } },
];

describe('SEPA pain.001 (Eurozone)', () => {
  const xml = buildSepa(run(42, euPayees), euPayer).content;
  const count = (tag: string) => xml.split(`<${tag}>`).length - 1;

  it('uses the pain.001.001.03 schema with salary payments', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('urn:iso:std:iso:20022:tech:xsd:pain.001.001.03');
    expect(xml).toContain('<SvcLvl><Cd>SEPA</Cd></SvcLvl><CtgyPurp><Cd>SALA</Cd></CtgyPurp>');
    expect(xml).toContain('<ReqdExctnDt>2026-10-09</ReqdExctnDt>');
    expect(xml).toContain('<ChrgBr>SLEV</ChrgBr>');
  });

  it('counts and totals match in both places', () => {
    expect(count('CdtTrfTxInf')).toBe(2);
    expect(xml.match(/<NbOfTxs>2<\/NbOfTxs>/g)).toHaveLength(2);
    expect(xml.match(/<CtrlSum>2100\.05<\/CtrlSum>/g)).toHaveLength(2);
    expect(xml).toContain('<InstdAmt Ccy="EUR">2100.00</InstdAmt>');
    expect(xml).toContain('<InstdAmt Ccy="EUR">0.05</InstdAmt>');
  });

  it('puts the payroll number in the references', () => {
    expect(xml).toContain('<PmtInfId>PAYROLL042</PmtInfId>');
    expect(xml).toContain('<EndToEndId>PAYROLL042-1</EndToEndId>');
    expect(xml).toContain('<EndToEndId>PAYROLL042-2</EndToEndId>');
    expect(count('Ustrd')).toBe(2);
    expect(xml).toContain('<Ustrd>PAYROLL 042</Ustrd>');
    expect(xml).toMatch(/<MsgId>PAYROLL042-20261008140530<\/MsgId>/);
  });

  it('cleans names and accounts to the SEPA character set', () => {
    expect(xml).toContain('<Nm>Zoe Dupont</Nm>');
    expect(xml).toContain('<Nm>Jan de Vries Zn</Nm>');
    expect(xml).toContain('<IBAN>DE89370400440532013000</IBAN>');
    expect(xml).toContain('<CdtrAgt><FinInstnId><BIC>ABNANL2A</BIC></FinInstnId></CdtrAgt>');
    expect(count('CdtrAgt')).toBe(1); // no BIC given for the first payee
  });

  it('says NOTPROVIDED when the business has no BIC', () => {
    const noBic = buildSepa(run(1, euPayees), { ...euPayer, bic: '' }).content;
    expect(noBic).toContain('<DbtrAgt><FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId></DbtrAgt>');
  });

  it('rejects an IBAN with a typo', () => {
    expect(() => buildSepa(run(1, [{ ...euPayees[0], bank: { accountName: 'X', iban: 'FR1420041010050500013M02607' } }]), euPayer)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Picking the file, payroll numbers and bank details
// ---------------------------------------------------------------------------

describe('picking the right file for the country', () => {
  it('maps countries to file types', () => {
    expect(paymentFileTypeFor('AU')).toBe('aba');
    expect(paymentFileTypeFor('US')).toBe('nacha');
    expect(paymentFileTypeFor('GB')).toBe('bacs18');
    for (const c of ['DE', 'FR', 'IE', 'NL', 'BG', 'HR']) expect(paymentFileTypeFor(c)).toBe('sepa');
    for (const c of ['NZ', 'CA', 'SG', 'OTHER', null, undefined]) expect(paymentFileTypeFor(c)).toBeNull();
  });

  it('returns the matching builder, or null', () => {
    expect(pickPaymentFileBuilder('AU')).toBe(buildAba);
    expect(pickPaymentFileBuilder('US')).toBe(buildNacha);
    expect(pickPaymentFileBuilder('GB')).toBe(buildBacs18);
    expect(pickPaymentFileBuilder('FR')).toBe(buildSepa);
    expect(pickPaymentFileBuilder('NZ')).toBeNull();
    expect(buildPaymentFile('NZ', run(1, auPayees), auPayer)).toBeNull();
    expect(buildPaymentFile('AU', run(1, auPayees), auPayer)?.extension).toBe('aba');
  });
});

describe('payroll numbers', () => {
  it('formats as 3 digits, growing when needed', () => {
    expect(payrollLabel(1)).toBe('Payroll 001');
    expect(payrollReference(9)).toBe('PAYROLL 009');
    expect(payrollReference(10, true)).toBe('PAYROLL010');
    expect(payrollReference(1234, true)).toBe('PAYROLL1234');
  });

  it('names the file with business, payroll number and pay date', () => {
    expect(paymentFileName('Smith & Sons Cleaning!', 3, '2026-10-09', 'aba')).toBe('Smith-Sons-Cleaning_PAYROLL003_2026-10-09.aba');
  });
});

describe('bank details checks', () => {
  it('checks US routing numbers and IBANs', () => {
    expect(isValidRoutingNumber('021000021')).toBe(true);
    expect(isValidRoutingNumber('021000022')).toBe(false);
    expect(isValidIban('GB29 NWBK 6016 1331 9268 19')).toBe(true);
    expect(isValidIban('GB29 NWBK 6016 1331 9268 18')).toBe(false);
  });

  it('validates each country’s boxes', () => {
    expect(validateBankForm('AU', { ...EMPTY_BANK_FORM, accountName: 'A', branchCode: '062-000', accountNumber: '12345678' })).toEqual({});
    expect(Object.keys(validateBankForm('US', { ...EMPTY_BANK_FORM, accountName: 'A', branchCode: '021000021', accountNumber: '1234' }))).toEqual(['accountType']);
    expect(Object.keys(validateBankForm('GB', { ...EMPTY_BANK_FORM, accountName: 'A', branchCode: '12-34-56', accountNumber: '1234567' }))).toEqual(['accountNumber']);
    expect(validateBankForm('EU', { ...EMPTY_BANK_FORM, accountName: 'A', iban: 'NL91ABNA0417164300' })).toEqual({});
  });

  it('treats details saved before countries existed as Australian', () => {
    const saved = { bank_country: null, account_name: 'Emma', bsb: '082001', account_number: '987654321', account_type: null, iban: null, bic: null };
    expect(payeeBankFromSaved('AU', saved).bank).toEqual({ accountName: 'Emma', bsb: '082001', accountNumber: '987654321' });
    expect(payeeBankFromSaved('GB', saved).problem).toBe('Bank details are for a different country');
    expect(payeeBankFromSaved('AU', null).problem).toBe('No bank details added');
  });
});
