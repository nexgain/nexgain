import { useCallback, useState } from 'react';
import { router, useFocusEffect, type Href } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { categoryIcon, signedMoney, TransactionRow } from '@/components/owner/transactions-ui';
import { Button, Card, EmptyState, Icon, OwnerIcons, OwnerScreen, PageHeader, RangeSelect, TabRow } from '@/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import {
  categorySections,
  isBankConnected,
  syncBank,
  syncBankIfStale,
  transactionItems,
  TRANSFERS_CATEGORY,
  useBankAccounts,
  useBankConnection,
  useBankSyncing,
  useBankTransactions,
  type TransactionItem,
} from '@/data/bank';
import { financeRanges, useExpenses } from '@/data/finance';
import { formatMoney } from '@/data/payroll';

const ALL = 'All';
/** Rows shown in each section before "Show all". */
const PREVIEW = 5;

// The Transactions tab: money in and out of the business bank account (and
// expenses the owner typed in), in sections by category: Income, Fuel,
// Materials & supplies...
export default function TransactionsScreen() {
  const connection = useBankConnection();
  const accounts = useBankAccounts();
  const txns = useBankTransactions();
  const expenses = useExpenses();
  const syncing = useBankSyncing();
  const connected = isBankConnected(connection);

  const ranges = financeRanges();
  const [rangeId, setRangeId] = useState('this-month');
  const range = ranges.find((r) => r.id === rangeId) ?? ranges[0];
  const [section, setSection] = useState(ALL);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);

  // Get the latest from the bank when the tab opens, if it's been a while.
  useFocusEffect(
    useCallback(() => {
      syncBankIfStale();
    }, []),
  );

  const all = transactionItems(txns, accounts, expenses);
  const items = all.filter((i) => i.date >= range.start && i.date < range.end);
  const sections = categorySections(items);
  const counted = items.filter((i) => i.category !== TRANSFERS_CATEGORY);
  const moneyIn = counted.filter((i) => i.amount > 0).reduce((sum, i) => sum + i.amount, 0);
  const moneyOut = counted.filter((i) => i.amount < 0).reduce((sum, i) => sum - i.amount, 0);

  const tabs = [ALL, ...sections.map((s) => s.category)];
  const activeTab = tabs.includes(section) ? section : ALL;
  const shown = activeTab === ALL ? sections : sections.filter((s) => s.category === activeTab);

  function open(item: TransactionItem) {
    if (item.source === 'bank') router.push({ pathname: '/transaction/[id]', params: { id: item.id } } as Href);
    else router.push({ pathname: '/expenses/edit', params: { id: item.expense!.id } } as Href);
  }

  async function sync() {
    setMessage(null);
    const result = await syncBank({ refresh: true });
    if (!result.ok) setMessage(result.message);
  }

  function toggle(category: string) {
    setExpanded((now) => {
      const next = new Set(now);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  return (
    <OwnerScreen>
      <PageHeader
        title="Transactions"
        subtitle={connected ? 'Money in and out of your business, sorted by category.' : 'Connect your bank to see your transactions here.'}
        right={
          connected ? (
            <Pressable
              onPress={sync}
              disabled={syncing}
              accessibilityRole="button"
              accessibilityLabel={syncing ? 'Getting your latest transactions' : 'Get the latest bank transactions'}
              hitSlop={8}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
              {syncing ? (
                <ActivityIndicator color={C.accent} />
              ) : (
                <Icon name={{ ios: 'arrow.clockwise', android: 'sync', web: 'sync' }} color={C.accent} size={18} />
              )}
            </Pressable>
          ) : undefined
        }
      />

      {!connected && (
        <Card>
          <View style={styles.connectRow}>
            <View style={styles.bankIcon}>
              <Icon name={OwnerIcons.bank} color={C.accent} size={20} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.connectTitle}>Connect your business bank</Text>
              <Text style={styles.muted}>
                Your transactions come in automatically and are sorted into Fuel, Materials and more. View only: NexGain can never
                move money.
              </Text>
            </View>
          </View>
          <Button label="Connect bank" icon={{ ios: 'link', android: 'link', web: 'link' }} onPress={() => router.push('/integrations')} />
        </Card>
      )}

      {syncing && connected && txns.length === 0 && (
        <Card>
          <View style={styles.loading}>
            <ActivityIndicator color={C.accent} />
            <Text style={styles.muted}>Getting your transactions from your bank. This can take a minute…</Text>
          </View>
        </Card>
      )}

      {message && (
        <Text accessibilityRole="alert" style={styles.error}>
          {message}
        </Text>
      )}

      <RangeSelect options={ranges} value={range} onChange={(r) => setRangeId(r.id)} />

      <View style={styles.totals}>
        <View style={[styles.total, styles.flex]}>
          <Text style={styles.label}>Money in</Text>
          <Text style={[styles.totalValue, { color: C.success }]} numberOfLines={1} adjustsFontSizeToFit>
            {formatMoney(moneyIn)}
          </Text>
        </View>
        <View style={[styles.total, styles.flex]}>
          <Text style={styles.label}>Money out</Text>
          <Text style={styles.totalValue} numberOfLines={1} adjustsFontSizeToFit>
            {formatMoney(moneyOut)}
          </Text>
        </View>
      </View>

      {sections.length > 0 && <TabRow tabs={tabs} active={activeTab} onChange={setSection} />}

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={OwnerIcons.card}
            message={
              all.length > 0
                ? 'No transactions in this period. Try a different date range.'
                : connected
                  ? 'No transactions yet. New ones appear here as your bank sends them.'
                  : 'No transactions yet. Connect your bank, or add an expense yourself from the Expenses page.'
            }
          />
        </Card>
      ) : (
        shown.map((s) => {
          const isOpen = expanded.has(s.category) || activeTab !== ALL;
          const rows = isOpen ? s.items : s.items.slice(0, PREVIEW);
          return (
            <Card
              key={s.category}
              title={s.category}
              icon={categoryIcon(s.category)}
              right={<Text style={styles.sectionTotal}>{signedMoney(s.total)}</Text>}>
              <Text style={styles.muted}>
                {s.items.length} transaction{s.items.length === 1 ? '' : 's'}
              </Text>
              <View>
                {rows.map((item, i) => (
                  <TransactionRow key={item.id} item={item} showDivider={i > 0} onPress={() => open(item)} />
                ))}
              </View>
              {s.items.length > PREVIEW && activeTab === ALL && (
                <Pressable
                  onPress={() => toggle(s.category)}
                  accessibilityRole="button"
                  hitSlop={6}
                  style={({ pressed }) => [styles.more, pressed && styles.pressed]}>
                  <Text style={styles.moreText}>{isOpen ? 'Show less' : `Show all ${s.items.length}`}</Text>
                </Pressable>
              )}
            </Card>
          );
        })
      )}

      {items.length > 0 && (
        <Text style={styles.footnote}>
          NexGain sorts each transaction into a category for you. Tap one to change it. Transfers between your own accounts
          aren’t counted in Money in or Money out.
        </Text>
      )}
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
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  connectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
  },
  bankIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(79, 140, 255, 0.14)',
  },
  connectTitle: {
    color: C.text,
    fontSize: 16,
    fontWeight: '700',
  },
  loading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
  },
  muted: {
    color: C.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  error: {
    color: C.danger,
    fontSize: 13,
    fontWeight: '600',
  },
  totals: {
    flexDirection: 'row',
    gap: Spacing.three - 4,
  },
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
  sectionTotal: {
    color: C.text,
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  more: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
  },
  moreText: {
    color: C.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  footnote: {
    color: C.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
});
