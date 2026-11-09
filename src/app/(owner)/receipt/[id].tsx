import { useState } from 'react';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { DateField, FormField, TextField } from '@/components/owner/form';
import { ConfirmDialog, ScreenHeader } from '@/components/owner/invoices-ui';
import { ReadingNote, ReceiptIcons, ReceiptPreview } from '@/components/owner/receipt-ui';
import { categoryIcon, signedMoney, TransactionRow } from '@/components/owner/transactions-ui';
import { Button, Card, EmptyState, goBack, Icon, OwnerIcons, OwnerScreen } from '@/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { transactionItems, useBankAccounts, useBankTransactions, type TransactionItem } from '@/data/bank';
import { formatShortDate } from '@/data/employee-roster';
import { EXPENSE_CATEGORIES, useExpenses } from '@/data/finance';
import { formatMoney } from '@/data/payroll';
import {
  deleteReceipt,
  indexReceipts,
  likelyTransactions,
  linkReceipt,
  readReceipt,
  replaceReceiptFile,
  updateReceipt,
  useReceiptErrors,
  useReceipts,
  type Receipt,
} from '@/data/receipts';
import { fromDateKey, toDateKey } from '@/data/shifts';
import { CaptureError, captureReceipt, chooseReceiptSource } from '@/lib/receipt-capture';

const RECEIPT_CATEGORIES = [...EXPENSE_CATEGORIES.filter((c) => c !== 'Other'), 'Bank fees', 'Other'];

type Draft = { supplier: string; abn: string; date: Date | null; total: string; gst: string; category: string | null };

const toDraft = (r: Receipt): Draft => ({
  supplier: r.supplier ?? '',
  abn: r.abn ?? '',
  date: r.date ? fromDateKey(r.date) : null,
  total: r.total === null ? '' : r.total.toFixed(2),
  gst: r.gst === null ? '' : r.gst.toFixed(2),
  category: r.category,
});

