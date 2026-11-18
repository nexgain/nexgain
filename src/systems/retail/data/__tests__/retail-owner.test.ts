// NexGain Retail owner side: its own transaction categories (and System 1's
// staying the same), no invoice questions, spending groups, and the Roster
// form's checks. FAKE transactions and staff only.
import { describe, expect, it, jest } from '@jest/globals';

import { businessStore, type BusinessProfile } from '@/data/business';
import { buildSampleBank } from '@/data/bank-sample';
import { currentSpendGroups, reviewItems, spendingByGroup } from '@/data/money-sorting';
import { shiftProblem } from '@/systems/retail/components/owner/shift-editor';
import { RETAIL_TRANSACTION_CATEGORIES } from '@/systems/retail/data/retail-money';

import {
  groupOf,
  RETAIL_CATEGORIES,
  RETAIL_SCHEME,
  RETAIL_SPEND_GROUPS,
  schemeForSystem,
  SERVICE_SCHEME,
  sortTransaction,
  type SortContext,
} from '../../../../../supabase/functions/_shared/ai/sorting';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const ctx: SortContext = { learned: new Map(), contractorNames: ['Mia Chen'], history: [] };
const out = (description: string, amount = -50) => ({ amount, description, merchant: null, date: '2030-03-10' });
const retail = (description: string, amount?: number) => sortTransaction(out(description, amount), ctx, RETAIL_SCHEME);

describe('retail transaction categories', () => {
  it('are exactly the retail list', () => {
    expect(RETAIL_CATEGORIES).toEqual([
      'Stock purchases',
      'Rent',
      'Wages',
      'Shipping & postage',
      'Packaging',
      'Marketing',
      'Utilities',
      'Shop fit-out & equipment',
      'Other',
    ]);
    expect(RETAIL_TRANSACTION_CATEGORIES).toEqual(['Income', ...RETAIL_CATEGORIES.slice(0, -1), 'Transfers', 'Other']);
  });

  it('sort known retail merchants', () => {
    expect(retail('AUSTRALIA POST BONDI')).toMatchObject({ category: 'Shipping & postage', method: 'rule' });
    expect(retail('SENDLE PTY LTD').category).toBe('Shipping & postage');
    expect(retail('FACEBK *ADS 8821').category).toBe('Marketing');
    expect(retail('NOISSUE PACKAGING').category).toBe('Packaging');
    expect(retail('AGL ENERGY').category).toBe('Utilities');
    expect(retail('TELSTRA MOBILE').category).toBe('Utilities');
    expect(retail('SCENTRE GROUP WESTFIELD RENT').category).toBe('Rent');
    expect(retail('ABC FASHION WHOLESALE').category).toBe('Stock purchases');
    expect(retail('SHOPFIT DIRECT SHELVING').category).toBe('Shop fit-out & equipment');
    expect(retail('PAYROLL WEEKLY').category).toBe('Wages');
  });

  it('pays contractors as Wages, and money in and transfers as before', () => {
    expect(retail('OSKO PAYMENT MIA CHEN').category).toBe('Wages');
    expect(retail('OSKO DEPOSIT CUSTOMER', 80).category).toBe('Income');
    expect(retail('TRANSFER TO SAVINGS').category).toBe('Transfers');
  });

  it('never uses System 1 categories', () => {
    for (const d of ['BUNNINGS 6342', 'AMPOL CAPALABA', 'XERO AUSTRALIA', 'ATO PAYMENT', 'MONTHLY ACCOUNT FEE', 'AAMI INSURANCE']) {
      expect([...RETAIL_CATEGORIES, 'Income', 'Transfers']).toContain(retail(d).category);
    }
    expect(retail('ATO PAYMENT').category).toBe('Other');
  });

  it('leaves System 1 and 2 sorting exactly as it was', () => {
    const t = out('BUNNINGS 6342 CAPALABA');
    expect(sortTransaction(t, ctx)).toEqual(sortTransaction(t, ctx, SERVICE_SCHEME));
    expect(sortTransaction(t, ctx).category).toBe('Materials & supplies');
    expect(sortTransaction(out('AMPOL CAPALABA'), ctx).category).toBe('Fuel');
    expect(schemeForSystem('service')).toBe(SERVICE_SCHEME);
    expect(schemeForSystem('bookings')).toBe(SERVICE_SCHEME);
    expect(schemeForSystem(null)).toBe(SERVICE_SCHEME);
    expect(schemeForSystem('retail')).toBe(RETAIL_SCHEME);
  });
});

