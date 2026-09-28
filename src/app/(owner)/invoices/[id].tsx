import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { FormField, OptionSheet, TextField } from '@/components/owner/form';
import { downloadPdf, sendDoc } from '@/components/owner/invoice-pdf';
import {
  HeaderIconButton,
  KIND_LABEL,
  ScreenHeader,
  StatusPill,
  TotalsBlock,
} from '@/components/owner/invoices-ui';
import { Button, Card, EmptyState, Icon, OwnerIcons, OwnerScreen, type IconName } from '@/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { formatShortDate } from '@/data/employee-roster';
import {
  deleteDoc,
  displayStatus,
  docTotals,
  lineAmount,
  updateBusinessPayment,
  updateDoc,
  useBusinessPayment,
  useDocs,
  type DocStatus,
  type SalesDoc,
} from '@/data/invoices';
import { formatMoney } from '@/data/payroll';
import { fromDateKey } from '@/data/shifts';

const dateText = (key: string | null) => (key ? formatShortDate(fromDateKey(key)) : null);

export default function DocDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const doc = useDocs().find((d) => d.id === id);
  const payment = useBusinessPayment();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!doc) {
    return (
      <OwnerScreen>
        <ScreenHeader title="Not found" onBack={() => router.back()} />
        <Card>
          <EmptyState icon={OwnerIcons.receipt} message="This invoice or quote doesn't exist or has been deleted." />
        </Card>
      </OwnerScreen>
    );
  }

  const label = KIND_LABEL[doc.kind].one;
  const status = displayStatus(doc);
  const totals = docTotals(doc.items, doc.gstRate);
  const due = dateText(doc.dueDate);
  const statusOptions: DocStatus[] =
    doc.kind === 'invoice' ? ['Draft', 'Pending', 'Paid'] : ['Draft', 'Sent', 'Accepted'];
  const menuOptions = [...statusOptions.map((s) => `Mark as ${s}`), `Delete ${label}`];

  async function run(action: (d: SalesDoc) => Promise<void>) {
    setBusy(true);
    try {
      await action(doc!);
    } catch {
      // Share sheet dismissed or unavailable.
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    await run((d) => sendDoc(d, payment));
    if (doc!.status === 'Draft') updateDoc(doc!.id, { status: doc!.kind === 'invoice' ? 'Pending' : 'Sent' });
  }

  return (
    <OwnerScreen>
      <ScreenHeader
        title={doc.number}
        onBack={() => router.back()}
        right={<HeaderIconButton icon="more" label="More options" onPress={() => setMenuOpen(true)} />}
      />

      {confirmDelete && (
        <View style={styles.confirm}>
          <Text style={styles.confirmText}>Delete {doc.number}? This can&apos;t be undone.</Text>
          <View style={styles.confirmButtons}>
            <Button label="Cancel" variant="secondary" onPress={() => setConfirmDelete(false)} />
            <Pressable
              onPress={() => {
                deleteDoc(doc.id);
                router.back();
              }}
              accessibilityRole="button"
              style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}>
              <Text style={styles.deleteText}>Delete</Text>
            </Pressable>
          </View>
        </View>
      )}

      <View style={styles.statusRow}>
        <StatusPill status={status} />
        <Text style={styles.muted}>
          {due ? `${doc.kind === 'invoice' ? 'Due' : 'Valid until'} ${due}` : 'No due date set'}
        </Text>
      </View>

      <Card>
        <View style={styles.clientHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(doc.client.name)}</Text>
          </View>
          <Text style={styles.clientName}>{doc.client.name || 'No client name'}</Text>
        </View>
        <ContactRow
          icon={{ ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' }}
          value={doc.client.address}
          placeholder="No address"
        />
        <ContactRow
          icon={{ ios: 'phone.fill', android: 'call', web: 'call' }}
          value={doc.client.phone}
          placeholder="No phone number"
          onPress={() => Linking.openURL(`tel:${doc.client.phone.replace(/\s/g, '')}`)}
          actionLabel="Call client"
        />
        <ContactRow
          icon={{ ios: 'envelope.fill', android: 'mail', web: 'mail' }}
          value={doc.client.email}
          placeholder="No email"
          onPress={() => Linking.openURL(`mailto:${doc.client.email}`)}
          actionLabel="Email client"
        />
      </Card>

      <Card title="Job Details" icon={OwnerIcons.calendar}>
        <DetailRow label="Job Type" value={doc.jobType} />
        <DetailRow label="Job Date" value={dateText(doc.jobDate)} />
        <DetailRow label="Notes" value={doc.description} />
      </Card>

      <Card
        title="Items"
        icon={OwnerIcons.receipt}
        right={
          <Pressable
            onPress={() => router.push({ pathname: '/invoices/new', params: { id: doc.id, step: '1' } })}
            accessibilityRole="button"
            hitSlop={8}
            style={styles.addItem}>
            <Icon name={{ ios: 'plus', android: 'add', web: 'add' }} color={C.accent} size={14} />
            <Text style={styles.addItemText}>Add Item</Text>
          </Pressable>
        }>
        <View style={styles.tableHeader}>
          <Text style={[styles.th, styles.descCol]}>Description</Text>
          <Text style={[styles.th, styles.qtyCol]}>Qty</Text>
          <Text style={[styles.th, styles.rateCol]}>Rate</Text>
          <Text style={[styles.th, styles.amountCol]}>Amount</Text>
        </View>
        {doc.items.length === 0 ? (
          <Text style={[styles.muted, styles.noItems]}>No items yet.</Text>
        ) : (
          doc.items.map((item) => (
            <View key={item.id} style={styles.tableRow}>
              <Text style={[styles.td, styles.descCol]}>{item.description}</Text>
              <Text style={[styles.td, styles.qtyCol]}>{item.qty}</Text>
              <Text style={[styles.td, styles.rateCol]}>{formatMoney(item.rate)}</Text>
              <Text style={[styles.td, styles.amountCol, styles.bold]}>{formatMoney(lineAmount(item))}</Text>
            </View>
          ))
        )}
        <TotalsBlock {...totals} />
      </Card>

      {doc.kind === 'invoice' && (
        <Card title="Payment Information" icon={OwnerIcons.bank}>
          <Text style={styles.muted}>Your business bank details, printed on every invoice.</Text>
          <FormField label="Bank">
            <TextField value={payment.bank} onChangeText={(bank) => updateBusinessPayment({ bank })} placeholder="Bank name" accessibilityLabel="Bank" />
          </FormField>
          <View style={styles.row}>
            <FormField label="BSB" style={styles.flex}>
              <TextField value={payment.bsb} onChangeText={(bsb) => updateBusinessPayment({ bsb })} placeholder="000-000" keyboardType="number-pad" accessibilityLabel="BSB" />
            </FormField>
            <FormField label="Account" style={styles.flex}>
              <TextField value={payment.account} onChangeText={(account) => updateBusinessPayment({ account })} placeholder="Account number" keyboardType="number-pad" accessibilityLabel="Account" />
            </FormField>
          </View>
          <FormField label="Reference">
            <TextField
              value={doc.paymentReference}
              onChangeText={(paymentReference) => updateDoc(doc.id, { paymentReference })}
              placeholder={doc.number}
              accessibilityLabel="Reference"
            />
          </FormField>
        </Card>
      )}

      <View style={styles.actions}>
        <View style={styles.flex}>
          <Button
            label="Edit"
            variant="secondary"
            icon={{ ios: 'pencil', android: 'edit', web: 'edit' }}
            onPress={() => router.push({ pathname: '/invoices/new', params: { id: doc.id } })}
          />
        </View>
        <View style={styles.flex}>
          <Button
            label="Download PDF"
            variant="secondary"
            icon={OwnerIcons.download}
            disabled={busy}
            onPress={() => run((d) => downloadPdf(d, payment))}
          />
        </View>
      </View>
      <Button label={`Send ${label}`} icon={{ ios: 'paperplane.fill', android: 'send', web: 'send' }} disabled={busy} onPress={send} />

      <OptionSheet
        visible={menuOpen}
        title={doc.number}
        options={menuOptions}
        value={`Mark as ${doc.status}`}
        onSelect={(option) => {
          if (option.startsWith('Delete')) setConfirmDelete(true);
          else updateDoc(doc.id, { status: option.replace('Mark as ', '') as DocStatus });
        }}
        onClose={() => setMenuOpen(false)}
      />
    </OwnerScreen>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length === 0 ? '?' : parts.slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

function ContactRow({
  icon,
  value,
  placeholder,
  onPress,
  actionLabel,
}: {
  icon: IconName;
  value: string;
  placeholder: string;
  onPress?: () => void;
  actionLabel?: string;
}) {
  return (
    <View style={styles.contactRow}>
      <Icon name={icon} color={C.textSecondary} size={14} />
      <Text style={[styles.contactText, !value && styles.muted]} numberOfLines={2}>
        {value || placeholder}
      </Text>
      {onPress && value ? (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          hitSlop={6}
          style={({ pressed }) => [styles.contactAction, pressed && styles.pressed]}>
          <Icon name={icon} color={C.accent} size={16} />
        </Pressable>
      ) : null}
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, !value && styles.muted]}>{value || '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.three - 4,
  },
  muted: {
    color: C.textSecondary,
    fontSize: 13,
  },
  bold: {
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.7,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  confirm: {
    gap: Spacing.three - 4,
    padding: Spacing.three,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: C.danger,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  confirmText: {
    color: C.text,
    fontSize: 15,
  },
  confirmButtons: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  deleteButton: {
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.medium,
    backgroundColor: C.danger,
  },
  deleteText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  clientHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.accent,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  clientName: {
    flex: 1,
    color: C.text,
    fontSize: 18,
    fontWeight: '700',
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 32,
  },
  contactText: {
    flex: 1,
    color: C.text,
    fontSize: 14,
  },
  contactAction: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(79, 140, 255, 0.14)',
  },
  detailRow: {
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
  addItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addItemText: {
    color: C.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  tableHeader: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingBottom: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  th: {
    color: C.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingVertical: Spacing.two + 2,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  td: {
    color: C.text,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  descCol: {
    flex: 1,
  },
  qtyCol: {
    width: 36,
    textAlign: 'right',
  },
  rateCol: {
    width: 76,
    textAlign: 'right',
  },
  amountCol: {
    width: 84,
    textAlign: 'right',
  },
  noItems: {
    textAlign: 'center',
    paddingVertical: Spacing.three,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.three - 4,
    marginTop: Spacing.two,
  },
});
