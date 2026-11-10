import { useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/owner/invoices-ui';
import { Badge, Button, Card, EmptyState, OwnerIcons, OwnerScreen, RangeSelect, type IconName } from '@/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { formatDay, recentQuarters, useGstQuarter, type GstItem } from '@/data/gst';
import { formatMoney } from '@/data/payroll';

const SOURCE: Record<GstItem['source'], string> = { invoice: 'Invoice', receipt: 'Receipt', bank: 'Bank', expense: 'Expense' };
const SHOWN = 8;

// GST: one Australian quarter at a time (this one first, earlier ones from the
// picker): GST collected on paid invoices, GST credits on expenses, and the
// estimated GST to pay, with everything that makes them up.
export default function GstScreen() {
  const quarters = recentQuarters();
  const options = quarters.map((q, i) => ({ id: q.start.toISOString(), label: i === 0 ? `This quarter (${q.label})` : `${q.label} (${q.fyLabel})`, q }));
  const [chosen, setChosen] = useState(options[0]);
  const quarter = chosen.q;
  const { enabled, items, totals, lodgedAt, status, setLodged } = useGstQuarter(quarter);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!enabled) {
    return (
      <OwnerScreen>
        <ScreenHeader title="GST" onBack={() => router.back()} />
        <Card>
          <EmptyState
            icon={OwnerIcons.receipt}
            message="GST is only for Australian businesses registered for GST. You can turn it on in Business Profile."
          />
        </Card>
      </OwnerScreen>
    );
  }

  const sales = items.filter((i) => i.kind === 'sale');
  const expenses = items.filter((i) => i.kind === 'expense');
  const lastDay = new Date(quarter.end.getFullYear(), quarter.end.getMonth(), 0);

  async function toggleLodged() {
    setBusy(true);
    setError(await setLodged(!lodgedAt));
    setBusy(false);
  }

  return (
    <OwnerScreen>
      <ScreenHeader title="GST" onBack={() => router.back()} />
      <View style={styles.row}>
        <RangeSelect options={options} value={chosen} onChange={setChosen} />
      </View>

      <Card>
        <Text style={styles.dates}>
          {formatDay(quarter.start)} – {formatDay(lastDay)} · {quarter.fyLabel}
        </Text>
        <View style={styles.dueLine}>
          <Text style={styles.muted}>BAS due {formatDay(quarter.basDue)}</Text>
          {lodgedAt ? <Badge label="Lodged / Paid" tone="success" /> : null}
        </View>
        {status === 'loading' ? (
          <ActivityIndicator color={C.accent} />
        ) : status === 'error' ? (
          <Text style={styles.error}>Couldn&apos;t load GST. Check your internet connection.</Text>
        ) : (
          <>
            <Line label="GST collected" hint="On invoices paid this quarter" value={formatMoney(totals.collected)} />
            <Line label="GST paid on expenses" hint="GST credits" value={`− ${formatMoney(totals.credits)}`} />
            <View style={styles.divider} />
            <Line
              label={totals.toPay >= 0 ? 'Estimated GST to pay' : 'Estimated GST refund'}
              value={formatMoney(Math.abs(totals.toPay))}
              strong
            />
          </>
        )}
        <Button
          label={busy ? 'Saving…' : lodgedAt ? 'Mark as not lodged' : 'Mark as Lodged / Paid'}
          variant={lodgedAt ? 'secondary' : 'primary'}
          icon={OwnerIcons.check}
          disabled={busy}
          onPress={toggleLodged}
        />
        {lodgedAt && <Text style={styles.muted}>Reminders for this quarter are turned off.</Text>}
        {error && <Text style={styles.error}>{error}</Text>}
      </Card>

      <ItemList title="GST collected" icon={OwnerIcons.trendingUp} items={sales} empty="No paid invoices with GST this quarter." />
      <ItemList title="GST credits (expenses)" icon={OwnerIcons.card} items={expenses} empty="No expenses with GST this quarter." />

      <View style={styles.notice}>
        <Text style={styles.noticeText}>
          These amounts are estimates. Please check them with your accountant before lodging your BAS. Purchases without a receipt
          are estimated at 1/11 when $82.50 or less; over $82.50 you need a tax invoice to claim the GST.
        </Text>
      </View>
    </OwnerScreen>
  );
}

