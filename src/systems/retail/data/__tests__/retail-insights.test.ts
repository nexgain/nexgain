// NexGain Retail AI: the daily health check's retail findings and the AI
// Assistant's stock and sales lookups. FAKE shop data only.
import { describe, expect, it } from '@jest/globals';

import { retailInsights, runRetailTool, type RetailData, type RetailProduct, type RetailSale } from '../../../../../supabase/functions/_shared/ai/retail-insights';

const NOW = new Date('2030-06-30T02:00:00Z'); // Sunday 30 June, noon in Brisbane
const daysAgo = (n: number, hourUtc = 1) => {
  const d = new Date(NOW.getTime() - n * 86_400_000);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d.toISOString();
};

const jeans: RetailProduct = {
  id: 'jeans',
  name: 'Black Jeans',
  sku: 'JEAN-BLK',
  brand: 'Urban',
  category: 'Pants',
  supplierId: 'denim',
  costPrice: 30,
  sellPrice: 99,
  gstIncluded: true,
  lowStockLevel: 3,
  createdAt: daysAgo(300),
  archived: false,
  variants: [
    { id: 'j-10', size: '10', colour: 'Black', sku: 'JB-10', barcode: 'NX10' },
    { id: 'j-12', size: '12', colour: 'Black', sku: 'JB-12', barcode: 'NX12' },
    { id: 'j-100', size: '100', colour: 'Black', sku: '', barcode: 'NX100' },
  ],
};
const tee: RetailProduct = {
  ...jeans,
  id: 'tee',
  name: 'Basic Tee',
  sku: 'TEE',
  category: 'T-Shirts',
  supplierId: null,
  costPrice: 18,
  sellPrice: 22,
  lowStockLevel: 2,
  variants: [{ id: 't-m', size: 'M', colour: 'White', sku: '', barcode: 'NXT' }],
};
const scarf: RetailProduct = { ...tee, id: 'scarf', name: 'Wool Scarf', category: 'Accessories', costPrice: 25, sellPrice: 80, variants: [{ id: 's-1', size: '', colour: 'Grey', sku: '', barcode: 'NXS' }] };

const sale = (variantId: string, quantity: number, total: number, days: number, soldBy = 'Mia', hourUtc = 1): RetailSale => ({
  variantId,
  productId: null,
  itemName: '',
  quantity,
  total,
  soldAt: daysAgo(days, hourUtc),
  soldBy,
});

// Jeans size 10: 2 a day for 4 weeks (Mia and Sam). Tees: some. Scarves: none for 100 days.
const sales: RetailSale[] = [
  ...Array.from({ length: 28 }, (_, i) => sale('j-10', 2, 198, i + 0.5, i % 3 === 0 ? 'Sam' : 'Mia', i % 7 === 0 ? 1 : 3)),
  sale('t-m', 5, 110, 3, 'Sam'),
  sale('t-m', -1, -22, 2, 'Sam'),
  // Last month (May): tees only.
  sale('t-m', 3, 66, 40, 'Mia'),
];

const data: RetailData = {
  products: [jeans, tee, scarf],
  stock: { 'j-10': 9, 'j-12': 20, 'j-100': 4, 't-m': 30, 's-1': 25 },
  storeStock: {},
  sales,
  changes: [
    // Size 10 sold out three times.
    { variantId: 'j-10', kind: 'sold', change: -1, quantityAfter: 0, unitCost: null, createdAt: daysAgo(10) },
    { variantId: 'j-10', kind: 'sold', change: -1, quantityAfter: 0, unitCost: null, createdAt: daysAgo(40) },
    { variantId: 'j-10', kind: 'sold', change: -1, quantityAfter: 0, unitCost: null, createdAt: daysAgo(70) },
    // Stocktakes found 4 jeans missing.
    { variantId: 'j-12', kind: 'stocktake', change: -4, quantityAfter: 20, unitCost: null, createdAt: daysAgo(20) },
    // Delivery costs: jeans went from $30 to $36.
    { variantId: 'j-12', kind: 'received', change: 10, quantityAfter: 24, unitCost: 30, createdAt: daysAgo(100) },
    { variantId: 'j-12', kind: 'received', change: 10, quantityAfter: 24, unitCost: 36, createdAt: daysAgo(15) },
  ],
  suppliers: [{ id: 'denim', name: 'Denim Co', leadTimeDays: 10 }],
  onOrder: {},
  usesGst: true,
  timeZone: 'Australia/Brisbane',
};

