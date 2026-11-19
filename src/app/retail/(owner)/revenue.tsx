import { useState } from 'react';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/systems/retail/components/owner/invoices-ui';
import { Card, EmptyState, Icon, OwnerIcons, OwnerScreen, RangeSelect } from '@/systems/retail/components/owner/ui';
import { Colors as C, Spacing } from '@/constants/theme';
import { formatShortDate } from '@/data/employee-roster';
import { financeRanges, inRange, percentChange, sumEntries } from '@/data/finance';
import { formatMoney } from '@/data/payroll';
import { useRetailRevenue } from '@/systems/retail/data/retail-revenue';
import { salesByPerson, salesTotals, useSales } from '@/systems/retail/data/sales';

// Money coming in (NexGain Retail): every sale, newest first. Opened from the
// Revenue box on the Dashboard. Retail shops have no invoices or quotes.
export default function RevenueScreen() {
  const all = useRetailRevenue();
  const ranges = financeRanges();
  const [rangeId, setRangeId] = useState('this-month');
  const range = ranges.find((r) => r.id === rangeId) ?? ranges[0];

  const entries = inRange(all, range);
  const total = sumEntries(entries);
  const previous = rangeId === 'this-month' ? sumEntries(inRange(all, ranges[1])) : null;
  const sales = useSales();
  const totals = salesTotals(sales, range.start, range.end);
  const people = salesByPerson(sales, range.start, range.end);

  return (
    <OwnerScreen>
      <ScreenHeader title="Revenue" onBack={() => router.navigate('/retail/dashboard')} />

      <View style={styles.rangeRow}>
        <RangeSelect options={ranges} value={range} onChange={(r) => setRangeId(r.id)} />
      </View>

      <Card>
        <Text style={styles.label}>Total sales · {range.label.toLowerCase()}</Text>
        <Text style={styles.total}>{formatMoney(total)}</Text>
        <Text style={styles.muted}>
          {totals.items} item{totals.items === 1 ? '' : 's'} sold{totals.returned > 0 ? ` · ${totals.returned} returned` : ''}
          {previous !== null ? ` · ${percentChange(total, previous) ?? '—'} vs last month` : ''}
        </Text>
        {totals.gst !== 0 && (
          <Text style={styles.muted}>
            Includes {formatMoney(totals.gst)} GST · {formatMoney(totals.exGst)} before GST
          </Text>
        )}
      </Card>

      {people.length > 0 && (
        <Card title="Sales by Person" icon={OwnerIcons.people}>
          {people.map((p, i) => (
            <View key={`${p.name}-${i}`} style={[styles.row, i > 0 && styles.divider]}>
              <Text style={[styles.title, styles.flex]}>{p.name}</Text>
              <Text style={styles.muted}>
                {p.items} item{p.items === 1 ? '' : 's'} · {formatMoney(p.total)}
              </Text>
            </View>
          ))}
        </Card>
      )}

      <Card title="Sales" icon={OwnerIcons.trendingUp}>
        {entries.length === 0 ? (
          <EmptyState
            icon={OwnerIcons.receipt}
            message={
              all.length === 0
                ? 'No sales yet. When stock is marked as Sold, the sale shows up here.'
                : 'No sales in this period.'
            }
          />
        ) : (
          entries.map((e, i) => (
            <View
              key={e.id}
              accessibilityLabel={`${e.title}, ${formatMoney(e.amount)}, sold ${formatShortDate(e.date)}`}
              style={[styles.row, i > 0 && styles.divider]}>
              <View style={styles.icon}>
                <Icon name={{ ios: 'arrow.down.left', android: 'south_west', web: 'south_west' }} color={C.success} size={16} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.title} numberOfLines={1}>
                  {e.title}
                </Text>
                <Text style={styles.muted} numberOfLines={1}>
                  {[formatShortDate(e.date), e.subtitle].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Text style={styles.amount}>+{formatMoney(e.amount)}</Text>
            </View>
          ))
        )}
      </Card>

      <Text style={styles.footnote}>
        Revenue comes from stock marked as Sold, including GST. Returns are taken back off.
      </Text>
    </OwnerScreen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  rangeRow: {
    flexDirection: 'row',
  },
  label: {
    color: C.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  total: {
    color: C.text,
    fontSize: 34,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  muted: {
    color: C.textSecondary,
    fontSize: 13,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    paddingVertical: Spacing.three - 4,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.successSoft,
  },
  title: {
    color: C.text,
    fontSize: 15,
    fontWeight: '600',
  },
  amount: {
    color: C.success,
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  footnote: {
    color: C.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
});
