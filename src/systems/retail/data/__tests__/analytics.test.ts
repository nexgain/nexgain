// NexGain Retail Reports: sales by category / product / size / colour,
// sell-through, profit margins and store comparison. FAKE shop data only.
import { describe, expect, it, jest } from '@jest/globals';

import { periodTotals, productMargins, salesBreakdown, salesOverTime, sellThrough, storeComparison } from '@/systems/retail/data/analytics';
import type { ProductCategory, StoreLocation } from '@/systems/retail/data/retail';
import type { Sale } from '@/systems/retail/data/sales';
import type { Product, StockLevels } from '@/systems/retail/data/stock';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const JUNE = { start: new Date('2030-06-01T00:00:00Z'), end: new Date('2030-07-01T00:00:00Z') };
const MAY = { start: new Date('2030-05-01T00:00:00Z'), end: JUNE.start };

const categories: ProductCategory[] = [
  { id: 'c-hood', name: 'Hoodies', sort: 0 },
  { id: 'c-hat', name: 'Hats', sort: 1 },
];
const stores: StoreLocation[] = [
  { id: 'city', name: 'City', address: '', sort: 0 },
  { id: 'beach', name: 'Beach', address: '', sort: 1 },
];

const hoodie: Product = {
  id: 'hoodie',
  name: 'Classic Hoodie',
  sku: '',
  categoryId: 'c-hood',
  brand: '',
  description: '',
  supplierId: null,
  costPrice: 20,
  sellPrice: 88,
  gstIncluded: true,
  lowStockLevel: 2,
  storeId: null,
  photos: [],
  archived: false,
  createdAt: '2030-01-01T00:00:00Z',
  variants: [
    { id: 'h-m-blk', productId: 'hoodie', size: 'M', colour: 'Black', sku: '', barcode: 'NX1', barcodeGenerated: true, sort: 0 },
    { id: 'h-l-wht', productId: 'hoodie', size: 'L', colour: 'White', sku: '', barcode: 'NX2', barcodeGenerated: true, sort: 1 },
  ],
};
// A cap that barely makes money: $22 inc GST = $20, cost $18 = 10%.
const cap: Product = {
  ...hoodie,
  id: 'cap',
  name: 'Logo Cap',
  categoryId: 'c-hat',
  costPrice: 18,
  sellPrice: 22,
  variants: [{ id: 'cap-1', productId: 'cap', size: '', colour: 'Black', sku: '', barcode: 'NX3', barcodeGenerated: true, sort: 0 }],
};
// No cost price entered.
const sock: Product = { ...hoodie, id: 'sock', name: 'Socks', categoryId: null, costPrice: null, variants: [{ ...cap.variants[0], id: 'sock-1', productId: 'sock', colour: '' }] };
const products = [hoodie, cap, sock];

let n = 0;
const sale = (variantId: string, quantity: number, unitPrice: number, soldAt: string, soldBy = 'Mia', storeId: string | null = 'city'): Sale => ({
  id: `s${n++}`,
  variantId,
  productId: null,
  itemName: '',
  quantity,
  unitPrice,
  total: quantity * unitPrice,
  gst: Math.round(((quantity * unitPrice) / 11) * 100) / 100,
  storeId,
  employeeId: null,
  soldBy,
  soldAt,
});

const sales: Sale[] = [
  sale('h-m-blk', 3, 88, '2030-06-05T03:00:00Z'), // $264, profit 3 x (80 - 20) = 180
  sale('h-l-wht', 1, 88, '2030-06-06T03:00:00Z', 'Sam', 'beach'), // $88, profit 60
  sale('h-m-blk', -1, 88, '2030-06-07T03:00:00Z'), // a return: -$88, -60
  sale('cap-1', 5, 22, '2030-06-08T03:00:00Z', 'Sam', 'beach'), // $110, profit 5 x 2 = 10
  sale('sock-1', 2, 11, '2030-06-09T03:00:00Z'), // $22, no cost price
  sale('cap-1', 2, 22, '2030-05-20T03:00:00Z'), // last month
];

