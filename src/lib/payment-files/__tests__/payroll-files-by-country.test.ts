// Every payroll bank file, made for FAKE test businesses with FAKE employees
// and FAKE bank details (no real accounts), checked against each format's rules:
// record lengths, header/footer records, field positions, dates, and that the
// totals and counts match the pay run. New Zealand check totals are tested
// against the worked examples in each bank's own guide.
import { describe, expect, it } from '@jest/globals';

import {
  bankFieldSetFor,
  buildPaymentFile,
  EMPTY_PAYER,
  getPayrollFileFormat,
  payeeBankFromSaved,
  validateBankForm,
  validatePayer,
  EMPTY_BANK_FORM,
  type PayeeBank,
  type PayerSettings,
  type PaymentRun,
} from '..';
import { formatNzAccount, nzHashTotal, parseNzAccount } from '../nz';

const records = (content: string) => {
  expect(content.endsWith('\r\n')).toBe(true);
  return content.split('\r\n').slice(0, -1);
};
const at = (r: string, from: number, to: number) => r.slice(from - 1, to);

/** Three fake employees' net pay, as the payroll page shows it ($720.00 + $1,234.56 + $99.99). */
const NET = [720.0, 1234.56, 99.99];
const NET_CENTS = NET.map((n) => Math.round(n * 100));
const TOTAL_CENTS = NET_CENTS.reduce((a, b) => a + b, 0); // 205455

function fakeRun(banks: PayeeBank[]): PaymentRun {
  return {
    payrollNumber: 7,
    payDate: '2026-11-14',
    createdAt: new Date(2026, 10, 13, 9, 5),
    businessName: 'Fake Test Plumbing, Ltd',
    lines: banks.map((bank, i) => ({ employeeId: `e${i}`, employeeName: `Fake Person ${i + 1}`, amountCents: NET_CENTS[i], bank })),
  };
}

function build(country: string, bank: string | undefined, payer: PayerSettings, banks: PayeeBank[]) {
  const format = getPayrollFileFormat({ country }, bank);
  if (!format.ok) throw new Error(format.message);
  expect(validatePayer(format.type, payer)).toEqual({});
  return { format, file: buildPaymentFile(format.type, fakeRun(banks), payer) };
}

describe('Australia (ABA)', () => {
  const payer = { ...EMPTY_PAYER, country: 'AU', accountName: 'Fake Test Plumbing', bankCode: '000-001', accountNumber: '11111111', bankShortName: 'TST', userIdNumber: '123456' };
  const banks = [1, 2, 3].map((n) => ({ accountName: `Fake Person ${n}`, bsb: `000-00${n}`, accountNumber: `2222222${n}` }));
  it('has a header, one line each, a footer and matching totals', () => {
    const { format, file } = build('AU', undefined, payer, banks);
    expect(format.code).toBe('AU');
    const r = records(file.content);
    expect(r.every((x) => x.length === 120)).toBe(true);
    expect(r.map((x) => x[0]).join('')).toBe('01117');
    expect(at(r[0], 75, 80)).toBe('141126'); // DDMMYY
    expect(r.slice(1, 4).map((x) => Number(at(x, 21, 30)))).toEqual(NET_CENTS);
    expect(Number(at(r[4], 31, 40))).toBe(TOTAL_CENTS);
    expect(Number(at(r[4], 75, 80))).toBe(3);
  });
});

describe('United States (NACHA)', () => {
  const payer = { ...EMPTY_PAYER, country: 'US', accountName: 'Fake Test Plumbing LLC', bankCode: '021000021', companyId: '1123456789', bankName: 'Fake Bank' };
  const banks = [1, 2, 3].map((n) => ({ accountName: `Fake Person ${n}`, routingNumber: '011000015', accountNumber: `99999${n}`, accountType: 'checking' as const }));
  it('has 94-character records in blocks of 10 and matching totals', () => {
    const { file } = build('US', undefined, payer, banks);
    const r = records(file.content);
    expect(r.every((x) => x.length === 94)).toBe(true);
    expect(r.length % 10).toBe(0);
    expect(r.map((x) => x[0]).slice(0, 7).join('')).toBe('1566689');
    expect(r.slice(2, 5).map((x) => Number(at(x, 30, 39)))).toEqual(NET_CENTS);
    expect(Number(at(r[6], 44, 55))).toBe(TOTAL_CENTS); // file control credits
    expect(Number(at(r[6], 14, 21))).toBe(3);
  });
});