const parseMoney = (text: string) => {
  const cleaned = text.replace(/[$,\s]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN;
};

const formatAbn = (abn: string) => abn.replace(/^(\d{2})(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3 $4');

// One receipt: the photo (pinch to zoom), what the AI read (editable), the
// transaction it belongs to, and Replace / Delete.
export default function ReceiptScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const receipts = useReceipts();
  const receipt = receipts.find((r) => r.id === id);
  const readError = useReceiptErrors()[id ?? ''];
  const txns = useBankTransactions();
  const accounts = useBankAccounts();
  const expenses = useExpenses();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<'save' | 'link' | 'replace' | 'delete' | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!receipt) {
    return (
      <OwnerScreen>
        <ScreenHeader title="Receipt" onBack={() => goBack('/transactions')} />
        <Card>
          <EmptyState icon={OwnerIcons.receipt} message="This receipt isn’t in NexGain any more." />
        </Card>
      </OwnerScreen>
    );
  }

  const items = transactionItems(txns, accounts, expenses);
  const index = indexReceipts(receipts);
  const linked: TransactionItem | undefined = receipt.bankTransactionId
    ? items.find((i) => i.bank?.id === receipt.bankTransactionId)
    : receipt.expenseId
      ? items.find((i) => i.expense?.id === receipt.expenseId)
      : undefined;
  const suggestions = linked ? [] : likelyTransactions(receipt, txns, index);
  const suggestionItems = suggestions.map((t) => items.find((i) => i.bank?.id === t.id)).filter((i): i is TransactionItem => !!i);
  const reading = receipt.status === 'reading';

  function openTransaction(item: TransactionItem) {
    if (item.bank) router.push({ pathname: '/transaction/[id]', params: { id: item.bank.id } } as Href);
    else if (item.expense) router.push({ pathname: '/expenses/edit', params: { id: item.expense.id } } as Href);
  }

  async function run(kind: NonNullable<typeof busy>, task: () => Promise<void>, failure: string) {
    setMessage(null);
    setBusy(kind);
    try {
      await task();
    } catch {
      setMessage({ tone: 'error', text: failure });
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!draft || !receipt) return;
    const total = parseMoney(draft.total);
    const gst = parseMoney(draft.gst);
    const abn = draft.abn.replace(/\D/g, '');
    if (Number.isNaN(total) || Number.isNaN(gst)) return setMessage({ tone: 'error', text: 'Enter amounts as numbers, e.g. 45.50.' });
    if (total !== null && gst !== null && gst > total) return setMessage({ tone: 'error', text: 'GST can’t be more than the total.' });
    if (abn && abn.length !== 11) return setMessage({ tone: 'error', text: 'An ABN has 11 digits.' });
    await run(
      'save',
      async () => {
        await updateReceipt(receipt.id, {
          supplier: draft.supplier.trim() || null,
          abn: abn || null,
          date: draft.date ? toDateKey(draft.date) : null,
          total,
          gst,
          category: draft.category,
        });
        setDraft(null);
        setMessage({ tone: 'ok', text: 'Saved.' });
      },
      'Couldn’t save your changes. Check your internet connection and try again.',
    );
  }

  async function replace() {
    if (!receipt) return;
    const source = await chooseReceiptSource();
    if (!source) return;
    setMessage(null);
    try {
      const file = await captureReceipt(source);
      if (!file) return;
      setBusy('replace');
      await replaceReceiptFile(receipt.id, file);
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof CaptureError ? e.message : 'Couldn’t replace the receipt. Please try again.' });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!receipt) return;
    setConfirmDelete(false);
    await run(
      'delete',
      async () => {
        await deleteReceipt(receipt.id);
        goBack('/transactions');
      },
      'Couldn’t delete the receipt. Please try again.',
    );
  }

  return (
    <OwnerScreen>
      <ScreenHeader
        title="Receipt"
        onBack={() => goBack('/transactions')}
        right={
          !draft && !reading ? (
            <Pressable
              onPress={() => setDraft(toDraft(receipt))}
              accessibilityRole="button"
              accessibilityLabel="Edit receipt details"
              hitSlop={8}
              style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}>
              <Text style={styles.headerButtonText}>Edit</Text>
            </Pressable>
          ) : undefined
        }
      />

      {reading && <ReadingNote />}
      {readError && !reading && (
        <Card>
          <Text accessibilityRole="alert" style={styles.errorText}>
            {readError}
          </Text>
          <View style={styles.buttonRow}>
            <Button label="Read again" icon={{ ios: 'arrow.clockwise', android: 'refresh', web: 'refresh' }} onPress={() => readReceipt(receipt.id)} />
            <Button label="Type details" variant="secondary" onPress={() => setDraft(toDraft(receipt))} />
          </View>
        </Card>
      )}
      {message && (
        <Text accessibilityRole={message.tone === 'error' ? 'alert' : undefined} style={message.tone === 'error' ? styles.errorText : styles.okText}>
          {message.text}
        </Text>
      )}

      <Card>
        <ReceiptPreview receipt={receipt} />
      </Card>

      {draft ? (
        <Card title="Receipt details" icon={OwnerIcons.receipt}>
          <FormField label="Supplier">
            <TextField value={draft.supplier} onChangeText={(supplier) => setDraft({ ...draft, supplier })} placeholder="e.g. Bunnings" autoCapitalize="words" />
          </FormField>
          <FormField label="ABN">
            <TextField value={draft.abn} onChangeText={(abn) => setDraft({ ...draft, abn })} placeholder="11 digits" keyboardType="number-pad" />
          </FormField>
          <FormField label="Date">
            <DateField label="Receipt date" value={draft.date ?? new Date()} onChange={(date) => setDraft({ ...draft, date })} />
          </FormField>
          <View style={styles.row}>
            <FormField label="Total (incl. GST)" style={styles.flex}>
              <TextField value={draft.total} onChangeText={(total) => setDraft({ ...draft, total })} placeholder="0.00" keyboardType="decimal-pad" />
            </FormField>
            <FormField label="GST" style={styles.flex}>
              <TextField value={draft.gst} onChangeText={(gst) => setDraft({ ...draft, gst })} placeholder="0.00" keyboardType="decimal-pad" />
            </FormField>
          </View>
          <FormField label="Category">
            <View style={styles.chips}>
              {RECEIPT_CATEGORIES.map((category) => {
                const selected = draft.category === category;
                return (
                  <Pressable
                    key={category}
                    onPress={() => setDraft({ ...draft, category })}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed]}>
                    <Icon name={categoryIcon(category)} color={selected ? '#FFFFFF' : C.textSecondary} size={13} />
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{category}</Text>
                  </Pressable>
                );
              })}
            </View>
          </FormField>
          <View style={styles.buttonRow}>
            <Button label={busy === 'save' ? 'Saving…' : 'Save'} onPress={save} disabled={busy !== null} />
            <Button label="Cancel" variant="secondary" onPress={() => setDraft(null)} disabled={busy !== null} />
          </View>
        </Card>
      ) : (
        !reading && (
          <Card title="Receipt details" icon={OwnerIcons.receipt}>
            <Detail label="Supplier" value={receipt.supplier} />
            <Detail label="ABN" value={receipt.abn ? formatAbn(receipt.abn) : null} />
            <Detail label="Date" value={receipt.date ? formatShortDate(fromDateKey(receipt.date)) : null} />
            <View style={styles.row}>
              <View style={styles.flex}>
                <Detail label="Total (incl. GST)" value={receipt.total !== null ? formatMoney(receipt.total) : null} strong />
              </View>
              <View style={styles.flex}>
                <Detail label="GST" value={receipt.gst !== null ? formatMoney(receipt.gst) : null} />
              </View>
            </View>
            <Detail label="Category" value={receipt.category} />
            {receipt.lineItems.length > 0 && (
              <View style={styles.lines}>
                <Text style={styles.label}>Items</Text>
                {receipt.lineItems.map((line, i) => (
                  <View key={i} style={styles.line}>
                    <Text style={styles.lineText} numberOfLines={2}>
                      {line.quantity && line.quantity !== 1 ? `${line.quantity} × ` : ''}
                      {line.description}
                    </Text>
                    {line.amount !== null && <Text style={styles.lineAmount}>{formatMoney(line.amount)}</Text>}
                  </View>
                ))}
              </View>
            )}
            <Text style={styles.muted}>Read by AI. Tap Edit if anything’s wrong.</Text>
          </Card>
        )
      )}

      <Card title="Transaction" icon={OwnerIcons.card}>
        {linked ? (
          <>
            <TransactionRow item={linked} showDivider={false} onPress={() => openTransaction(linked)} />
            <Text style={styles.muted}>
              {receipt.matchedBy === 'auto' ? 'NexGain matched this receipt automatically.' : 'Linked by you.'}
            </Text>
            <Pressable
              onPress={() => run('link', () => linkReceipt(receipt.id, null), 'Couldn’t unlink the receipt. Please try again.')}
              disabled={busy !== null}
              accessibilityRole="button"
              hitSlop={6}
              style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}>
              <Text style={styles.linkText}>Not the right transaction? Unlink</Text>
            </Pressable>
          </>
        ) : reading ? (
          <Text style={styles.muted}>Once it’s read, NexGain finds the matching bank transaction.</Text>
        ) : suggestionItems.length > 0 ? (
          <>
            <Text style={styles.muted}>Is it one of these? Tap the right one to link it.</Text>
            {suggestionItems.map((item, i) => (
              <Pressable
                key={item.id}
                onPress={() =>
                  run('link', () => linkReceipt(receipt.id, { bankTransactionId: item.bank!.id }), 'Couldn’t link the receipt. Please try again.')
                }
                disabled={busy !== null}
                accessibilityRole="button"
                accessibilityLabel={`Link to ${item.title}, ${signedMoney(item.amount)}, ${formatShortDate(item.date)}`}
                style={({ pressed }) => [styles.suggestion, i > 0 && styles.divider, pressed && styles.pressed]}>
                <View style={styles.flex}>
                  <Text style={styles.suggestionTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.muted}>{[formatShortDate(item.date), item.subtitle].filter(Boolean).join(' · ')}</Text>
                </View>
                <Text style={styles.suggestionAmount}>{signedMoney(item.amount)}</Text>
                <Icon name={ReceiptIcons.attached} color={C.accent} size={20} />
              </Pressable>
            ))}
          </>
        ) : (
          <View style={styles.unmatched}>
            <Icon name={OwnerIcons.info} color={C.textSecondary} size={16} />
            <Text style={[styles.muted, styles.flex]}>
              No matching bank transaction yet. If your bank hasn’t sent it, NexGain checks again each time new transactions come in.
            </Text>
          </View>
        )}
      </Card>

      <View style={styles.buttonRow}>
        <Button
          label={busy === 'replace' ? 'Replacing…' : 'Replace'}
          icon={ReceiptIcons.camera}
          variant="secondary"
          onPress={replace}
          disabled={busy !== null || reading}
        />
        <Button
          label={busy === 'delete' ? 'Deleting…' : 'Delete'}
          icon={{ ios: 'trash', android: 'delete', web: 'delete' }}
          variant="secondary"
          onPress={() => setConfirmDelete(true)}
          disabled={busy !== null}
        />
      </View>
      {busy === 'link' && <ActivityIndicator color={C.accent} />}

      <ConfirmDialog
        visible={confirmDelete}
        title="Delete this receipt? The photo and its details will be removed."
        confirmLabel="Delete"
        cancelLabel="Keep"
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </OwnerScreen>
  );
}

