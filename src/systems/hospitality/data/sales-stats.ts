// NexGain Hospitality: sales maths (pure functions, no database), used by the
// Dashboard, Sales page and (later) Analytics and the AI. Tested in
// __tests__/sales-stats.test.ts.
import type { MenuItem, Sale } from './menu';

/** "YYYY-MM-DD" in the phone's own time. */
export function dateKey(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, days: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

/** Profit and margin for one item, or null when no cost to make is entered. */
export function profitOf(item: Pick<MenuItem, 'price' | 'cost'>): { profit: number; margin: number | null } | null {
  if (item.cost === null) return null;
  const profit = Math.round((item.price - item.cost) * 100) / 100;
  return { profit, margin: item.price > 0 ? Math.round((profit / item.price) * 1000) / 10 : null };
}

/** True when the item is a special running today (no dates = always on while it's a special). */
export function isSpecialNow(item: Pick<MenuItem, 'isSpecial' | 'specialStart' | 'specialEnd'>, today: string) {
  if (!item.isSpecial) return false;
  if (item.specialStart && today < item.specialStart) return false;
  if (item.specialEnd && today > item.specialEnd) return false;
  return true;
}

/** A special whose end date has passed. */
export function specialEnded(item: Pick<MenuItem, 'isSpecial' | 'specialEnd'>, today: string) {
  return item.isSpecial && !!item.specialEnd && today > item.specialEnd;
}

export type Period = { id: string; label: string; start: Date; end: Date };

/** Today, this week (Monday first), this month and last month. */
export function salesPeriods(now = new Date()): Period[] {
  const today = startOfDay(now);
  const monday = addDays(today, -((today.getDay() + 6) % 7));
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  return [
    { id: 'today', label: 'Today', start: today, end: addDays(today, 1) },
    { id: 'week', label: 'This week', start: monday, end: addDays(monday, 7) },
    { id: 'month', label: 'This month', start: monthStart, end: new Date(today.getFullYear(), today.getMonth() + 1, 1) },
    { id: 'last-month', label: 'Last month', start: lastMonthStart, end: monthStart },
  ];
}

export function salesIn(sales: Sale[], start: Date, end: Date) {
  const from = start.toISOString();
  const to = end.toISOString();
  return sales.filter((s) => s.soldAt >= from && s.soldAt < to);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export type SalesTotals = {
  revenue: number;
  /** Number of sales recorded (an end-of-day entry counts as one). */
  sales: number;
  /** How many items were sold altogether. */
  itemsSold: number;
};

export function salesTotals(sales: Sale[]): SalesTotals {
  let revenue = 0;
  let itemsSold = 0;
  for (const s of sales) {
    for (const l of s.lines) {
      revenue += l.quantity * l.unitPrice;
      itemsSold += l.quantity;
    }
  }
  return { revenue: round2(revenue), sales: sales.length, itemsSold: round2(itemsSold) };
}

export type ItemSales = {
  /** The menu item id, or the name for items no longer on the menu. */
  key: string;
  menuItemId: string | null;
  name: string;
  category: string;
  quantity: number;
  revenue: number;
  /** Profit, when every sale of it had a cost to make; otherwise null. */
  profit: number | null;
};

/** Each item's quantity, revenue and profit, best sellers (by quantity) first. */
export function itemSales(sales: Sale[]): ItemSales[] {
  const byKey = new Map<string, ItemSales & { costKnown: boolean; cost: number }>();
  for (const s of sales) {
    for (const l of s.lines) {
      const key = l.menuItemId ?? `name:${l.name.toLowerCase()}`;
      const row = byKey.get(key) ?? {
        key,
        menuItemId: l.menuItemId,
        name: l.name,
        category: l.category,
        quantity: 0,
        revenue: 0,
        profit: null,
        costKnown: true,
        cost: 0,
      };
      row.quantity += l.quantity;
      row.revenue += l.quantity * l.unitPrice;
      if (l.unitCost === null) row.costKnown = false;
      else row.cost += l.quantity * l.unitCost;
      byKey.set(key, row);
    }
  }
  return [...byKey.values()]
    .map(({ costKnown, cost, ...r }) => ({
      ...r,
      quantity: round2(r.quantity),
      revenue: round2(r.revenue),
      profit: costKnown ? round2(r.revenue - cost) : null,
    }))
    .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue || a.name.localeCompare(b.name));
}
