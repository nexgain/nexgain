// The Transactions page's AI sorting, invoice matching and job suggestions, on the sample bank feed.
import { describe, expect, it, jest } from '@jest/globals';
import { buildSampleBank } from '@/data/bank-sample';
import { bankPreviewStore, chooseCategory, reviewItems, startBankPreview, stopBankPreview } from '@/data/money-sorting';

import {
  groupOf,
  matchPayment,
  merchantKey,
  REVIEW_BELOW,
  sortTransaction,
  suburbOf,
  suggestJob,
  travelCosts,
  type SortContext,
} from '../../../supabase/functions/_shared/ai/sorting';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const NOW = new Date(2026, 10, 9); // Mon 9 Nov 2026
const sample = buildSampleBank(NOW);
const ctx: SortContext = {
  learned: new Map(),
  contractorNames: sample.contractorNames,
  history: sample.transactions.filter((t) => t.amount < 0),
};
const sortOf = (description: string) => {
  const t = sample.transactions.find((x) => x.description === description)!;
  return sortTransaction(t, ctx);
};

describe('sorting bank transactions', () => {
  it('uses rules for shops it knows', () => {
    expect(sortOf('BUNNINGS 6342 CAPALABA')).toMatchObject({ category: 'Materials & supplies', method: 'rule' });
    expect(sortOf('AMPOL CAPALABA 4157')).toMatchObject({ category: 'Fuel', method: 'rule' });
    expect(sortOf('TMR REGO RENEWAL ONLINE').category).toBe('Vehicle');
  });

  it('treats money in as income and own-account moves as transfers', () => {
    expect(sortOf('OSKO DEPOSIT M PATEL').category).toBe('Income');
    expect(sortOf('TRANSFER TO SAVINGS 9921').category).toBe('Transfers');
  });

  it('knows payments to contractors are labour', () => {
    const s = sortOf('OSKO PAYMENT MIA CHEN');
    expect(s.category).toBe('Wages & super');
    expect(groupOf(s.category)).toBe('labour');
  });

  it('is unsure about unclear payments (they go to Needs review)', () => {
    expect(sortOf('JS ENTERPRISES PTY LTD').confidence).toBeLessThan(REVIEW_BELOW);
  });

  it('remembers the owner’s choice for a merchant', () => {
    const t = sample.transactions.find((x) => x.description === 'JS ENTERPRISES PTY LTD')!;
    const learned = new Map([[merchantKey(t), 'Materials & supplies']]);
    expect(sortTransaction(t, { ...ctx, learned })).toMatchObject({ category: 'Materials & supplies', method: 'learned', confidence: 1 });
  });
});

describe('matching payments to invoices', () => {
  const income = (description: string) => sample.transactions.find((x) => x.description === description)!;

  it('finds one clear match by reference', () => {
    const m = matchPayment(income('OSKO DEPOSIT T NGUYEN REF INV-2003'), sample.invoices);
    expect(m.kind).toBe('one');
    if (m.kind === 'one') expect(m.invoice.number).toBe('INV-2003');
  });

  it('asks when two invoices have the same amount and name', () => {
    const m = matchPayment(income('DIRECT CREDIT J SMITH'), sample.invoices);
    expect(m.kind).toBe('several');
    if (m.kind === 'several') expect(m.invoices.map((i) => i.number).sort()).toEqual(['INV-2001', 'INV-2002']);
  });

  it('leaves unmatched income alone', () => {
    expect(matchPayment(income('OSKO DEPOSIT M PATEL'), sample.invoices).kind).toBe('none');
  });
});

describe('linking expenses to jobs', () => {
  it('suggests the Smith deck job for Bunnings the day before', () => {
    const bunnings = sample.transactions.find((x) => x.description === 'BUNNINGS 6342 CAPALABA' && x.amount === -380)!;
    expect(suggestJob({ ...bunnings, category: 'Materials & supplies' }, sample.jobs)?.label).toBe('Smith deck');
  });

  it('doesn’t suggest a job for wages', () => {
    expect(suggestJob({ amount: -1890, date: sample.jobs[0]!.date, category: 'Wages & super' }, sample.jobs)).toBeNull();
  });
});

describe('travel costs', () => {
  it('reads the suburb from an address', () => {
    expect(suburbOf('12 Smith St, Ipswich QLD 4305')).toBe('Ipswich');
    expect(suburbOf('')).toBeNull();
  });

  it('adds up fuel bought near jobs', () => {
    const fuel = sample.transactions.filter((t) => sortTransaction(t, ctx).category === 'Fuel');
    const [top] = travelCosts(fuel, sample.jobs);
    expect(top).toMatchObject({ suburb: 'Ipswich', jobs: 2 });
    expect(Math.round(top!.fuel)).toBe(120);
  });
});

describe('the sample preview', () => {
  it('asks the right questions in Needs review', async () => {
    startBankPreview();
    const p = bankPreviewStore.get()!;
    const feed = { preview: true, connected: true, ...p, linkExpensesToJobs: true };
    const items = reviewItems(feed);
    const kinds = items.map((i) => `${i.kind}:${i.txn.description}`);
    expect(kinds).toEqual(
      expect.arrayContaining([
        'invoice:DIRECT CREDIT J SMITH',
        'income:OSKO DEPOSIT M PATEL',
        'category:JS ENTERPRISES PTY LTD',
        'job:BUNNINGS 6342 CAPALABA',
      ]),
    );
    // The clear match was linked straight away, so it isn't a question.
    expect(kinds.some((k) => k.includes('T NGUYEN'))).toBe(false);
    expect(p.transactions.find((t) => t.description.includes('T NGUYEN'))?.invoiceId).toBe('sample-inv-2003');

    // Answering a category takes it off the list (memory only).
    const js = p.transactions.find((t) => t.description === 'JS ENTERPRISES PTY LTD')!;
    await chooseCategory(js.id, 'Materials & supplies');
    const after = reviewItems({ ...feed, ...bankPreviewStore.get()! });
    expect(after.some((i) => i.kind === 'category' && i.txn.id === js.id)).toBe(false);
    stopBankPreview();
  });
});