// Stock left: City 6 hoodies M, Beach 2 hoodies L, Beach 5 caps, no socks.
const levels: StockLevels = new Map([
  ['h-m-blk', new Map([['city', 6]])],
  ['h-l-wht', new Map([['beach', 2]])],
  ['cap-1', new Map([['beach', 5]])],
]);

describe('retail reports', () => {
  it('totals sales, items, returns and gross profit for a period', () => {
    const t = periodTotals(sales, products, JUNE);
    expect(t).toMatchObject({ total: 396, items: 11, returned: 1, cost: 150, profit: 190 });
    // Margin only counts sales with a cost price: 190 / (374 / 1.1 = 340) = 56%.
    expect(t.margin).toBe(56);
    expect(periodTotals(sales, products, MAY).total).toBe(44);
  });

  it('gives sales and profit per time bucket', () => {
    expect(salesOverTime(sales, products, [MAY, JUNE])).toEqual([
      { sales: 44, profit: 4 },
      { sales: 396, profit: 190 },
    ]);
  });

  it('splits sales by category, product, size and colour', () => {
    expect(salesBreakdown(sales, products, categories, JUNE, 'category').map((r) => [r.name, r.units, r.sales])).toEqual([
      ['Hoodies', 3, 264],
      ['Hats', 5, 110],
      ['No category', 2, 22],
    ]);
    expect(salesBreakdown(sales, products, categories, JUNE, 'product')[0]).toMatchObject({ name: 'Classic Hoodie', profit: 180, share: 67 });
    expect(salesBreakdown(sales, products, categories, JUNE, 'size').map((r) => r.name)).toEqual(['M', 'No size', 'L']);
    expect(salesBreakdown(sales, products, categories, JUNE, 'colour').map((r) => [r.name, r.sales])).toEqual([
      ['Black', 286],
      ['White', 88],
      ['No colour', 22],
    ]);
    // Socks have no cost price, so no profit is guessed.
    expect(salesBreakdown(sales, products, categories, JUNE, 'product').find((r) => r.name === 'Socks')!.profit).toBeNull();
  });

  it('works out sell-through, slowest first', () => {
    const t = sellThrough(sales, products, levels, JUNE);
    // Sold 3 hoodies (4 less a return) + 5 caps + 2 socks = 10; 13 left.
    expect(t).toMatchObject({ sold: 10, inStock: 13, rate: 43 });
    expect(t.rows.map((r) => [r.name, r.rate])).toEqual([
      ['Classic Hoodie', 27],
      ['Logo Cap', 50],
      ['Socks', 100],
    ]);
  });

  it('ranks products by profit and finds low margins', () => {
    const m = productMargins(sales, products, JUNE);
    expect(m.map((r) => [r.name, r.profit, r.margin])).toEqual([
      ['Classic Hoodie', 180, 75],
      ['Logo Cap', 10, 10],
    ]);
  });

  it('compares stores side by side', () => {
    const rows = storeComparison(sales, products, levels, stores, JUNE);
    expect(rows.map((r) => [r.name, r.sales, r.profit, r.stockCost])).toEqual([
      ['City', 198, 120, 120],
      ['Beach', 198, 70, 130],
    ]);
    // City: 2 hoodies + 2 socks sold, 6 left = 40%.
    expect(rows[0].sellThrough).toBe(40);
  });

  it('copes with a shop with nothing yet', () => {
    expect(periodTotals([], [], JUNE)).toMatchObject({ total: 0, profit: 0, margin: 0 });
    expect(sellThrough([], [], new Map(), JUNE)).toEqual({ rate: 0, sold: 0, inStock: 0, rows: [] });
    expect(storeComparison([], [], new Map(), stores, JUNE).map((r) => r.sales)).toEqual([0, 0]);
  });
});
