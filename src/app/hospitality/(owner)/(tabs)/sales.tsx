import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, EmptyState, Icon, OwnerIcons, OwnerScreen, PageHeader, RangeSelect, StatCard, StatGrid } from '@/components/owner/ui';
import { Colors as C, Spacing } from '@/constants/theme';
import { formatMoney } from '@/data/payroll';
import { router } from '@/lib/nav';
import { MenuIcons, saleWhen } from '@/systems/hospitality/components/owner/menu-ui';
import { useHospitalityLoaded, useSales, type Sale } from '@/systems/hospitality/data/menu';
import { itemSales, salesIn, salesPeriods, salesTotals } from '@/systems/hospitality/data/sales-stats';

const SOURCE_LABEL: Record<Sale['source'], string> = { sale: 'Sale', day: 'End of day', import: 'Imported' };

// The Sales tab: what's sold in the chosen period, the best sellers, and
// every sale (newest first). Record a sale, or enter a whole day's totals.
export default function SalesScreen() {
  const loaded = useHospitalityLoaded();
  const sales = useSales();
  const periods = salesPeriods();
  const [periodId, setPeriodId] = useState('today');
  const period = periods.find((p) => p.id === periodId) ?? periods[0];
  const [showAll, setShowAll] = useState(false);

  const inPeriod = salesIn(sales, period.start, period.end);
  const totals = salesTotals(inPeriod);
  const best = itemSales(inPeriod);
  const shown = showAll ? inPeriod : inPeriod.slice(0, 20);

  return (
    <OwnerScreen>
      <PageHeader title="Sales" subtitle="What you’ve sold, and your best sellers." />

      <View style={styles.actions}>
        <View style={styles.flex}>
          <Button fill label="Record sale" icon={MenuIcons.sale} onPress={() => router.push('/hospitality/record-sale')} />
        </View>
        <View style={styles.flex}>
          <Button fill label="End of day" icon={MenuIcons.day} variant="secondary" onPress={() => router.push('/hospitality/end-of-day')} />
        </View>
      </View>

      <RangeSelect options={periods} value={period} onChange={(p) => setPeriodId(p.id)} />

      <StatGrid columns={3}>
        <StatCard icon={OwnerIcons.money} label="Sales" value={formatMoney(totals.revenue)} change={null} changeLabel={period.label.toLowerCase()} />
        <StatCard icon={MenuIcons.menu} label="Items sold" value={String(totals.itemsSold)} change={null} changeLabel={period.label.toLowerCase()} />
        <StatCard icon={MenuIcons.sale} label="Sales recorded" value={String(totals.sales)} change={null} changeLabel={period.label.toLowerCase()} />
      </StatGrid>

      {!loaded ? (
        <ActivityIndicator color={C.accent} />
      ) : inPeriod.length === 0 ? (
        <Card>
          <EmptyState icon={MenuIcons.sale} message={`No sales ${period.id === 'today' ? 'today' : `for ${period.label.toLowerCase()}`} yet. Tap Record sale, or End of day to enter a whole day.`} />
        </Card>
      ) : (
        <>
          <Card title="Best sellers" icon={MenuIcons.trophy}>
            <View>
              {best.slice(0, 5).map((r, i) => (
                <View key={r.key} style={[styles.row, i > 0 && styles.divider]}>
                  <Text style={styles.rank}>{i + 1}</Text>
                  <View style={styles.flex}>
                    <Text style={styles.name} numberOfLines={1}>
                      {r.name}
                    </Text>
                    <Text style={styles.muted}>
                      {r.quantity} sold{r.profit !== null ? ` · ${formatMoney(r.profit)} profit` : ''}
                    </Text>
                  </View>
                  <Text style={styles.amount}>{formatMoney(r.revenue)}</Text>
                </View>
              ))}
            </View>
            {best.length > 5 && <Text style={styles.muted}>Full best and worst sellers are coming to Analytics.</Text>}
          </Card>

          <Card title={`${inPeriod.length} sale${inPeriod.length === 1 ? '' : 's'}`} icon={OwnerIcons.clock}>
            <View>
              {shown.map((s, i) => (
                <Pressable
                  key={s.id}
                  onPress={() => router.push({ pathname: '/hospitality/sale/[id]', params: { id: s.id } })}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.row, i > 0 && styles.divider, pressed && styles.pressed]}>
                  <View style={styles.flex}>
                    <Text style={styles.name} numberOfLines={1}>
                      {s.lines.map((l) => `${l.quantity}× ${l.name}`).join(', ') || 'No items'}
                    </Text>
                    <Text style={styles.muted}>
                      {SOURCE_LABEL[s.source]} · {saleWhen(s)}
                    </Text>
                  </View>
                  <Text style={styles.amount}>{formatMoney(s.total)}</Text>
                  <Icon name={OwnerIcons.chevron} color={C.textSecondary} size={12} />
                </Pressable>
              ))}
            </View>
            {inPeriod.length > shown.length && (
              <Pressable onPress={() => setShowAll(true)} accessibilityRole="button" hitSlop={8}>
                <Text style={styles.link}>Show all {inPeriod.length}</Text>
              </Pressable>
            )}
          </Card>
        </>
      )}
    </OwnerScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  pressed: { opacity: 0.7 },
  actions: { flexDirection: 'row', gap: Spacing.three - 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three - 4, paddingVertical: Spacing.two, minHeight: 48 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  rank: { width: 22, color: C.accent, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  name: { color: C.text, fontSize: 15, fontWeight: '600' },
  muted: { color: C.textSecondary, fontSize: 13 },
  amount: { color: C.text, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  link: { color: C.accent, fontSize: 14, fontWeight: '700' },
});
