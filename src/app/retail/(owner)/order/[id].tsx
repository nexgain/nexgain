// Place Order / an order (NexGain Retail): the supplier at the top, the order
// items (each product with a Size / Quantity / Subtotal table), the order
// total, where to deliver, the requested delivery date and notes. "Place
// Order" emails it to the supplier (from the owner's own email); "Save as
// Draft" keeps it to finish later.
// An existing order shows its status: Sent orders can be marked Pending
// (the supplier has confirmed), and Sent / Pending orders marked Delivered,
// which adds the items to stock automatically (once).
// Opened as /retail/order/new?supplier=...&items=[[variantId, qty], ...] for a
// ready-made order (from Product Details or the AI's "Review & Order Stock").
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useNativePicker } from '@/components/pickers/use-native-picker';
import { ConfirmDialog } from '@/systems/retail/components/owner/confirm-dialog';
import { OptionSheet, OWNER_PICKER_THEME } from '@/systems/retail/components/owner/form';
import { IconSquare, InfoRow, Panel, Pill, TableHead, retailStyles } from '@/systems/retail/components/owner/retail-ui';
import { Chips, ProductPicker, ProductPhoto, QuantityBox, StockIcons, stockStyles } from '@/systems/retail/components/owner/stock-ui';
import { Button, EmptyState, goBack, Icon, OwnerScreen, PageHeader } from '@/systems/retail/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { businessStore, useBusiness } from '@/data/business';
import { formatMoney } from '@/data/payroll';
import { openEmailDraft } from '@/lib/email';
import {
  deleteOrder,
  deliverOrder,
  formatOrderDate,
  ORDER_STATUS_LABELS,
  orderEmail,
  orderStatusTone,
  orderProblem,
  orderTotal,
  saveOrder,
  setOrderStatus,
  useOrders,
  type OrderLine,
  type PurchaseOrder,
} from '@/systems/retail/data/orders';
import { hasManyStores, useStores } from '@/systems/retail/data/retail';
import { isConnected, productSku, useProducts, useStockLevels, useSuppliers, variantLabel, type Product } from '@/systems/retail/data/stock';

const FACTORY = { ios: 'building.2.fill', android: 'factory', web: 'factory' } as const;
const DAY = 86_400_000;
const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromKey = (k: string) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};

type Edit = 'address' | 'notes' | null;

