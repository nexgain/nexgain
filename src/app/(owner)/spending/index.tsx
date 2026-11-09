import { useState } from 'react';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { DonutChart } from '@/components/owner/charts';
import { ScreenHeader } from '@/components/owner/invoices-ui';
import { GROUP_COLORS, GroupRow } from '@/components/owner/money-review';
import { Card, EmptyState, goBack, OwnerIcons, OwnerScreen, RangeSelect } from '@/components/owner/ui';
import { Colors as C } from '@/constants/theme';
import { transactionItems } from '@/data/bank';
import { useExpenses } from '@/data/finance';
import { groupSummaries, transactionRanges, useMoneyFeed } from '@/data/money-sorting';
import { formatMoney } from '@/data/payroll';

// "Expenses by category" from the Transactions page: spending in six groups
// (Materials, Labour, Tools, Fuel, Vehicle, Other) for the chosen period.
// Tapping a group opens its own page (spending/[group]).
export default function SpendingScreen() {
  const params = useLocalSearchParams<{ range?: string }>();
  const feed = useMoneyFeed();
  const typedExpenses = useExpenses();
  const ranges = transactionRanges();
  const [rangeId, setRangeId] = useState(params.range ?? 'this-month');
  const range = ranges.find((r) => r.id === rangeId) ?? ranges[0];

  const all = transactionItems(feed.transactions, feed.accounts, feed.preview ? [] : typedExpenses);
  const groups = groupSummaries(all, range);
  const spent = groups.reduce((sum, g) => sum + g.total, 0);

  return (
    <OwnerScreen>
      <ScreenHeader title="Expenses by category" onBack={() => goBack('/transactions')} />
      <RangeSelect options={ranges} value={range} onChange={(r) => setRangeId(r.id)} />

      {spent === 0 ? (
        <Card>
          <EmptyState icon={OwnerIcons.chart} message="No spending in this period. Try a different date range." />
        </Card>
      ) : (
        <Card title="Where the money went" icon={OwnerIcons.chart}>
          <DonutChart
            segments={groups.filter((g) => g.total > 0).map((g) => ({ name: g.group.name, value: g.total, color: GROUP_COLORS[g.group.id] }))}
            formatValue={(v) => formatMoney(v).replace('.00', '')}
            showPercent
          />
        </Card>
      )}

      <Card title="Categories" icon={OwnerIcons.card}>
        <View>
          {groups.map((g, i) => (
            <GroupRow
              key={g.group.id}
              summary={g}
              showDivider={i > 0}
              onPress={() => router.push({ pathname: '/spending/[group]', params: { group: g.group.id, range: range.id } } as Href)}
            />
          ))}
        </View>
        {range.previous && <Text style={styles.muted}>“Up” compares with the same time {range.previousLabel}.</Text>}
        {feed.preview && <Text style={styles.muted}>Sample data: nothing here is saved.</Text>}
      </Card>
    </OwnerScreen>
  );
}

const styles = StyleSheet.create({
  muted: {
    color: C.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
});
