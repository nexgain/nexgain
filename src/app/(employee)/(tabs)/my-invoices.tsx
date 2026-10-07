import { useState } from 'react';
import { Redirect, router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { InvoiceStatusPill, useInvoicesLoader } from '@/components/employee/invoice-ui';
import { Card, EmployeeScreen, Icon, IconBadge, Icons } from '@/components/employee/ui';
import { EmployeeColors as C } from '@/constants/employee-theme';
import { Radius, Spacing } from '@/constants/theme';
import { createDraftInvoice, invoiceTotals, useContractorInvoices } from '@/data/contractor-invoices';
import { useCurrentEmployee } from '@/data/current-employee';
import { formatShortDate } from '@/data/employee-roster';
import { formatCurrency } from '@/data/employee-payslips';
import { isContractor } from '@/data/employees';
import { fromDateKey } from '@/data/shifts';

// Contractors only: invoices that haven't been paid yet (paid ones are on the Paid tab).
export default function InvoicesScreen() {
  const me = useCurrentEmployee();
  const invoices = useContractorInvoices().filter((i) => i.status !== 'paid');
  const { state, reload } = useInvoicesLoader();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (me && !isContractor(me)) return <Redirect href="/home" />;

  async function newInvoice() {
    if (!me || creating) return;
    setCreating(true);
    setError(null);
    try {
      const id = await createDraftInvoice(me.id);
      router.push({ pathname: '/contractor-invoice/[id]', params: { id } });
    } catch {
      setError('Couldn’t start a new invoice. Check your internet connection and try again.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <EmployeeScreen
      title="Invoices"
      headerRight={
        <Pressable
          onPress={newInvoice}
          disabled={creating}
          accessibilityRole="button"
          accessibilityLabel="New invoice"
          style={({ pressed }) => [styles.newButton, pressed && styles.pressed]}>
          {creating ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Icon name={{ ios: 'plus', android: 'add', web: 'add' }} color="#FFFFFF" size={18} />
          )}
          <Text style={styles.newText}>New</Text>
        </Pressable>
      }>
      <Text style={styles.subtitle}>Create invoices and send them to your boss</Text>
      {error && <Text style={styles.error}>{error}</Text>}

      {state === 'loading' && invoices.length === 0 ? (
        <ActivityIndicator color={C.primary} style={styles.loading} />
      ) : state === 'error' && invoices.length === 0 ? (
        <Card style={styles.empty}>
          <Text style={styles.emptyTitle}>Couldn&apos;t load your invoices</Text>
          <Pressable onPress={reload} accessibilityRole="button">
            <Text style={styles.link}>Try again</Text>
          </Pressable>
        </Card>
      ) : invoices.length === 0 ? (
        <Card style={styles.empty}>
          <IconBadge name={Icons.payslip} />
          <Text style={styles.emptyTitle}>No invoices yet</Text>
          <Text style={styles.emptyBody}>Tap &quot;New&quot; to create your first invoice. Paid invoices move to the Paid tab.</Text>
        </Card>
      ) : (
        <View style={styles.list}>
          {invoices.map((inv) => (
            <Pressable
              key={inv.id}
              onPress={() => router.push({ pathname: '/contractor-invoice/[id]', params: { id: inv.id } })}
              accessibilityRole="button"
              accessibilityLabel={`Invoice ${inv.number}, ${inv.status}`}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
              <IconBadge name={Icons.payslip} />
              <View style={styles.flex}>
                <Text style={styles.number}>{inv.number}</Text>
                <Text style={styles.meta}>{formatShortDate(fromDateKey(inv.invoiceDate))}</Text>
                <InvoiceStatusPill status={inv.status} />
              </View>
              <Text style={styles.amount}>
                {formatCurrency(inv.status === 'draft' ? invoiceTotals(inv.items, me?.gstRegistered ?? false).total : inv.total)}
              </Text>
              <Icon name={Icons.chevron} color={C.textMuted} size={14} />
            </Pressable>
          ))}
        </View>
      )}
    </EmployeeScreen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    gap: 4,
  },
  pressed: {
    opacity: 0.7,
  },
  subtitle: {
    color: C.textSecondary,
    fontSize: 15,
    marginTop: -Spacing.two,
  },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.three - 2,
    paddingVertical: Spacing.two,
    borderRadius: 999,
    backgroundColor: C.primary,
  },
  newText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  error: {
    color: C.danger,
    fontSize: 14,
  },
  loading: {
    marginTop: Spacing.five,
  },
  list: {
    gap: Spacing.three - 4,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    padding: Spacing.three,
    borderRadius: 16,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
  },
  number: {
    color: C.text,
    fontSize: 16,
    fontWeight: '700',
  },
  meta: {
    color: C.textSecondary,
    fontSize: 13,
  },
  amount: {
    color: C.text,
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  empty: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.five,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.large,
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
  },
  link: {
    color: C.primary,
    fontSize: 15,
    fontWeight: '600',
  },
});
