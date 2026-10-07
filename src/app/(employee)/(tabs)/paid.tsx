import { Redirect, router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useInvoicesLoader } from '@/components/employee/invoice-ui';
import { Card, EmployeeScreen, Icon, IconBadge, Icons } from '@/components/employee/ui';
import { EmployeeColors as C } from '@/constants/employee-theme';
import { Spacing } from '@/constants/theme';
import { useBusiness } from '@/data/business';
import { financialYearStart, paidDateKey, useContractorInvoices, type ContractorInvoice } from '@/data/contractor-invoices';
import { useCurrentEmployee } from '@/data/current-employee';
import { formatShortDate } from '@/data/employee-roster';
import { formatCurrency } from '@/data/employee-payslips';
import { isContractor } from '@/data/employees';
import { fromDateKey } from '@/data/shifts';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Contractors only (in place of Payslips): every invoice the owner has marked as paid.
export default function PaidScreen() {
  const me = useCurrentEmployee();
  const business = useBusiness();
  const { state, reload } = useInvoicesLoader();
  const paid = useContractorInvoices()
    .filter((i) => i.status === 'paid' && i.paidAt)
    .sort((a, b) => (b.paidAt ?? '').localeCompare(a.paidAt ?? ''));

  if (me && !isContractor(me)) return <Redirect href="/home" />;

  // Financial year (1 July – 30 June by default, or the business's own start month).
  const fyStart = financialYearStart(new Date(), business?.financialYearStartMonth ?? 7);
  const fyStartDate = fromDateKey(fyStart);
  const fyEnd = new Date(fyStartDate.getFullYear() + 1, fyStartDate.getMonth(), 0);
  const thisYear = paid.filter((i) => (paidDateKey(i) ?? '') >= fyStart);
  const yearTotal = thisYear.reduce((sum, i) => sum + i.total, 0);

  // Grouped by the month they were paid, newest first.
  const groups: { label: string; items: ContractorInvoice[] }[] = [];
  for (const inv of paid) {
    const d = fromDateKey(paidDateKey(inv)!);
    const label = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    const group = groups.find((g) => g.label === label);
    if (group) group.items.push(inv);
    else groups.push({ label, items: [inv] });
  }

  return (
    <EmployeeScreen title="Paid">
      <View style={styles.summary}>
        <Text style={styles.summaryLabel}>
          Paid this financial year ({formatShortDate(fyStartDate, false)} – {formatShortDate(fyEnd)})
        </Text>
        <Text style={styles.summaryValue}>{formatCurrency(yearTotal)}</Text>
        <Text style={styles.summarySub}>
          {thisYear.length} paid invoice{thisYear.length === 1 ? '' : 's'}
        </Text>
      </View>

      {state === 'loading' && paid.length === 0 ? (
        <ActivityIndicator color={C.primary} style={styles.loading} />
      ) : state === 'error' && paid.length === 0 ? (
        <Card style={styles.empty}>
          <Text style={styles.emptyTitle}>Couldn&apos;t load your paid invoices</Text>
          <Pressable onPress={reload} accessibilityRole="button">
            <Text style={styles.link}>Try again</Text>
          </Pressable>
        </Card>
      ) : paid.length === 0 ? (
        <Card style={styles.empty}>
          <IconBadge name={{ ios: 'checkmark.seal.fill', android: 'paid', web: 'paid' }} color={C.success} background={C.successSoft} />
          <Text style={styles.emptyBody}>No paid invoices yet. Invoices show up here once your boss marks them as paid.</Text>
        </Card>
      ) : (
        groups.map((g) => (
          <View key={g.label} style={styles.group}>
            <Text style={styles.groupLabel}>{g.label}</Text>
            <Card>
              {g.items.map((inv, i) => (
                <Pressable
                  key={inv.id}
                  onPress={() => router.push({ pathname: '/contractor-invoice/[id]', params: { id: inv.id } })}
                  accessibilityRole="button"
                  accessibilityLabel={`Invoice ${inv.number}, paid, ${formatCurrency(inv.total)}`}
                  style={({ pressed }) => [styles.row, i > 0 && styles.divider, pressed && styles.pressed]}>
                  <View style={styles.flex}>
                    <Text style={styles.number}>{inv.number}</Text>
                    <Text style={styles.meta}>Paid {formatShortDate(fromDateKey(paidDateKey(inv)!))}</Text>
                  </View>
                  <View style={styles.right}>
                    <Text style={styles.amount}>{formatCurrency(inv.total)}</Text>
                    <View style={styles.paidBadge}>
                      <Text style={styles.paidText}>Paid</Text>
                    </View>
                  </View>
                  <Icon name={Icons.chevron} color={C.textMuted} size={14} />
                </Pressable>
              ))}
            </Card>
          </View>
        ))
      )}
    </EmployeeScreen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    gap: 2,
  },
  pressed: {
    opacity: 0.7,
  },
  summary: {
    gap: 4,
    padding: Spacing.three + 2,
    borderRadius: 16,
    backgroundColor: C.success,
  },
  summaryLabel: {
    color: '#DCFCE7',
    fontSize: 13,
    fontWeight: '600',
  },
  summaryValue: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  summarySub: {
    color: '#DCFCE7',
    fontSize: 14,
  },
  loading: {
    marginTop: Spacing.five,
  },
  group: {
    gap: Spacing.two,
  },
  groupLabel: {
    color: C.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    paddingVertical: Spacing.three - 2,
    paddingHorizontal: Spacing.three,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  number: {
    color: C.text,
    fontSize: 15,
    fontWeight: '700',
  },
  meta: {
    color: C.textSecondary,
    fontSize: 13,
  },
  right: {
    alignItems: 'flex-end',
    gap: 4,
  },
  amount: {
    color: C.text,
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  paidBadge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: C.successSoft,
  },
  paidText: {
    color: C.success,
    fontSize: 12,
    fontWeight: '700',
  },
  empty: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.five,
    paddingHorizontal: Spacing.four,
  },
  emptyTitle: {
    color: C.text,
    fontSize: 16,
    fontWeight: '700',
  },
  emptyBody: {
    color: C.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  link: {
    color: C.primary,
    fontSize: 15,
    fontWeight: '600',
  },
});
