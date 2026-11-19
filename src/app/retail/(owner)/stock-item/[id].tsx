// Product Details (NexGain Retail): a big photo, the name, SKU and an edit
// button, then four tabs:
//   Stock     current stock, reorder point and the AI's recommended order;
//             stock by size / colour (red when low) with how many to reorder,
//             and "Order from Manufacturer" (a ready-made order).
//   Sales     how many sold in the last 4 weeks, the money, and recent sales.
//   Suppliers who supplies it (connected or not) and recent orders of it.
//   Details   description, prices and margin, barcodes, labels, full history.
// Opened with ?variant=... (from scanning a barcode), that size is highlighted.
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { shareLabels, type Label } from '@/systems/retail/components/owner/barcode-labels';
import { ChangeStock } from '@/systems/retail/components/owner/change-stock';
import { ConfirmDialog } from '@/systems/retail/components/owner/confirm-dialog';
import { OptionSheet } from '@/systems/retail/components/owner/form';
import { IconSquare, InfoRow, Panel, Pill, Segmented, StatBox, TableHead, retailStyles } from '@/systems/retail/components/owner/retail-ui';
import { MovementRow, ProductPhoto, QuantityBox, StockIcons, stockStyles } from '@/systems/retail/components/owner/stock-ui';
import { Button, EmptyState, goBack, Icon, OwnerScreen, PageHeader } from '@/systems/retail/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { useBusiness } from '@/data/business';
import { formatMoney } from '@/data/payroll';
import { businessUsesGst } from '@/data/super-rules';
import { formatOrderDate, onOrder, ORDER_STATUS_LABELS, orderTotal, useOrders } from '@/systems/retail/data/orders';
import { hasManyStores, useCategories, useStores } from '@/systems/retail/data/retail';
import { reorderAdvice, salesValue, SALES_WINDOW_DAYS, unitsSold } from '@/systems/retail/data/reorder';
import { salesAsMovements, useSales } from '@/systems/retail/data/sales';
import {
  archiveProduct,
  isConnected,
  marginPercent,
  productSku,
  stockStatus,
  useMovements,
  useProducts,
  useStockLevels,
  useSuppliers,
  variantLabel,
  variantStock,
  type Variant,
} from '@/systems/retail/data/stock';

