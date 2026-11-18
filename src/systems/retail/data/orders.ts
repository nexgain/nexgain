// NexGain Retail: orders to suppliers and manufacturers ("purchase orders").
// Draft (saved, not sent) -> Sent (emailed to the supplier) -> Pending (the
// supplier has it, waiting for delivery) -> Delivered (the stock is added
// automatically, once). Or Cancelled. Stored in Supabase (see
// supabase/migrations/20261127000300_retail_orders.sql).
import { useEffect } from 'react';

import { businessStore, useBusiness } from '@/data/business';
import { formatMoney } from '@/data/payroll';
import { createStore } from '@/data/store';
import { systemOf } from '@/data/systems';
import { supabase } from '@/lib/supabase';
import { refreshStock, stockError, variantLabel, type Product, type Supplier } from '@/systems/retail/data/stock';

export type OrderStatus = 'draft' | 'sent' | 'pending' | 'delivered' | 'cancelled';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  pending: 'Pending',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

/** The colour of each status's pill. */
export function orderStatusTone(status: OrderStatus): 'success' | 'neutral' | 'warning' | 'accent' {
  return status === 'delivered' ? 'success' : status === 'draft' || status === 'cancelled' ? 'neutral' : status === 'pending' ? 'warning' : 'accent';
}

export type OrderLine = { variantId: string; quantity: number; unitCost: number | null };

export type PurchaseOrder = {
  id: string;
  /** PO-0001 */
  number: string;
  supplierId: string | null;
  status: OrderStatus;
  storeId: string | null;
  deliveryAddress: string;
  /** "YYYY-MM-DD" */
  requestedDate: string | null;
  notes: string;
  sentAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  lines: OrderLine[];
};

export const ordersStore = createStore<PurchaseOrder[]>([]);
export const useOrders = () => ordersStore.use();

type OrderRow = {
  id: string;
  number: string;
  supplier_id: string | null;
  status: OrderStatus;
  store_id: string | null;
  delivery_address: string;
  requested_date: string | null;
  notes: string;
  sent_at: string | null;
  delivered_at: string | null;
  created_at: string;
};
type LineRow = { order_id: string; variant_id: string; quantity: number; unit_cost: number | string | null };

const ORDER_COLUMNS = 'id, number, supplier_id, status, store_id, delivery_address, requested_date, notes, sent_at, delivered_at, created_at';

const orderFromRow = (r: OrderRow, lines: LineRow[]): PurchaseOrder => ({
  id: r.id,
  number: r.number,
  supplierId: r.supplier_id,
  status: r.status,
  storeId: r.store_id,
  deliveryAddress: r.delivery_address,
  requestedDate: r.requested_date,
  notes: r.notes,
  sentAt: r.sent_at,
  deliveredAt: r.delivered_at,
  createdAt: r.created_at,
  lines: lines
    .filter((l) => l.order_id === r.id)
    .map((l) => ({ variantId: l.variant_id, quantity: l.quantity, unitCost: l.unit_cost === null ? null : Number(l.unit_cost) })),
});

const businessId = () => businessStore.get()?.id ?? null;

/** Loads every order (newest first). */
export async function loadOrders() {
  const id = businessId();
  if (!id) return;
  const [orders, lines] = await Promise.all([
    supabase.from('purchase_orders').select(ORDER_COLUMNS).eq('business_id', id).order('created_at', { ascending: false }),
    supabase.from('purchase_order_lines').select('order_id, variant_id, quantity, unit_cost').eq('business_id', id),
  ]);
  // Before the step 4 database update is run there are no orders.
  if (orders.error || lines.error) return;
  ordersStore.set((orders.data as OrderRow[]).map((r) => orderFromRow(r, lines.data as LineRow[])));
}

