// NexGain Retail: the FREE AI Assistant's stock and sales answers (on the
// phone, no AI company). FAKE shop data only.
import { describe, expect, it, jest } from '@jest/globals';

import { toRetailData } from '@/systems/retail/data/retail-ai';
import type { Sale } from '@/systems/retail/data/sales';
import type { Product, StockLevels } from '@/systems/retail/data/stock';

import { answerRetailQuestion, retailNotUnderstood } from '../../../../../supabase/functions/_shared/ai/retail-answer';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const NOW = new Date('2030-06-30T02:00:00Z'); // Sunday 30 June, noon in Brisbane
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const base: Omit<Product, 'id' | 'name' | 'variants'> = {
  sku: '',
  categoryId: 'pants',
  brand: '',
  description: '',
  supplierId: 'denim',
  costPrice: 30,
  sellPrice: 99,
  gstIncluded: true,
  lowStockLevel: 3,
  storeId: null,
  photos: [],
  archived: false,
  createdAt: daysAgo(300),
};
const v = (id: string, productId: string, size: string, colour: string) => ({ id, productId, size, colour, sku: '', barcode: `NX-${id}`, barcodeGenerated: true, sort: 0 });

const jeans: Product = { ...base, id: 'jeans', name: 'Black Jeans', variants: [v('j-10', 'jeans', '10', 'Black'), v('j-12', 'jeans', '12', 'Black'), v('j-100', 'jeans', '100', 'Black')] };
const hoodie: Product = { ...base, id: 'hoodie', name: 'Classic Hoodie', categoryId: 'hoodies', supplierId: null, costPrice: 20, sellPrice: 79, variants: [v('h-m', 'hoodie', 'M', 'Grey')] };
// Never sold, in the shop for 300 days.
const scarf: Product = { ...base, id: 'scarf', name: 'Wool Scarf', categoryId: null, supplierId: null, costPrice: 25, sellPrice: 80, variants: [v('s-1', 'scarf', '', 'Red')] };

let n = 0;
const sale = (variantId: string, quantity: number, days: number, soldBy = 'Mia'): Sale => ({
  id: `s${n++}`,
  variantId,
  productId: null,
  itemName: '',
  quantity,
  unitPrice: 99,
  total: quantity * 99,
  gst: (quantity * 99) / 11,
  storeId: null,
  employeeId: null,
  soldBy,
  soldAt: daysAgo(days),
});

const sales: Sale[] = [
  ...Array.from({ length: 20 }, (_, i) => sale('j-10', 2, i + 0.5, i % 4 === 0 ? 'Sam' : 'Mia')),
  sale('h-m', 3, 2, 'Sam'),
  sale('h-m', 1, 40), // last month
];

const levels: StockLevels = new Map([
  ['j-10', new Map([['', 5]])],
  ['j-12', new Map([['', 20]])],
  ['j-100', new Map([['', 2]])],
  ['h-m', new Map([['', 0]])],
  ['s-1', new Map([['', 12]])],
]);

const data = toRetailData({
  products: [jeans, hoodie, scarf],
  levels,
  sales,
  movements: [],
  suppliers: [{ id: 'denim', name: 'Denim Co', contactName: '', phone: '', email: '', website: '', notes: '', leadTimeDays: 10 }],
  categories: [
    { id: 'pants', name: 'Pants', sort: 0 },
    { id: 'hoodies', name: 'Hoodies', sort: 1 },
  ],
  stores: [],
  onOrder: new Map(),
  usesGst: true,
  timeZone: 'Australia/Brisbane',
});
const ask = (q: string) => answerRetailQuestion(data, q, NOW);

describe('free retail answers', () => {
  it('answers "how many size 10 black jeans do we have?" (size 10, not 100)', () => {
    expect(ask('How many size 10 black jeans do we have?')!.text).toBe('You have 5 Black Jeans · 10 / Black in stock.');
    expect(ask('how many black jeans have we got')!.text).toMatch(/^27 in stock across 3 sizes \/ colours/);
    expect(ask('how many hoodies left?')!.text).toMatch(/0 Classic Hoodie · M \/ Grey in stock\. It’s sold out\./);
  });

  it('leaves questions that aren’t about products to the normal answers', () => {
    expect(ask('How many staff do we have?')).toBeNull();
    expect(ask('Who is working tomorrow?')).toBeNull();
    expect(ask('How much did we spend on fuel?')).toBeNull();
  });

  it('says what to reorder', () => {
    const a = ask('What should I reorder?')!.text;
    expect(a).toMatch(/Black Jeans · 10 \/ Black: 5 left \(about 3 days\) — order 53 from Denim Co/);
    expect(a).toMatch(/Classic Hoodie · M \/ Grey: sold out — order 7\n/);
    expect(a).toMatch(/Review & Order Stock/);
  });

  it('lists low and out of stock', () => {
    const a = ask('What’s low on stock?')!.text;
    expect(a).toMatch(/Out of stock \(1\):\n• Classic Hoodie · M \/ Grey/);
    expect(a).toMatch(/Black Jeans · 100 \/ Black \(2 left\)/);
  });

  it('finds the best seller, by product or size, for a period', () => {
    expect(ask('What was my best seller this month?')!.text).toMatch(/^Your best-selling product this month .* was Black Jeans — 40 items/);
    expect(ask('What was my best seller last month?')!.text).toMatch(/was Classic Hoodie — 1 item/);
    expect(ask('top size?')!.text).toMatch(/best-selling size .* was 10/);
  });

  it('finds stock that isn’t selling', () => {
    expect(ask('Which stock isn’t selling?')!.text).toMatch(/Wool Scarf: 12 in stock, \$300, never sold/);
  });

  it('totals sales, and sales of one product', () => {
    expect(ask('How much did we sell this week?')!.text).toMatch(/^Sales this week .*: \$/);
    expect(ask('how many hoodies did we sell this month')!.text).toMatch(/^You sold 3 items/);
  });

  it('answers staff, busy times, margins and stock value', () => {
    expect(ask('Who sold the most this month?')!.text).toMatch(/^Mia sold the most/);
    expect(ask('What are our busiest days and times?')!.text).toMatch(/Busiest day: /);
    expect(ask('What are my most profitable products?')!.text).toMatch(/Black Jeans: 67%/);
    expect(ask('What is my stock worth?')!.text).toMatch(/^Your stock is worth \$1,110 at cost price/);
  });

  it('suggests retail questions when it doesn’t understand', () => {
    expect(retailNotUnderstood().text).toMatch(/How many size 10 black jeans do we have\?/);
  });
});
