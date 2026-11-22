// NexGain Hospitality: money-in cards on the shared Transactions screens.
//   <MoneyInDetail>   on one transaction: "Square payout $1,180 matches
//                     Tuesday's sales of $1,214 (fees about $34)", delivery
//                     income, or the invoice it paid (with Undo).
//   <MoneyInSummary>  on the Transactions tab: insights and recent payouts.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Icon, OwnerIcons } from '@/components/owner/ui';
import { Colors as C, Spacing } from '@/constants/theme';
import type { BankTransaction } from '@/data/bank';
import { invoiceLabel, undoInvoicePayment, type MoneyFeed } from '@/data/money-sorting';
import { formatMoney } from '@/data/payroll';
import { router } from '@/lib/nav';
import { CARD_SALES, CATERING, DELIVERY, matchPayouts, moneyInsights, payoutText, shortDate } from '@/systems/hospitality/data/money';

import { HOSPITALITY_CATEGORIES, HOSPITALITY_INCOME_CATEGORIES } from '../../../../../supabase/functions/_shared/ai/sorting';

const nameOf = (t: Pick<BankTransaction, 'merchant' | 'description'>) => t.merchant || t.description || 'Payment';

/** The categories offered on a hospitality transaction: money in or money out. */
export function hospitalityCategoriesFor(amount: number): string[] {
  return amount > 0
    ? [...HOSPITALITY_INCOME_CATEGORIES, 'Transfers']
    : [...HOSPITALITY_CATEGORIES.filter((c) => c !== 'Other'), 'Transfers', 'Other'];
}

/** One transaction: what its money in was for. */
export function MoneyInDetail({ txn, feed }: { txn: BankTransaction; feed: MoneyFeed }) {
  const [error, setError] = useState<string | null>(null);
  if (txn.amount <= 0) return null;
  const invoice = invoiceLabel(txn.invoiceId, feed);

  if (invoice) {
    return (
      <Card title="Invoice" icon={OwnerIcons.receipt}>
        <Text style={styles.value}>
          Paid {invoice.number} ({invoice.clientName})
        </Text>
        <Text style={styles.muted}>You confirmed this payment is for the invoice, so it’s counted once, as Catering & functions. If that’s wrong, tap Undo.</Text>
        <Button
          label="Open invoice"
          variant="secondary"
          onPress={() => router.push({ pathname: '/hospitality/invoice/[id]', params: { id: invoice.id } })}
        />
        <Button
          label="Undo"
          variant="secondary"
          onPress={async () => {
            setError(null);
            const failed = await undoInvoicePayment(txn.id);
            if (failed) setError(`Couldn’t undo: ${failed}`);
          }}
        />
        {error && <Text style={styles.error}>{error}</Text>}
      </Card>
    );
  }
  if (txn.category === CARD_SALES) {
    const match = matchPayouts(feed.transactions, feed.daySales ?? new Map()).get(txn.id) ?? null;
    return (
      <Card title="Daily sales" icon={OwnerIcons.chart}>
        <Text style={styles.value}>{payoutText(nameOf(txn), txn.amount, match)}</Text>
        <Text style={styles.muted}>
          {match
            ? 'Card and till payouts usually arrive 1–2 business days after the sales, with the provider’s fees taken out.'
            : 'Record your sales (Sales › Record sale or End of day) and NexGain matches the payout to them. If you take cash too, the payout will be less than your sales.'}
        </Text>
      </Card>
    );
  }
  if (txn.category === DELIVERY) {
    return (
      <Card title="Delivery income" icon={OwnerIcons.money}>
        <Text style={styles.value}>
          {nameOf(txn)} paid you {formatMoney(txn.amount)}.
        </Text>
        <Text style={styles.muted}>Delivery app payouts are counted as delivery income (after the app’s fees).</Text>
      </Card>
    );
  }
  if (txn.category === CATERING) {
    return (
      <Card title="Catering & functions" icon={OwnerIcons.money}>
        <Text style={styles.muted}>Saved as catering and functions income. If it pays an invoice, open the invoice in Sales and mark it as paid.</Text>
      </Card>
    );
  }
  return null;
}

/** The Transactions tab: what's going on with the money coming in. */
export function MoneyInSummary({ feed }: { feed: MoneyFeed }) {
  const daySales = feed.daySales ?? new Map<string, number>();
  const insights = moneyInsights(feed.transactions, daySales, feed.docs ?? []);
  const matches = matchPayouts(feed.transactions, daySales);
  const payouts = feed.transactions.filter((t) => t.amount > 0 && t.category === CARD_SALES).slice(0, 3);
  if (insights.length === 0 && payouts.length === 0) return null;
  return (
    <Card title="Money coming in" icon={OwnerIcons.sparkles}>
      {insights.map((i) => (
        <View key={i.id} style={styles.row}>
          <Icon name={i.tone === 'warning' ? { ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' } : OwnerIcons.lightbulb} color={i.tone === 'warning' ? C.warning : C.accent} size={16} />
          <Text style={[styles.text, styles.flex]}>{i.text}</Text>
        </View>
      ))}
      {payouts.map((t) => (
        <Pressable
          key={t.id}
          onPress={() => router.push({ pathname: '/transaction/[id]', params: { id: t.id } })}
          accessibilityRole="button"
          style={({ pressed }) => [styles.row, styles.divider, pressed && styles.pressed]}>
          <Icon name={{ ios: 'creditcard.fill', android: 'credit_card', web: 'credit_card' }} color={matches.has(t.id) ? C.success : C.textSecondary} size={16} />
          <View style={styles.flex}>
            <Text style={styles.text}>{payoutText(nameOf(t), t.amount, matches.get(t.id) ?? null)}</Text>
            <Text style={styles.muted}>Arrived {shortDate(t.date)}</Text>
          </View>
          <Icon name={OwnerIcons.chevron} color={C.textSecondary} size={12} />
        </Pressable>
      ))}
    </Card>
  );
}

/** The Dashboard: money-in insights only (hidden when there's nothing to say). */
export function MoneyInsightsCard({ feed }: { feed: MoneyFeed }) {
  const insights = moneyInsights(feed.transactions, feed.daySales ?? new Map(), feed.docs ?? []);
  if (insights.length === 0) return null;
  return (
    <Card title="Insights" icon={OwnerIcons.sparkles}>
      {insights.map((i, n) => (
        <View key={i.id} style={[styles.row, n > 0 && styles.divider]}>
          <Icon name={i.tone === 'warning' ? { ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' } : OwnerIcons.lightbulb} color={i.tone === 'warning' ? C.warning : C.accent} size={16} />
          <Text style={[styles.text, styles.flex]}>{i.text}</Text>
        </View>
      ))}
      {feed.preview && <Text style={styles.muted}>From the sample data preview.</Text>}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  pressed: { opacity: 0.7 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two, paddingVertical: Spacing.two },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  value: { color: C.text, fontSize: 15, fontWeight: '600', lineHeight: 21 },
  text: { color: C.text, fontSize: 14, lineHeight: 20 },
  muted: { color: C.textSecondary, fontSize: 13, lineHeight: 18 },
  error: { color: C.danger, fontSize: 13, fontWeight: '600' },
});
