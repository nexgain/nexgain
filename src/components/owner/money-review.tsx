// The Transactions page's "Needs review" card and "Expenses by category" rows.
import { useState } from 'react';
import { router, type Href } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { OptionSheet } from '@/components/owner/form';
import { categoryIcon } from '@/components/owner/transactions-ui';
import { Badge, Card, Icon, OwnerIcons, type IconName } from '@/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import type { BankTransaction } from '@/data/bank';
import { formatShortDate } from '@/data/employee-roster';
import {
  answerJob,
  chooseCategory,
  groupById,
  invoiceLabel,
  linkInvoice,
  notForAnInvoice,
  recentAutoMatches,
  reviewItems,
  SPEND_GROUPS,
  undoInvoiceMatch,
  type GroupSummary,
  type MoneyFeed,
  type ReviewItem,
  type SpendGroupId,
} from '@/data/money-sorting';
import { formatMoney } from '@/data/payroll';
import { fromDateKey } from '@/data/shifts';

/** Questions shown before "Show all". */
const FIRST = 3;

/** One icon per group, from the category icons. */
export const GROUP_ICONS: Record<SpendGroupId, IconName> = {
  materials: categoryIcon('Materials & supplies'),
  labour: categoryIcon('Wages & super'),
  tools: categoryIcon('Equipment & tools'),
  fuel: categoryIcon('Fuel'),
  vehicle: categoryIcon('Vehicle'),
  other: categoryIcon('Other'),
};

const nameOf = (t: BankTransaction) => t.merchant || t.description || 'This transaction';

/** "on Tuesday" for the last week, otherwise "on 3 Nov". */
export function whenText(dateKey: string) {
  const date = fromDateKey(dateKey);
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - date.getTime()) / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days > 1 && days < 7) return `on ${date.toLocaleDateString([], { weekday: 'long' })}`;
  return `on ${formatShortDate(date, false)}`;
}