/** Loads the orders for a NexGain Retail business and keeps them up to date. */
export function useOrdersSync() {
  const business = useBusiness();
  const id = business?.id ?? null;
  const retail = systemOf(business) === 'retail';
  useEffect(() => {
    if (!id || !retail) return;
    loadOrders();
    const channel = supabase
      .channel(`orders-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_orders', filter: `business_id=eq.${id}` }, () => loadOrders())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      ordersStore.set([]);
    };
  }, [id, retail]);
}

// ---------------------------------------------------------------------------
// Working things out (pure, tested)
// ---------------------------------------------------------------------------

/** Each line's subtotal and the order total (lines with no cost count as $0). */
export function orderTotal(lines: OrderLine[]) {
  return Math.round(lines.reduce((sum, l) => sum + l.quantity * (l.unitCost ?? 0), 0) * 100) / 100;
}

/** Orders still to arrive (Sent or Pending). */
export const isOpen = (o: Pick<PurchaseOrder, 'status'>) => o.status === 'sent' || o.status === 'pending';

/** How many of each variant are on order and still to arrive. */
export function onOrder(orders: PurchaseOrder[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const o of orders) if (isOpen(o)) for (const l of o.lines) map.set(l.variantId, (map.get(l.variantId) ?? 0) + l.quantity);
  return map;
}

/** "Fri 24 Jan 2025" for "2025-01-24". */
export function formatOrderDate(dateKey: string | null) {
  if (!dateKey) return 'Not set';
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

/** The email that goes to the supplier: every item, size and quantity, delivery details and notes. */
export function orderEmail(order: PurchaseOrder, products: Product[], supplier: Supplier | null, businessName: string) {
  const find = (variantId: string) => {
    for (const p of products) {
      const v = p.variants.find((x) => x.id === variantId);
      if (v) return { p, v };
    }
    return null;
  };
  const items = order.lines.map((l) => {
    const f = find(l.variantId);
    if (!f) return `• Item no longer in NexGain × ${l.quantity}`;
    const sku = f.v.sku || f.p.sku;
    const option = variantLabel(f.v);
    return `• ${f.p.name}${option ? ` – ${option}` : ''}${sku ? ` (${sku})` : ''} × ${l.quantity}${l.unitCost !== null ? ` @ ${formatMoney(l.unitCost)}` : ''}`;
  });
  const total = orderTotal(order.lines);
  const body = [
    `Hi${supplier?.contactName ? ` ${supplier.contactName.split(' ')[0]}` : ''},`,
    '',
    `Please supply the following for order ${order.number}:`,
    '',
    ...items,
    '',
    ...(total > 0 ? [`Order total: ${formatMoney(total)}`, ''] : []),
    `Deliver to: ${order.deliveryAddress || 'please confirm with us'}`,
    `Requested delivery: ${formatOrderDate(order.requestedDate)}`,
    ...(order.notes.trim() ? ['', `Notes: ${order.notes.trim()}`] : []),
    '',
    'Please reply to confirm the order and the delivery date.',
    '',
    'Thanks,',
    businessName,
  ].join('\n');
  return { to: supplier?.email ?? '', subject: `Order ${order.number} from ${businessName}`, body };
}

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------

export type OrderDraft = Omit<PurchaseOrder, 'id' | 'number' | 'sentAt' | 'deliveredAt' | 'createdAt' | 'status'> & {
  id: string | null;
  status: 'draft' | 'sent' | 'pending';
};

/** What's stopping the order from being saved, or null. */
export function orderProblem(d: Pick<OrderDraft, 'lines' | 'supplierId'>) {
  if (!d.supplierId) return 'Choose who you’re ordering from.';
  if (d.lines.length === 0) return 'Add at least one item.';
  if (d.lines.some((l) => !Number.isInteger(l.quantity) || l.quantity < 1)) return 'Each item needs a quantity of 1 or more.';
  return null;
}

/** Saves an order (new or changed) with its lines. Returns the saved order, or an error message. */
export async function saveOrder(d: OrderDraft): Promise<{ order: PurchaseOrder } | { error: string }> {
  const biz = businessId();
  if (!biz) return { error: 'Your shop isn’t set up yet.' };
  const problem = orderProblem(d);
  if (problem) return { error: problem };
  const cols = {
    supplier_id: d.supplierId,
    status: d.status,
    store_id: d.storeId,
    delivery_address: d.deliveryAddress.trim().slice(0, 300),
    requested_date: d.requestedDate,
    notes: d.notes.trim().slice(0, 1000),
    updated_at: new Date().toISOString(),
    ...(d.status === 'sent' ? { sent_at: new Date().toISOString() } : {}),
  };
  const saved = d.id
    ? await supabase.from('purchase_orders').update(cols).eq('id', d.id).select(ORDER_COLUMNS).single<OrderRow>()
    : await supabase.from('purchase_orders').insert({ ...cols, business_id: biz }).select(ORDER_COLUMNS).single<OrderRow>();
  if (saved.error) return { error: stockError(saved.error) };
  const orderId = saved.data.id;

  // The lines: replaced as a whole (same quantities merged).
  const merged = new Map<string, OrderLine>();
  for (const l of d.lines) {
    const before = merged.get(l.variantId);
    merged.set(l.variantId, before ? { ...before, quantity: before.quantity + l.quantity } : l);
  }
  const { error: clearError } = await supabase.from('purchase_order_lines').delete().eq('order_id', orderId);
  if (clearError) return { error: stockError(clearError) };
  const rows = [...merged.values()].map((l) => ({ order_id: orderId, business_id: biz, variant_id: l.variantId, quantity: l.quantity, unit_cost: l.unitCost }));
  const { data: lineRows, error } = await supabase.from('purchase_order_lines').insert(rows).select('order_id, variant_id, quantity, unit_cost');
  if (error) return { error: stockError(error) };

  const order = orderFromRow(saved.data, lineRows as LineRow[]);
  ordersStore.set((all) => [order, ...all.filter((o) => o.id !== order.id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  return { order };
}

/** Sent, Pending or Cancelled. Returns an error message, or null. */
export async function setOrderStatus(orderId: string, status: 'sent' | 'pending' | 'cancelled' | 'draft'): Promise<string | null> {
  const changes = { status, updated_at: new Date().toISOString(), ...(status === 'sent' ? { sent_at: new Date().toISOString() } : {}) };
  const { error } = await supabase.from('purchase_orders').update(changes).eq('id', orderId);
  if (error) return stockError(error);
  ordersStore.set((all) => all.map((o) => (o.id === orderId ? { ...o, status, sentAt: status === 'sent' ? changes.sent_at! : o.sentAt } : o)));
  return null;
}

/** Marks the order delivered: its items are added to stock (once). Returns an error message, or null. */
export async function deliverOrder(orderId: string): Promise<string | null> {
  const { error } = await supabase.rpc('purchase_order_deliver', { p_order: orderId });
  if (error) return stockError(error);
  await Promise.all([refreshStock(), loadOrders()]);
  return null;
}

/** Deletes a draft or cancelled order. Returns an error message, or null. */
export async function deleteOrder(orderId: string): Promise<string | null> {
  const { error } = await supabase.from('purchase_orders').delete().eq('id', orderId);
  if (error) return stockError(error);
  ordersStore.set((all) => all.filter((o) => o.id !== orderId));
  return null;
}
