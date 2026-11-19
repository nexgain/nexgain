// Hospitality sales maths. Uses FAKE menu items and sales only.
import { describe, expect, it } from '@jest/globals';

import type { Sale } from '@/systems/hospitality/data/menu';
import { isSpecialNow, itemSales, profitOf, salesIn, salesPeriods, salesTotals, specialEnded } from '@/systems/hospitality/data/sales-stats';
import { cleanCategories, findHospitalityType, HOSPITALITY_TYPES } from '@/systems/hospitality/constants/hospitality-types';

const sale = (id: string, soldAt: string, lines: Sale['lines']): Sale => ({ id, soldAt, source: 'sale', note: '', total: 0, lines });
const line = (menuItemId: string | null, name: string, quantity: number, unitPrice: number, unitCost: number | null = null) => ({
  menuItemId,
  name,
  category: 'Coffee',
  quantity,
  unitPrice,
  unitCost,
});

describe('profit per item', () => {
  it('works out profit and margin when a cost is entered', () => {
    expect(profitOf({ price: 5, cost: 1.25 })).toEqual({ profit: 3.75, margin: 75 });
  });
  it('shows nothing when there is no cost', () => {
    expect(profitOf({ price: 5, cost: null })).toBeNull();
  });
  it('has no margin for a free item', () => {
    expect(profitOf({ price: 0, cost: 1 })).toEqual({ profit: -1, margin: null });
  });
});

describe('specials', () => {
  const special = { isSpecial: true, specialStart: '2026-11-10', specialEnd: '2026-11-20' };
  it('is on between its dates', () => {
    expect(isSpecialNow(special, '2026-11-10')).toBe(true);
    expect(isSpecialNow(special, '2026-11-20')).toBe(true);
    expect(isSpecialNow(special, '2026-11-09')).toBe(false);
    expect(isSpecialNow(special, '2026-11-21')).toBe(false);
    expect(specialEnded(special, '2026-11-21')).toBe(true);
  });
  it('a special with no dates is always on', () => {
    expect(isSpecialNow({ isSpecial: true, specialStart: null, specialEnd: null }, '2030-01-01')).toBe(true);
  });
  it('a normal item is never a special', () => {
    expect(isSpecialNow({ isSpecial: false, specialStart: null, specialEnd: null }, '2026-11-15')).toBe(false);
  });
});

describe('sales totals and best sellers', () => {
  const sales = [
    sale('1', '2026-11-16T22:00:00.000Z', [line('latte', 'Latte', 3, 5, 1), line('muffin', 'Muffin', 1, 4.5)]),
    sale('2', '2026-11-17T01:00:00.000Z', [line('latte', 'Latte', 2, 5.5, 1)]),
    // An item deleted from the menu since: counted by name.
    sale('3', '2026-11-17T02:00:00.000Z', [line(null, 'Old Scone', 4, 3)]),
  ];

  it('adds up revenue and items', () => {
    expect(salesTotals(sales)).toEqual({ revenue: 42.5, sales: 3, itemsSold: 10 });
  });

  it('ranks items by how many sold, using the price at the time', () => {
    const rows = itemSales(sales);
    expect(rows.map((r) => r.name)).toEqual(['Latte', 'Old Scone', 'Muffin']);
    expect(rows[0]).toMatchObject({ quantity: 5, revenue: 26, profit: 21 });
    // No cost entered: no profit shown.
    expect(rows[2].profit).toBeNull();
  });

  it('picks the sales in a period', () => {
    expect(salesIn(sales, new Date('2026-11-17T00:00:00.000Z'), new Date('2026-11-18T00:00:00.000Z')).map((s) => s.id)).toEqual(['2', '3']);
  });

  it('has today, this week, this month and last month', () => {
    const periods = salesPeriods(new Date(2026, 10, 18, 15, 0)); // Wednesday 18 Nov 2026
    expect(periods.map((p) => p.id)).toEqual(['today', 'week', 'month', 'last-month']);
    const week = periods.find((p) => p.id === 'week')!;
    expect(week.start.getDay()).toBe(1); // Monday
    expect(week.start.getDate()).toBe(16);
    expect(periods.find((p) => p.id === 'last-month')!.start.getMonth()).toBe(9); // October
  });
});

describe('hospitality business types', () => {
  it('has the 10 food & drink types, each with a starter menu', () => {
    expect(HOSPITALITY_TYPES).toHaveLength(10);
    expect(HOSPITALITY_TYPES.every((t) => t.menu.length > 0)).toBe(true);
    expect(findHospitalityType('cafe')?.menu).toEqual(['Coffee', 'Breakfast', 'Lunch', 'Cakes & Pastries', 'Cold Drinks']);
    expect(findHospitalityType('bar')?.menu).toEqual(['Beer', 'Wine', 'Spirits', 'Cocktails', 'Bar Food']);
  });
  it('cleans up the starter categories', () => {
    expect(cleanCategories([' Coffee ', '', 'coffee', 'Lunch'])).toEqual(['Coffee', 'Lunch']);
  });
});
