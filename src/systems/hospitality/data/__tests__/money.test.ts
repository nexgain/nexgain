// NexGain Hospitality money in: card payouts -> daily sales, payments ->
// invoices (always asked), and the questions and insights. FAKE data only.
import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

/* eslint-disable import/first */
import type { SalesDoc } from '@/data/invoices';
import { hospitalityStatus, invoiceAmounts } from '@/systems/hospitality/data/invoice-status';
import {
  incomeQuestionText,
  invoiceCandidates,
  matchPayouts,
  moneyInQuestions,
  moneyInsights,
  oneInvoiceQuestion,
  payoutText,
  type MoneyIn,
} from '@/systems/hospitality/data/money';
/* eslint-enable import/first */

const txn = (id: string, date: string, amount: number, category: string, description = 'PAYMENT'): MoneyIn => ({
  id,
  date,
  amount,
  category,
  merchant: null,
  description,
  invoiceId: null,
  invoiceReviewDone: false,
  categorySource: 'auto',
  categoryReviewDone: false,
  confidence: category === 'Other income' ? 0.4 : 0.95,
});

/** A fake invoice: no GST, so the total is simply qty x rate. */
const invoice = (id: string, number: string, total: number, extra: Partial<SalesDoc> = {}): SalesDoc => ({
  id,
  kind: 'invoice',
  number,
  status: 'Pending',
  client: { name: 'Sam Smith', email: 'sam@example.com', phone: '', address: '', business: 'Smith Co' },
  jobType: null,
  jobDate: null,
  description: '',
  items: [{ id: 'l1', description: 'Catering', qty: 1, rate: total }],
  dueDate: '2026-12-10',
  paymentReference: '',
  gstRate: 0,
  createdAt: '2026-12-01T00:00:00.000Z',
  ...extra,
});

const TODAY = new Date(2026, 11, 12, 10); // Sat 12 Dec 2026

describe('card payouts and daily sales', () => {
  // Tue 8 Dec $1,214 of sales; the Square payout of $1,180 arrives Wed 9 Dec.
  const days = new Map([
    ['2026-12-08', 1214],
    ['2026-12-09', 900],
  ]);

  it('matches a payout to the day before, with the fees taken out', () => {
    const m = matchPayouts([txn('p1', '2026-12-09', 1180, 'Card / till sales')], days);
    expect(m.get('p1')).toEqual({ days: ['2026-12-08'], salesTotal: 1214, fees: 34 });
    expect(payoutText('Square', 1180, m.get('p1')!)).toBe('Square payout $1,180.00 matches Tuesday’s sales of $1,214.00 (fees about $34.00).');
  });

  it('matches a Monday payout to the whole weekend', () => {
    const weekend = new Map([
      ['2026-12-04', 500],
      ['2026-12-05', 800],
      ['2026-12-06', 700],
    ]);
    const m = matchPayouts([txn('p2', '2026-12-07', 1960, 'Card / till sales')], weekend);
    expect(m.get('p2')?.days).toEqual(['2026-12-04', '2026-12-05', '2026-12-06']);
  });

  it("doesn't match when the fees would be more than 5%, or the payout is more than the sales", () => {
    expect(matchPayouts([txn('p3', '2026-12-09', 1000, 'Card / till sales')], days).size).toBe(0);
    expect(matchPayouts([txn('p4', '2026-12-09', 1300, 'Card / till sales')], days).size).toBe(0);
  });

  it('uses each day of sales only once', () => {
    const m = matchPayouts([txn('a', '2026-12-09', 1180, 'Card / till sales'), txn('b', '2026-12-10', 1180, 'Card / till sales')], days);
    expect(m.get('a')?.days).toEqual(['2026-12-08']);
    expect(m.get('b')).toBeUndefined();
  });
});

