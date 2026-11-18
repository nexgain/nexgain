// NexGain Retail stock: Code 128 barcodes, stock levels and statuses, profit
// margins, stock value, search, variants from sizes and colours, stocktake
// differences, and CSV import. FAKE products only.
import { describe, expect, it, jest } from '@jest/globals';

import { canEncode128, code128Codes, code128Svg, code128Widths } from '@/systems/retail/data/code128';
import { CSV_TEMPLATE, importProducts, parseCsv } from '@/systems/retail/data/csv-import';
import { labelsHtml } from '@/systems/retail/components/owner/barcode-labels';
import {
  combineOptions,
  countDifferences,
  findBarcode,
  marginPercent,
  productProblem,
  productStatus,
  productStock,
  searchProducts,
  sortProducts,
  stockError,
  stockStatus,
  stockValue,
  variantLabel,
  variantStock,
  type Product,
  type ProductDraft,
  type StockLevels,
} from '@/systems/retail/data/stock';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/lib/share-pdf', () => ({
  sharePdf: jest.fn(),
  escapeHtml: (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
}));

const variant = (id: string, size: string, colour: string, barcode = `NX${id}`) => ({
  id,
  productId: 'p',
  size,
  colour,
  sku: '',
  barcode,
  barcodeGenerated: true,
  sort: 0,
});
const product = (id: string, name: string, variants: ReturnType<typeof variant>[], extra: Partial<Product> = {}): Product => ({
  id,
  name,
  sku: '',
  categoryId: null,
  brand: '',
  description: '',
  supplierId: null,
  costPrice: 10,
  sellPrice: 33,
  gstIncluded: true,
  lowStockLevel: 3,
  storeId: null,
  photos: [],
  archived: false,
  createdAt: '2030-01-01',
  variants: variants.map((v) => ({ ...v, productId: id })),
  ...extra,
});

const tee = product('tee', 'Classic Tee', [variant('tee-s', 'S', 'Black'), variant('tee-m', 'M', 'Black', '9312345678901')], { brand: 'Bondi' });
const gel = product('gel', 'Hair Gel', [variant('gel-1', '', '')], { costPrice: 4, sellPrice: 20, lowStockLevel: 10 });
const levels: StockLevels = new Map([
  ['tee-s', new Map([['', 2]])],
  ['tee-m', new Map([['store-a', 5], ['store-b', 7]])],
  ['gel-1', new Map([['', 40]])],
]);

describe('Code 128 barcodes', () => {
  it('uses the right check code', () => {
    // Start B (104) + P 48×1 + J 42×2 + J 42×3 + 1 17×4 + 2 18×5 + 3 19×6 + C 35×7 = 879; 879 mod 103 = 55.
    const codes = code128Codes('PJJ123C');
    expect(codes).toEqual([104, 48, 42, 42, 17, 18, 19, 35, 55, 106]);
    // 104 + A 33×1 + B 34×2 + C 35×3 = 310; 310 mod 103 = 1.
    expect(code128Codes('ABC').at(-2)).toBe(1);
  });

  it('has a different bar pattern for every code, each the right width', () => {
    const one = (ch: string) => code128Widths(ch).slice(6, 12).join('');
    const printable = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i));
    expect(new Set(printable.map(one)).size).toBe(95);
    for (const ch of printable) expect(one(ch).split('').reduce((a, b) => a + Number(b), 0)).toBe(11);
  });

  it('draws 11-module codes and a 13-module stop', () => {
    const widths = code128Widths('NX0123456789');
    // start + 12 characters + check = 14 codes of 6 bars, then the stop's 7.
    expect(widths).toHaveLength(14 * 6 + 7);
    expect(widths.reduce((a, b) => a + b, 0)).toBe(14 * 11 + 13);
  });

  it('makes an SVG, and refuses characters a barcode can’t hold', () => {
    expect(code128Svg('NX0001')).toMatch(/^<svg[^>]+viewBox/);
    expect(canEncode128('NX0001')).toBe(true);
    expect(canEncode128('Tee – black')).toBe(false);
    expect(() => code128Codes('')).toThrow();
  });

  it('puts name, size, colour, price and barcode on each label', () => {
    const html = labelsHtml([{ name: 'Classic Tee <Black>', option: 'M / Black', price: '$39.95', barcode: 'NX0001' }]);
    expect(html).toContain('Classic Tee &lt;Black&gt;');
    expect(html).toContain('M / Black');
    expect(html).toContain('$39.95');
    expect(html).toContain('NX0001');
    expect(html).toContain('<svg');
  });
});

