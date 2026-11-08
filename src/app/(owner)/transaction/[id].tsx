import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/owner/invoices-ui';
import { amountColor, categoryIcon, signedMoney } from '@/components/owner/transactions-ui';
import { Card, EmptyState, goBack, Icon, OwnerIcons, OwnerScreen } from '@/components/owner/ui';
import { Colors as C, Spacing } from '@/constants/theme';
import { setTransactionCategory, TRANSACTION_CATEGORIES, useBankAccounts, useBankTransactions } from '@/data/bank';
import { fromDateKey } from '@/data/shifts';

// One bank transaction: its details, and the category it's sorted into (the owner can change it).
export default function TransactionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const txn = useBankTransactions().find((t) => t.id === id);
  const account = useBankAccounts().find((a) => a.id === txn?.accountId);
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
