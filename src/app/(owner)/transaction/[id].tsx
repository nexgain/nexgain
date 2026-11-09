import { useState } from 'react';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { OptionSheet } from '@/components/owner/form';
import { ScreenHeader } from '@/components/owner/invoices-ui';
import { ReadingNote, ReceiptIcons, ReceiptPreview, useAddReceipt } from '@/components/owner/receipt-ui';
import { amountColor, categoryIcon, signedMoney } from '@/components/owner/transactions-ui';
import { Button, Card, EmptyState, goBack, Icon, OwnerIcons, OwnerScreen } from '@/components/owner/ui';
import { Colors as C, Spacing } from '@/constants/theme';
import { INCOME_CATEGORY, TRANSACTION_CATEGORIES, type BankTransaction } from '@/data/bank';
import {
  answerJob,
  chooseCategory,
  invoiceLabel,
  jobLabel,
  linkInvoice,
  undoInvoiceMatch,
  useMoneyFeed,
} from '@/data/money-sorting';
import { formatMoney } from '@/data/payroll';
import { needsReceipt, useReceipts } from '@/data/receipts';
import { fromDateKey } from '@/data/shifts';

/** How NexGain picked the category, in plain English. */
function sortedBy(t: BankTransaction) {
  switch (t.categoryMethod) {
    case 'owner':
      return 'Chosen by you.';
    case 'learned':
      return 'You picked this category for this shop before, so NexGain used it again.';
    case 'ai':
      return `NexGain’s best guess (${Math.round((t.confidence ?? 0) * 100)}% sure). Tap another one if it’s wrong.`;
    default:
      return t.categorySource === 'owner' ? 'Chosen by you.' : 'NexGain knows this shop or payee. Tap another one if it’s wrong.';
  }
}

type Sheet = { title: string; options: { label: string; onPick: () => void }[] };

// One bank transaction: its details, the category it's sorted into (the owner
// can change it), and the job or invoice it's linked to.
export default function TransactionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const feed = useMoneyFeed();
  const txn = feed.transactions.find((t) => t.id === id);
  const account = feed.accounts.find((a) => a.id === txn?.accountId);
  const receipt = useReceipts().find((r) => r.bankTransactionId === id);
  const { add: addReceipt, busy: adding, error: addError } = useAddReceipt();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);

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
    setNote(null);
    try {
      const moved = await chooseCategory(txn.id, category);
      setNote(`NexGain will sort ${title} as ${category} from now on${moved > 0 ? ` (${moved} more moved too)` : ''}.`);
    } catch {
      setError('Couldn’t change the category. Check your internet connection and try again.');
    }
  }

  async function link(action: () => Promise<string | null>) {
    setLinkError(null);
    try {
      const failed = await action();
      if (failed) setLinkError('Couldn’t save that. Check your internet connection and try again.');
    } catch {
      setLinkError('Couldn’t save that. Check your internet connection and try again.');
    }
  }

  const invoice = invoiceLabel(txn.invoiceId, feed);
  const job = jobLabel(txn.jobId, feed);
  const moneyIn = txn.amount > 0 && txn.category === INCOME_CATEGORY;
  const showJob = txn.amount < 0 && (feed.linkExpensesToJobs || txn.jobId !== null);

  function pickInvoice() {
    setSheet({
      title: 'Which invoice is it for?',
      options: feed.invoices.map((inv) => ({
        label: `${inv.number} · ${inv.clientName} · ${formatMoney(inv.total)}`,
        onPick: () => link(() => linkInvoice(txn!.id, inv.id)),
      })),
    });
  }

  function pickJob() {
    setSheet({
      title: 'Which job was it for?',
      options: [
        ...feed.jobs
          .filter((j) => j.status !== 'cancelled')
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, 20)
          .map((j) => ({
            label: `${j.label} · ${fromDateKey(j.date).toLocaleDateString([], { day: 'numeric', month: 'short' })}`,
            onPick: () => link(async () => ((await answerJob(txn!.id, j.id)) ? null : 'failed')),
          })),
        { label: 'Not for a job', onPick: () => link(async () => ((await answerJob(txn!.id, null)) ? null : 'failed')) },
      ],
    });
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
            {feed.preview ? (
              <Text style={styles.muted}>Receipts can’t be added to sample transactions.</Text>
            ) : (
              <Button
                label={adding ? 'Saving…' : 'Add receipt'}
                icon={ReceiptIcons.camera}
                onPress={() => addReceipt({ bankTransactionId: txn.id })}
                disabled={adding}
              />
            )}
          </>
        )}
      </Card>

      {moneyIn && (
        <Card title="Invoice" icon={OwnerIcons.receipt}>
          {invoice ? (
            <>
              <Text style={styles.detailValue}>
                Paid invoice {invoice.number} ({invoice.clientName})
              </Text>
              <Text style={styles.muted}>
                {txn.invoiceMatchedBy === 'auto' ? 'NexGain matched this payment and marked the invoice as paid.' : 'You linked this payment to the invoice.'}{' '}
                If that’s wrong, tap Undo and the invoice goes back to unpaid.
              </Text>
              <Button label="Undo" variant="secondary" onPress={() => link(() => undoInvoiceMatch(txn.id))} />
            </>
          ) : (
            <>
              <Text style={styles.muted}>Not linked to an invoice. Saved as income.</Text>
              {feed.invoices.length > 0 && <Button label="Link to an invoice" icon={{ ios: 'link', android: 'link', web: 'link' }} onPress={pickInvoice} />}
            </>
          )}
          {linkError && (
            <Text accessibilityRole="alert" style={styles.error}>
              {linkError}
            </Text>
          )}
        </Card>
      )}

      {showJob && (
        <Card title="Job" icon={OwnerIcons.calendar}>
          <Text style={styles.detailValue}>{job ? `For the ${job} job` : 'Not linked to a job'}</Text>
          <Button label={job ? 'Change job' : 'Pick a job'} variant="secondary" onPress={pickJob} />
          {linkError && !moneyIn && (
            <Text accessibilityRole="alert" style={styles.error}>
              {linkError}
            </Text>
          )}
        </Card>
      )}

      <Card title="Category" icon={categoryIcon(txn.category)}>
        <Text style={styles.muted}>{sortedBy(txn)}</Text>
        {note && <Text style={styles.note}>{note}</Text>}
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

      <OptionSheet
        visible={sheet !== null}
        title={sheet?.title ?? ''}
        options={sheet?.options.map((o) => o.label) ?? []}
        value={null}
        onSelect={(label) => {
          const option = sheet?.options.find((o) => o.label === label);
          setSheet(null);
          option?.onPick();
        }}
        onClose={() => setSheet(null)}
      />
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
  note: {
    color: C.success,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
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
