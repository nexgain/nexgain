// NexGain Retail (System 3): the Transactions page's categories and groups.
// The categories themselves, the known-merchant rules and the AI sorting live
// in RETAIL_SCHEME (supabase/functions/_shared/ai/sorting.ts), shared with the
// bank sync and the AI, so they always match. This file adds what the retail
// screens need on top: the lists shown in pickers, and each group's colour.
import { INCOME_CATEGORY, TRANSFERS_CATEGORY } from '@/data/bank';

import { RETAIL_CATEGORIES, type RetailSpendGroupId } from '../../../../supabase/functions/_shared/ai/sorting';

export { RETAIL_CATEGORIES };

/** Categories offered when typing in an expense or checking a receipt. */
export const RETAIL_EXPENSE_CATEGORIES: string[] = [...RETAIL_CATEGORIES];

/** Every category a bank transaction can have, in the order they're offered. */
export const RETAIL_TRANSACTION_CATEGORIES: string[] = [
  INCOME_CATEGORY,
  ...RETAIL_CATEGORIES.filter((c) => c !== 'Other'),
  TRANSFERS_CATEGORY,
  'Other',
];

/** One colour per group, the same everywhere (Stock is always purple...). */
export const RETAIL_GROUP_COLORS: Record<RetailSpendGroupId, string> = {
  stock: '#8b5cf6',
  rent: '#3987e5',
  wages: '#199e70',
  shipping: '#f97316',
  packaging: '#c98500',
  marketing: '#d55181',
  utilities: '#0ea5e9',
  fitout: '#008300',
  other: '#94a3b8',
};

/** The category each group's icon comes from. */
export const RETAIL_GROUP_CATEGORY: Record<RetailSpendGroupId, string> = {
  stock: 'Stock purchases',
  rent: 'Rent',
  wages: 'Wages',
  shipping: 'Shipping & postage',
  packaging: 'Packaging',
  marketing: 'Marketing',
  utilities: 'Utilities',
  fitout: 'Shop fit-out & equipment',
  other: 'Other',
};
