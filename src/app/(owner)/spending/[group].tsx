import { useState } from 'react';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BarChart } from '@/components/owner/charts';
import { ScreenHeader } from '@/components/owner/invoices-ui';
import { GROUP_ICONS } from '@/components/owner/money-review';
import { TransactionRow } from '@/components/owner/transactions-ui';
import { Card, EmptyState, goBack, OwnerIcons, OwnerScreen, RangeSelect } from '@/components/owner/ui';
import { Colors as C, Spacing } from '@/constants/theme';
import { transactionItems, type TransactionItem } from '@/data/bank';
import { useExpenses } from '@/data/finance';
import {
  groupById,
  groupInsight,
  groupSummary,
  monthlyTotals,
  sortingCounts,
  transactionRanges,
  useMoneyFeed,
  type SpendGroupId,
} from '@/data/money-sorting';
import { formatMoney } from '@/data/payroll';
import { indexReceipts, receiptStatus, useReceipts } from '@/data/receipts';

/** Transactions shown before "Show more" (and how many more each tap). */
const PAGE = 10;

const METHODS = [
  { key: 'rule', label: 'Known shops and payees', hint: 'Like Bunnings, Ampol or your payroll.' },
  { key: 'learned', label: 'From your earlier choices', hint: 'You picked the category for this shop before.' },
  { key: 'ai', label: 'Best guesses', hint: 'From clues in the bank’s description. NexGain asks when it’s not sure.' },
  { key: 'owner', label: 'Chosen by you', hint: null },
  { key: 'typed', label: 'Typed in by you', hint: 'Expenses you added yourself.' },
] as const;

// One spending group (Materials, Labour, Tools, Fuel, Vehicle or Other): its
// total, the last few months, an AI insight, how NexGain sorted it, and its
// transactions.
export default function SpendingGroupScreen() {
  const params = useLocalSearchParams<{ group: string; range?: string }>();
  const group = groupById(params.group);
  const feed = useMoneyFeed();
  const typedExpenses = useExpenses();
  const receipts = useReceipts();
  const ranges = transactionRanges();
  const [rangeId, setRangeId] = useState(params.range ?? 'this-month');
  const range = ranges.find((r) => r.id === rangeId) ?? ranges[0];
  const [shown, setShown] = useState(PAGE);

  if (!group) {
    return (
      <OwnerScreen>
        <ScreenHeader title="Spending" onBack={() => goBack('/transactions')} />
        <Card>
          <EmptyState icon={OwnerIcons.chart} message="This category doesn’t exist." />
        </Card>
      </OwnerScreen>
    );
  }

  const all = transactionItems(feed.transactions, feed.accounts, feed.preview ? [] : typedExpenses);
  const summary = groupSummary(all, range, group.id as SpendGroupId);
  const months = monthlyTotals(all, group.id);
  const counts = sortingCounts(summary.items);
  const receiptIndex = indexReceipts(receipts);
  const rows = summary.items.slice(0, shown);

  const change =
    summary.change === null
      ? null
      : summary.change === 0
        ? `The same as this time ${range.previousLabel}`
        : `${summary.change > 0 ? 'Up' : 'Down'} ${Math.abs(summary.change)}% on the same time ${range.previousLabel} (${formatMoney(summary.previous ?? 0)})`;

  function open(item: TransactionItem) {
    if (item.source === 'bank') router.push({ pathname: '/transaction/[id]', params: { id: item.id } } as Href);
    else router.push({ pathname: '/expenses/edit', params: { id: item.expense!.id } } as Href);
  }

  return (
    <OwnerScreen>
      <ScreenHeader title={group.name} onBack={() => goBack('/transactions')} />

      <RangeSelect options={ranges} value={range} onChange={(r) => setRangeId(r.id)} />

      <Card title={group.description} icon={GROUP_ICONS[group.id]}>
        <Text style={styles.total} numberOfLines={1} adjustsFontSizeToFit>
          {formatMoney(summary.total)}
        </Text>
        {change && <Text style={[styles.change, summary.upALot && styles.changeUp]}>{change}</Text>}
        {feed.preview && <Text style={styles.muted}>Sample data: nothing here is saved.</Text>}
      </Card>

      <Card title="Last 4 months" icon={OwnerIcons.chart}>
        <BarChart
          categories={months.map((m) => m.label)}
          series={[{ name: group.name, color: C.accent, values: months.map((m) => m.total) }]}
          formatValue={(v) => formatMoney(v).replace('.00', '')}
          emptyMessage={`No ${group.name.toLowerCase()} spending yet`}
        />
      </Card>

      <Card title="AI insight" icon={OwnerIcons.sparkles}>
        <Text style={styles.insight}>{groupInsight(summary, range, feed.jobs, feed.purchases)}</Text>
      </Card>

      {summary.items.length > 0 && (
        <Card title="How the AI sorted these" icon={OwnerIcons.lightbulb}>
          <View>
            {METHODS.filter((m) => counts[m.key] > 0).map((m, i) => (
              <View key={m.key} style={[styles.method, i > 0 && styles.divider]}>
                <View style={styles.flex}>
                  <Text style={styles.methodLabel}>{m.label}</Text>
                  {m.hint && <Text style={styles.muted}>{m.hint}</Text>}
                </View>
                <Text style={styles.methodCount}>{counts[m.key]}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.muted}>
            Something in the wrong place? Tap it below and pick another category. NexGain remembers it for that shop.
          </Text>
        </Card>
      )}

      <Card title="Transactions" icon={OwnerIcons.card}>
        {rows.length === 0 ? (
          <EmptyState icon={OwnerIcons.card} message="No transactions in this period. Try a different date range." />
        ) : (
          <View>
            {rows.map((item, i) => (
              <TransactionRow
                key={item.id}
                item={item}
                showDivider={i > 0}
                onPress={() => open(item)}
                receipt={receiptStatus(item, receiptIndex)}
              />
            ))}
          </View>
        )}
        {summary.items.length > shown && (
          <Pressable
            onPress={() => setShown((n) => n + PAGE)}
            accessibilityRole="button"
            hitSlop={6}
            style={({ pressed }) => [styles.more, pressed && styles.pressed]}>
            <Text style={styles.moreText}>Show more ({summary.items.length - shown} left)</Text>
          </Pressable>
        )}
      </Card>
    </OwnerScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  divider: { borderTopWidth: 1, borderTopColor: C.border },
  total: { color: C.text, fontSize: 32, fontWeight: '700', fontVariant: ['tabular-nums'] },
  change: { color: C.textSecondary, fontSize: 14, fontWeight: '600' },
  changeUp: { color: C.warning },
  muted: { color: C.textSecondary, fontSize: 13, lineHeight: 18 },
  insight: { color: C.text, fontSize: 15, lineHeight: 21 },
  method: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three - 4, minHeight: 48, paddingVertical: Spacing.two },
  methodLabel: { color: C.text, fontSize: 15, fontWeight: '600' },
  methodCount: { color: C.text, fontSize: 17, fontWeight: '700', fontVariant: ['tabular-nums'] },
  more: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  moreText: { color: C.accent, fontSize: 14, fontWeight: '700' },
});