describe('retail spending groups', () => {
  it('has one group per category, with payroll wages in Wages', () => {
    expect(RETAIL_SPEND_GROUPS.map((g) => g.pick)).toEqual(RETAIL_CATEGORIES);
    expect(groupOf('Wages & super', RETAIL_SPEND_GROUPS)).toBe('wages');
    expect(groupOf('Stock purchases', RETAIL_SPEND_GROUPS)).toBe('stock');
    expect(groupOf('Bank fees', RETAIL_SPEND_GROUPS)).toBe('other');
    expect(groupOf('Income', RETAIL_SPEND_GROUPS)).toBeNull();
  });
});

describe('the Transactions page for a retail business', () => {
  const sample = buildSampleBank(new Date(2026, 10, 9));
  const feed = {
    preview: true,
    connected: true,
    accounts: sample.accounts,
    // Money in sorted as Income, as the bank sync does.
    transactions: sample.transactions.map((t) => (t.amount > 0 ? { ...t, category: 'Income' } : t)),
    invoices: sample.invoices,
    jobs: [],
    linkExpensesToJobs: false,
    purchases: [],
  };
  const as = (systemType: 'service' | 'retail') => businessStore.set({ id: 'fake-business', systemType } as BusinessProfile);

  it('never asks which invoice money in was for (retail has no invoices)', () => {
    as('service');
    expect(reviewItems(feed).some((i) => i.kind === 'invoice' || i.kind === 'income')).toBe(true);
    as('retail');
    expect(reviewItems(feed).some((i) => i.kind === 'invoice' || i.kind === 'income')).toBe(false);
  });

  it('shows the retail groups, and System 1 keeps its own', () => {
    as('retail');
    expect(currentSpendGroups().map((g) => g.name)).toEqual(RETAIL_SPEND_GROUPS.map((g) => g.name));
    as('service');
    expect(currentSpendGroups().map((g) => g.id)).toEqual(['materials', 'labour', 'tools', 'fuel', 'vehicle', 'other']);
  });

  it('adds payroll wages to the Wages group when there is no bank feed', () => {
    as('retail');
    const wages = spendingByGroup([], new Date(2026, 0, 1), new Date(2027, 0, 1), 500).find((g) => (g.group.id as string) === 'wages');
    expect(wages?.total).toBe(500);
    businessStore.set(null);
  });
});

describe('Roster form', () => {
  const draft = { date: new Date(2030, 2, 12), start: '09:00', end: '17:00', employeeIds: ['emp-a'], location: '' };
  const twoStores = [{ name: 'Bondi' }, { name: 'Manly' }];

  it('saves a shift for one person', () => {
    expect(shiftProblem(draft, [], [])).toBeNull();
    expect(shiftProblem(draft, [], [{ name: 'Bondi' }])).toBeNull();
  });

  it('needs someone and a real time', () => {
    expect(shiftProblem({ ...draft, employeeIds: [] }, [], [])).toMatch(/Choose who/);
    expect(shiftProblem({ ...draft, end: '08:00' }, [], [])).toMatch(/end time/);
  });

  it('asks which store only when there is more than one', () => {
    expect(shiftProblem(draft, [], twoStores)).toMatch(/which store/);
    expect(shiftProblem({ ...draft, location: 'Manly' }, [], twoStores)).toBeNull();
  });

  it('can’t roster the same person at overlapping times', () => {
    const existing = [{ id: 'a', date: '2030-03-12', start: '12:00', end: '18:00', employeeIds: ['emp-a'] }];
    expect(shiftProblem(draft, existing, [])).toMatch(/already rostered/);
    expect(shiftProblem({ ...draft, id: 'a' }, existing, [])).toBeNull();
    expect(shiftProblem({ ...draft, employeeIds: ['emp-b'] }, existing, [])).toBeNull();
  });
});