/** A one-tap answer. */
function Chip({
  label,
  onPress,
  primary,
  disabled,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.chip,
        primary && styles.chipPrimary,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.chipText, primary && styles.chipTextPrimary]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

type Answer = { label: string; primary?: boolean; onPress: () => void };
type Question = { icon: IconName; text: string; hint: string | null; answers: Answer[]; disabled: boolean };

type Sheet = { title: string; options: { label: string; onPick: () => void }[] };

// Matches the owner has already seen ("OK"), for this session.
const seenMatches = new Set<string>();

/** "Needs review": questions about anything NexGain isn't sure of. Hidden when there's nothing to ask. */
export function NeedsReviewCard({ feed }: { feed: MoneyFeed }) {
  const items = reviewItems(feed);
  const [, setSeen] = useState(0);
  const matches = recentAutoMatches(feed).filter((t) => !seenMatches.has(t.id));
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);

  if (items.length === 0 && matches.length === 0 && !note) return null;

  async function run(id: string, action: () => Promise<string | null>) {
    setBusy(id);
    setNote(null);
    try {
      const result = await action();
      if (result) setNote({ text: result });
    } catch {
      setNote({ text: 'Couldn’t save that. Check your internet connection and try again.', error: true });
    } finally {
      setBusy(null);
    }
  }

  const pickCategory = (t: BankTransaction, groupId: SpendGroupId) =>
    run(t.id, async () => {
      const group = groupById(groupId)!;
      const moved = await chooseCategory(t.id, group.pick);
      return `Saved as ${group.name}. NexGain will sort ${nameOf(t)} this way from now on${moved > 0 ? ` (${moved} more moved too)` : ''}.`;
    });

  const pickInvoice = (t: BankTransaction, invoiceId: string, number: string) =>
    run(t.id, async () => {
      const error = await linkInvoice(t.id, invoiceId);
      if (error) throw new Error(error);
      return `Invoice ${number} is marked as paid${feed.preview ? ' (sample only, nothing saved)' : ''}.`;
    });

  const pickJob = (t: BankTransaction, jobId: string | null, label?: string) =>
    run(t.id, async () => {
      await answerJob(t.id, jobId);
      return jobId ? `Linked to the ${label} job.` : 'Got it: not for a job.';
    });

  function invoiceSheet(t: BankTransaction) {
    setSheet({
      title: 'Which invoice is it for?',
      options: feed.invoices.map((inv) => ({
        label: `${inv.number} · ${inv.clientName} · ${formatMoney(inv.total)}`,
        onPick: () => pickInvoice(t, inv.id, inv.number),
      })),
    });
  }

  function jobSheet(t: BankTransaction) {
    const date = fromDateKey(t.date).getTime();
    const near = [...feed.jobs]
      .filter((j) => j.status !== 'cancelled')
      .sort((a, b) => Math.abs(fromDateKey(a.date).getTime() - date) - Math.abs(fromDateKey(b.date).getTime() - date))
      .slice(0, 12);
    setSheet({
      title: 'Which job was it for?',
      options: [
        ...near.map((j) => ({
          label: `${j.label} · ${formatShortDate(fromDateKey(j.date), false)}`,
          onPick: () => pickJob(t, j.id, j.label),
        })),
        { label: 'Not for a job', onPick: () => pickJob(t, null) },
      ],
    });
  }

  function question(item: ReviewItem): Question {
    const t = item.txn;
    const money = formatMoney(Math.abs(t.amount));
    const disabled = busy !== null;
    switch (item.kind) {
      case 'category': {
        const guess = SPEND_GROUPS.find((g) => (g.categories as string[]).includes(t.category) && g.id !== 'other');
        return {
          icon: OwnerIcons.sparkles,
          text: `${nameOf(t)}, ${money} ${whenText(t.date)}. What was it for?`,
          hint: guess ? `Best guess: ${guess.name}.` : 'NexGain couldn’t tell from the bank’s description.',
          answers: [
            ...(guess ? [{ label: `Yes, ${guess.name}`, primary: true, onPress: () => pickCategory(t, guess.id) }] : []),
            ...SPEND_GROUPS.filter((g) => g.id !== guess?.id).map((g) => ({
              label: g.name,
              onPress: () => pickCategory(t, g.id),
            })),
          ],
          disabled,
        };
      }
      case 'invoice':
        return {
          icon: OwnerIcons.receipt,
          text: `${money} came in from ${nameOf(t)} ${whenText(t.date)}. Which invoice is it for?`,
          hint: `${item.invoices.length} unpaid invoices are for ${money}.`,
          answers: [
            ...item.invoices.map((inv) => ({
              label: `${inv.number} · ${inv.clientName}`,
              onPress: () => pickInvoice(t, inv.id, inv.number),
            })),
            {
              label: 'Neither',
              onPress: () =>
                run(t.id, async () => (await notForAnInvoice(t.id), 'Got it. It stays as income, not linked to an invoice.')),
            },
          ],
          disabled,
        };
      case 'income':
        return {
          icon: OwnerIcons.money,
          text: `${money} came in from ${nameOf(t)} ${whenText(t.date)}.`,
          hint: 'It doesn’t match an unpaid invoice, so it’s saved as income.',
          answers: [
            ...(feed.invoices.length > 0 ? [{ label: 'Link to an invoice', primary: true, onPress: () => invoiceSheet(t) }] : []),
            {
              label: 'Not for an invoice',
              onPress: () => run(t.id, async () => (await notForAnInvoice(t.id), 'Got it. It stays as income.')),
            },
          ],
          disabled,
        };
      case 'job':
        return {
          icon: OwnerIcons.calendar,
          text: `${nameOf(t)} ${money} ${whenText(t.date)}. Was this for the ${item.job.label} job?`,
          hint: null,
          answers: [
            { label: `Yes, ${item.job.label}`, primary: true, onPress: () => pickJob(t, item.job.id, item.job.label) },
            { label: 'Pick a job', onPress: () => jobSheet(t) },
            { label: 'No', onPress: () => pickJob(t, null) },
          ],
          disabled,
        };
    }
  }

  const shown = showAll ? items : items.slice(0, FIRST);
  const count = items.length + matches.length;

  return (
    <Card
      title="Needs review"
      icon={OwnerIcons.sparkles}
      right={count > 0 ? <Badge label={String(count)} tone="warning" /> : null}>
      {feed.preview && <Text style={styles.muted}>Sample data: your answers aren’t saved.</Text>}

      {matches.map((t, i) => {
        const number = invoiceLabel(t.invoiceId, feed)?.number;
        return (
          <View key={`match-${t.id}`} style={[styles.question, i > 0 && styles.divider]}>
            <View style={styles.questionTop}>
              <Icon name={OwnerIcons.check} color={C.success} size={18} />
              <View style={styles.flex}>
                <Text style={styles.questionText}>Invoice {number ?? ''} marked as paid</Text>
                <Text style={styles.muted}>
                  {formatMoney(t.amount)} came in from {nameOf(t)} {whenText(t.date)} and matched the invoice.
                </Text>
              </View>
            </View>
            <View style={styles.answers}>
              <Chip
                label="Undo"
                disabled={busy !== null}
                onPress={() =>
                  run(t.id, async () => {
                    const error = await undoInvoiceMatch(t.id);
                    if (error) throw new Error(error);
                    return `Undone. Invoice ${number ?? ''} is unpaid again.`;
                  })
                }
              />
              <Chip
                label="OK"
                primary
                onPress={() => {
                  seenMatches.add(t.id);
                  setSeen((n) => n + 1);
                }}
              />
            </View>
          </View>
        );
      })}

      {shown.map((item, i) => {
        const q = question(item);
        return (
          <View key={`${item.kind}-${item.txn.id}`} style={[styles.question, (i > 0 || matches.length > 0) && styles.divider]}>
            <Pressable
              onPress={() => router.push({ pathname: '/transaction/[id]', params: { id: item.txn.id } } as Href)}
              accessibilityRole="button"
              accessibilityHint="Opens the transaction"
              style={({ pressed }) => [styles.questionTop, pressed && styles.pressed]}>
              <Icon name={q.icon} color={C.accent} size={18} />
              <View style={styles.flex}>
                <Text style={styles.questionText}>{q.text}</Text>
                {q.hint && <Text style={styles.muted}>{q.hint}</Text>}
              </View>
              {busy === item.txn.id && <ActivityIndicator color={C.accent} />}
            </Pressable>
            <View style={styles.answers}>
              {q.answers.map((a) => (
                <Chip key={a.label} label={a.label} primary={a.primary} onPress={a.onPress} disabled={q.disabled} />
              ))}
            </View>
          </View>
        );
      })}

      {note && (
        <Text accessibilityRole="alert" style={note.error ? styles.error : styles.note}>
          {note.text}
        </Text>
      )}

      {items.length > FIRST && (
        <Pressable
          onPress={() => setShowAll((v) => !v)}
          accessibilityRole="button"
          hitSlop={6}
          style={({ pressed }) => [styles.more, pressed && styles.pressed]}>
          <Text style={styles.moreText}>{showAll ? 'Show less' : `Show all ${items.length}`}</Text>
        </Pressable>
      )}

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
    </Card>
  );
}