describe('United Kingdom (Bacs Standard 18)', () => {
  const payer = { ...EMPTY_PAYER, country: 'GB', accountName: 'Fake Test Plumbing Ltd', bankCode: '00-00-01', accountNumber: '11111111' };
  const banks = [1, 2, 3].map((n) => ({ accountName: `Fake Person ${n}`, sortCode: `00-00-0${n}`, accountNumber: `2222222${n}` }));
  it('has a 100-character credit each and a contra for the total', () => {
    const { file } = build('GB', undefined, payer, banks);
    const r = records(file.content);
    expect(r.every((x) => x.length === 100)).toBe(true);
    expect(r.slice(0, 3).map((x) => at(x, 16, 17))).toEqual(['99', '99', '99']);
    expect(r.slice(0, 3).map((x) => Number(at(x, 36, 46)))).toEqual(NET_CENTS);
    expect(at(r[3], 16, 17)).toBe('17');
    expect(Number(at(r[3], 36, 46))).toBe(TOTAL_CENTS);
  });
});

// ---------------------------------------------------------------------------
// New Zealand
// ---------------------------------------------------------------------------

describe('New Zealand account numbers', () => {
  it('reads 15- and 16-digit numbers and formats them', () => {
    expect(parseNzAccount('12-3456-1234567-00')).toEqual({ bank: '12', branch: '3456', base: '1234567', suffix: '000' });
    expect(parseNzAccount('12-3456-1234567-025')?.suffix).toBe('025');
    expect(parseNzAccount('12-3456-123456')).toBeNull();
    expect(formatNzAccount('1234561234567000')).toBe('12-3456-1234567-000');
  });

  it('works out check totals exactly like the banks’ own examples', () => {
    const acc = (t: string) => parseNzAccount(t)!;
    // BNZ guide, control record examples. (The guide prints the first as 06930134459, a typo:
    // 05730067170 + 01200066289 = 06930133459. Its second example matches exactly.)
    expect(nzHashTotal([acc('0205730067170000'), acc('0201200066289000')])).toBe('06930133459');
    expect(nzHashTotal([acc('0217450124580000'), acc('0282840066289000')])).toBe('00290190869');
    // ANZ domestic extended format sample.
    expect(
      nzHashTotal([acc('01-0123-0456789-00'), acc('06-0475-0123456-02'), acc('03-0321-0987654-30'), acc('11-6100-1234567-040')]),
    ).toBe('70192802466');
    // ASB guide, Appendix A.
    expect(nzHashTotal([acc('121234123456700'), acc('124321765432100')])).toBe('55558888888');
  });

  it('employees enter one full account number', () => {
    expect(bankFieldSetFor('NZ')).toBe('NZ');
    expect(validateBankForm('NZ', { ...EMPTY_BANK_FORM, accountName: 'A', accountNumber: '01-0001-0000001-00' })).toEqual({});
    expect(Object.keys(validateBankForm('NZ', { ...EMPTY_BANK_FORM, accountName: 'A', accountNumber: '01-0001' }))).toEqual(['accountNumber']);
    const saved = { bank_country: 'NZ', account_name: 'Fake', bsb: '', account_number: '010001000000100', account_type: null, iban: null, bic: null };
    expect(payeeBankFromSaved('NZ', saved).bank).toEqual({ accountName: 'Fake', nzAccount: '0100010000001000' });
    // Typed in before NexGain had NZ boxes (saved as "other country").
    const old = { ...saved, bank_country: 'OTHER', bsb: '01-0001', account_number: '0000001-00' };
    expect(payeeBankFromSaved('NZ', old).bank).toEqual({ accountName: 'Fake', nzAccount: '0100010000001000' });
  });
});

const nzBanks = [1, 2, 3].map((n) => ({ accountName: `Fake Person ${n}`, nzAccount: `03-0001-000000${n}-00` }));
const nzPayer = (account: string) => ({ ...EMPTY_PAYER, country: 'NZ', accountName: 'Fake Test Plumbing Ltd', accountNumber: account });

