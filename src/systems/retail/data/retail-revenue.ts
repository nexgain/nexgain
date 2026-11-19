// NexGain Retail (System 3): money coming in. A retail shop has no customer
// invoices or quotes; its revenue is its sales (see sales.ts): every item
// marked Sold, at what the customer paid (incl. GST), minus returns.
import type { MoneyEntry } from '@/data/finance';
import { useSales, type Sale } from '@/systems/retail/data/sales';

/** Sales (and returns, as negative amounts) as money in, newest first. */
export function retailRevenueEntries(sales: Sale[]): MoneyEntry[] {
  return sales
    .filter((s) => s.quantity !== 0)
    .map((s) => ({
      id: `sale-${s.id}`,
      date: new Date(s.soldAt),
      amount: s.total,
      title: s.itemName,
      subtitle: [s.quantity < 0 ? `Returned ${-s.quantity}` : `${s.quantity} sold`, s.soldBy].filter(Boolean).join(' · '),
      category: s.quantity < 0 ? 'Return' : 'Sale',
      source: 'sale' as const,
    }))
    .sort((a, b) => b.date.getTime() - a.date.getTime());
}

/** Every sale as money in, newest first. */
export function useRetailRevenue(): MoneyEntry[] {
  return retailRevenueEntries(useSales());
}
