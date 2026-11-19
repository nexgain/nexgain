// NexGain Retail business types and their preset product categories, and the
// sign-up categories step. FAKE sign-ups only.
import { describe, expect, it } from '@jest/globals';

import { INDUSTRIES } from '@/data/industries';
import { BOOKING_TYPES } from '@/systems/bookings/constants/booking-business-types';
import { retailCategoriesProblem } from '@/systems/retail/components/signup/step-retail-categories';
import {
  cleanCategories,
  findRetailType,
  presetCategories,
  PRESET_SIZES,
  RETAIL_TYPES,
} from '@/systems/retail/constants/retail-business-types';

describe('retail business types', () => {
  it('lists every retail type asked for, plus Other Retail', () => {
    expect(RETAIL_TYPES.map((t) => t.name)).toEqual([
      'Clothing Brand',
      'Clothing Boutique',
      'Shoe Store',
      'General Retail Store',
      'Chemist / Pharmacy',
      'Beauty & Cosmetics Store',
      'Gift Shop',
      'Homewares',
      'Sporting Goods',
      'Jewellery & Accessories',
      'Bookshop',
      'Electronics Store',
      'Toy Store',
      'I Sell My Own Product',
      'Other Retail',
    ]);
    expect(RETAIL_TYPES.filter((t) => t.other).map((t) => t.id)).toEqual(['other-retail']);
  });

  it('never mixes in service or booking types (or restaurants)', () => {
    const others = new Set([...INDUSTRIES.map((i) => i.name.toLowerCase()), ...BOOKING_TYPES.map((t) => t.name.toLowerCase())]);
    expect(RETAIL_TYPES.filter((t) => others.has(t.name.toLowerCase()))).toEqual([]);
    expect(RETAIL_TYPES.some((t) => /restaurant|cafe|café/i.test(t.name))).toBe(false);
  });

  it('has unique ids that the database accepts', () => {
    const ids = RETAIL_TYPES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]{1,60}$/);
  });

  it('gives each type its own preset categories', () => {
    expect(findRetailType('clothing-brand')?.categories).toEqual(['T-Shirts', 'Hoodies', 'Shorts', 'Jackets', 'Pants', 'Hats', 'Accessories']);
    expect(findRetailType('pharmacy')?.categories).toEqual(expect.arrayContaining(['Medicine', 'Vitamins', 'Skincare', 'Personal Care', 'Baby']));
    expect(presetCategories('pharmacy').map((c) => c.name)).not.toContain('Hoodies');
    expect(presetCategories(null)).toEqual([]);
    for (const t of RETAIL_TYPES) expect(t.categories.length).toBeGreaterThanOrEqual(2);
  });

  it('suggests clothing or shoe sizes only where they fit', () => {
    expect(PRESET_SIZES[findRetailType('clothing-boutique')!.variants]).toContain('M');
    expect(PRESET_SIZES[findRetailType('shoe-store')!.variants]).toContain('9');
    expect(PRESET_SIZES[findRetailType('bookshop')!.variants]).toEqual([]);
  });
});

describe('sign-up categories step', () => {
  it('cleans the list: trims, drops blanks and repeats', () => {
    expect(cleanCategories([{ name: ' Tops ' }, { name: '' }, { name: 'tops' }, { name: 'Gift  Sets' }])).toEqual(['Tops', 'Gift Sets']);
  });

  it('needs at least one category', () => {
    expect(retailCategoriesProblem({ retailCategories: [{ key: 'a', name: 'Tops' }] })).toBeNull();
    expect(retailCategoriesProblem({ retailCategories: [{ key: 'a', name: '  ' }] })).toMatch(/at least one/);
  });
});
