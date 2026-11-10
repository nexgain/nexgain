// GST: Australian quarters and BAS due dates, totals, and who sees GST at all.
// Uses a FAKE GST-registered business and a FAKE non-GST business.
import { describe, expect, it, jest } from '@jest/globals';

import { businessStore, currentGstRate, type BusinessProfile } from '@/data/business';
import { gstTotals, quarterOf, recentQuarters, type GstItem } from '@/data/gst';
import { docTotals } from '@/data/invoices';
import { businessUsesGst } from '@/data/super-rules';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const fakeGstBusiness = { id: 'b1', country: 'AU', gstRegistered: true } as BusinessProfile;
const fakeNoGstBusiness = { id: 'b2', country: 'AU', gstRegistered: false } as BusinessProfile;
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);

describe('Australian GST quarters', () => {
  it('uses Jul–Sep, Oct–Dec, Jan–Mar and Apr–Jun with the right BAS due dates', () => {
    const q1 = quarterOf(day(2026, 8, 15));
    expect(q1.label).toBe('Jul – Sep 2026');
    expect(q1.fyLabel).toBe('Q1 2026–27');
    expect(q1.basDue).toEqual(day(2026, 10, 28));
    expect(quarterOf(day(2026, 11, 1)).basDue).toEqual(day(2027, 2, 28)); // Oct–Dec: 28 Feb
    expect(quarterOf(day(2027, 2, 10)).basDue).toEqual(day(2027, 4, 28)); // Jan–Mar: 28 Apr
    expect(quarterOf(day(2027, 5, 31)).basDue).toEqual(day(2027, 7, 28)); // Apr–Jun: 28 Jul
    expect(quarterOf(day(2027, 5, 31)).fyLabel).toBe('Q4 2026–27');
  });

  it('lists this quarter first, then earlier ones', () => {
    const list = recentQuarters(day(2026, 11, 12), 3).map((q) => q.label);
    expect(list).toEqual(['Oct – Dec 2026', 'Jul – Sep 2026', 'Apr – Jun 2026']);
  });
});

describe('GST totals', () => {
  it('is GST collected minus GST credits', () => {
    const items = [
      { kind: 'sale', gst: 100 },
      { kind: 'sale', gst: 50.5 },
      { kind: 'expense', gst: 20.25 },
      { kind: 'expense', gst: 0 }, // needs a receipt: not counted
    ] as GstItem[];
    expect(gstTotals(items)).toEqual({ collected: 150.5, credits: 20.25, toPay: 130.25 });
  });
});

describe('who sees GST', () => {
  it('is only Australian GST-registered businesses', () => {
    expect(businessUsesGst(fakeGstBusiness)).toBe(true);
    expect(businessUsesGst(fakeNoGstBusiness)).toBe(false);
    expect(businessUsesGst({ country: 'NZ', gstRegistered: true })).toBe(false);
    expect(businessUsesGst(null)).toBe(false);
  });

  it('adds 10% GST to new invoices only for a GST business', () => {
    businessStore.set(fakeGstBusiness);
    expect(currentGstRate()).toBe(0.1);
    expect(docTotals([{ qty: 2, rate: 50 }], currentGstRate())).toMatchObject({ subtotal: 100, gst: 10, total: 110 });
    businessStore.set(fakeNoGstBusiness);
    expect(currentGstRate()).toBe(0);
    expect(docTotals([{ qty: 2, rate: 50 }], currentGstRate())).toMatchObject({ subtotal: 100, gst: 0, total: 100 });
  });
});
