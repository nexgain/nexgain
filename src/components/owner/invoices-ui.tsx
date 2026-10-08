import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { BackButton, Button, Icon, OwnerIcons } from '@/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { formatShortDate } from '@/data/employee-roster';
import {
  displayStatus,
  docTotals,
  gstLabel,
  isQuoteExpired,
  type DocKind,
  type DocStatus,
  type ListFilter,
  type ReceiptStatus,
  type SalesDoc,
} from '@/data/invoices';
import { formatMoney } from '@/data/payroll';
import { fromDateKey } from '@/data/shifts';

export const KIND_LABEL: Record<DocKind, { one: string; many: string }> = {
  invoice: { one: 'Invoice', many: 'Invoices' },
  quote: { one: 'Quote', many: 'Quotes' },
};

export const ToneColors = {
  blue: { text: C.accent, background: 'rgba(79, 140, 255, 0.14)' },
  amber: { text: C.warning, background: 'rgba(245, 158, 11, 0.14)' },
  green: { text: C.success, background: 'rgba(34, 197, 94, 0.14)' },
  red: { text: C.danger, background: 'rgba(239, 68, 68, 0.14)' },
  grey: { text: C.textSecondary, background: C.surfaceRaised },
} as const;
export type Tone = keyof typeof ToneColors;

/** The four boxes on Invoices & Quotes; each opens its own list page. */
export const SUMMARY: Record<DocKind, readonly { filter: ListFilter; label: string; tone: Tone }[]> = {
  quote: [
    { filter: 'all', label: 'Total Quotes', tone: 'blue' },
    { filter: 'Sent', label: 'Sent', tone: 'amber' },
    { filter: 'Accepted', label: 'Accepted', tone: 'green' },
    { filter: 'Declined', label: 'Declined', tone: 'red' },
  ],
  invoice: [
    { filter: 'all', label: 'Total Invoices', tone: 'blue' },
    { filter: 'Pending', label: 'Pending', tone: 'amber' },
    { filter: 'Paid', label: 'Paid', tone: 'green' },
    { filter: 'Overdue', label: 'Overdue', tone: 'red' },
  ],
};

/** "Total Quotes", "Sent Quotes", "Overdue Invoices"... */
export function listTitle(kind: DocKind, filter: ListFilter) {
  return `${filter === 'all' ? 'Total' : filter} ${KIND_LABEL[kind].many}`;
}

/** Spoken label for a box, e.g. "Sent quotes". */
export function boxLabel(kind: DocKind, filter: ListFilter) {
  return `${filter === 'all' ? 'Total' : filter} ${KIND_LABEL[kind].many.toLowerCase()}`;
}

const STATUS_TONE: Record<DocStatus, Tone> = {
  Draft: 'grey',
  Pending: 'amber',
  Sent: 'amber',
  Paid: 'green',
  Accepted: 'green',
  Booked: 'blue',
  Overdue: 'red',
  Declined: 'red',
};

export function StatusPill({ status }: { status: DocStatus }) {
  const colors = ToneColors[STATUS_TONE[status]];
  return (
    <View style={[styles.pill, { backgroundColor: colors.background }]}>
      <Text style={[styles.pillText, { color: colors.text }]}>{status}</Text>
    </View>
  );
}

/** Small red tag on sent quotes past their "valid until" date (the customer can still accept). */
export function ExpiredTag({ doc }: { doc: SalesDoc }) {
  if (!isQuoteExpired(doc)) return null;
  const colors = ToneColors.red;
  return (
    <View style={[styles.pill, { backgroundColor: colors.background }]}>
      <Text style={[styles.receiptText, { color: colors.text }]}>Expired</Text>
    </View>
  );
}

/** Small label on paid invoices: grey "Receipt not sent" or green "Receipt sent". */
export function ReceiptLabel({ status }: { status: ReceiptStatus | null | undefined }) {
  if (!status) return null;
  const sent = status === 'sent';
  const colors = ToneColors[sent ? 'green' : 'grey'];
  return (
    <View style={[styles.pill, { backgroundColor: colors.background }]}>
      <Text style={[styles.receiptText, { color: colors.text }]}>{sent ? 'Receipt sent' : 'Receipt not sent'}</Text>
    </View>
  );
}