/** One row of "Expenses by category". */
export function GroupRow({
  summary,
  showDivider,
  onPress,
}: {
  summary: GroupSummary;
  showDivider: boolean;
  onPress: () => void;
}) {
  const { group, items, total, change, upALot } = summary;
  const count = `${items.length} transaction${items.length === 1 ? '' : 's'}`;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${group.name}, ${formatMoney(total)}, ${count}${upALot ? `, up ${change}%` : ''}`}
      style={({ pressed }) => [styles.groupRow, showDivider && styles.divider, pressed && styles.pressed]}>
      <View style={styles.groupIcon}>
        <Icon name={GROUP_ICONS[group.id]} color={C.accent} size={16} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.groupName}>{group.name}</Text>
        <Text style={styles.muted} numberOfLines={1}>
          {group.description} · {count}
        </Text>
      </View>
      <View style={styles.groupRight}>
        <Text style={styles.groupTotal}>{formatMoney(total)}</Text>
        {upALot && <Text style={styles.up}>Up {change}%</Text>}
      </View>
      <Icon name={OwnerIcons.chevron} color={C.textSecondary} size={12} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.5 },
  divider: { borderTopWidth: 1, borderTopColor: C.border },
  muted: { color: C.textSecondary, fontSize: 13, lineHeight: 18 },
  note: { color: C.success, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  error: { color: C.danger, fontSize: 13, fontWeight: '600' },
  question: { gap: Spacing.two, paddingVertical: Spacing.two },
  questionTop: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three - 4 },
  questionText: { color: C.text, fontSize: 15, fontWeight: '600', lineHeight: 20 },
  answers: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    minHeight: 40,
    maxWidth: '100%',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: 999,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  chipPrimary: { backgroundColor: C.accent, borderColor: C.accent },
  chipText: { color: C.text, fontSize: 14, fontWeight: '600' },
  chipTextPrimary: { color: C.onAccent },
  more: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  moreText: { color: C.accent, fontSize: 14, fontWeight: '700' },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three - 4, minHeight: 60, paddingVertical: Spacing.two },
  groupIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.accentSoft,
  },
  groupName: { color: C.text, fontSize: 15, fontWeight: '700' },
  groupRight: { alignItems: 'flex-end', gap: 2 },
  groupTotal: { color: C.text, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  up: { color: C.warning, fontSize: 12, fontWeight: '700' },
});