describe('New Zealand: BNZ', () => {
  it('has a header, a payroll line each and a control record with matching totals', () => {
    const { format, file } = build('NZ', 'BNZ', nzPayer('02-0001-0000009-00'), nzBanks);
    expect(file.extension).toBe('txt');
    expect(format.code).toBe('NZ');
    const r = records(file.content).map((x) => x.split(','));
    expect(r[0]).toEqual(['1', '', '', '', '0200010000009000', '7', '261114', '261113', '']);
    const tx = r.slice(1, 4);
    expect(tx.every((f) => f.length === 13 && f[0] === '2' && f[2] === '52')).toBe(true);
    expect(tx.map((f) => Number(f[3]))).toEqual(NET_CENTS);
    expect(tx[0][9]).toBe('Fake Test Plumbing L'); // commas removed, cut to BNZ's 20 characters
    expect(r[4]).toEqual(['3', String(TOTAL_CENTS), '3', nzHashTotal(nzBanks.map((b) => parseNzAccount(b.nzAccount)!))]);
    expect(records(file.content).every((x) => !/ ,|, /.test(x))).toBe(true); // no stray spaces next to commas
  });

  it('must be paid from a BNZ account', () => {
    expect(validatePayer('nz_bnz', nzPayer('12-0001-0000009-00')).accountNumber).toMatch(/BNZ/);
  });
});

describe('New Zealand: ANZ', () => {
  it('uses the domestic extended layout with matching totals', () => {
    const { file } = build('NZ', 'ANZ', nzPayer('01-0001-0000009-00'), nzBanks);
    expect(file.extension).toBe('csv');
    const r = records(file.content).map((x) => x.split(','));
    expect(r[0]).toEqual(['1', '', '', '', '', '', '20261114', '20261113', '']);
    expect(r.slice(1, 4).every((f) => f.length === 13 && f[0] === '2' && f[2] === '50' && f[5] && f[6])).toBe(true);
    expect(r.slice(1, 4).map((f) => Number(f[3]))).toEqual(NET_CENTS);
    expect(r[4].slice(0, 3)).toEqual(['3', String(TOTAL_CENTS), '3']);
  });
});

describe('New Zealand: ASB (MT9)', () => {
  it('has 160-character header, detail and trailer records in the right places', () => {
    const { file } = build('NZ', 'ASB', nzPayer('12-3141-0000009-00'), nzBanks);
    const r = records(file.content);
    expect(r).toHaveLength(5);
    expect(r.every((x) => x.length === 160)).toBe(true);
    // Header: file type 12, payer 12-3141-0000009, suffix "00 ", due date CCYYMMDD + 5 spaces.
    expect(at(r[0], 1, 2)).toBe('12');
    expect(at(r[0], 3, 15)).toBe('1231410000009');
    expect(at(r[0], 16, 18)).toBe('00 ');
    expect(at(r[0], 19, 31)).toBe('20261114     ');
    // Details: record 13, suffix 000, code 052, amount in cents.
    const d = r.slice(1, 4);
    expect(d.every((x) => at(x, 1, 2) === '13' && at(x, 16, 18) === '000' && at(x, 19, 21) === '052')).toBe(true);
    expect(d.map((x) => Number(at(x, 22, 31)))).toEqual(NET_CENTS);
    // Trailer: 13 99, check total, 6 spaces, total amount.
    expect(at(r[4], 1, 4)).toBe('1399');
    expect(at(r[4], 5, 15)).toBe(nzHashTotal(nzBanks.map((b) => parseNzAccount(b.nzAccount)!)));
    expect(Number(at(r[4], 22, 31))).toBe(TOTAL_CENTS);
  });
});

describe('New Zealand: Westpac and Kiwibank', () => {
  it('get a friendly message instead of a broken file', () => {
    for (const bank of ['WESTPAC', 'KIWIBANK']) {
      const f = getPayrollFileFormat({ country: 'NZ' }, bank);
      expect(f.ok).toBe(false);
      if (!f.ok) expect(f.message).toMatch(/Mark as paid/);
    }
  });
});