function Line({ label, hint, value, strong }: { label: string; hint?: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.line}>
      <View style={styles.flex}>
        <Text style={[styles.lineLabel, strong && styles.strong]}>{label}</Text>
        {hint ? <Text style={styles.muted}>{hint}</Text> : null}
      </View>
      <Text style={[styles.lineValue, strong && styles.strongValue]}>{value}</Text>
    </View>
  );
}

function ItemList({ title, icon, items, empty }: { title: string; icon: IconName; items: GstItem[]; empty: string }) {
  const [all, setAll] = useState(false);
  const sorted = [...items].sort((a, b) => b.day.localeCompare(a.day));
  const shown = all ? sorted : sorted.slice(0, SHOWN);
  const open = (i: GstItem) =>
    i.source === 'invoice'
      ? router.push({ pathname: '/invoices/[id]', params: { id: i.refId } })
      : i.source === 'bank'
        ? router.push({ pathname: '/transaction/[id]', params: { id: i.refId } })
        : i.source === 'receipt'
          ? router.push({ pathname: '/receipt/[id]', params: { id: i.refId } })
          : undefined;
  return (
    <Card title={`${title} (${items.length})`} icon={icon}>
      {items.length === 0 ? (
        <Text style={styles.muted}>{empty}</Text>
      ) : (
        shown.map((i, n) => (
          <Pressable
            key={`${i.source}-${i.refId}`}
            onPress={() => open(i)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.item, n > 0 && styles.itemDivider, pressed && styles.pressed]}>
            <View style={styles.flex}>
              <Text style={styles.itemTitle} numberOfLines={1}>
                {i.description}
              </Text>
              <Text style={styles.muted}>
                {SOURCE[i.source]} · {formatDay(new Date(`${i.day}T00:00:00`))} · {formatMoney(i.amount)}
              </Text>
            </View>
            <View style={styles.itemRight}>
              <Text style={styles.itemGst}>{formatMoney(i.gst)}</Text>
              {i.note === 'estimated' && <Badge label="Estimated" tone="neutral" />}
              {i.note === 'needs receipt' && <Badge label="Needs receipt" tone="warning" />}
            </View>
          </Pressable>
        ))
      )}
      {items.length > SHOWN && (
        <Button label={all ? 'Show less' : `Show all ${items.length}`} variant="secondary" onPress={() => setAll(!all)} />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  flex: {
    flex: 1,
  },
  dates: {
    color: C.text,
    fontSize: 15,
    fontWeight: '700',
  },
  dueLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  muted: {
    color: C.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  error: {
    color: C.danger,
    fontSize: 13,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  lineLabel: {
    color: C.text,
    fontSize: 15,
  },
  lineValue: {
    color: C.text,
    fontSize: 15,
    fontWeight: '600',
  },
  strong: {
    fontWeight: '700',
  },
  strongValue: {
    fontSize: 20,
    fontWeight: '800',
    color: C.accent,
  },
  divider: {
    height: 1,
    backgroundColor: C.border,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  itemDivider: {
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  pressed: {
    opacity: 0.7,
  },
  itemTitle: {
    color: C.text,
    fontSize: 14,
    fontWeight: '600',
  },
  itemRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  itemGst: {
    color: C.text,
    fontSize: 14,
    fontWeight: '700',
  },
  notice: {
    padding: Spacing.three - 4,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: C.warningBorder,
    backgroundColor: C.warningSoft,
  },
  noticeText: {
    color: C.text,
    fontSize: 13,
    lineHeight: 19,
  },
});
