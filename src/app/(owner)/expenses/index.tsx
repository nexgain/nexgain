import { useState } from 'react';
import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/owner/invoices-ui';
import { Button, Card, EmptyState, Icon, OwnerIcons, OwnerScreen, RangeSelect } from '@/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { formatShortDate } from '@/data/employee-roster';
import { useEmployees } from '@/data/employees';
import {
  byCategory,
  expenseEntries,
  financeRanges,
  inRange,
  percentChange,
  sumEntries,
  useExpenses,
  type MoneyEntry,
} from '@/data/finance';
import { formatMoney, usePayslipRecords } from '@/data/payroll';

// Money going out: approved payroll plus expenses the owner has entered.
// Opened from the Expenses box on the Dashboard.
export default function ExpensesScreen() {
  const expenses = useExpenses();
  const payslips = usePayslipRecords();
  const employees = useEmployees();
  const ranges = financeRanges();
  const [rangeId, setRangeId] = useState('this-month');
  const range = ranges.find((r) => r.id === rangeId) ?? ranges[0];

  const all = expenseEntries(expenses, payslips, employees);
  const entries = inRange(all, range);
  const total = sumEntries(entries);
  const previous = rangeId === 'this-month' ? sumEntries(inRange(all, ranges[1])) : null;
  const categories = byCategory(entries);

  function open(entry: MoneyEntry) {
    if (entry.source === 'payroll') router.navigate('/payroll');
    else router.push({ pathname: '/expenses/edit', params: { id: entry.id } } as Href);
  }

  return (
    <OwnerScreen>
      <ScreenHeader title="Expenses" onBack={() => router.navigate('/dashboard')} />

      <View style={styles.topRow}>
        <RangeSelect options={ranges} value={range} onChange={(r) => setRangeId(r.id)} />
        <Button
          label="Add Expense"
          icon={{ ios: 'plus', android: 'add', web: 'add' }}
          onPress={() => router.push('/expenses/edit' as Href)}
        />
      </View>

      <Card>
        <Text style={styles.label}>Total spent · {range.label.toLowerCase()}</Text>
        <Text style={styles.total}>{formatMoney(total)}</Text>
        <Text style={styles.muted}>
          {entries.length} expense{entries.length === 1 ? '' : 's'}
          {previous !== null ? ` · ${percentChange(total, previous) ?? '—'} vs last month` : ''}
        </Text>
      </Card>

      {categories.length > 0 && (
        <Card title="By Category" icon={OwnerIcons.chart}>
          {categories.map((c) => (
            <View key={c.category} style={styles.category}>
              <View style={styles.categoryLine}>
                <Text style={styles.categoryName}>{c.category}</Text>
                <Text style={styles.categoryAmount}>{formatMoney(c.amount)}</Text>
              </View>
              <View style={styles.track}>
                <View style={[styles.bar, { width: `${total > 0 ? Math.max(2, (c.amount / total) * 100) : 0}%` }]} />
              </View>
            </View>
          ))}
        </Card>
      )}

      <Card title="All Expenses" icon={OwnerIcons.card}>
        {entries.length === 0 ? (
          <EmptyState
            icon={OwnerIcons.card}
            message={
              all.length === 0
                ? 'No expenses yet. Tap “Add Expense” to record fuel, materials and other costs. Approved payroll is added automatically.'
                : 'No expenses in this period.'
            }
          />
        ) : (
          entries.map((e, i) => (
            <Pressable
              key={e.id}
              onPress={() => open(e)}
              accessibilityRole="button"
              accessibilityLabel={`${e.title}, ${formatMoney(e.amount)}, ${formatShortDate(e.date)}`}
              style={({ pressed }) => [styles.row, i > 0 && styles.divider, pressed && styles.pressed]}>
              <View style={styles.icon}>
                <Icon
                  name={
                    e.source === 'payroll'
                      ? OwnerIcons.people
                      : e.expense?.receiptPath
                        ? OwnerIcons.receipt
                        : { ios: 'arrow.up.right', android: 'north_east', web: 'north_east' }
                  }
                  color={C.danger}
                  size={16}
                />
              </View>
              <View style={styles.flex}>
                <Text style={styles.title} numberOfLines={1}>
                  {e.title}
                </Text>
                <Text style={styles.muted} numberOfLines={1}>
                  {[formatShortDate(e.date), e.subtitle].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Text style={styles.amount}>-{formatMoney(e.amount)}</Text>
              <Icon name={OwnerIcons.chevron} color={C.textSecondary} size={12} />
            </Pressable>
          ))
        )}
      </Card>

      <Text style={styles.footnote}>
        Wages are added automatically when you approve payroll (gross pay plus super). Tap one to open Payroll.
      </Text>
    </OwnerScreen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
  },
  topRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
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
  category: {
    gap: 6,
  },
  categoryLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  categoryName: {
    flex: 1,
    color: C.text,
    fontSize: 14,
  },
  categoryAmount: {
    color: C.text,
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  track: {
    height: 6,
    borderRadius: Radius.medium,
    backgroundColor: C.surfaceRaised,
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    borderRadius: Radius.medium,
    backgroundColor: C.danger,
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
    backgroundColor: 'rgba(239, 68, 68, 0.14)',
  },
  title: {
    color: C.text,
    fontSize: 15,
    fontWeight: '600',
  },
  amount: {
    color: C.text,
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
