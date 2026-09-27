import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, OwnerIcons } from '@/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { formatShortDate } from '@/data/employee-roster';
import { displayStatus, docTotals, type DocKind, type DocStatus, type SalesDoc } from '@/data/invoices';
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

const STATUS_TONE: Record<DocStatus, Tone> = {
  Draft: 'grey',
  Pending: 'amber',
  Sent: 'amber',
  Paid: 'green',
  Accepted: 'green',
  Overdue: 'red',
  Expired: 'red',
};

export function StatusPill({ status }: { status: DocStatus }) {
  const colors = ToneColors[STATUS_TONE[status]];
  return (
    <View style={[styles.pill, { backgroundColor: colors.background }]}>
      <Text style={[styles.pillText, { color: colors.text }]}>{status}</Text>
    </View>
  );
}

export function ScreenHeader({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack: () => void;
  right?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={8}
        style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}>
        <Icon name={{ ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }} color={C.text} size={16} />
      </Pressable>
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

export function SummaryTile({ label, value, tone }: { label: string; value: number; tone: Tone }) {
  const colors = ToneColors[tone];
  return (
    <View style={[styles.tile, { backgroundColor: colors.background, borderColor: colors.text + '33' }]}>
      <Text style={[styles.tileValue, { color: colors.text }]}>{value}</Text>
      <Text style={styles.tileLabel} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

export function DocCard({ doc, onPress }: { doc: SalesDoc; onPress: () => void }) {
  const { total } = docTotals(doc.items);
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
      </View>
      <Icon name={OwnerIcons.chevron} color={C.textSecondary} size={14} />
    </Pressable>
  );
}

export function TotalsBlock({ subtotal, gst, total }: { subtotal: number; gst: number; total: number }) {
  return (
    <View style={styles.totals}>
      <TotalRow label="Subtotal" value={formatMoney(subtotal)} />
      <TotalRow label="GST (10%)" value={formatMoney(gst)} />
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