/** Centred pop-up with a question and two buttons. */
export function ConfirmDialog({
  visible,
  title,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.dialogBackdrop}>
        <View style={styles.dialog} accessibilityRole="alert">
          <Text style={styles.dialogTitle}>{title}</Text>
          <View style={styles.dialogButtons}>
            <View style={styles.flex}>
              <Button label={cancelLabel} variant="secondary" onPress={onCancel} />
            </View>
            <View style={styles.flex}>
              <Button label={confirmLabel} onPress={onConfirm} />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function ScreenHeader({
  title,
  onBack,
  right,
}: {
  title: string;
  /** Defaults to the previous screen. */
  onBack?: () => void;
  right?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      <BackButton onPress={onBack} />
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      {right ?? <View style={styles.headerSpacer} />}
    </View>
  );
}

export function HeaderIconButton({
  icon,
  label,
  onPress,
}: {
  icon: 'plus' | 'more';
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => [
        styles.headerButton,
        icon === 'plus' && styles.headerButtonPrimary,
        pressed && styles.pressed,
      ]}>
      <Icon
        name={
          icon === 'plus'
            ? { ios: 'plus', android: 'add', web: 'add' }
            : { ios: 'ellipsis', android: 'more_horiz', web: 'more_horiz' }
        }
        color={icon === 'plus' ? '#FFFFFF' : C.text}
        size={16}
      />
    </Pressable>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={[styles.segment, selected && styles.segmentSelected]}>
            <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SummaryTile({
  label,
  value,
  tone,
  spokenLabel = label,
  onPress,
}: {
  label: string;
  value: number;
  tone: Tone;
  /** What screen readers say before the number, e.g. "Sent quotes". */
  spokenLabel?: string;
  onPress?: () => void;
}) {
  const colors = ToneColors[tone];
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={`${spokenLabel}, ${value}.${onPress ? ' Open list.' : ''}`}
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: colors.background, borderColor: colors.text + '33' },
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.tileValue, { color: colors.text }]}>{value}</Text>
      <Text style={styles.tileLabel} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

export function DocCard({ doc, onPress }: { doc: SalesDoc; onPress: () => void }) {
  const { total } = docTotals(doc.items, doc.gstRate);
  const date = doc.jobDate ?? doc.createdAt.slice(0, 10);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.docCard, pressed && styles.pressed]}>
      <View style={styles.docIcon}>
        <Icon name={OwnerIcons.receipt} color={C.accent} size={18} />
      </View>
      <View style={styles.docText}>
        <Text style={styles.docTitle} numberOfLines={1}>
          {doc.client.name || 'No client name'}
        </Text>
        <Text style={styles.docMeta} numberOfLines={1}>
          {doc.number} · {formatShortDate(fromDateKey(date))}
        </Text>
      </View>
      <View style={styles.docRight}>
        <Text style={styles.docTotal}>{formatMoney(total)}</Text>
        <StatusPill status={displayStatus(doc)} />
        {doc.status === 'Paid' && <ReceiptLabel status={doc.receiptStatus} />}
        <ExpiredTag doc={doc} />
      </View>
      <Icon name={OwnerIcons.chevron} color={C.textSecondary} size={14} />
    </Pressable>
  );
}

export function TotalsBlock({
  subtotal,
  gst,
  total,
  gstRate,
}: {
  subtotal: number;
  gst: number;
  total: number;
  gstRate: number;
}) {
  return (
    <View style={styles.totals}>
      <TotalRow label="Subtotal" value={formatMoney(subtotal)} />
      <TotalRow label={gstLabel(gstRate)} value={formatMoney(gst)} />
      <View style={styles.totalDivider} />
      <TotalRow label="Total" value={formatMoney(total)} strong />
    </View>
  );
}

function TotalRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.totalRow}>
      <Text style={[styles.totalLabel, strong && styles.totalStrong]}>{label}</Text>
      <Text style={[styles.totalValue, strong && styles.totalStrong]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.7,
  },
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
    borderRadius: 999,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  receiptText: {
    fontSize: 11,
    fontWeight: '600',
  },
  flex: {
    flex: 1,
  },
  dialogBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  dialog: {
    width: '100%',
    maxWidth: 380,
    gap: Spacing.three,
    padding: Spacing.four - 4,
    borderRadius: Radius.large,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  dialogTitle: {
    color: C.text,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  dialogButtons: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    marginTop: Spacing.two,
  },
  headerButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  headerSpacer: {
    width: 38,
    height: 38,
  },
  headerButtonPrimary: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  headerTitle: {
    flex: 1,
    color: C.text,
    fontSize: 22,
    fontWeight: '700',
  },
  segmented: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: Radius.medium,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Radius.medium - 4,
  },
  segmentSelected: {
    backgroundColor: C.accent,
  },
  segmentText: {
    color: C.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  segmentTextSelected: {
    color: '#FFFFFF',
  },
  tile: {
    flex: 1,
    minWidth: 70,
    paddingVertical: Spacing.three - 4,
    paddingHorizontal: Spacing.two + 2,
    borderRadius: Radius.medium,
    borderWidth: 1,
    gap: 2,
  },
  tileValue: {
    fontSize: 24,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  tileLabel: {
    color: C.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  docCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    padding: Spacing.three - 4,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceRaised,
  },
  docIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surface,
  },
  docText: {
    flex: 1,
    gap: 2,
  },
  docTitle: {
    color: C.text,
    fontSize: 15,
    fontWeight: '700',
  },
  docMeta: {
    color: C.textSecondary,
    fontSize: 13,
  },
  docRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  docTotal: {
    color: C.text,
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  totals: {
    gap: Spacing.two,
    paddingTop: Spacing.two,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalLabel: {
    color: C.textSecondary,
    fontSize: 14,
  },
  totalValue: {
    color: C.text,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  totalStrong: {
    color: C.text,
    fontSize: 17,
    fontWeight: '700',
  },
  totalDivider: {
    height: 1,
    backgroundColor: C.border,
  },
});
