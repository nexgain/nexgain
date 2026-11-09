import { router, type Href } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/owner/invoices-ui';
import { ReceiptIcons, useAddReceipt } from '@/components/owner/receipt-ui';
import { Button, Card, EmptyState, goBack, Icon, OwnerIcons, OwnerScreen } from '@/components/owner/ui';
import { Colors as C, Spacing } from '@/constants/theme';
import { formatShortDate } from '@/data/employee-roster';
import { formatMoney } from '@/data/payroll';
import { receiptTitle, unmatchedReceipts, useReceipts } from '@/data/receipts';
import { fromDateKey } from '@/data/shifts';

// Receipts not linked to a transaction yet (e.g. the bank hasn't sent the
// payment). NexGain tries again each time new bank transactions come in.
export default function UnmatchedReceiptsScreen() {
  const receipts = unmatchedReceipts(useReceipts());
  const { add, busy, error } = useAddReceipt();

  return (
    <OwnerScreen>
      <ScreenHeader title="Unmatched receipts" onBack={() => goBack('/transactions')} />
      <Text style={styles.muted}>
        These receipts aren’t linked to a transaction yet. NexGain checks again each time new bank transactions come in, or
        you can tap one to pick its transaction.
      </Text>
      {error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}

      <Card>
        {receipts.length === 0 ? (
          <EmptyState icon={OwnerIcons.check} message="All your receipts are matched to a transaction." />
        ) : (
          receipts.map((r, i) => (
            <Pressable
              key={r.id}
              onPress={() => router.push({ pathname: '/receipt/[id]', params: { id: r.id } } as Href)}
              accessibilityRole="button"
              accessibilityLabel={`${receiptTitle(r)}${r.total !== null ? `, ${formatMoney(r.total)}` : ''}`}
              style={({ pressed }) => [styles.row, i > 0 && styles.divider, pressed && styles.pressed]}>
              <View style={styles.icon}>
                {r.status === 'reading' ? <ActivityIndicator color={C.accent} /> : <Icon name={ReceiptIcons.receipt} color={C.accent} size={16} />}
              </View>
              <View style={styles.flex}>
                <Text style={styles.title} numberOfLines={1}>
                  {receiptTitle(r)}
                </Text>
                <Text style={styles.muted} numberOfLines={1}>
                  {r.status === 'failed'
                    ? 'Couldn’t be read. Tap to type the details.'
                    : r.matchStatus === 'suggested'
                      ? 'Possible matches found. Tap to choose.'
                      : r.date
                        ? formatShortDate(fromDateKey(r.date))
                        : 'Waiting for its bank transaction'}
                </Text>
              </View>
              {r.total !== null && <Text style={styles.amount}>{formatMoney(r.total)}</Text>}
              <Icon name={OwnerIcons.chevron} color={C.textSecondary} size={12} />
            </Pressable>
          ))
        )}
      </Card>

      <Button label={busy ? 'Saving…' : 'Add receipt'} icon={ReceiptIcons.camera} onPress={() => add()} disabled={busy} />
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    minHeight: 56,
    paddingVertical: Spacing.two,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(79, 140, 255, 0.14)',
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
});
