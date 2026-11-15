// AI transaction sorting: which transactions the AI reads, and how its answers
// are applied. Uses FAKE transactions only.
import { describe, expect, it, jest } from '@jest/globals';

import type { BankTransaction } from '@/data/bank';
import { applyAiUpdates, needsAiSorting } from '@/data/money-sorting';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const fakeTxn = (over: Partial<BankTransaction>): BankTransaction =>
  ({
    id: 't1',
    accountId: 'a1',
    date: '2026-11-10',
    description: 'EFTPOS JSMITH TRADING',
    amount: -45.5,
    merchant: null,
    category: 'Other',
    categorySource: 'auto',
    bankCategory: null,
    confidence: 0.3,
    categoryMethod: 'ai',
    jobId: null,
    invoiceId: null,
    invoiceMatchedBy: null,
    categoryReviewDone: false,
    jobReviewDone: false,
    invoiceReviewDone: false,
    ...over,
  }) as BankTransaction;

describe('which transactions the AI reads', () => {
  it('reads unsure money out from the quick sorting', () => {
    expect(needsAiSorting(fakeTxn({}))).toBe(true);
  });

  it('skips ones already sure, already read, chosen by the owner, reviewed, or money in', () => {
    expect(needsAiSorting(fakeTxn({ confidence: 0.9 }))).toBe(false);
    expect(needsAiSorting(fakeTxn({ categoryMethod: 'claude' }))).toBe(false);
    expect(needsAiSorting(fakeTxn({ categorySource: 'owner', categoryMethod: 'owner' }))).toBe(false);
    expect(needsAiSorting(fakeTxn({ categoryReviewDone: true }))).toBe(false);
    expect(needsAiSorting(fakeTxn({ amount: 120 }))).toBe(false);
    expect(needsAiSorting(fakeTxn({ categoryMethod: 'rule' }))).toBe(false);
  });
});

describe("applying the AI's answers", () => {
  it('uses the category when sure, and only marks it read when unsure', () => {
    const [sure, unsure, untouched] = applyAiUpdates(
      [fakeTxn({ id: 'a' }), fakeTxn({ id: 'b' }), fakeTxn({ id: 'c' })],
      [{ id: 'a', category: 'Materials & supplies', confidence: 0.85 }, { id: 'b' }],
    );
    expect(sure).toMatchObject({ category: 'Materials & supplies', confidence: 0.85, categoryMethod: 'claude' });
    expect(unsure).toMatchObject({ category: 'Other', confidence: 0.3, categoryMethod: 'claude' });
    expect(untouched).toMatchObject({ categoryMethod: 'ai' });
  });

  it("never changes a category the owner chose", () => {
    const [owner] = applyAiUpdates([fakeTxn({ id: 'a', categorySource: 'owner', category: 'Fuel' })], [{ id: 'a', category: 'Rent', confidence: 0.9 }]);
    expect(owner.category).toBe('Fuel');
  });
});