describe('retail health check', () => {
  const found = retailInsights(data, NOW);
  const of = (check: string) => found.find((i) => i.check === check);

  it('says what to reorder, most urgent first', () => {
    // Size 10: 9 left at 2 a day = 4 days, delivery takes 10: sells out first.
    expect(of('retail_reorder')).toMatchObject({ severity: 'high', title: '1 item ready to reorder' });
    expect(of('retail_reorder')!.summary).toMatch(/^Black Jeans · 10 \/ Black will sell out in about 4 days — reorder \d+\./);
  });

  it('finds slow stock with the money tied up', () => {
    expect(of('retail_slow_stock')).toMatchObject({ title: '$625 tied up in slow stock' });
    expect(of('retail_slow_stock')!.summary).toMatch(/Wool Scarf/);
  });

  it('names the best seller, top category, size and colour', () => {
    expect(of('retail_best_sellers')!.summary).toBe('Black Jeans sold 56 in the last 30 days (top category Pants, top size 10, top colour Black).');
  });

  it('finds what makes the most money and low margins', () => {
    expect(of('retail_top_profit')!.title).toBe('Black Jeans makes you the most money');
    // Tee: $22 inc GST = $20 ex GST, cost $18: 10% margin.
    expect(of('retail_low_margin')).toMatchObject({ title: 'Low margin on Basic Tee', severity: 'low' });
  });

  it('spots sizes that keep selling out, stock loss and cost rises', () => {
    expect(of('retail_size_sellouts')!.title).toBe('Size 10 keeps selling out');
    expect(of('retail_shrinkage')).toMatchObject({ title: '$120 of stock missing' });
    expect(of('retail_cost_rise')!.summary).toBe('Black Jeans · 12 / Black now costs $36.00 from Denim Co, up from $30.00 last delivery.');
  });

  it('compares staff and finds the busiest day and time', () => {
    expect(of('retail_staff_sales')!.title).toBe('Mia sold the most');
    expect(of('retail_busy_times')).toBeTruthy();
  });

  it('finds nothing for a shop with no stock or sales', () => {
    expect(retailInsights({ ...data, products: [], sales: [], changes: [], stock: {} }, NOW)).toEqual([]);
  });
});

describe('AI Assistant stock lookups', () => {
  type Lookup = { found: number; items: { item: string; inStock: number; status: string }[] };

  it('answers "how many size 10 black jeans do we have?"', () => {
    const r = runRetailTool(data, 'retail_stock_lookup', { query: 'how many size 10 black jeans do we have' }, NOW).result as Lookup;
    expect(r.found).toBe(1);
    expect(r.items[0]).toMatchObject({ item: 'Black Jeans · 10 / Black', inStock: 9, status: 'ok' });
  });

  it('finds by SKU or barcode', () => {
    expect((runRetailTool(data, 'retail_stock_lookup', { query: 'JB-12' }, NOW).result as Lookup).items[0].inStock).toBe(20);
    expect((runRetailTool(data, 'retail_stock_lookup', { query: 'nothing like this' }, NOW).result as { found: number }).found).toBe(0);
  });

  it('answers "what was my best seller last month?"', () => {
    const r = runRetailTool(data, 'retail_sales_report', { period: 'last_month', group_by: 'product' }, NOW).result as {
      rows: { product: string; unitsSold: number }[];
    };
    expect(r.rows).toEqual([{ product: 'Basic Tee', unitsSold: 3, sales: 66 }]);
  });

  it('reports sales by size, staff and worst sellers (including ones that sold nothing)', () => {
    const bySize = runRetailTool(data, 'retail_sales_report', { period: 'this_month', group_by: 'size' }, NOW).result as { rows: Record<string, unknown>[] };
    expect(bySize.rows[0].size).toBe('10');
    const worst = runRetailTool(data, 'retail_sales_report', { period: 'this_month', group_by: 'product', order: 'worst' }, NOW).result as {
      rows: { product: string; unitsSold: number }[];
    };
    expect(worst.rows[0]).toEqual({ product: 'Wool Scarf', unitsSold: 0, sales: 0 });
    const staff = runRetailTool(data, 'retail_sales_report', { period: 'this_month', group_by: 'staff' }, NOW).result as { itemsReturned: number };
    expect(staff.itemsReturned).toBe(1);
  });

  it('suggests what to reorder and gives a stock overview', () => {
    const r = runRetailTool(data, 'retail_reorder_suggestions', {}, NOW).result as { itemsToReorder: number; items: { item: string; supplier: string }[] };
    expect(r.itemsToReorder).toBe(1);
    expect(r.items[0]).toMatchObject({ item: 'Black Jeans · 10 / Black', supplier: 'Denim Co' });
    const health = runRetailTool(data, 'retail_stock_health', {}, NOW).result as { stockValueAtCost: number; slowStock: { product: string }[] };
    expect(health.stockValueAtCost).toBe(33 * 30 + 30 * 18 + 25 * 25);
    expect(health.slowStock[0].product).toBe('Wool Scarf');
  });

  it('never throws on a bad request', () => {
    expect(runRetailTool(data, 'retail_sales_report', { period: 'nonsense' }, NOW).result).toHaveProperty('error');
    expect(runRetailTool(data, 'nope', {}, NOW).result).toHaveProperty('error');
  });
});
