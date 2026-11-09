import { useCallback, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { SwitchRow } from '@/components/owner/form';
import { NeedsReviewCard } from '@/components/owner/money-review';
import { ReceiptIcons, useAddReceipt } from '@/components/owner/receipt-ui';
import { categoryIcon, signedMoney, TransactionRow } from '@/components/owner/transactions-ui';
import { ActionRow, Button, Card, EmptyState, Icon, OwnerIcons, OwnerScreen, PageHeader, RangeSelect, TabRow } from '@/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { categorySections, syncBank, syncBankIfStale, transactionItems, TRANSFERS_CATEGORY, useBankSyncing, type TransactionItem } from '@/data/bank';
import { useExpenses } from '@/data/finance';
import {
  setLinkExpensesToJobs,
  startBankPreview,
  stopBankPreview,
  transactionRanges,
  useMoneyFeed,
} from '@/data/money-sorting';
import { formatMoney } from '@/data/payroll';
import { indexReceipts, receiptStatus, unmatchedReceipts, useReceipts } from '@/data/receipts';

const ALL = 'All';
const FILTERS = ['All', 'Missing receipts'] as const;
type Filter = (typeof FILTERS)[number];
/** Rows shown in each section (and in "Recent") before "Show all". */
const PREVIEW = 5;

// The Transactions tab: money in and out of the business bank account (and
// expenses the owner typed in), in sections by category: Income, Fuel,
// Materials & supplies... NexGain sorts each one (see src/data/money-sorting.ts),
// asks about anything it isn't sure of ("Needs review") and adds up spending
// in six groups ("Expenses by category").
export default function TransactionsScreen() {
  const feed = useMoneyFeed();
  const { accounts, transactions: txns, connected, preview } = feed;
  const typedExpenses = useExpenses();
  // The sample preview shows the sample bank only.
  const expenses = preview ? [] : typedExpenses;
  const syncing = useBankSyncing();
  const receipts = useReceipts();
  const params = useLocalSearchParams<{ filter?: string; range?: string }>();
  const { add: addReceipt, busy: addingReceipt, error: receiptError } = useAddReceipt();

  const ranges = transactionRanges();
  const [rangeId, setRangeId] = useState(params.range ?? 'this-month');
  const range = ranges.find((r) => r.id === rangeId) ?? ranges[0];
  const [section, setSection] = useState(ALL);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>(params.filter === 'missing' ? 'Missing receipts' : 'All');
  // "Recent" shows the latest few; "See all" shows every transaction by category.
  const [seeAll, setSeeAll] = useState(params.filter === 'missing');

  // Opened from the Dashboard's "receipts missing" card: show the missing ones.
  const [lastParams, setLastParams] = useState(`${params.filter}|${params.range}`);
  if (`${params.filter}|${params.range}` !== lastParams) {
    setLastParams(`${params.filter}|${params.range}`);
    if (params.filter === 'missing') {
      setFilter('Missing receipts');
      setSeeAll(true);
    }
    if (params.range) setRangeId(params.range);
  }

  // Get the latest from the bank when the tab opens, if it's been a while.
  useFocusEffect(
    useCallback(() => {
      if (!preview) syncBankIfStale();
    }, [preview]),
  );

  const all = transactionItems(txns, accounts, expenses);
  const inPeriod = all.filter((i) => i.date >= range.start && i.date < range.end);
  const receiptIndex = indexReceipts(receipts);
  const statusOf = (item: TransactionItem) => receiptStatus(item, receiptIndex);
  const missingCount = inPeriod.filter((i) => statusOf(i) === 'missing').length;
  const items = filter === 'Missing receipts' ? inPeriod.filter((i) => statusOf(i) === 'missing') : inPeriod;
  const sections = categorySections(items);
  const unmatched = unmatchedReceipts(receipts);
  const counted = inPeriod.filter((i) => i.category !== TRANSFERS_CATEGORY);
  const moneyIn = counted.filter((i) => i.amount > 0).reduce((sum, i) => sum + i.amount, 0);
  const moneyOut = counted.filter((i) => i.amount < 0).reduce((sum, i) => sum - i.amount, 0);
  const recent = inPeriod.slice(0, PREVIEW);

  const tabs = [ALL, ...sections.map((s) => s.category)];
  const activeTab = tabs.includes(section) ? section : ALL;
  const shown = activeTab === ALL ? sections : sections.filter((s) => s.category === activeTab);

  function open(item: TransactionItem) {
    if (item.source === 'bank') router.push({ pathname: '/transaction/[id]', params: { id: item.id } } as Href);
    else router.push({ pathname: '/expenses/edit', params: { id: item.expense!.id } } as Href);
  }

  async function sync() {
    setMessage(null);
    if (preview) return;
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
        subtitle={
          preview
            ? 'Sample data: a preview of how your bank transactions will look. Nothing is saved.'
            : connected
              ? 'Money in and out of your business, sorted by category.'
              : 'Connect your bank to see your transactions here.'
        }
        right={
          <View style={styles.headerButtons}>
            {connected && (
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
            )}
            <Pressable
              onPress={() => addReceipt()}
              disabled={addingReceipt}
              accessibilityRole="button"
              accessibilityLabel="Add a receipt"
              hitSlop={8}
              style={({ pressed }) => [styles.iconButton, styles.cameraButton, pressed && styles.pressed]}>
              {addingReceipt ? <ActivityIndicator color={C.onAccent} /> : <Icon name={ReceiptIcons.camera} color={C.onAccent} size={18} />}
            </Pressable>
          </View>
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

      <NeedsReviewCard feed={feed} />

      {syncing && connected && txns.length === 0 && (
        <Card>
          <View style={styles.loading}>
            <ActivityIndicator color={C.accent} />
            <Text style={styles.muted}>Getting your transactions from your bank. This can take a minute…</Text>
          </View>
        </Card>
      )}

      {(message || receiptError) && (
        <Text accessibilityRole="alert" style={styles.error}>
          {message ?? receiptError}
        </Text>
      )}

      {unmatched.length > 0 && (
        <Pressable
          onPress={() => router.push('/unmatched-receipts' as Href)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.banner, pressed && styles.pressed]}>
          <Icon name={ReceiptIcons.receipt} color={C.accent} size={18} />
          <View style={styles.flex}>
            <Text style={styles.bannerTitle}>
              {unmatched.length} unmatched receipt{unmatched.length === 1 ? '' : 's'}
            </Text>
            <Text style={styles.muted}>Not linked to a transaction yet. Tap to check them.</Text>
          </View>
          <Icon name={OwnerIcons.chevron} color={C.textSecondary} size={12} />
        </Pressable>
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

      {all.length > 0 && (
        // The list, wheel and details are on their own page, to keep this one tidy.
        <Card>
          <ActionRow
            icon={OwnerIcons.chart}
            label="Expenses by category"
            onPress={() => router.push({ pathname: '/spending', params: { range: range.id } } as Href)}
          />
        </Card>
      )}

      {!seeAll && recent.length > 0 && (
        <Card
          title="Recent"
          icon={OwnerIcons.clock}
          right={
            <Pressable onPress={() => setSeeAll(true)} accessibilityRole="button" hitSlop={8} style={({ pressed }) => pressed && styles.pressed}>
              <Text style={styles.moreText}>See all</Text>
            </Pressable>
          }>
          <View>
            {recent.map((item, i) => (
              <TransactionRow key={item.id} item={item} showDivider={i > 0} onPress={() => open(item)} receipt={statusOf(item)} />
            ))}
          </View>
        </Card>
      )}

      {seeAll && (
        <View style={styles.allHeader}>
          <Text style={styles.allTitle}>All transactions</Text>
          <Pressable onPress={() => setSeeAll(false)} accessibilityRole="button" hitSlop={8} style={({ pressed }) => pressed && styles.pressed}>
            <Text style={styles.moreText}>Show less</Text>
          </Pressable>
        </View>
      )}

      {seeAll && (
        <View style={styles.filters} accessibilityRole="tablist">
          {FILTERS.map((f) => {
            const selected = f === filter;
            return (
              <Pressable
                key={f}
                onPress={() => setFilter(f)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                style={({ pressed }) => [styles.filter, selected && styles.filterSelected, pressed && styles.pressed]}>
                {f === 'Missing receipts' && missingCount > 0 && (
                  <Icon name={ReceiptIcons.missing} color={selected ? C.onAccent : C.warning} size={13} />
                )}
                <Text style={[styles.filterText, selected && styles.filterTextSelected]}>
                  {f === 'Missing receipts' ? `Missing receipts${missingCount > 0 ? ` (${missingCount})` : ''}` : f}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {seeAll && sections.length > 0 && <TabRow tabs={tabs} active={activeTab} onChange={setSection} />}

      {(seeAll || recent.length === 0) && (items.length === 0 ? (
        <Card>
          <EmptyState
            icon={filter === 'Missing receipts' ? OwnerIcons.check : OwnerIcons.card}
            message={
              filter === 'Missing receipts'
                ? 'No missing receipts in this period. Nice work!'
                : all.length > 0
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
                  <TransactionRow key={item.id} item={item} showDivider={i > 0} onPress={() => open(item)} receipt={statusOf(item)} />
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
      ))}

      {connected && (
        <Card title="Settings" icon={OwnerIcons.info}>
          <SwitchRow
            label="Link expenses to jobs"
            hint="NexGain asks which job a purchase was for (like Bunnings the day before a deck job), so you can see what each job really cost."
            value={feed.linkExpensesToJobs}
            onChange={setLinkExpensesToJobs}
          />
        </Card>
      )}

      {__DEV__ && (
        <Button
          label={preview ? 'Stop the sample preview' : 'Preview with sample data'}
          icon={OwnerIcons.play}
          variant="secondary"
          onPress={preview ? stopBankPreview : startBankPreview}
        />
      )}

      {receipts.length === 0 && all.length > 0 && (
        <Text style={styles.muted}>No receipts yet. Tap the camera at the top to add one.</Text>
      )}

      <Button
        label="Export for my accountant"
        icon={OwnerIcons.download}
        variant="secondary"
        onPress={() => router.push('/accountant-export' as Href)}
      />

      {items.length > 0 && (
        <Text style={styles.footnote}>
          NexGain sorts each transaction into a category for you and asks when it isn’t sure. Tap one to change it or add its
          receipt; NexGain remembers your choice for that shop next time. A green tick means
          the receipt is saved; an orange warning means an expense over $82.50 has no receipt yet (you need one to claim the
          GST). Transfers between your own accounts aren’t counted in Money in or Money out.
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
  headerButtons: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  cameraButton: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    padding: Spacing.three,
    borderRadius: Radius.large - 4,
    backgroundColor: C.accentSoft,
    borderWidth: 1,
    borderColor: C.infoBorder,
  },
  bannerTitle: {
    color: C.text,
    fontSize: 15,
    fontWeight: '700',
  },
  filters: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  filter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: Spacing.three,
    borderRadius: 999,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  filterSelected: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  filterText: {
    color: C.text,
    fontSize: 14,
    fontWeight: '600',
  },
  filterTextSelected: {
    color: C.onAccent,
  },
  allHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  allTitle: {
    color: C.text,
    fontSize: 17,
    fontWeight: '700',
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
    backgroundColor: C.accentSoft,
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
