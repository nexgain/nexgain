import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ConfirmDialog } from '@/components/owner/confirm-dialog';
import { Button, Card, goBack, OwnerScreen, PageHeader } from '@/components/owner/ui';
import { Colors as C, Spacing } from '@/constants/theme';
import { formatMoney } from '@/data/payroll';
import { saleWhen } from '@/systems/hospitality/components/owner/menu-ui';
import { deleteSale, useSales } from '@/systems/hospitality/data/menu';

// One sale: its items, quantities and the prices they sold at. It can be
// deleted (e.g. recorded by mistake).
export default function SaleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sale = useSales().find((s) => s.id === id);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!sale) {
    return (
      <OwnerScreen>
        <PageHeader title="Sale" onBack={() => goBack('/hospitality/sales')} />
        <Text style={styles.muted}>This sale isn’t here any more.</Text>
      </OwnerScreen>
    );
  }

  async function remove() {
    setConfirm(false);
    try {
      await deleteSale(sale!.id);
      goBack('/hospitality/sales');
    } catch (e) {
      setError(`Couldn’t delete: ${e instanceof Error ? e.message : 'please try again.'}`);
    }
  }

  return (
    <OwnerScreen>
      <PageHeader title={sale.source === 'day' ? 'End of day sales' : 'Sale'} subtitle={saleWhen(sale)} onBack={() => goBack('/hospitality/sales')} />
      <Card>
        <View>
          {sale.lines.map((l, i) => (
            <View key={`${l.name}-${i}`} style={[styles.row, i > 0 && styles.divider]}>
              <View style={styles.flex}>
                <Text style={styles.name}>
                  {l.quantity}× {l.name}
                </Text>
                <Text style={styles.muted}>
                  {formatMoney(l.unitPrice)} each{l.category ? ` · ${l.category}` : ''}
                </Text>
              </View>
              <Text style={styles.amount}>{formatMoney(Math.round(l.quantity * l.unitPrice * 100) / 100)}</Text>
            </View>
          ))}
        </View>
        <View style={[styles.row, styles.divider]}>
          <Text style={[styles.name, styles.flex]}>Total</Text>
          <Text style={styles.total}>{formatMoney(sale.total)}</Text>
        </View>
        {sale.note ? <Text style={styles.muted}>Note: {sale.note}</Text> : null}
      </Card>
      {error && <Text style={styles.error}>{error}</Text>}
      <Button label="Delete sale" variant="secondary" onPress={() => setConfirm(true)} />
      <ConfirmDialog
        visible={confirm}
        message={`Delete this ${formatMoney(sale.total)} sale? It’s removed from your sales totals.`}
        confirmLabel="Delete"
        onConfirm={remove}
        onCancel={() => setConfirm(false)}
      />
    </OwnerScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three - 4, paddingVertical: Spacing.two },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  name: { color: C.text, fontSize: 15, fontWeight: '600' },
  muted: { color: C.textSecondary, fontSize: 13 },
  amount: { color: C.text, fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  total: { color: C.text, fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
  error: { color: C.danger, fontSize: 13, fontWeight: '600' },
});
