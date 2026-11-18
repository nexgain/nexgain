// Review & Order Stock (NexGain Retail): everything the AI watchdog says to
// reorder, grouped by who supplies it, with the recommended amount for each
// size / colour (change any). "Create order" opens a ready-made order for that
// supplier. Also lists best sellers and slow-moving stock.
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { IconSquare, Panel, Pill, retailStyles } from '@/systems/retail/components/owner/retail-ui';
import { ProductPhoto, QuantityBox, StockIcons, stockStyles } from '@/systems/retail/components/owner/stock-ui';
import { Button, EmptyState, goBack, OwnerScreen, PageHeader } from '@/systems/retail/components/owner/ui';
import { Colors as C, Spacing } from '@/constants/theme';
import { formatMoney } from '@/data/payroll';
import { onOrder, useOrders } from '@/systems/retail/data/orders';
import { bestSellers, reorderAdvice, reorderBySupplier, SALES_WINDOW_DAYS, slowSellers, SLOW_DAYS } from '@/systems/retail/data/reorder';
import { salesAsMovements, useSales } from '@/systems/retail/data/sales';
import { isConnected, useProducts, useStockLevels, useSuppliers, variantLabel } from '@/systems/retail/data/stock';

export default function ReorderScreen() {
  const products = useProducts();
  const levels = useStockLevels();
  // Every sale (not just the latest stock changes).
  const movements = salesAsMovements(useSales());
  const suppliers = useSuppliers();
  const orders = useOrders();
  const [amounts, setAmounts] = useState<Record<string, number>>({});

  const advice = reorderAdvice(products, levels, movements, suppliers, onOrder(orders));
  const groups = reorderBySupplier(advice, products);
  const best = bestSellers(products, movements).slice(0, 5);
  const slow = slowSellers(products, levels, movements).slice(0, 5);
  const productOf = (id: string) => products.find((p) => p.id === id)!;
  const amountOf = (variantId: string, recommended: number) => amounts[variantId] ?? recommended;

  return (
    <OwnerScreen>
      <PageHeader onBack={() => goBack('/retail/dashboard' as Href)} title="Review & Order Stock" subtitle="What the AI suggests reordering, by supplier. Change any amount." />

      {groups.length === 0 ? (
        <Panel>
          <EmptyState icon={StockIcons.box} message="Nothing needs reordering right now. Stock is above every reorder point and won’t run out before a delivery could arrive." />
        </Panel>
      ) : (
        groups.map((g) => {
          const supplier = suppliers.find((s) => s.id === g.supplierId) ?? null;
          const items = g.items.map((a) => [a.variantId, amountOf(a.variantId, a.recommended)] as const).filter(([, q]) => q > 0);
          return (
            <Panel key={g.supplierId ?? 'none'}>
              <View style={styles.head}>
                <IconSquare icon={StockIcons.factory} size={44} />
                <View style={styles.flex}>
                  <Text style={styles.supplier}>{supplier?.name ?? 'No supplier set'}</Text>
                  {supplier ? (
                    <Pill label={isConnected(supplier) ? 'Connected' : 'No email yet'} tone={isConnected(supplier) ? 'success' : 'warning'} />
                  ) : (
                    <Text style={stockStyles.muted}>Choose a supplier on these products to order them.</Text>
                  )}
                </View>
              </View>
              {g.items.map((a, i) => {
                const p = productOf(a.productId);
                const v = p.variants.find((x) => x.id === a.variantId)!;
                return (
                  <View key={a.variantId} style={[styles.item, i > 0 && styles.divider]}>
                    <Pressable
                      onPress={() => router.push({ pathname: '/retail/stock-item/[id]', params: { id: p.id, variant: v.id } } as Href)}
                      accessibilityRole="link"
                      style={styles.itemTop}>
                      <ProductPhoto path={p.photos[0]} size={44} />
                      <View style={styles.flex}>
                        <Text style={styles.itemName} numberOfLines={1}>
                          {p.name}
                          {variantLabel(v) ? ` · ${variantLabel(v)}` : ''}
                        </Text>
                        <Text style={[stockStyles.muted, a.stock <= a.reorderPoint && styles.low]}>
                          {a.stock} in stock · reorder at {a.reorderPoint}
                        </Text>
                      </View>
                    </Pressable>
                    <Text style={stockStyles.muted}>{a.reason}</Text>
                    <View style={styles.amount}>
                      <Text style={styles.label}>Order</Text>
                      <QuantityBox value={amountOf(a.variantId, a.recommended)} onChange={(n) => setAmounts((x) => ({ ...x, [a.variantId]: n }))} label={`order amount for ${p.name}`} />
                    </View>
                  </View>
                );
              })}
              {supplier ? (
                <Button
                  label={`Create order (${items.reduce((s, [, q]) => s + q, 0)} units)`}
                  icon={StockIcons.cart}
                  disabled={items.length === 0}
                  onPress={() => router.push({ pathname: '/retail/order/[id]', params: { id: 'new', supplier: supplier.id, items: JSON.stringify(items) } } as Href)}
                />
              ) : (
                <Button label="Order without a supplier set" variant="secondary" disabled={items.length === 0} onPress={() => router.push({ pathname: '/retail/order/[id]', params: { id: 'new', items: JSON.stringify(items) } } as Href)} />
              )}
            </Panel>
          );
        })
      )}

      <Panel>
        <Text style={retailStyles.sectionTitle}>Best sellers ({SALES_WINDOW_DAYS} days)</Text>
        {best.length === 0 ? (
          <Text style={stockStyles.muted}>No sales yet. Best sellers show once stock is marked Sold.</Text>
        ) : (
          best.map((b, i) => (
            <View key={b.productId} style={[styles.line, i > 0 && styles.divider]}>
              <Text style={[styles.itemName, styles.flex]}>
                {i + 1}. {productOf(b.productId).name}
              </Text>
              <Text style={styles.label}>{b.units} sold</Text>
            </View>
          ))
        )}
      </Panel>

      <Panel>
        <Text style={retailStyles.sectionTitle}>Slow-moving stock</Text>
        {slow.length === 0 ? (
          <Text style={stockStyles.muted}>Nothing has been sitting unsold for {SLOW_DAYS} days.</Text>
        ) : (
          <>
            <Text style={stockStyles.muted}>No sales in {SLOW_DAYS}+ days. Think about a sale, a bundle, or moving it to the front of the shop.</Text>
            {slow.map((s, i) => (
              <View key={s.productId} style={[styles.line, i > 0 && styles.divider]}>
                <Text style={[styles.itemName, styles.flex]}>{productOf(s.productId).name}</Text>
                <Text style={stockStyles.muted}>
                  {s.stock} in stock{s.value > 0 ? ` · ${formatMoney(s.value, { cents: false })} tied up` : ''}
                </Text>
              </View>
            ))}
          </>
        )}
      </Panel>
    </OwnerScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 4 },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three - 4 },
  supplier: { color: C.text, fontSize: 17, fontWeight: '700' },
  item: { gap: Spacing.two, paddingVertical: Spacing.three - 4 },
  itemTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three - 4 },
  itemName: { color: C.text, fontSize: 15, fontWeight: '600' },
  low: { color: C.danger, fontWeight: '600' },
  amount: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { color: C.text, fontSize: 15, fontWeight: '600' },
  line: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
});
