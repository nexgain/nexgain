// Price rises for the same product (from receipt line items), and deleting notifications with Undo.
import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { productKey, productPriceRises, purchasesFromReceipts } from '../../../supabase/functions/_shared/ai/products';
import { runHealthCheck } from '../../../supabase/functions/_shared/ai/insights';
import { buildSampleSnapshot } from '@/data/ai-sample-data';
import { deleteNotification, notificationsStore, undoNotificationDelete, UNDO_DELETE_MS, type AppNotification } from '@/data/notifications';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn(() => ({ delete: () => ({ eq: () => Promise.resolve({ error: null }) }) })) } }));

const receipt = (id: string, date: string, items: { description: string; quantity: number | null; amount: number | null }[], supplier = 'Pool Supplies Co') => ({
  id,
  status: 'ready',
  supplier,
  date,
  lineItems: items,
});

describe('recognising the same product', () => {
  it('treats different ways of writing it as the same', () => {
    const key = productKey('Liquid Chlorine 20L');
    expect(productKey('LIQUID CHLORINE 20 LITRE')).toBe(key);
    expect(productKey('liquid chlorine 20lt')).toBe(key);
    expect(productKey('Chlorine 20L, liquid')).toBe(key);
  });

  it('keeps different sizes apart', () => {
    expect(productKey('Liquid Chlorine 15L')).not.toBe(productKey('Liquid Chlorine 20L'));
  });

  it('ignores totals and blank lines', () => {
    expect(productKey('GST')).toBeNull();
    expect(productKey('  ')).toBeNull();
  });
});

describe('product price rises', () => {
  it('finds the chlorine rise: $20 last month, $24 this week (+20%)', () => {
    const purchases = purchasesFromReceipts([
      receipt('r1', '2026-10-12', [{ description: 'Liquid Chlorine 20L', quantity: 1, amount: 20 }]),
      receipt('r2', '2026-11-06', [{ description: 'LIQUID CHLORINE 20 LITRE', quantity: 2, amount: 48 }]),
    ]);
    const [rise] = productPriceRises(purchases, '2026-11-09');
    expect(rise).toMatchObject({ changePercent: 20 });
    expect(rise!.before.unitPrice).toBe(20);
    expect(rise!.now.unitPrice).toBe(24);
  });

  it('ignores the same price, cheaper, or an old purchase', () => {
    const purchases = purchasesFromReceipts([
      receipt('r1', '2026-10-12', [
        { description: 'Sugar soap 1L', quantity: 1, amount: 9.5 },
        { description: 'Pool salt 20kg', quantity: 1, amount: 15 },
      ]),
      receipt('r2', '2026-11-06', [
        { description: 'Sugar Soap 1L', quantity: 1, amount: 9.5 },
        { description: 'Pool Salt 20kg', quantity: 1, amount: 13 },
      ]),
    ]);
    expect(productPriceRises(purchases, '2026-11-09')).toEqual([]);
    expect(productPriceRises(purchases, '2027-03-01')).toEqual([]);
  });

  it('sends it as an insight from the health check (not based on total spending)', () => {
    const insights = runHealthCheck(buildSampleSnapshot(new Date(2026, 10, 9)), new Date(2026, 10, 9));
    const chlorine = insights.find((i) => i.check === 'product_price_increase');
    expect(chlorine?.title).toContain('up 20%');
    expect(chlorine?.placements).toContain('attention');
    expect(insights.some((i) => i.check === 'spending_category_increase' && i.metrics.category === 'Materials')).toBe(false);
  });
});

describe('deleting notifications', () => {
  const n = { id: 'local-1', audience: 'owner', type: 'job_completed', title: 'Job done', summary: '', body: '', createdAt: '2026-11-09T01:00:00Z', read: false } as AppNotification;

  afterEach(() => {
    jest.useRealTimers();
  });

  it('removes it straight away and can be undone', () => {
    jest.useFakeTimers();
    notificationsStore.set([n]);
    deleteNotification(n.id);
    expect(notificationsStore.get()).toEqual([]);
    undoNotificationDelete(n.id);
    expect(notificationsStore.get()).toEqual([n]);
  });

  it('is gone for good after the undo time', () => {
    jest.useFakeTimers();
    notificationsStore.set([n]);
    deleteNotification(n.id);
    jest.advanceTimersByTime(UNDO_DELETE_MS + 10);
    undoNotificationDelete(n.id);
    expect(notificationsStore.get()).toEqual([]);
  });
});
