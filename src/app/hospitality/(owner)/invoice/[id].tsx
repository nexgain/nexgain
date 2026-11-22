import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/owner/confirm-dialog';
import { DateField, FormField, SwitchRow } from '@/components/owner/form';
import { downloadPdf } from '@/components/owner/invoice-pdf';
import { Button, Card, EmptyState, goBack, OwnerIcons, OwnerScreen, PageHeader } from '@/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { gstLabel, lineAmount, useBusinessPayment, useDocs, type PaidMethod } from '@/data/invoices';
import { formatMoney } from '@/data/payroll';
import { useDesktopSheetStyle } from '@/hooks/use-desktop';
import { InvoiceStatusTag } from '@/systems/hospitality/components/owner/invoice-ui';
import {
  cancelInvoice,
  hospitalityStatus,
  infoOf,
  invoiceAmounts,
  markOverdue,
  markPaid,
  markUnpaid,
  notSentYet,
  PAID_METHODS,
  sendInvoice,
  setDepositPaid,
} from '@/systems/hospitality/data/invoices';

const longDate = (key: string | null) => {
  if (!key) return '—';
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
};

// One hospitality invoice: its status (Unpaid, Overdue, Paid, Cancelled), the
// items and amounts, and big buttons to change the status, send or resend it,
// or email a payment reminder (only ever when the owner taps it).
// ?remind=1 (from an "overdue" notification) highlights "Send reminder email".
// ?askSent=1: it was opened in the phone's email app, so ask if it was sent.
export default function HospitalityInvoiceScreen() {
  const { id, remind, askSent } = useLocalSearchParams<{ id: string; remind?: string; askSent?: string }>();
  const doc = useDocs().find((d) => d.id === id && d.kind === 'invoice');
  const payment = useBusinessPayment();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [paying, setPaying] = useState(false);
  const [askedSent, setAskedSent] = useState(askSent === '1');

  if (!doc) {
    return (
      <OwnerScreen>
        <PageHeader title="Invoice" onBack={() => goBack('/hospitality/sales')} />
        <Card>
          <EmptyState icon={OwnerIcons.receipt} message="This invoice isn’t here any more." />
        </Card>
      </OwnerScreen>
    );
  }

  const status = hospitalityStatus(doc);
  const a = invoiceAmounts(doc);
  const info = infoOf(doc);
  const open = status === 'Unpaid' || status === 'Overdue';

  async function send(kind: 'invoice' | 'reminder') {
    setBusy(true);
    setMessage(null);
    try {
      const result = await sendInvoice(doc!.id, kind);
      if (result === 'sent') setMessage({ text: kind === 'reminder' ? 'Reminder sent from your email.' : 'Invoice sent from your email.' });
      else if (result === 'ask') setAskedSent(kind === 'invoice' && notSentYet(doc!));
      else setMessage({ text: 'Not sent.' });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : 'Couldn’t send it. Please try again.', error: true });
    } finally {
      setBusy(false);
    }
  }

  const said = (text: string) => setMessage({ text });

  return (
    <OwnerScreen>
      <PageHeader title={`Invoice ${doc.number}`} subtitle={doc.client.business || doc.client.name} onBack={() => goBack('/hospitality/sales')} />

      <Card>
        <View style={styles.statusRow}>
          <InvoiceStatusTag status={status} large />
          {notSentYet(doc) && status !== 'Cancelled' && <Text style={styles.muted}>Not sent yet</Text>}
        </View>
        <Text style={styles.owing}>{status === 'Paid' ? formatMoney(a.total) : status === 'Cancelled' ? formatMoney(a.total) : formatMoney(a.owing)}</Text>
        <Text style={styles.muted}>
          {status === 'Paid'
            ? `Paid ${doc.paidAt ? new Date(doc.paidAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long' }) : ''}${info.paidMethod ? ` by ${info.paidMethod.toLowerCase()}` : ''}.`
            : status === 'Cancelled'
              ? 'Cancelled: it isn’t counted anywhere.'
              : `Owing, due ${longDate(doc.dueDate)}.`}
        </Text>
      </Card>

      {askedSent && (
        <Card>
          <Text style={styles.value}>Did you send the email?</Text>
          <Text style={styles.muted}>It opened in your phone’s email app, so NexGain can’t tell.</Text>
          <View style={styles.twoButtons}>
            <View style={styles.flex}>
              <Button
                fill
                label="Yes, it’s sent"
                onPress={() => {
                  if (notSentYet(doc)) markUnpaid(doc.id);
                  setAskedSent(false);
                  said('Marked as sent.');
                }}
              />
            </View>
            <View style={styles.flex}>
              <Button fill label="Not yet" variant="secondary" onPress={() => setAskedSent(false)} />
            </View>
          </View>
        </Card>
      )}

      {message && (
        <Text accessibilityRole="alert" style={message.error ? styles.error : styles.note}>
          {message.text}
        </Text>
      )}

      {/* Big, simple buttons for the status. */}
      <Card title="Change status" icon={OwnerIcons.check}>
        {status !== 'Paid' && status !== 'Cancelled' && <Button label="Mark as paid" icon={OwnerIcons.check} onPress={() => setPaying(true)} disabled={busy} />}
        {status !== 'Unpaid' && (
          <Button
            label="Mark as unpaid"
            variant="secondary"
            onPress={() => {
              markUnpaid(doc.id);
              said(`${doc.number} is unpaid again.`);
            }}
            disabled={busy}
          />
        )}
        {status !== 'Overdue' && status !== 'Cancelled' && (
          <Button
            label="Mark as overdue"
            variant="secondary"
            onPress={() => {
              markOverdue(doc.id);
              said(`${doc.number} is marked overdue.`);
            }}
            disabled={busy}
          />
        )}
        {status !== 'Cancelled' && <Button label="Cancel invoice" variant="secondary" onPress={() => setConfirmCancel(true)} disabled={busy} />}
      </Card>

      <Card title="Email" icon={{ ios: 'envelope.fill', android: 'mail', web: 'mail' }}>
        {status === 'Overdue' && (
          <>
            {remind === '1' && <Text style={styles.note}>This invoice is overdue. Tap below to email {doc.client.name || 'the customer'} a friendly reminder.</Text>}
            <Button label={busy ? 'Opening…' : 'Send reminder email'} icon={{ ios: 'bell.fill', android: 'notifications', web: 'notifications' }} onPress={() => send('reminder')} disabled={busy} />
          </>
        )}
        {status !== 'Cancelled' && (
          <Button
            label={notSentYet(doc) ? 'Send invoice' : 'Resend'}
            variant={status === 'Overdue' ? 'secondary' : 'primary'}
            icon={{ ios: 'paperplane.fill', android: 'send', web: 'send' }}
            onPress={() => send('invoice')}
            disabled={busy}
          />
        )}
        <Button label="Download PDF" variant="secondary" onPress={() => downloadPdf(doc, payment).catch(() => setMessage({ text: 'Couldn’t make the PDF.', error: true }))} />
        <Text style={styles.muted}>NexGain never emails your customer unless you tap a button here. To: {doc.client.email || '—'}</Text>
      </Card>

      <Card title="Details" icon={OwnerIcons.receipt}>
        <Detail label="Customer" value={[doc.client.name, doc.client.business].filter(Boolean).join(' · ') || '—'} />
        {doc.client.phone ? <Detail label="Phone" value={doc.client.phone} /> : null}
        <Detail label="Sent / made" value={new Date(doc.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })} />
        <Detail label="Due" value={longDate(doc.dueDate)} />
        {doc.description ? <Detail label="Note" value={doc.description} /> : null}
        <View style={styles.items}>
          {doc.items.map((item) => (
            <View key={item.id} style={styles.itemRow}>
              <Text style={[styles.text, styles.flex]}>
                {item.qty}× {item.description}
              </Text>
              <Text style={styles.text}>{formatMoney(Math.round(lineAmount(item) * (1 + doc.gstRate) * 100) / 100)}</Text>
            </View>
          ))}
        </View>
        <Total label="Total" value={formatMoney(a.total)} bold />
        {doc.gstRate > 0 && <Total label={`Includes ${gstLabel(doc.gstRate)}`} value={formatMoney(a.gst)} />}
        {a.deposit > 0 && <Total label={a.depositPaid ? 'Deposit paid' : 'Deposit (not paid yet)'} value={formatMoney(a.deposit)} />}
        {open && <Total label="Amount owing" value={formatMoney(a.owing)} bold />}
        {a.deposit > 0 && open && <SwitchRow label="Deposit paid" value={a.depositPaid} onChange={(paid) => setDepositPaid(doc.id, paid)} />}
      </Card>

      <PaidSheet
        visible={paying}
        onClose={() => setPaying(false)}
        onSave={(date, method) => {
          setPaying(false);
          markPaid(doc.id, date, method);
          said(`${doc.number} is marked as paid.`);
        }}
      />
      <ConfirmDialog
        visible={confirmCancel}
        message={`Are you sure you want to cancel ${doc.number}? It won’t be counted in your sales or GST. You can mark it unpaid again later.`}
        confirmLabel="Cancel invoice"
        onConfirm={() => {
          setConfirmCancel(false);
          cancelInvoice(doc.id);
          said(`${doc.number} is cancelled.`);
        }}
        onCancel={() => setConfirmCancel(false)}
      />
    </OwnerScreen>
  );
}

