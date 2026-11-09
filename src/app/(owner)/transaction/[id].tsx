import { useState } from 'react';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/owner/invoices-ui';
import { ReadingNote, ReceiptIcons, ReceiptPreview, useAddReceipt } from '@/components/owner/receipt-ui';
import { amountColor, categoryIcon, signedMoney } from '@/components/owner/transactions-ui';
import { Button, Card, EmptyState, goBack, Icon, OwnerIcons, OwnerScreen } from '@/components/owner/ui';
import { Colors as C, Spacing } from '@/constants/theme';
import { setTransactionCategory, TRANSACTION_CATEGORIES, useBankAccounts, useBankTransactions } from '@/data/bank';
import { formatMoney } from '@/data/payroll';
import { needsReceipt, useReceipts } from '@/data/receipts';
import { fromDateKey } from '@/data/shifts';

// One bank transaction: its details, and the category it's sorted into (the owner can change it).
export default function TransactionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const txn = useBankTransactions().find((t) => t.id === id);
  const account = useBankAccounts().find((a) => a.id === txn?.accountId);
  const receipt = useReceipts().find((r) => r.bankTransactionId === id);
  const { add: addReceipt, busy: adding, error: addError } = useAddReceipt();
  const [error, setError] = useState<string | null>(null);

  if (!txn) {
    return (
      <OwnerScreen>
        <ScreenHeader title="Transaction" onBack={() => goBack('/transactions')} />
        <Card>
          <EmptyState icon={OwnerIcons.card} message="This transaction isn’t in NexGain any more." />
        </Card>
      </OwnerScreen>
    );
  }

  const title = txn.merchant || txn.description || 'Bank transaction';
  const date = fromDateKey(txn.date).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  async function choose(category: string) {
    if (!txn || category === txn.category) return;
    setError(null);
    try {
      await setTransactionCategory(txn.id, category);
    } catch {
      setError('Couldn’t change the category. Check your internet connection and try again.');
    }
  }

  return (
    <OwnerScreen>
      <ScreenHeader title="Transaction" onBack={() => goBack('/transactions')} />

      <Card>
        <Text style={styles.title}>{title}</Text>
        <Text style={[styles.amount, { color: amountColor(txn) }]}>{signedMoney(txn.amount)}</Text>
        <Detail label="Date" value={date} />
        {account && (
          <Detail label="Account" value={[account.institution, account.name, account.maskedNumber].filter(Boolean).join(' · ')} />
        )}
        {txn.merchant && txn.description && txn.description !== txn.merchant && <Detail label="Bank description" value={txn.description} />}
      </Card>

      <Card title="Receipt" icon={ReceiptIcons.receipt}>
        {receipt ? (
          <>
            {receipt.status === 'reading' ? <ReadingNote /> : <ReceiptPreview receipt={receipt} />}
            <Pressable
              onPress={() => router.push({ pathname: '/receipt/[id]', params: { id: receipt.id } } as Href)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.receiptRow, pressed && styles.pressed]}>
              <Icon name={ReceiptIcons.attached} color={C.success} size={18} />
              <Text style={styles.receiptText} numberOfLines={1}>
                {receipt.supplier ?? 'Receipt'}
                {receipt.gst !== null ? ` · GST ${formatMoney(receipt.gst)}` : ''}
              </Text>
              <Text style={styles.link}>Details</Text>
            </Pressable>
          </>
        ) : (
          <>
            {needsReceipt(txn) ? (
              <View style={styles.receiptRow}>
                <Icon name={ReceiptIcons.missing} color={C.warning} size={18} />
                <Text style={[styles.muted, styles.flex]}>Over $82.50: keep the receipt to claim the GST.</Text>
              </View>
            ) : (
              <Text style={styles.muted}>No receipt yet.</Text>
            )}
            {addError && (
              <Text accessibilityRole="alert" style={styles.error}>
                {addError}
              </Text>
            )}
            <Button
              label={adding ? 'Saving…' : 'Add receipt'}
              icon={ReceiptIcons.camera}
              onPress={() => addReceipt({ bankTransactionId: txn.id })}
              disabled={adding}
            />
          </>
        )}
      </Card>

      <Card title="Category" icon={categoryIcon(txn.category)}>
        <Text style={styles.muted}>
          {txn.categorySource === 'owner' ? 'Chosen by you.' : 'NexGain picked this for you. Tap another one if it’s wrong.'}
        </Text>
        {error && (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        )}
        <View>
          {TRANSACTION_CATEGORIES.map((category, i) => {
            const selected = category === txn.category;
            return (
              <Pressable
                key={category}
                onPress={() => choose(category)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={({ pressed }) => [styles.option, i > 0 && styles.divider, pressed && styles.pressed]}>
                <Icon name={categoryIcon(category)} color={selected ? C.accent : C.textSecondary} size={16} />
                <Text style={[styles.optionText, selected && styles.optionSelected]}>{category}</Text>
                {selected && <Icon name={OwnerIcons.check} color={C.accent} size={18} />}
              </Pressable>
            );
          })}
        </View>
      </Card>
    </OwnerScreen>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    color: C.text,
    fontSize: 20,
    fontWeight: '700',
  },
  amount: {
    fontSize: 32,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  detail: {
    gap: 2,
  },
  detailLabel: {
    color: C.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  detailValue: {
    color: C.text,
    fontSize: 15,
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
  flex: {
    flex: 1,
  },
  receiptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 44,
  },
  receiptText: {
    flex: 1,
    color: C.text,
    fontSize: 15,
    fontWeight: '600',
  },
  link: {
    color: C.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    minHeight: 48,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  pressed: {
    opacity: 0.7,
  },
  optionText: {
    flex: 1,
    color: C.text,
    fontSize: 15,
  },
  optionSelected: {
    color: C.accent,
    fontWeight: '700',
  },
});
