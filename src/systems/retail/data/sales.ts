// NexGain Retail: sales and returns. The database records one automatically
// whenever stock is marked Sold or Returned (by the owner or on the staff
// Scanner), with the price, who sold it, the store and the GST (see
// supabase/migrations/20261127000500_retail_sales.sql). Kept live, so a sale
// on the Scanner shows on the owner's dashboard straight away.
import { useEffect } from 'react';

import { businessStore, useBusiness } from '@/data/business';
import { createStore } from '@/data/store';
import { systemOf } from '@/data/systems';
import { supabase } from '@/lib/supabase';
import type { Movement } from '@/systems/retail/data/stock';

export type Sale = {
  id: string;
  variantId: string | null;
  productId: string | null;
  /** "Classic Hoodie · M" (as it was when sold). */
  itemName: string;
  /** Items sold; negative for a return. */
  quantity: number;
  unitPrice: number;
  /** What the customer paid (incl. GST); negative for a return. */
  total: number;
  gst: number;
  storeId: string | null;
  employeeId: string | null;
  soldBy: string;
  soldAt: string;
};

export const salesStore = createStore<Sale[]>([]);
export const salesLoadStore = createStore<'idle' | 'loading' | 'ready' | 'error'>('idle');
export const useSales = () => salesStore.use();
export const useSalesLoad = () => salesLoadStore.use();

type SaleRow = {
  id: string;
  variant_id: string | null;
  product_id: string | null;
  item_name: string;
  quantity: number;
  unit_price: number | string;
  total: number | string;
  gst: number | string;
  store_id: string | null;
  employee_id: string | null;
  sold_by: string;
  sold_at: string;
};

const fromRow = (r: SaleRow): Sale => ({
  id: r.id,
  variantId: r.variant_id,
  productId: r.product_id,
  itemName: r.item_name,
  quantity: r.quantity,
  unitPrice: Number(r.unit_price),
  total: Number(r.total),
  gst: Number(r.gst),
  storeId: r.store_id,
  employeeId: r.employee_id,
  soldBy: r.sold_by,
  soldAt: r.sold_at,
});

/** The last two years of sales are loaded (plenty for this year vs last year). */
const YEARS_LOADED = 2;
const PAGE = 1000;

/** Loads every sale from the last two years (in pages of 1,000). */
export async function loadSales() {
  const id = businessStore.get()?.id;
  if (!id) return;
  salesLoadStore.set('loading');
  const since = new Date();
  since.setFullYear(since.getFullYear() - YEARS_LOADED);
  const all: Sale[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('sales')
      .select('*')
      .eq('business_id', id)
      .gte('sold_at', since.toISOString())
      .order('sold_at', { ascending: false })
      .range(from, from + PAGE - 1);
    // Before the step 6 database update is run there's no sales table: no sales yet.
    if (error) {
      salesLoadStore.set('error');
      return;
    }
    all.push(...(data as SaleRow[]).map(fromRow));
    if (data.length < PAGE) break;
  }
  salesStore.set(all);
  salesLoadStore.set('ready');
}

/** Loads the sales for a NexGain Retail business and keeps them live. */
export function useSalesSync() {
  const business = useBusiness();
  const id = business?.id ?? null;
  const retail = systemOf(business) === 'retail';
  useEffect(() => {
    if (!id || !retail) return;
    loadSales();
    const channel = supabase
      .channel(`sales-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sales', filter: `business_id=eq.${id}` }, (payload) => {
        const sale = fromRow(payload.new as SaleRow);
        salesStore.set((all) => [sale, ...all.filter((s) => s.id !== sale.id)]);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      salesStore.set([]);
      salesLoadStore.set('idle');
    };
  }, [id, retail]);
}

// ---------------------------------------------------------------------------
// Working things out (pure, tested)
// ---------------------------------------------------------------------------

/**
 * Sales in the shape of stock history lines, so the AI watchdog (best sellers,
 * how fast things sell) works from every sale, not just the latest stock changes.
 */
export function salesAsMovements(sales: Sale[]): Movement[] {
  return sales
    .filter((s) => s.variantId && s.quantity !== 0)
    .map((s) => ({
      id: s.id,
      variantId: s.variantId!,
      storeId: s.storeId,
      kind: s.quantity > 0 ? ('sold' as const) : ('returned' as const),
      change: -s.quantity,
      quantityAfter: 0,
      unitPrice: s.unitPrice,
      unitCost: null,
      note: '',
      actorName: s.soldBy,
      createdAt: s.soldAt,
    }));
}

/** Sales totals between two dates: money (incl. GST), GST, items and returns. */
export function salesTotals(sales: Sale[], start: Date, end: Date) {
  let total = 0;
  let gst = 0;
  let items = 0;
  let returned = 0;
  for (const s of sales) {
    const at = Date.parse(s.soldAt);
    if (at < start.getTime() || at >= end.getTime()) continue;
    total += s.total;
    gst += s.gst;
    if (s.quantity > 0) items += s.quantity;
    else returned -= s.quantity;
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return { total: round(total), gst: round(gst), exGst: round(total - gst), items, returned };
}

/** Each staff member's sales between two dates, most first. */
export function salesByPerson(sales: Sale[], start: Date, end: Date) {
  const map = new Map<string, { name: string; total: number; items: number }>();
  for (const s of sales) {
    const at = Date.parse(s.soldAt);
    if (at < start.getTime() || at >= end.getTime()) continue;
    const key = s.employeeId ?? `owner:${s.soldBy}`;
    const row = map.get(key) ?? { name: s.soldBy || 'Owner', total: 0, items: 0 };
    row.total += s.total;
    row.items += s.quantity;
    map.set(key, row);
  }
  return [...map.values()].map((r) => ({ ...r, total: Math.round(r.total * 100) / 100 })).sort((a, b) => b.total - a.total);
}