/** "Mark as paid": the date it was paid and how. */
function PaidSheet({ visible, onClose, onSave }: { visible: boolean; onClose: () => void; onSave: (date: Date, method: PaidMethod) => void }) {
  const insets = useSafeAreaInsets();
  const desktopSheet = useDesktopSheetStyle();
  const [date, setDate] = useState(new Date());
  const [method, setMethod] = useState<PaidMethod>('Bank transfer');
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.three }, desktopSheet]}>
        <Text style={styles.sheetTitle}>Mark as paid</Text>
        <FormField label="Date paid">
          <DateField label="Date paid" value={date} onChange={setDate} />
        </FormField>
        <Text style={styles.label}>How was it paid?</Text>
        <View style={styles.methods}>
          {PAID_METHODS.map((m) => (
            <Pressable
              key={m}
              onPress={() => setMethod(m)}
              accessibilityRole="radio"
              accessibilityState={{ selected: m === method }}
              style={[styles.method, m === method && styles.methodOn]}>
              <Text style={[styles.methodText, m === method && styles.methodTextOn]}>{m}</Text>
            </Pressable>
          ))}
        </View>
        <Button label="Save as paid" onPress={() => onSave(date, method)} />
        <Button label="Cancel" variant="secondary" onPress={onClose} />
      </View>
    </Modal>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.text}>{value}</Text>
    </View>
  );
}