type Tab = 'stock' | 'sales' | 'suppliers' | 'details';
const LABEL_CHOICES = ['One for each size / colour', 'One for every item in stock'] as const;
const SPARKLES = { ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' } as const;
const CART = { ios: 'cart.fill', android: 'shopping_cart', web: 'shopping_cart' } as const;
const DAY = 86_400_000;

export default function ProductDetailsScreen() {
  const { id, variant: highlight } = useLocalSearchParams<{ id: string; variant?: string }>();
  const product = useProducts().find((p) => p.id === id);
  const levels = useStockLevels();
  const movements = useMovements();
  // Every sale (from the sales records), for the AI and the Sales tab.
  const allSales = salesAsMovements(useSales());
  const categories = useCategories();
  const suppliers = useSuppliers();
  const orders = useOrders();
  const stores = useStores();
  const manyStores = hasManyStores(stores);
  const usesGst = businessUsesGst(useBusiness());
  const [tab, setTab] = useState<Tab>('stock');
  const [reorder, setReorder] = useState<Record<string, number>>({});
  const [changing, setChanging] = useState<Variant | null>(null);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  // When the page was opened: sales are counted back from here.
  const [openedAt] = useState(() => Date.now());

  if (!product) {
    return (
      <OwnerScreen>
        <PageHeader onBack={() => goBack('/retail/products' as Href)} title="Product Details" />
        <Panel>
          <EmptyState icon={StockIcons.box} message="This product can’t be found." />
        </Panel>
      </OwnerScreen>
    );
  }

  const supplier = suppliers.find((s) => s.id === product.supplierId) ?? null;
  const advice = reorderAdvice([product], levels, allSales, suppliers, onOrder(orders));
  const adviceOf = (variantId: string) => advice.find((a) => a.variantId === variantId);
  const totalStock = product.variants.reduce((sum, v) => sum + variantStock(levels, v.id), 0);
  const recommended = advice.reduce((sum, a) => sum + a.recommended, 0);
  const qtyToOrder = (v: Variant) => reorder[v.id] ?? adviceOf(v.id)?.recommended ?? 0;
  const ordering = product.variants.reduce((sum, v) => sum + qtyToOrder(v), 0);
  const ids = new Set(product.variants.map((v) => v.id));
  const history = movements.filter((m) => ids.has(m.variantId));
  const storeName = (storeId: string | null) => (storeId ? (stores.find((s) => s.id === storeId)?.name ?? 'Old store') : manyStores ? 'No store' : null);
  const sku = productSku(product);

  function orderFromManufacturer() {
    const items = product!.variants.map((v) => [v.id, qtyToOrder(v)] as const).filter(([, q]) => q > 0);
    if (items.length === 0) return setMessage({ tone: 'error', text: 'Set how many to reorder for at least one size.' });
    router.push({ pathname: '/retail/order/[id]', params: { id: 'new', supplier: product!.supplierId ?? '', items: JSON.stringify(items) } } as Href);
  }

  async function printLabels(perItem: boolean) {
    setLabelsOpen(false);
    const labels: Label[] = product!.variants.flatMap((v) => {
      const label = { name: product!.name, option: variantLabel(v), price: product!.sellPrice !== null ? formatMoney(product!.sellPrice) : '', barcode: v.barcode };
      return Array.from({ length: perItem ? Math.max(0, variantStock(levels, v.id)) : 1 }, () => label);
    });
    if (labels.length === 0) return setMessage({ tone: 'error', text: 'Nothing in stock to print labels for.' });
    try {
      await shareLabels(labels, `${product!.name} labels.pdf`);
    } catch {
      setMessage({ tone: 'error', text: 'Couldn’t make the labels. Please try again.' });
    }
  }

  // ----- Sales -----
  const since = new Date(openedAt - SALES_WINDOW_DAYS * DAY);
  const productSales = allSales.filter((m) => ids.has(m.variantId));
  const sold = unitsSold(productSales, since);
  const soldUnits = [...sold.values()].reduce((a, b) => a + b, 0);
  const soldMoney = salesValue(productSales, since);
  const sales = productSales;

  const theirOrders = orders.filter((o) => o.lines.some((l) => ids.has(l.variantId))).slice(0, 10);

  return (
    <OwnerScreen>
      <PageHeader onBack={() => goBack('/retail/products' as Href)} title="Product Details" />

      <Panel style={styles.photoPanel}>
        <ProductPhoto path={product.photos[0]} size={220} />
        {product.photos.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs}>
            {product.photos.slice(1).map((p) => (
              <ProductPhoto key={p} path={p} size={52} />
            ))}
          </ScrollView>
        )}
      </Panel>

      <View style={styles.titleRow}>
        <View style={styles.flex}>
          <Text style={styles.name}>{product.name}</Text>
          {sku ? <Text style={styles.sku}>SKU: {sku}</Text> : null}
        </View>
        <Pressable
          onPress={() => router.push({ pathname: '/retail/product/[id]', params: { id: product.id } } as Href)}
          accessibilityRole="button"
          accessibilityLabel="Edit product"
          style={({ pressed }) => [styles.edit, pressed && styles.pressed]}>
          <Icon name={StockIcons.edit} color={C.accent} size={16} />
        </Pressable>
      </View>

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'stock', label: 'Stock' },
          { value: 'sales', label: 'Sales' },
          { value: 'suppliers', label: 'Suppliers' },
          { value: 'details', label: 'Details' },
        ]}
      />

      {message && (
        <Text style={message.tone === 'ok' ? stockStyles.message : stockStyles.error} accessibilityRole="alert">
          {message.text}
        </Text>
      )}

      {tab === 'stock' && (
        <>
          <View style={styles.stats}>
            <StatBox label="Current stock" value={`${totalStock} units`} />
            <StatBox label="Reorder point" value={`${product.lowStockLevel} units`} />
            <StatBox label="Recommended order" value={`${recommended} units`} highlight icon={SPARKLES} />
          </View>
          {advice.some((a) => a.needsReorder) ? (
            <Text style={stockStyles.muted}>
              {advice
                .filter((a) => a.needsReorder)
                .map((a) => `${variantLabel(product.variants.find((v) => v.id === a.variantId)!) || 'This product'}: ${a.reason}`)
                .join('\n')}
            </Text>
          ) : (
            <Text style={stockStyles.muted}>
              Stock is fine for now. The recommendation updates as it sells (based on the last {SALES_WINDOW_DAYS} days of sales and the supplier’s delivery time).
            </Text>
          )}

          <Text style={retailStyles.sectionTitle}>Stock by variant</Text>
          <View style={styles.table}>
            <TableHead
              columns={[
                { label: product.variants.some((v) => v.size) ? 'Size' : 'Variant', flex: 1.3 },
                { label: 'Current', flex: 1, align: 'center' },
                { label: 'Reorder', flex: 1.6, align: 'center' },
              ]}
            />
            {product.variants.map((v) => {
              const qty = variantStock(levels, v.id);
              const low = stockStatus(qty, product.lowStockLevel) !== 'ok';
              return (
                <View key={v.id} style={[retailStyles.tableRow, v.id === highlight && styles.highlight]}>
                  <Pressable
                    onPress={() => setChanging(v)}
                    accessibilityRole="button"
                    accessibilityLabel={`Change stock for ${variantLabel(v) || product.name}`}
                    style={[styles.cell, { flex: 1.3 }]}>
                    <Text style={retailStyles.td} numberOfLines={2}>
                      {variantLabel(v) || 'One size'}
                    </Text>
                    <Text style={styles.link}>Change</Text>
                  </Pressable>
                  <Text style={[retailStyles.td, low && retailStyles.tdLow, styles.center, { flex: 1 }]}>{qty}</Text>
                  <View style={[styles.cell, styles.centerCell, { flex: 1.6 }]}>
                    <QuantityBox value={qtyToOrder(v)} onChange={(n) => setReorder((r) => ({ ...r, [v.id]: n }))} label={`reorder ${variantLabel(v) || product.name}`} />
                  </View>
                </View>
              );
            })}
          </View>
          {manyStores && (
            <Text style={stockStyles.muted}>
              {product.variants.map((v) => `${variantLabel(v) || 'Stock'}: ${stores.map((s) => `${s.name} ${variantStock(levels, v.id, s.id)}`).join(', ')}`).join('\n')}
            </Text>
          )}
          <Button label={ordering > 0 ? `Order from Manufacturer (${ordering})` : 'Order from Manufacturer'} icon={CART} onPress={orderFromManufacturer} />
        </>
      )}

      {tab === 'sales' && (
        <>
          <View style={styles.stats}>
            <StatBox label={`Sold (${SALES_WINDOW_DAYS} days)`} value={`${soldUnits}`} />
            <StatBox label="Sales" value={formatMoney(soldMoney, { cents: false })} />
            <StatBox label="Per week" value={`${Math.round((soldUnits / SALES_WINDOW_DAYS) * 7 * 10) / 10}`} />
          </View>
          <View style={styles.table}>
            <TableHead
              columns={[
                { label: 'Variant', flex: 1.5 },
                { label: 'Sold', flex: 1, align: 'center' },
                { label: 'Days left', flex: 1, align: 'right' },
              ]}
            />
            {product.variants.map((v) => {
              const a = adviceOf(v.id);
              const daysLeft = a?.daysLeft ?? null;
              return (
                <View key={v.id} style={retailStyles.tableRow}>
                  <Text style={[retailStyles.td, { flex: 1.5 }]}>{variantLabel(v) || 'One size'}</Text>
                  <Text style={[retailStyles.td, styles.center, { flex: 1 }]}>{sold.get(v.id) ?? 0}</Text>
                  <Text style={[retailStyles.td, styles.right, { flex: 1 }, daysLeft !== null && a !== undefined && daysLeft <= a.leadTimeDays && retailStyles.tdLow]}>
                    {daysLeft === null ? '—' : daysLeft}
                  </Text>
                </View>
              );
            })}
          </View>
          <Panel>
            <Text style={retailStyles.sectionTitle}>Recent sales</Text>
            {sales.length === 0 ? (
              <Text style={stockStyles.muted}>No sales yet. Sales show here when stock is marked Sold.</Text>
            ) : (
              sales.slice(0, 20).map((m, i) => {
                const v = product.variants.find((x) => x.id === m.variantId);
                return <MovementRow key={m.id} movement={m} name={v ? variantLabel(v) || product.name : 'Removed variant'} storeName={storeName(m.storeId)} showDivider={i > 0} />;
              })
            )}
          </Panel>
        </>
      )}

      {tab === 'suppliers' && (
        <>
          <Panel>
            {supplier ? (
              <>
                <View style={styles.supplierHead}>
                  <IconSquare icon={{ ios: 'building.2.fill', android: 'factory', web: 'factory' }} />
                  <View style={styles.flex}>
                    <Text style={styles.supplierName}>{supplier.name}</Text>
                    <Pill label={isConnected(supplier) ? 'Connected' : 'Not connected'} tone={isConnected(supplier) ? 'success' : 'neutral'} />
                  </View>
                </View>
                {supplier.contactName ? <InfoRow icon={{ ios: 'person.fill', android: 'person', web: 'person' }} label="Contact" value={supplier.contactName} showDivider /> : null}
                {supplier.email ? (
                  <InfoRow icon={{ ios: 'envelope.fill', android: 'mail', web: 'mail' }} label="Email" value={supplier.email} onPress={() => Linking.openURL(`mailto:${supplier.email}`)} showDivider />
                ) : null}
                {supplier.phone ? (
                  <InfoRow
                    icon={{ ios: 'phone.fill', android: 'call', web: 'call' }}
                    label="Phone"
                    value={supplier.phone}
                    onPress={() => Linking.openURL(`tel:${supplier.phone.replace(/[^0-9+]/g, '')}`)}
                    showDivider
                  />
                ) : null}
                <InfoRow icon={StockIcons.truck} label="Delivery time" value={`About ${supplier.leadTimeDays} day${supplier.leadTimeDays === 1 ? '' : 's'}`} showDivider />
              </>
            ) : (
              <Text style={stockStyles.muted}>No supplier yet. Edit the product to choose who you buy it from.</Text>
            )}
            <Button
              label={supplier ? 'Change supplier' : 'Choose a supplier'}
              variant="secondary"
              onPress={() => router.push({ pathname: '/retail/product/[id]', params: { id: product.id } } as Href)}
            />
          </Panel>
          <Panel>
            <Text style={retailStyles.sectionTitle}>Orders of this product</Text>
            {theirOrders.length === 0 ? (
              <Text style={stockStyles.muted}>Not ordered yet.</Text>
            ) : (
              theirOrders.map((o, i) => (
                <Pressable
                  key={o.id}
                  onPress={() => router.push({ pathname: '/retail/order/[id]', params: { id: o.id } } as Href)}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.orderRow, i > 0 && styles.divider, pressed && styles.pressed]}>
                  <View style={styles.flex}>
                    <Text style={styles.orderTitle}>
                      {o.number} · {o.lines.filter((l) => ids.has(l.variantId)).reduce((s, l) => s + l.quantity, 0)} units
                    </Text>
                    <Text style={stockStyles.muted}>
                      {formatOrderDate(o.createdAt.slice(0, 10))} · {formatMoney(orderTotal(o.lines))}
                    </Text>
                  </View>
                  <Pill
                    label={ORDER_STATUS_LABELS[o.status]}
                    tone={o.status === 'delivered' ? 'success' : o.status === 'draft' || o.status === 'cancelled' ? 'neutral' : 'accent'}
                  />
                </Pressable>
              ))
            )}
          </Panel>
        </>
      )}

      {tab === 'details' && (
        <>
          <Panel>
            {product.description ? <Text style={styles.description}>{product.description}</Text> : null}
            <Line label="Category" value={categories.find((c) => c.id === product.categoryId)?.name ?? '—'} />
            <Line label="Brand" value={product.brand || '—'} />
            <Line label={usesGst ? 'Cost price (ex GST)' : 'Cost price'} value={product.costPrice === null ? '—' : formatMoney(product.costPrice)} />
            <Line
              label={`Sell price${usesGst ? (product.gstIncluded ? ' (inc GST)' : ' (plus GST)') : ''}`}
              value={product.sellPrice === null ? '—' : formatMoney(product.sellPrice)}
            />
            <Line
              label="Profit margin"
              value={(() => {
                const m = marginPercent(product.costPrice, product.sellPrice, product.gstIncluded, usesGst);
                return m === null ? '—' : `${m}%`;
              })()}
            />
            <Text style={stockStyles.muted}>Only you can see cost prices and margins.</Text>
          </Panel>
          <Panel>
            <Text style={retailStyles.sectionTitle}>Barcodes</Text>
            {product.variants.map((v, i) => (
              <View key={v.id} style={[styles.barcodeRow, i > 0 && styles.divider]}>
                <Text style={[retailStyles.td, styles.flex]}>{variantLabel(v) || 'One size'}</Text>
                <Text style={stockStyles.muted} selectable>
                  {v.barcode}
                  {v.sku ? ` · ${v.sku}` : ''}
                </Text>
              </View>
            ))}
            <Button label="Print barcode labels" variant="secondary" icon={StockIcons.printer} onPress={() => setLabelsOpen(true)} />
          </Panel>
          <Panel>
            <Text style={retailStyles.sectionTitle}>Stock history</Text>
            {history.length === 0 ? (
              <Text style={stockStyles.muted}>No stock changes yet.</Text>
            ) : (
              history.slice(0, 40).map((m, i) => {
                const v = product.variants.find((x) => x.id === m.variantId);
                return <MovementRow key={m.id} movement={m} name={v ? variantLabel(v) || product.name : 'Removed variant'} storeName={storeName(m.storeId)} showDivider={i > 0} />;
              })
            )}
          </Panel>
          <Pressable onPress={() => setConfirmArchive(true)} accessibilityRole="button" style={styles.archive} hitSlop={6}>
            <Text style={styles.archiveText}>Take off the product list</Text>
          </Pressable>
        </>
      )}

      {changing && (
        <ChangeStock
          product={product}
          variant={changing}
          onClose={() => setChanging(null)}
          onDone={(text) => {
            setChanging(null);
            setMessage({ tone: 'ok', text });
          }}
        />
      )}
      <OptionSheet
        visible={labelsOpen}
        title="How many labels?"
        options={LABEL_CHOICES}
        value={null}
        onSelect={(choice) => printLabels(choice === LABEL_CHOICES[1])}
        onClose={() => setLabelsOpen(false)}
      />
      <ConfirmDialog
        visible={confirmArchive}
        message={`Take ${product.name} off your product list? Its history is kept, and it stops showing in Products and the Scanner.`}
        confirmLabel="Take off"
        onConfirm={async () => {
          setConfirmArchive(false);
          const error = await archiveProduct(product.id);
          if (error) setMessage({ tone: 'error', text: error });
          else goBack('/retail/products' as Href);
        }}
        onCancel={() => setConfirmArchive(false)}
      />
    </OwnerScreen>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={styles.lineValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  photoPanel: { alignItems: 'center', backgroundColor: C.background },
  thumbs: { gap: Spacing.two },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  name: { color: C.text, fontSize: 22, fontWeight: '800' },
  sku: { color: C.textSecondary, fontSize: 14, marginTop: 2 },
  edit: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  stats: { flexDirection: 'row', gap: Spacing.two },
  table: { borderRadius: Radius.medium, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, overflow: 'hidden' },
  cell: { justifyContent: 'center', gap: 2 },
  centerCell: { alignItems: 'center' },
  center: { textAlign: 'center' },
  right: { textAlign: 'right' },
  link: { color: C.accent, fontSize: 12, fontWeight: '600' },
  highlight: { backgroundColor: C.accentSoft },
  supplierHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three - 4 },
  supplierName: { color: C.text, fontSize: 17, fontWeight: '700', marginBottom: 4 },
  orderRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two },
  orderTitle: { color: C.text, fontSize: 15, fontWeight: '600' },
  description: { color: C.text, fontSize: 15, lineHeight: 21 },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  lineLabel: { color: C.textSecondary, fontSize: 15 },
  lineValue: { color: C.text, fontSize: 15, fontWeight: '600' },
  barcodeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two },
  archive: { alignItems: 'center', paddingVertical: Spacing.three },
  archiveText: { color: C.danger, fontSize: 15, fontWeight: '600' },
});
