import { useState } from 'react';
import { Redirect, router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge, Card, EmptyState, goBack, Icon, OwnerIcons, OwnerScreen, PageHeader, TabRow } from '@/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import {
  INVOICE_STATUS_LABEL,
  loadContractorInvoices,
  useContractorInvoices,
  type ContractorInvoice,
  type InvoiceStatus,
} from '@/data/contractor-invoices';
import { useCurrentEmployee } from '@/data/current-employee';
import { formatShortDate } from '@/data/employee-roster';
import { employeeFullName, useEmployees } from '@/data/employees';
import { formatMoney } from '@/data/payroll';
import { fromDateKey } from '@/data/shifts';

const TABS = ['To review', 'Approved', 'Paid', 'Declined', 'All'] as const;
type Tab = (typeof TABS)[number];
const TAB_STATUS: Record<Exclude<Tab, 'All'>, InvoiceStatus> = {
  'To review': 'sent',
  Approved: 'approved',
  Paid: 'paid',
  Declined: 'declined',
};

const STATUS_TONE: Record<InvoiceStatus, 'info' | 'warning' | 'success' | 'danger' | 'neutral'> = {
  draft: 'neutral',
  sent: 'info',
  approved: 'warning',
  declined: 'danger',
  paid: 'success',
};

// Invoices contractors have sent to the business, newest first. Owner only.
export default function ContractorInvoicesScreen() {
  const me = useCurrentEmployee();
  const employees = useEmployees();
  const invoices = useContractorInvoices().filter((i) => i.status !== 'draft');
  const [tab, setTab] = useState<Tab>('To review');
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');

  if (me) return <Redirect href="/home" />;

  const nameOf = (inv: ContractorInvoice) => {
    const e = employees.find((x) => x.id === inv.employeeId);
    return e ? employeeFullName(e) : (inv.sentDetails?.name ?? 'Contractor');
  };
  const count = (t: Tab) => (t === 'All' ? invoices.length : invoices.filter((i) => i.status === TAB_STATUS[t]).length);
  const visible = (tab === 'All' ? invoices : invoices.filter((i) => i.status === TAB_STATUS[tab])).sort((a, b) =>
    (b.sentAt ?? b.createdAt).localeCompare(a.sentAt ?? a.createdAt),
  );

  function refresh() {
    setState('loading');
    loadContractorInvoices()
      .then(() => setState('idle'))
      .catch(() => setState('error'));
  }

  return (
    <OwnerScreen>
      <PageHeader
        onBack={() => goBack()}
        title="Contractor Invoices"
        subtitle="Invoices your contractors have sent you. Approve, decline or mark them as paid."
      />
      <TabRow
        tabs={TABS.map((t) => `${t} (${count(t)})`)}
        active={`${tab} (${count(tab)})`}
        onChange={(t) => setTab(t.replace(/ \(\d+\)$/, '') as Tab)}
      />

      {state === 'loading' && <ActivityIndicator color={C.accent} />}
      {state === 'error' && (
        <Card>
          <Text style={styles.muted}>Couldn&apos;t load invoices. Check your internet connection.</Text>
          <Pressable onPress={refresh} accessibilityRole="button">
            <Text style={styles.link}>Try again</Text>
          </Pressable>
        </Card>
      )}

      {visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={OwnerIcons.receipt}
            message={
              invoices.length === 0
                ? 'No contractor invoices yet. When a contractor sends you an invoice it appears here and in your Notifications to-do list.'
                : `No ${tab === 'All' ? '' : tab.toLowerCase() + ' '}invoices.`
            }
          />
        </Card>
      ) : (
        <View style={styles.list}>
          {visible.map((inv) => (
            <Pressable
              key={inv.id}
              onPress={() => router.push({ pathname: '/team-invoice/[id]', params: { id: inv.id } })}
              accessibilityRole="button"
              accessibilityLabel={`${nameOf(inv)}, ${inv.number}, ${INVOICE_STATUS_LABEL[inv.status]}`}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
              <View style={styles.flex}>
                <Text style={styles.name}>{nameOf(inv)}</Text>
                <Text style={styles.muted}>
                  {inv.number} · {formatShortDate(fromDateKey(inv.invoiceDate))}
                  {inv.dueDate ? ` · due ${formatShortDate(fromDateKey(inv.dueDate), false)}` : ''}
                </Text>
                <Badge label={INVOICE_STATUS_LABEL[inv.status]} tone={STATUS_TONE[inv.status]} />
              </View>
              <Text style={styles.total}>{formatMoney(inv.total)}</Text>
              <Icon name={OwnerIcons.chevron} color={C.textSecondary} size={14} />
            </Pressable>
          ))}
        </View>
      )}
    </OwnerScreen>
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
  muted: {
    color: C.textSecondary,
    fontSize: 13,
  },
  link: {
    color: C.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  list: {
    gap: Spacing.three - 4,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    padding: Spacing.three,
    borderRadius: Radius.large,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  name: {
    color: C.text,
    fontSize: 16,
    fontWeight: '700',
  },
  total: {
    color: C.text,
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