function Total({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.itemRow}>
      <Text style={[styles.muted, styles.flex, bold && styles.bold]}>{label}</Text>
      <Text style={[styles.text, bold && styles.bold]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  owing: { color: C.text, fontSize: 30, fontWeight: '800', fontVariant: ['tabular-nums'] },
  value: { color: C.text, fontSize: 16, fontWeight: '700' },
  text: { color: C.text, fontSize: 15, fontVariant: ['tabular-nums'] },
  muted: { color: C.textSecondary, fontSize: 13, lineHeight: 18 },
  bold: { color: C.text, fontSize: 16, fontWeight: '700' },
  label: { color: C.textSecondary, fontSize: 13, fontWeight: '600' },
  note: { color: C.success, fontSize: 14, fontWeight: '600' },
  error: { color: C.danger, fontSize: 14, fontWeight: '600' },
  twoButtons: { flexDirection: 'row', gap: Spacing.two },
  detail: { gap: 2 },
  items: { gap: Spacing.two, paddingVertical: Spacing.two, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.border },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  backdrop: { flex: 1, backgroundColor: C.overlay },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: Radius.large,
    borderTopRightRadius: Radius.large,
    paddingTop: Spacing.three,
    paddingHorizontal: Spacing.four - 4,
    gap: Spacing.three - 4,
  },
  sheetTitle: { color: C.text, fontSize: 17, fontWeight: '700' },
  methods: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  method: { minHeight: 48, paddingHorizontal: Spacing.three, borderRadius: 999, justifyContent: 'center', borderWidth: 1, borderColor: C.border, backgroundColor: C.background },
  methodOn: { backgroundColor: C.accent, borderColor: C.accent },
  methodText: { color: C.text, fontSize: 15, fontWeight: '600' },
  methodTextOn: { color: C.onAccent },
});