export default function OrderScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string; supplier?: string; items?: string }>();
  const orders = useOrders();
  const existing = orders.find((o) => o.id === params.id) ?? null;
  const products = useProducts();
  const levels = useStockLevels();
  const suppliers = useSuppliers();
  const stores = useStores();
  const manyStores = hasManyStores(stores);
  const business = useBusiness();

  // A new order starts from the link's supplier and items, the last delivery address and the supplier's delivery time.
  const [supplierId, setSupplierId] = useState<string | null>(() => existing?.supplierId ?? (params.supplier || null));
  const [lines, setLines] = useState<OrderLine[]>(() => {
    if (existing) return existing.lines;
    try {
      const items = JSON.parse(params.items ?? '[]') as [string, number][];
      return items.map(([variantId, quantity]) => {
        const product = products.find((p) => p.variants.some((v) => v.id === variantId));
        return { variantId, quantity: Math.max(1, Math.round(quantity)), unitCost: product?.costPrice ?? null };
      });
    } catch {
      return [];
    }
  });
  const [address, setAddress] = useState(() => existing?.deliveryAddress ?? orders.find((o) => o.deliveryAddress)?.deliveryAddress ?? stores[0]?.address ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [requested, setRequested] = useState<string | null>(() => {
    if (existing) return existing.requestedDate;
    const lead = suppliers.find((s) => s.id === (params.supplier || null))?.leadTimeDays ?? 7;
    return keyOf(new Date(Date.now() + lead * DAY));
  });
  const [storeId, setStoreId] = useState<string | null>(existing?.storeId ?? (manyStores ? (stores[0]?.id ?? null) : null));
  const [editing, setEditing] = useState<Edit>(null);
  const [editText, setEditText] = useState('');
  const [supplierSheet, setSupplierSheet] = useState(false);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [askSent, setAskSent] = useState<PurchaseOrder | null>(null);
  const [confirm, setConfirm] = useState<'deliver' | 'cancel' | 'delete' | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const editable = !existing || existing.status === 'draft';
  const supplier = suppliers.find((s) => s.id === supplierId) ?? null;
  const total = orderTotal(lines);
  const datePicker = useNativePicker({
    mode: 'date',
    value: requested ? fromKey(requested) : new Date(),
    onChange: (d: Date) => setRequested(keyOf(d)),
    title: 'Requested delivery',
    theme: OWNER_PICKER_THEME,
  });

  // Items grouped by product, in the order they were added.
  const groups: { product: Product; lines: OrderLine[] }[] = [];
  for (const l of lines) {
    const product = products.find((p) => p.variants.some((v) => v.id === l.variantId));
    if (!product) continue;
    const g = groups.find((x) => x.product.id === product.id);
    if (g) g.lines.push(l);
    else groups.push({ product, lines: [l] });
  }

  const setQty = (variantId: string, quantity: number) =>
    setLines((all) => (quantity <= 0 ? all.filter((l) => l.variantId !== variantId) : all.map((l) => (l.variantId === variantId ? { ...l, quantity } : l))));

  const draftOf = (status: 'draft' | 'sent') => ({
    id: existing?.id ?? null,
    supplierId,
    status,
    storeId,
    deliveryAddress: address,
    requestedDate: requested,
    notes,
    lines,
  });

  async function save(asDraft: boolean) {
    setMessage(null);
    const problem = orderProblem({ supplierId, lines });
    if (problem) return setMessage({ tone: 'error', text: problem });
    if (!asDraft && (!supplier || !isConnected(supplier))) {
      return setMessage({ tone: 'error', text: `Add ${supplier?.name ?? 'the supplier'}'s email address (Suppliers tab) to send them orders. You can save this as a draft for now.` });
    }
    setBusy(true);
    const saved = await saveOrder(draftOf('draft'));
    if ('error' in saved) {
      setBusy(false);
      return setMessage({ tone: 'error', text: saved.error });
    }
    if (asDraft) {
      setBusy(false);
      setMessage({ tone: 'ok', text: `Saved as draft ${saved.order.number}.` });
      if (!existing) router.replace({ pathname: '/retail/order/[id]', params: { id: saved.order.id } } as Href);
      return;
    }
    await send(saved.order);
    setBusy(false);
    if (!existing) router.replace({ pathname: '/retail/order/[id]', params: { id: saved.order.id } } as Href);
  }

  /** Emails the order to the supplier; marks it Sent when the email goes. */
  async function send(order: PurchaseOrder) {
    const email = orderEmail(order, products, supplier, businessStore.get()?.businessName || 'NexGain');
    const result = await openEmailDraft(email, business?.emailApp ?? 'other');
    if (result === 'sent') {
      const error = await setOrderStatus(order.id, 'sent');
      setMessage(error ? { tone: 'error', text: error } : { tone: 'ok', text: `Order ${order.number} sent to ${supplier?.name}.` });
    } else if (result === 'ask') {
      setAskSent(order);
    } else {
      setMessage({ tone: 'error', text: `Not sent. Order ${order.number} is saved as a draft.` });
    }
  }

  async function setStatus(status: 'sent' | 'pending' | 'cancelled') {
    if (!existing) return;
    const error = await setOrderStatus(existing.id, status);
    setMessage(error ? { tone: 'error', text: error } : { tone: 'ok', text: `Marked as ${ORDER_STATUS_LABELS[status]}.` });
  }

  async function deliver() {
    if (!existing) return;
    setConfirm(null);
    setBusy(true);
    const error = await deliverOrder(existing.id);
    setBusy(false);
    const units = existing.lines.reduce((s, l) => s + l.quantity, 0);
    setMessage(error ? { tone: 'error', text: error } : { tone: 'ok', text: `Delivered. ${units} item${units === 1 ? '' : 's'} added to stock.` });
  }

  function openEdit(kind: Edit) {
    setEditText(kind === 'address' ? address : notes);
    setEditing(kind);
  }

  if (params.id !== 'new' && !existing) {
    return (
      <OwnerScreen>
        <PageHeader onBack={() => goBack('/retail/orders' as Href)} title="Order" />
        <Panel>
          <EmptyState icon={StockIcons.truck} message="This order can’t be found." />
        </Panel>
      </OwnerScreen>
    );
  }

  return (
    <OwnerScreen>
      <PageHeader
        onBack={() => goBack('/retail/orders' as Href)}
        title={existing ? `Order ${existing.number}` : 'Place Order'}
        right={existing ? <Pill label={ORDER_STATUS_LABELS[existing.status]} tone={orderStatusTone(existing.status)} /> : undefined}
      />

      <Pressable
        onPress={() => editable && setSupplierSheet(true)}
        disabled={!editable}
        accessibilityRole="button"
        accessibilityLabel={supplier ? `Supplier: ${supplier.name}` : 'Choose a supplier'}
        style={({ pressed }) => [styles.supplierCard, pressed && styles.pressed]}>
        <IconSquare icon={FACTORY} size={48} />
        <View style={styles.flex}>
          <Text style={styles.supplierName}>{supplier?.name ?? 'Choose a supplier'}</Text>
          {supplier ? (
            <Pill label={isConnected(supplier) ? 'Connected' : 'No email yet'} tone={isConnected(supplier) ? 'success' : 'warning'} icon={isConnected(supplier) ? StockIcons.link : undefined} />
          ) : (
            <Text style={stockStyles.muted}>Who are you ordering from?</Text>
          )}
        </View>
        {editable && <Icon name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} color={C.textSecondary} size={14} />}
      </Pressable>

      {message && (
        <Text style={message.tone === 'ok' ? stockStyles.message : stockStyles.error} accessibilityRole="alert">
          {message.text}
        </Text>
      )}

      <Text style={retailStyles.sectionTitle}>Order Items</Text>
      {groups.length === 0 ? (
        <Panel>
          <EmptyState icon={StockIcons.box} message="No items yet. Add the products you want to order." />
        </Panel>
      ) : (
        groups.map(({ product, lines: productLines }) => (
          <View key={product.id} style={styles.group}>
            <View style={styles.productHead}>
              <ProductPhoto path={product.photos[0]} size={52} />
              <View style={styles.flex}>
                <Text style={styles.productName}>{product.name}</Text>
                {productSku(product) ? <Text style={stockStyles.muted}>SKU: {productSku(product)}</Text> : null}
              </View>
            </View>
            <View style={styles.table}>
              <TableHead
                columns={[
                  { label: product.variants.some((v) => v.size) ? 'Size' : 'Item', flex: 1.2 },
                  { label: 'Quantity', flex: 1.6, align: 'center' },
                  { label: 'Subtotal', flex: 1.2, align: 'right' },
                ]}
              />
              {productLines.map((l) => {
                const v = product.variants.find((x) => x.id === l.variantId)!;
                return (
                  <View key={l.variantId} style={retailStyles.tableRow}>
                    <Text style={[retailStyles.td, { flex: 1.2 }]}>{variantLabel(v) || 'One size'}</Text>
                    <View style={[styles.center, { flex: 1.6 }]}>
                      {editable ? (
                        <QuantityBox value={l.quantity} onChange={(q) => setQty(l.variantId, q)} label={`quantity of ${variantLabel(v) || product.name}`} />
                      ) : (
                        <Text style={retailStyles.td}>{l.quantity}</Text>
                      )}
                    </View>
                    <Text style={[retailStyles.td, styles.right, { flex: 1.2 }]}>{l.unitCost === null ? '—' : formatMoney(l.quantity * l.unitCost)}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        ))
      )}
      {editable && <Button label="Add an item" variant="secondary" icon={StockIcons.plus} onPress={() => setPicking(true)} />}

      <View style={styles.total}>
        <Text style={styles.totalLabel}>Order Total</Text>
        <Text style={styles.totalValue}>{formatMoney(total)}</Text>
      </View>
      {lines.some((l) => l.unitCost === null) && <Text style={stockStyles.muted}>Items with no cost price aren’t in the total. Add cost prices to the products to include them.</Text>}

      <Panel style={styles.rows}>
        <InfoRow icon={StockIcons.truck} label="Delivery" value={address || 'Add the delivery address'} onPress={editable ? () => openEdit('address') : undefined} />
        <InfoRow
          icon={{ ios: 'calendar', android: 'calendar_month', web: 'calendar_month' }}
          label="Requested Delivery"
          value={formatOrderDate(requested)}
          onPress={editable ? datePicker.open : undefined}
          showDivider
        />
        <InfoRow
          icon={{ ios: 'doc.text', android: 'description', web: 'description' }}
          label="Order Notes"
          value={notes.trim() || 'None'}
          onPress={editable ? () => openEdit('notes') : undefined}
          showDivider
        />
      </Panel>
      {datePicker.element}

      {manyStores && editable && (
        <>
          <Text style={styles.label}>Stock goes into</Text>
          <Chips label="Store" value={storeId ?? ''} onChange={setStoreId} options={stores.map((s) => ({ value: s.id, label: s.name }))} />
        </>
      )}

      {editable ? (
        <>
          <Button label={busy ? 'Working…' : 'Place Order'} onPress={() => save(false)} disabled={busy || lines.length === 0} />
          <Button label="Save as Draft" variant="secondary" onPress={() => save(true)} disabled={busy || lines.length === 0} />
          {existing && (
            <Pressable onPress={() => setConfirm('delete')} accessibilityRole="button" style={styles.danger} hitSlop={6}>
              <Text style={styles.dangerText}>Delete draft</Text>
            </Pressable>
          )}
        </>
      ) : existing && existing.status === 'delivered' ? (
        <Text style={stockStyles.message}>
          Delivered {existing.deliveredAt ? formatOrderDate(existing.deliveredAt.slice(0, 10)) : ''}. The items were added to stock.
        </Text>
      ) : existing && existing.status === 'cancelled' ? (
        <>
          <Text style={stockStyles.muted}>This order was cancelled.</Text>
          <Pressable onPress={() => setConfirm('delete')} accessibilityRole="button" style={styles.danger} hitSlop={6}>
            <Text style={styles.dangerText}>Delete order</Text>
          </Pressable>
        </>
      ) : existing ? (
        <>
          <Button label={busy ? 'Adding to stock…' : 'Mark as Delivered'} icon={StockIcons.truck} onPress={() => setConfirm('deliver')} disabled={busy} />
          {existing.status === 'sent' && <Button label="Mark as Pending (supplier confirmed)" variant="secondary" onPress={() => setStatus('pending')} />}
          <Button label="Send the email again" variant="secondary" onPress={() => send(existing)} />
          <Pressable onPress={() => setConfirm('cancel')} accessibilityRole="button" style={styles.danger} hitSlop={6}>
            <Text style={styles.dangerText}>Cancel order</Text>
          </Pressable>
        </>
      ) : null}

      <Modal visible={editing !== null} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <Pressable style={styles.backdrop} onPress={() => setEditing(null)} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.three }]}>
          <Text style={styles.sheetTitle}>{editing === 'address' ? 'Delivery address' : 'Order notes'}</Text>
          <TextInput
            value={editText}
            onChangeText={setEditText}
            placeholder={editing === 'address' ? 'e.g. Warehouse – 12 Industry Rd, Brisbane' : 'e.g. Please send the invoice to accounts@…'}
            placeholderTextColor={C.textMuted}
            multiline
            autoFocus
            maxLength={editing === 'address' ? 300 : 1000}
            accessibilityLabel={editing === 'address' ? 'Delivery address' : 'Order notes'}
            style={[stockStyles.input, styles.multiline]}
          />
          <Button
            label="Done"
            onPress={() => {
              if (editing === 'address') setAddress(editText);
              else setNotes(editText);
              setEditing(null);
            }}
          />
        </View>
      </Modal>

      <OptionSheet
        visible={supplierSheet}
        title="Supplier"
        options={suppliers.map((s) => s.name)}
        value={supplier?.name ?? null}
        onSelect={(name) => {
          const s = suppliers.find((x) => x.name === name);
          setSupplierId(s?.id ?? null);
          if (s && !existing) setRequested(keyOf(new Date(Date.now() + s.leadTimeDays * DAY)));
        }}
        onClose={() => setSupplierSheet(false)}
      />
      <ProductPicker
        visible={picking}
        products={products}
        levels={levels}
        storeId={storeId}
        onPick={(p, v) =>
          setLines((all) =>
            all.some((l) => l.variantId === v.id)
              ? all.map((l) => (l.variantId === v.id ? { ...l, quantity: l.quantity + 1 } : l))
              : [...all, { variantId: v.id, quantity: 1, unitCost: p.costPrice }],
          )
        }
        onClose={() => setPicking(false)}
      />
      <ConfirmDialog
        visible={askSent !== null}
        message="Did the email to the supplier send?"
        confirmLabel="Yes, it sent"
        destructive={false}
        onConfirm={async () => {
          const order = askSent;
          setAskSent(null);
          if (!order) return;
          const error = await setOrderStatus(order.id, 'sent');
          setMessage(error ? { tone: 'error', text: error } : { tone: 'ok', text: `Order ${order.number} marked as sent.` });
        }}
        onCancel={() => {
          setAskSent(null);
          setMessage({ tone: 'error', text: 'Not sent. It’s saved as a draft.' });
        }}
      />
      <ConfirmDialog
        visible={confirm === 'deliver'}
        message="Has this order arrived? Its items will be added to your stock now (shown in the stock history as received)."
        confirmLabel="Yes, add to stock"
        destructive={false}
        onConfirm={deliver}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        visible={confirm === 'cancel'}
        message="Cancel this order? Remember to tell the supplier too."
        confirmLabel="Cancel order"
        onConfirm={() => {
          setConfirm(null);
          setStatus('cancelled');
        }}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        visible={confirm === 'delete'}
        message="Delete this order? This can’t be undone."
        confirmLabel="Delete"
        onConfirm={async () => {
          setConfirm(null);
          if (!existing) return;
          const error = await deleteOrder(existing.id);
          if (error) setMessage({ tone: 'error', text: error });
          else goBack('/retail/orders' as Href);
        }}
        onCancel={() => setConfirm(null)}
      />
    </OwnerScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 4 },
  pressed: { opacity: 0.7 },
  supplierCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    padding: Spacing.three,
    borderRadius: Radius.large - 4,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  supplierName: { color: C.text, fontSize: 17, fontWeight: '700' },
  group: { gap: Spacing.two },
  productHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three - 4 },
  productName: { color: C.text, fontSize: 16, fontWeight: '700' },
  table: { borderRadius: Radius.medium, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, overflow: 'hidden' },
  center: { alignItems: 'center' },
  right: { textAlign: 'right' },
  total: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.three,
    borderRadius: Radius.medium,
    backgroundColor: C.accentSoft,
  },
  totalLabel: { color: C.text, fontSize: 16, fontWeight: '700' },
  totalValue: { color: C.text, fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] },
  rows: { paddingVertical: Spacing.one, gap: 0 },
  label: { color: C.text, fontSize: 15, fontWeight: '600' },
  danger: { alignItems: 'center', paddingVertical: Spacing.three },
  dangerText: { color: C.danger, fontSize: 15, fontWeight: '600' },
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.45)' },
  sheet: { padding: Spacing.three, gap: Spacing.three - 4, borderTopLeftRadius: Radius.large, borderTopRightRadius: Radius.large, backgroundColor: C.background },
  sheetTitle: { color: C.text, fontSize: 18, fontWeight: '700' },
  multiline: { minHeight: 96, paddingTop: Spacing.two, textAlignVertical: 'top' },
});
