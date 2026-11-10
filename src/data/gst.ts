// GST for Australian GST-registered businesses (see businessUsesGst): each
// quarter's GST collected, GST credits and estimated GST to pay, plus
// "Lodged / Paid". The maths lives in the database (gst_quarter_items), so this
// page, the dashboard tile and the reminders always agree.
// See supabase/migrations/20261112000000_gst.sql.
import { useEffect, useState } from 'react';

import { useBusiness } from '@/data/business';
import { useDocs } from '@/data/invoices';
import { useReceipts } from '@/data/receipts';
import { businessUsesGst } from '@/data/super-rules';
import { supabase } from '@/lib/supabase';

export type GstItem = {
  kind: 'sale' | 'expense';
  source: 'invoice' | 'receipt' | 'bank' | 'expense';
  refId: string;
  day: string;
  description: string;
  /** Full amount, including GST. */
  amount: number;
  /** GST counted (0 when it can't be claimed yet). */
  gst: number;
  /** '', 'estimated' (1/11 of a purchase of $82.50 or less) or 'needs receipt'. */
  note: '' | 'estimated' | 'needs receipt';
};

export type GstQuarter = {
  /** First day, e.g. 1 Jul. */
  start: Date;
  /** Day after the last day. */
  end: Date;
  /** "Jul – Sep 2026" */
  label: string;
  /** Financial-year quarter, e.g. "Q1 2026–27". */
  fyLabel: string;
  basDue: Date;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The Australian GST quarter a day falls in (Jul–Sep, Oct–Dec, Jan–Mar, Apr–Jun). */
export function quarterOf(day: Date): GstQuarter {
  const start = new Date(day.getFullYear(), Math.floor(day.getMonth() / 3) * 3, 1);
  const end = new Date(start.getFullYear(), start.getMonth() + 3, 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 0);
  // Due the 28th of the month after the quarter; Oct–Dec is due 28 Feb.
  const basDue = start.getMonth() === 9 ? new Date(start.getFullYear() + 1, 1, 28) : new Date(end.getFullYear(), end.getMonth(), 28);
  const fyStart = start.getMonth() >= 6 ? start.getFullYear() : start.getFullYear() - 1;
  const q = ((start.getMonth() - 6 + 12) % 12) / 3 + 1;
  return {
    start,
    end,
    label: `${MONTHS[start.getMonth()]} – ${MONTHS[last.getMonth()]} ${last.getFullYear()}`,
    fyLabel: `Q${q} ${fyStart}–${String(fyStart + 1).slice(2)}`,
    basDue,
  };
}

/** This quarter and the ones before it, newest first. */
export function recentQuarters(now = new Date(), count = 8): GstQuarter[] {
  return Array.from({ length: count }, (_, i) => quarterOf(new Date(now.getFullYear(), now.getMonth() - i * 3, 1)));
}

export const formatDay = (d: Date) => d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });

export type GstTotals = { collected: number; credits: number; toPay: number };

export function gstTotals(items: GstItem[]): GstTotals {
  const round = (n: number) => Math.round(n * 100) / 100;
  const collected = round(items.filter((i) => i.kind === 'sale').reduce((s, i) => s + i.gst, 0));
  const credits = round(items.filter((i) => i.kind === 'expense').reduce((s, i) => s + i.gst, 0));
  return { collected, credits, toPay: round(collected - credits) };
}

type ItemRow = { kind: string; source: string; ref_id: string; day: string; description: string; amount: number | string; gst: number | string; note: string };

/** One quarter's items and whether it's been marked lodged, from the database. */
async function fetchQuarter(businessId: string, startKey: string) {
  const [{ data, error }, lodged] = await Promise.all([
    supabase.rpc('gst_quarter_items', { p_quarter: startKey }),
    supabase.from('gst_quarters').select('lodged_at').eq('business_id', businessId).eq('quarter_start', startKey).maybeSingle(),
  ]);
  if (error) throw error;
  const items: GstItem[] = (data as ItemRow[]).map((r) => ({
    kind: r.kind as GstItem['kind'],
    source: r.source as GstItem['source'],
    refId: r.ref_id,
    day: r.day,
    description: r.description,
    amount: Number(r.amount),
    gst: Number(r.gst),
    note: (r.note || '') as GstItem['note'],
  }));
  return { items, lodgedAt: (lodged.data as { lodged_at: string | null } | null)?.lodged_at ?? null };
}

/**
 * One quarter's GST items, refreshed when invoices or receipts change.
 * Does nothing (and returns no items) for businesses that don't use GST.
 */
export function useGstQuarter(quarter: GstQuarter) {
  const business = useBusiness();
  const enabled = businessUsesGst(business);
  const businessId = business?.id ?? null;
  const docs = useDocs();
  const receipts = useReceipts();
  const [items, setItems] = useState<GstItem[]>([]);
  const [lodgedAt, setLodgedAt] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const startKey = key(quarter.start);

  // Again whenever invoices or receipts change (e.g. an invoice is marked paid).
  useEffect(() => {
    if (!enabled || !businessId) return;
    let live = true;
    fetchQuarter(businessId, startKey)
      .then((r) => {
        if (!live) return;
        setItems(r.items);
        setLodgedAt(r.lodgedAt);
        setStatus('ready');
      })
      .catch(() => live && setStatus('error'));
    return () => {
      live = false;
    };
  }, [enabled, businessId, startKey, docs, receipts]);

  async function setLodged(lodged: boolean) {
    const { error } = await supabase.rpc('mark_gst_quarter', { p_quarter: startKey, p_lodged: lodged });
    if (error) return 'Couldn’t save that. Check your internet connection and try again.';
    setLodgedAt(lodged ? new Date().toISOString() : null);
    return null;
  }

  return { enabled, items, totals: gstTotals(items), lodgedAt, status, setLodged };
}