describe('stock levels', () => {
  it('counts each variant, per store or all together', () => {
    expect(variantStock(levels, 'tee-m')).toBe(12);
    expect(variantStock(levels, 'tee-m', 'store-a')).toBe(5);
    expect(variantStock(levels, 'tee-m', null)).toBe(0);
    expect(variantStock(levels, 'nothing')).toBe(0);
    expect(productStock(levels, tee)).toBe(14);
  });

  it('shows out of stock and low stock clearly', () => {
    expect(stockStatus(0, 3)).toBe('out');
    expect(stockStatus(3, 3)).toBe('low');
    expect(stockStatus(4, 3)).toBe('ok');
    // One size low makes the product show low.
    expect(productStatus(levels, tee)).toBe('low');
    expect(productStatus(levels, gel)).toBe('ok');
    expect(productStatus(new Map(), gel)).toBe('out');
  });

  it('values stock at cost and sell price', () => {
    expect(stockValue([tee, gel], levels)).toEqual({ cost: 14 * 10 + 40 * 4, sell: 14 * 33 + 40 * 20 });
    expect(stockValue([{ ...tee, archived: true }], levels)).toEqual({ cost: 0, sell: 0 });
  });

  it('works out the profit margin (GST taken off a GST-inclusive price)', () => {
    expect(marginPercent(10, 33, true, true)).toBe(67); // 33 / 1.1 = 30: (30 - 10) / 30
    expect(marginPercent(10, 20, false, false)).toBe(50);
    expect(marginPercent(25, 20, false, false)).toBe(-25);
    expect(marginPercent(null, 20, false, false)).toBeNull();
    expect(marginPercent(10, 0, false, false)).toBeNull();
  });
});

describe('finding products', () => {
  it('searches name, brand, barcode, size and colour', () => {
    expect(searchProducts([tee, gel], 'bondi').map((p) => p.id)).toEqual(['tee']);
    expect(searchProducts([tee, gel], 'black m').map((p) => p.id)).toEqual(['tee']);
    expect(searchProducts([tee, gel], '9312345678901').map((p) => p.id)).toEqual(['tee']);
    expect(searchProducts([tee, gel], '')).toHaveLength(2);
  });

  it('opens the exact variant for a barcode', () => {
    expect(findBarcode([tee, gel], '9312345678901')?.variant.id).toBe('tee-m');
    expect(findBarcode([tee, gel], ' NXgel-1 ')?.product.id).toBe('gel');
    expect(findBarcode([tee, gel], 'nope')).toBeNull();
  });

  it('sorts by stock level', () => {
    expect(sortProducts([gel, tee], 'low-first', levels).map((p) => p.id)).toEqual(['tee', 'gel']);
    expect(sortProducts([tee, gel], 'high-first', levels).map((p) => p.id)).toEqual(['gel', 'tee']);
    expect(sortProducts([tee, gel], 'name', levels).map((p) => p.id)).toEqual(['tee', 'gel']);
  });
});

