// NexGain Hospitality's bank categories and the cafe preview. FAKE data only.
import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

/* eslint-disable import/first */
import { buildHospitalitySample } from '@/systems/hospitality/data/bank-sample';
import { matchPayouts, moneyInQuestions, payoutText } from '@/systems/hospitality/data/money';

import { HOSPITALITY_SCHEME, schemeForSystem, SERVICE_SCHEME, sortTransaction } from '../../../../../supabase/functions/_shared/ai/sorting';
/* eslint-enable import/first */

const ctx = { learned: new Map<string, string>(), contractorNames: [], history: [] };
const sort = (amount: number, description: string, merchant: string | null = null) =>
  sortTransaction({ amount, description, merchant, bankCategory: null, date: '2026-12-01' }, ctx, HOSPITALITY_SCHEME);

describe('hospitality categories', () => {
  it('uses the hospitality scheme only for hospitality businesses', () => {
    expect(schemeForSystem('hospitality')).toBe(HOSPITALITY_SCHEME);
    expect(schemeForSystem('service')).toBe(SERVICE_SCHEME);
    expect(schemeForSystem('bookings')).toBe(SERVICE_SCHEME);
  });

  it('sorts money in: card/till payouts, delivery apps, cash, and asks about the rest', () => {
    expect(sort(1180, 'SQUARE AUSTRALIA PTY LTD SQ SETTLEMENT').category).toBe('Card / till sales');
    expect(sort(980, 'TYRO PAYMENTS SETTLEMENT').category).toBe('Card / till sales');
    expect(sort(400, 'UBER EATS AUSTRALIA PAYMENT').category).toBe('Delivery apps');
    expect(sort(320, 'MENULOG PTY LTD').category).toBe('Delivery apps');
    expect(sort(640, 'CASH DEPOSIT BRANCH 112').category).toBe('Cash deposits');
    const unknown = sort(500, 'DIRECT DEBIT 087123 M PATEL');
    expect(unknown.category).toBe('Other income');
    expect(unknown.confidence).toBeLessThan(0.6);
  });

  it('sorts money out into food categories', () => {
    expect(sort(-820, 'BIDFOOD BRISBANE 4401').category).toBe('Food & Supplies');
    expect(sort(-412.5, 'CAMPOS COFFEE PTY LTD').category).toBe('Food & Supplies');
    expect(sort(-264, 'COCA-COLA EUROPACIFIC').category).toBe('Drinks');
    expect(sort(-318.6, 'BIOPAK PTY LTD').category).toBe('Packaging');
    expect(sort(-142, 'ECOLAB PTY LTD').category).toBe('Cleaning');
    expect(sort(-684.2, 'ORIGIN ENERGY 8812 ELECTRICITY').category).toBe('Utilities');
    expect(sort(-5200, 'RENT - GREEN PROPERTY GROUP').category).toBe('Rent');
    expect(sort(-4200, 'PAYROLL WAGES WEEKLY').category).toBe('Wages');
  });

  it('leaves the service system as it was', () => {
    const service = sortTransaction({ amount: 1000, description: 'SQUARE SETTLEMENT', merchant: null, bankCategory: null, date: '2026-12-01' }, ctx, SERVICE_SCHEME);
    expect(service.category).toBe('Income');
  });
});

describe('the cafe preview', () => {
  const now = new Date(2026, 11, 12, 10);
  const sample = buildHospitalitySample(now);
  const sorted = sample.transactions.map((t) => {
    if (t.categorySource === 'owner') return t;
    const s = sortTransaction({ amount: t.amount, description: t.description, merchant: t.merchant, bankCategory: null, date: t.date }, ctx, HOSPITALITY_SCHEME);
    return { ...t, category: s.category, confidence: s.confidence };
  });

  it('never mentions jobs or quotes', () => {
    // Everything the owner reads: bank descriptions, payees, customers and invoice lines.
    const shown = [
      ...sample.transactions.map((t) => `${t.description} ${t.merchant ?? ''}`),
      ...sample.invoices.map((d) => `${d.client.name} ${d.client.business ?? ''} ${d.description} ${d.items.map((i) => i.description).join(' ')}`),
    ].join(' ');
    expect(shown.toLowerCase()).not.toMatch(/\bjobs?\b|quote/);
  });

  it("matches yesterday's Square payout to the sales two days ago", () => {
    const yesterday = sorted.find((t) => t.amount === 1180)!;
    const match = matchPayouts(sorted, sample.daySales).get(yesterday.id) ?? null;
    expect(match?.salesTotal).toBe(1214);
    expect(match?.fees).toBe(34);
    expect(payoutText('Square', 1180, match)).toContain('matches');
  });

  it('asks which $1,000 invoice, about the deposit, and what the $500 was for', () => {
    const q = moneyInQuestions(sorted, sample.invoices, now);
    const thousand = q.find((x) => x.txn.amount === 1000);
    expect(thousand?.kind).toBe('hosp-invoice');
    // Two unpaid $1,000 invoices, nothing chosen for the owner.
    expect(thousand?.kind === 'hosp-invoice' && thousand.candidates.map((c) => c.invoice.number)).toEqual(['INV-0002', 'INV-0003']);
    const deposit = q.find((x) => x.txn.amount === 600);
    expect(deposit?.kind === 'hosp-invoice' && deposit.candidates[0]).toMatchObject({ part: 'deposit' });
    expect(q.find((x) => x.txn.amount === 500)?.kind).toBe('hosp-income');
    // The paid invoice's payment isn't asked about again.
    expect(q.some((x) => x.txn.invoiceId === 'sample-inv-0001')).toBe(false);
  });
});