describe('payments and invoices (never decided without the owner)', () => {
  it('finds the one invoice with exactly that amount owing', () => {
    const c = invoiceCandidates(txn('t', '2026-12-12', 1000, 'Other income'), [invoice('i4', 'INV-0004', 1000), invoice('i5', 'INV-0005', 450)], TODAY);
    expect(c.map((x) => x.invoice.number)).toEqual(['INV-0004']);
    expect(oneInvoiceQuestion({ amount: 1000, date: '2026-12-12' }, c[0])).toBe('We got $1,000.00 on 12 Dec. Is this payment for INV-0004, Smith Co ($1,000.00, due 10 Dec)?');
  });

  it('lists every invoice with the same amount, the one the reference names first', () => {
    const docs = [
      invoice('a', 'INV-0004', 1000, { client: { name: 'Jo Brown', email: '', phone: '', address: '', business: '' } }),
      invoice('b', 'INV-0007', 1000, { client: { name: 'Lee Green', email: '', phone: '', address: '', business: '' } }),
    ];
    const plain = invoiceCandidates(txn('t', '2026-12-12', 1000, 'Other income', 'DIRECT CREDIT'), docs, TODAY);
    expect(plain.map((x) => x.invoice.number)).toEqual(['INV-0004', 'INV-0007']);
    expect(plain.every((x) => x.why === null)).toBe(true);

    const named = invoiceCandidates(txn('t', '2026-12-12', 1000, 'Other income', 'DIRECT CREDIT INV-0007 GREEN'), docs, TODAY);
    expect(named[0].invoice.number).toBe('INV-0007');
    expect(named[0].why).toBe('The reference says INV-0007');
  });

  it('asks about a deposit that matches exactly', () => {
    const doc = invoice('d', 'INV-0009', 2000, { hospitality: { deposit: 500, depositPaid: false, depositPaidAt: null, paidMethod: null } });
    const c = invoiceCandidates(txn('t', '2026-12-12', 500, 'Other income'), [doc], TODAY);
    expect(c[0].part).toBe('deposit');
    expect(oneInvoiceQuestion({ amount: 500, date: '2026-12-12' }, c[0])).toBe('We got $500.00 on 12 Dec. Is this the deposit for INV-0009, Smith Co?');
  });

  it('a paid deposit lowers what is owing', () => {
    const doc = invoice('d', 'INV-0009', 2000, { hospitality: { deposit: 500, depositPaid: true, depositPaidAt: null, paidMethod: null } });
    expect(invoiceAmounts(doc).owing).toBe(1500);
    expect(invoiceCandidates(txn('t', '2026-12-12', 1500, 'Other income'), [doc], TODAY)).toHaveLength(1);
  });

  it('ignores paid and cancelled invoices', () => {
    const docs = [invoice('p', 'INV-0001', 1000, { status: 'Paid' }), invoice('c', 'INV-0002', 1000, { status: 'Cancelled' as SalesDoc['status'] })];
    expect(invoiceCandidates(txn('t', '2026-12-12', 1000, 'Other income'), docs, TODAY)).toEqual([]);
  });
});

describe('questions about money in', () => {
  const docs = [invoice('i4', 'INV-0004', 1000)];

  it('never matches card or delivery payouts to invoices', () => {
    const q = moneyInQuestions([txn('sq', '2026-12-11', 1000, 'Card / till sales'), txn('ue', '2026-12-11', 1000, 'Delivery apps')], docs, TODAY);
    expect(q).toEqual([]);
  });

  it('asks about the invoice when the amount matches, and "what was this for?" otherwise', () => {
    const q = moneyInQuestions([txn('a', '2026-12-12', 1000, 'Other income'), txn('b', '2026-12-11', 500, 'Other income', 'DIRECT DEBIT')], docs, TODAY);
    expect(q.map((x) => x.kind)).toEqual(['hosp-invoice', 'hosp-income']);
    expect(incomeQuestionText({ amount: 500, description: 'DIRECT DEBIT', merchant: null })).toBe('We got $500.00 by direct debit. What was this for?');
  });

  it('only asks about invoices when there are unpaid ones', () => {
    const q = moneyInQuestions([txn('a', '2026-12-12', 1000, 'Other income')], [], TODAY);
    expect(q.map((x) => x.kind)).toEqual(['hosp-income']);
  });

  it("doesn't ask about money the owner already sorted", () => {
    const sorted = { ...txn('a', '2026-12-12', 300, 'Cash deposits'), categorySource: 'owner' as const };
    expect(moneyInQuestions([sorted], [], TODAY)).toEqual([]);
  });
});

describe('invoice status', () => {
  it('is overdue automatically the day after the due date', () => {
    expect(hospitalityStatus({ status: 'Pending', dueDate: '2026-12-12' }, TODAY)).toBe('Unpaid');
    expect(hospitalityStatus({ status: 'Pending', dueDate: '2026-12-11' }, TODAY)).toBe('Overdue');
    expect(hospitalityStatus({ status: 'Draft', dueDate: '2026-12-20' }, TODAY)).toBe('Unpaid');
    expect(hospitalityStatus({ status: 'Paid', dueDate: '2026-12-01' }, TODAY)).toBe('Paid');
  });
});

describe('insights', () => {
  it('shows delivery share, card fees and overdue invoices', () => {
    const days = new Map([['2026-12-08', 1214]]);
    const txns = [txn('sq', '2026-12-09', 1180, 'Card / till sales'), txn('ue', '2026-12-07', 395, 'Delivery apps')];
    const docs = [invoice('o', 'INV-0003', 1450, { dueDate: '2026-12-01' })];
    const text = moneyInsights(txns, days, docs, TODAY).map((i) => i.text);
    expect(text).toContain('Delivery apps made up 25% of income this month ($395.00).');
    expect(text).toContain('Card fees cost you about $34.00 this month.');
    expect(text).toContain('You have 1 overdue invoice totalling $1,450.00.');
  });
});
