// NexGain Hospitality: the coloured invoice status tag, and an invoice row for lists.
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ToneColors } from '@/components/owner/invoices-ui';
import { Icon, OwnerIcons } from '@/components/owner/ui';
import { Colors as C, Spacing } from '@/constants/theme';
import type { SalesDoc } from '@/data/invoices';
import { formatMoney } from '@/data/payroll';
import { hospitalityStatus, invoiceAmounts, notSentYet, type HospitalityStatus } from '@/systems/hospitality/data/invoice-status';

const TONES: Record<HospitalityStatus, keyof typeof ToneColors> = { Unpaid: 'amber', Overdue: 'red', Paid: 'green', Cancelled: 'grey' };

export function InvoiceStatusTag({ status, large }: { status: HospitalityStatus; large?: boolean }) {
  const colors = ToneColors[TONES[status]];
  return (
    <View style={[styles.tag, large && styles.tagLarge, { backgroundColor: colors.background }]}>
      <Text style={[styles.tagText, large && styles.tagTextLarge, { color: colors.text }]}>{status}</Text>
    </View>
  );
}

export function InvoiceRow({ doc, showDivider, onPress }: { doc: SalesDoc; showDivider: boolean; onPress: () => void }) {
  const status = hospitalityStatus(doc);
  const a = invoiceAmounts(doc);
  const due = doc.dueDate
    ? (() => {
        const [y, m, d] = doc.dueDate!.split('-').map(Number);
        return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
      })()
    : null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Invoice ${doc.number}, ${doc.client.business || doc.client.name}, ${status}, ${formatMoney(status === 'Paid' || status === 'Cancelled' ? a.total : a.owing)}`}
      style={({ pressed }) => [styles.row, showDivider && styles.divider, pressed && styles.pressed]}>
      <View style={styles.flex}>
        <Text style={styles.name} numberOfLines={1}>
          {doc.number} · {doc.client.business || doc.client.name || 'Customer'}
        </Text>
        <Text style={styles.muted} numberOfLines={1}>
          {notSentYet(doc) && status !== 'Cancelled' ? 'Not sent yet · ' : ''}
          {due ? `Due ${due}` : ''}
          {a.deposit > 0 && a.depositPaid && status !== 'Paid' ? ' · deposit paid' : ''}
        </Text>
      </View>
      <View style={styles.right}>
        <Text style={styles.amount}>{formatMoney(status === 'Paid' || status === 'Cancelled' ? a.total : a.owing)}</Text>
        <InvoiceStatusTag status={status} />
      </View>
      <Icon name={OwnerIcons.chevron} color={C.textSecondary} size={12} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  pressed: { opacity: 0.7 },
  tag: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  tagLarge: { paddingHorizontal: 14, paddingVertical: 6 },
  tagText: { fontSize: 12, fontWeight: '700' },
  tagTextLarge: { fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three - 4, paddingVertical: Spacing.two, minHeight: 56 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  name: { color: C.text, fontSize: 15, fontWeight: '600' },
  muted: { color: C.textSecondary, fontSize: 13 },
  right: { alignItems: 'flex-end', gap: 4 },
  amount: { color: C.text, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