function Detail({ label, value, strong }: { label: string; value: string | null; strong?: boolean }) {
  return (
    <View style={styles.detail}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, strong && styles.valueStrong, !value && styles.missing]}>{value ?? 'Not shown'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.three - 4,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  headerButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerButtonText: {
    color: C.accent,
    fontSize: 16,
    fontWeight: '700',
  },
  muted: {
    color: C.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  errorText: {
    color: C.danger,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  okText: {
    color: C.success,
    fontSize: 13,
    fontWeight: '600',
  },
  detail: {
    gap: 2,
  },
  label: {
    color: C.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  value: {
    color: C.text,
    fontSize: 15,
  },
  valueStrong: {
    fontSize: 20,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  missing: {
    color: C.textSecondary,
    fontStyle: 'italic',
  },
  lines: {
    gap: 6,
  },
  line: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  lineText: {
    flex: 1,
    color: C.text,
    fontSize: 14,
  },
  lineAmount: {
    color: C.text,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: Spacing.three - 4,
    borderRadius: 999,
    backgroundColor: C.surfaceRaised,
    borderWidth: 1,
    borderColor: C.border,
  },
  chipSelected: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  chipText: {
    color: C.text,
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: '#FFFFFF',
  },
  textButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
  },
  linkText: {
    color: C.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  suggestion: {
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
  suggestionTitle: {
    color: C.text,
    fontSize: 15,
    fontWeight: '600',
  },
  suggestionAmount: {
    color: C.text,
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  unmatched: {
    flexDirection: 'row',
    gap: Spacing.two,
    padding: Spacing.three - 4,
    borderRadius: Radius.medium,
    backgroundColor: C.surfaceRaised,
  },
});