describe('variants', () => {
  it('makes every size and colour combination', () => {
    expect(combineOptions(['S', 'M', 'm'], ['Black', 'White'])).toEqual([
      { size: 'S', colour: 'Black' },
      { size: 'S', colour: 'White' },
      { size: 'M', colour: 'Black' },
      { size: 'M', colour: 'White' },
      { size: 'm', colour: 'Black' },
      { size: 'm', colour: 'White' },
    ]);
    expect(combineOptions([], [])).toEqual([{ size: '', colour: '' }]);
    expect(combineOptions([' 10 '], [])).toEqual([{ size: '10', colour: '' }]);
    expect(variantLabel({ size: 'M', colour: 'Black' })).toBe('M / Black');
    expect(variantLabel({ size: '', colour: '' })).toBe('');
  });

  it('checks a product before saving', () => {
    const draft: ProductDraft = {
      ...tee,
      id: null,
      variants: [
        { id: null, size: 'S', colour: 'Black', sku: '', barcode: '', startingStock: 3 },
        { id: null, size: 'M', colour: 'Black', sku: '', barcode: '', startingStock: 0 },
      ],
    };
    expect(productProblem(draft)).toBeNull();
    expect(productProblem({ ...draft, name: ' ' })).toMatch(/name/);
    expect(productProblem({ ...draft, variants: [draft.variants[0], { ...draft.variants[0], size: 's' }] })).toMatch(/same size/);
    expect(productProblem({ ...draft, variants: [{ ...draft.variants[0], barcode: 'A' }, { ...draft.variants[1], barcode: 'A' }] })).toMatch(/same barcode/);
    expect(productProblem({ ...draft, variants: [{ ...draft.variants[0], startingStock: -1 }] })).toMatch(/whole number/);
  });

  it('explains database refusals clearly', () => {
    expect(stockError({ code: '23505', message: 'duplicate key value violates unique constraint "product_variants_unique_barcode"' })).toMatch(/barcode is already/);
    expect(stockError({ code: 'NXS03', message: 'Not enough in stock: only 2 left.' })).toBe('Not enough in stock: only 2 left.');
  });
});

describe('stocktake', () => {
  it('lists only counted items that differ from the records', () => {
    const counts = new Map([
      ['tee-s', 1],
      ['gel-1', 40],
    ]);
    expect(countDifferences(counts, levels, null)).toEqual([{ variantId: 'tee-s', expected: 2, counted: 1, difference: -1 }]);
    expect(countDifferences(new Map([['tee-m', 6]]), levels, 'store-a')).toEqual([{ variantId: 'tee-m', expected: 5, counted: 6, difference: 1 }]);
  });
});

describe('CSV import', () => {
  it('reads quotes, commas and Windows line endings', () => {
    expect(parseCsv('﻿Name,Price\r\n"Tee, black",39.95\r\n"Say ""hi""",5\n\n')).toEqual([
      ['Name', 'Price'],
      ['Tee, black', '39.95'],
      ['Say "hi"', '5'],
    ]);
  });

  it('groups rows into products with variants (the template)', () => {
    const { products, problems } = importProducts(parseCsv(CSV_TEMPLATE));
    expect(problems).toEqual([]);
    expect(products.map((p) => p.name)).toEqual(['Classic Tee', 'Hair Gel 150ml']);
    expect(products[0]).toMatchObject({ category: 'Tops', supplier: 'ABC Wholesale', costPrice: 12.5, sellPrice: 39.95, gstIncluded: true, lowStockLevel: 3 });
    expect(products[0].variants).toEqual([
      { size: 'S', colour: 'Black', sku: 'TEE-S-BLK', barcode: '', stock: 10 },
      { size: 'M', colour: 'Black', sku: 'TEE-M-BLK', barcode: '', stock: 12 },
    ]);
    expect(products[1].variants[0].barcode).toBe('9312345678901');
  });

  it('matches headings in any order and spelling, and skips bad rows with a reason', () => {
    const { products, problems } = importProducts(
      parseCsv('qty,Product Name,RRP,Color\n5,Mug,$12.00,Blue\nlots,Cup,3,\n2,,4,\n1,Mug,12,Blue'),
    );
    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject({ name: 'Mug', sellPrice: 12, costPrice: null });
    expect(products[0].variants).toEqual([{ size: '', colour: 'Blue', sku: '', barcode: '', stock: 5 }]);
    expect(problems).toHaveLength(3);
    expect(problems.join(' ')).toMatch(/Row 3.*stock/);
    expect(problems.join(' ')).toMatch(/Row 4.*no product name/);
    expect(problems.join(' ')).toMatch(/Row 5.*same size and colour/);
  });

  it('needs a Name column', () => {
    expect(importProducts(parseCsv('Price,Stock\n5,1')).problems[0]).toMatch(/no Name column/);
  });

  it('keeps each barcode once', () => {
    const { products, problems } = importProducts(parseCsv('Name,Size,Barcode\nTee,S,123\nTee,M,123'));
    expect(products[0].variants.map((v) => v.barcode)).toEqual(['123', '']);
    expect(problems[0]).toMatch(/used twice/);
  });
});
