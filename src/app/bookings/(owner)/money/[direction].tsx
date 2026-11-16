import { useState } from 'react';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/systems/bookings/components/owner/invoices-ui';
import { TransactionRow } from '@/systems/bookings/components/owner/transactions-ui';
import { Card, EmptyState, goBack, OwnerIcons, OwnerScreen, RangeSelect } from '@/systems/bookings/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { transactionItems, TRANSFERS_CATEGORY, type TransactionItem } from '@/data/bank';
import { useExpenses } from '@/data/finance';
import { transactionRanges, useMoneyFeed } from '@/data/money-sorting';
import { formatMoney } from '@/data/payroll';
import { indexReceipts, receiptStatus, useReceipts } from '@/data/receipts';

// "Money in" / "Money out" from the Transactions page: every transaction in
// that direction for the chosen period, newest first, whatever its category.
// Transfers between your own accounts are left out, matching the totals.
export default function MoneyDirectionScreen() {
  const params = useLocalSearchParams<{ direction?: string; range?: string }>();
  const moneyIn = params.direction === 'in';
  const feed = useMoneyFeed();
  const typedExpenses = useExpenses();
  const receipts = useReceipts();
  const ranges = transactionRanges();
  const [rangeId, setRangeId] = useState(params.range ?? 'this-month');
  const range = ranges.find((r) => r.id === rangeId) ?? ranges[0];

  // transactionItems already sorts newest first.
  const items = transactionItems(feed.transactions, feed.accounts, feed.preview ? [] : typedExpenses).filter(
    (i) =>
      i.date >= range.start &&
      i.date < range.end &&
      i.category !== TRANSFERS_CATEGORY &&
      (moneyIn ? i.amount > 0 : i.amount < 0),
  );
  const total = items.reduce((sum, i) => sum + Math.abs(i.amount), 0);
  const receiptIndex = indexReceipts(receipts);

  function open(item: TransactionItem) {
    if (item.source === 'bank') router.push({ pathname: '/bookings/transaction/[id]', params: { id: item.id } } as Href);
    else router.push({ pathname: '/bookings/expenses/edit', params: { id: item.expense!.id } } as Href);
  }

  return (
    <OwnerScreen>
      <ScreenHeader title={moneyIn ? 'Money in' : 'Money out'} onBack={() => goBack('/bookings/transactions')} />
      <RangeSelect options={ranges} value={range} onChange={(r) => setRangeId(r.id)} />

      <View style={styles.total}>
        <Text style={styles.label}>
          {items.length} transaction{items.length === 1 ? '' : 's'}
        </Text>
        <Text style={[styles.totalValue, moneyIn && { color: C.success }]} numberOfLines={1} adjustsFontSizeToFit>
          {formatMoney(total)}
        </Text>
      </View>

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={OwnerIcons.card}
            message={`No money ${moneyIn ? 'in' : 'out'} in this period. Try a different date range.`}
          />
        </Card>
      ) : (
        <Card title="Newest first" icon={OwnerIcons.clock}>
          <View>
            {items.map((item, i) => (
              <TransactionRow
                key={item.id}
                item={item}
                showDivider={i > 0}
                onPress={() => open(item)}
                receipt={receiptStatus(item, receiptIndex)}
              />
            ))}
          </View>
        </Card>
      )}

      <Text style={styles.footnote}>
        {feed.preview ? 'Sample data: nothing here is saved. ' : ''}Transfers between your own accounts aren’t included.
      </Text>
    </OwnerScreen>
  );
}

const styles = StyleSheet.create({
  total: {
    gap: 4,
    padding: Spacing.three,
    borderRadius: Radius.large - 4,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  label: {
    color: C.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  totalValue: {
    color: C.text,
    fontSize: 24,
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
