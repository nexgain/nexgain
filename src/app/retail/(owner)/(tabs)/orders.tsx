// Orders tab (NexGain Retail): every order to a supplier or manufacturer with
// its status: Draft, Sent, Pending, Delivered (or Cancelled). Tap one to open
// it; when it's marked Delivered, its items go into stock automatically.
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { IconSquare, Panel, Pill } from '@/systems/retail/components/owner/retail-ui';
import { Chips, StockIcons, stockStyles } from '@/systems/retail/components/owner/stock-ui';
import { Button, EmptyState, Icon, OwnerScreen, PageHeader } from '@/systems/retail/components/owner/ui';
import { Colors as C, Spacing } from '@/constants/theme';
import { formatMoney } from '@/data/payroll';
import { formatOrderDate, ORDER_STATUS_LABELS, orderStatusTone, orderTotal, useOrders, type OrderStatus } from '@/systems/retail/data/orders';
import { useSuppliers } from '@/systems/retail/data/stock';

type Filter = 'all' | OrderStatus;

export default function OrdersScreen() {
  const orders = useOrders();
  const suppliers = useSuppliers();
  const [filter, setFilter] = useState<Filter>('all');
  const count = (s: OrderStatus) => orders.filter((o) => o.status === s).length;
  const shown = orders.filter((o) => filter === 'all' || o.status === filter);

  return (
    <OwnerScreen>
      <PageHeader
        title="Orders"
        subtitle="Orders to your suppliers and manufacturers."
        right={<Button label="New" icon={StockIcons.plus} onPress={() => router.push({ pathname: '/retail/order/[id]', params: { id: 'new' } } as Href)} />}
      />
      <Chips
        label="Status"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: `All (${orders.length})` },
          { value: 'draft', label: `Draft (${count('draft')})` },
          { value: 'sent', label: `Sent (${count('sent')})` },
          { value: 'pending', label: `Pending (${count('pending')})` },
          { value: 'delivered', label: `Delivered (${count('delivered')})` },
          ...(count('cancelled') > 0 ? [{ value: 'cancelled' as const, label: `Cancelled (${count('cancelled')})` }] : []),
        ]}
      />
      <Panel style={styles.list}>
        {shown.length === 0 ? (
          <EmptyState
            icon={StockIcons.cart}
            message={orders.length === 0 ? 'No orders yet. Tap New, or use “Order from Manufacturer” on a product.' : 'No orders with this status.'}
          />
        ) : (
          shown.map((o, i) => {
            const units = o.lines.reduce((s, l) => s + l.quantity, 0);
            return (
              <Pressable
                key={o.id}
                onPress={() => router.push({ pathname: '/retail/order/[id]', params: { id: o.id } } as Href)}
                accessibilityRole="button"
                accessibilityLabel={`Order ${o.number}, ${ORDER_STATUS_LABELS[o.status]}`}
                style={({ pressed }) => [styles.row, i > 0 && styles.divider, pressed && styles.pressed]}>
                <IconSquare icon={StockIcons.cart} size={44} />
                <View style={styles.flex}>
                  <Text style={styles.title} numberOfLines={1}>
                    {suppliers.find((s) => s.id === o.supplierId)?.name ?? 'No supplier'}
                  </Text>
                  <Text style={stockStyles.muted}>
                    {o.number} · {units} item{units === 1 ? '' : 's'} · {formatMoney(orderTotal(o.lines))}
                  </Text>
                  <Text style={stockStyles.muted}>
                    {o.status === 'delivered' && o.deliveredAt
                      ? `Delivered ${formatOrderDate(o.deliveredAt.slice(0, 10))}`
                      : o.requestedDate && o.status !== 'cancelled'
                        ? `Wanted by ${formatOrderDate(o.requestedDate)}`
                        : `Made ${formatOrderDate(o.createdAt.slice(0, 10))}`}
                  </Text>
                </View>
                <Pill label={ORDER_STATUS_LABELS[o.status]} tone={orderStatusTone(o.status)} />
                <Icon name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} color={C.textSecondary} size={13} />
              </Pressable>
            );
          })
        )}
      </Panel>
    </OwnerScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  pressed: { opacity: 0.7 },
  list: { paddingVertical: Spacing.one, gap: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three - 4, paddingVertical: Spacing.three - 4 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  title: { color: C.text, fontSize: 16, fontWeight: '700' },
});
