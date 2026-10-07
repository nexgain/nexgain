import { useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatBsb } from '@/components/employee-signup/types';
import { FormField, OptionSheet, TextField } from '@/components/owner/form';
import { downloadPdf, emailInvoice, emailQuote, sendReceipt } from '@/components/owner/invoice-pdf';
import {
  ConfirmDialog,
  ExpiredTag,
  HeaderIconButton,
  KIND_LABEL,
  ReceiptLabel,
  ScreenHeader,
  StatusPill,
  TotalsBlock,
} from '@/components/owner/invoices-ui';
import { Button, Card, EmptyState, Icon, OwnerIcons, OwnerScreen, type IconName } from '@/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { formatShortDate } from '@/data/employee-roster';
import {
  convertQuoteToInvoice,
  deleteDoc,
  displayStatus,
  docTotals,
  hasBankDetails,
  invoiceForQuote,
  lineAmount,
  markQuoteSent,
  setDocStatus,
  updateBusinessPayment,
  updateDoc,
  useBusinessPayment,
  useDocs,
  type DocStatus,
} from '@/data/invoices';
import { useJobs } from '@/data/jobs';
import { formatMoney } from '@/data/payroll';
import { fromDateKey } from '@/data/shifts';

const dateText = (key: string | null) => (key ? formatShortDate(fromDateKey(key)) : null);

type Notice = { tone: 'ok' | 'error'; text: string };

// Let a pop-up or screen change finish first; iOS can't open the email screen over it.
const settle = () => new Promise((resolve) => setTimeout(resolve, 400));

export default function DocDetailScreen() {
  // send=1: just created with "Save & Send", so open the email straight away.
  const { id, send: sendOnOpen } = useLocalSearchParams<{ id: string; send?: string }>();
  const docs = useDocs();
  const doc = docs.find((d) => d.id === id);
  const jobs = useJobs();
  const payment = useBusinessPayment();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  // Asked after the email app closes on Android (it can't tell us whether it was sent).
  const [askSent, setAskSent] = useState(false);
  // "offer": ask to send a receipt after marking paid. "confirm": ask whether it was sent.
  const [receiptPrompt, setReceiptPrompt] = useState<'offer' | 'confirm' | null>(null);
  const autoSent = useRef(false);

  useEffect(() => {
    if (sendOnOpen !== '1' || autoSent.current || !doc) return;
    autoSent.current = true;
    settle().then(sendNow);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the screen opens
  }, [sendOnOpen, doc?.id]);

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
  const isPaidInvoice = doc.kind === 'invoice' && doc.status === 'Paid';
  const isQuote = doc.kind === 'quote';
  const clientName = doc.client.name.trim() || 'The customer';
  const answeredOn = doc.respondedAt ? formatShortDate(new Date(doc.respondedAt)) : null;
  // A booked quote belongs to its job now, and a customer's own answer stands, so
  // their status can't be changed here (sending a revised quote re-opens it).
  const statusOptions: DocStatus[] =
    doc.kind === 'invoice'
      ? ['Draft', 'Pending', 'Paid']
      : doc.status === 'Booked' || doc.respondedAt
        ? []
        : ['Draft', 'Sent', 'Accepted', 'Declined'];
  const bookedJob = isQuote ? jobs.find((j) => j.quoteId === doc.id) : undefined;
  const invoice = isQuote ? invoiceForQuote(docs, doc.id) : undefined;
  const menuOptions = [...statusOptions.map((s) => `Mark as ${s}`), `Delete ${label}`];

  async function download() {
    setBusy(true);
    try {
      await downloadPdf(doc!, payment);
    } catch {
      // Share sheet dismissed or unavailable.
    } finally {
      setBusy(false);
    }
  }

  /** Opens the owner's email app with the quote or invoice written and the PDF attached. */
  async function sendNow() {
    const d = doc!;
    setNotice(null);
    const problem = !d.client.email.trim()
      ? `Add ${d.client.name.trim() || "the customer"}'s email address first (tap Edit).`
      : d.items.length === 0
        ? 'Add at least one item first.'
        : d.kind === 'invoice' && !hasBankDetails(payment)
          ? 'Add your account name, BSB and account number under Payment Details first. They are printed on the invoice.'
          : null;
    if (problem) {
      setNotice({ tone: 'error', text: problem });
      return;
    }
    setBusy(true);
    try {
      const result = d.kind === 'quote' ? await emailQuote(d, payment) : await emailInvoice(d, payment);
      if (result === 'sent') markSent();
      else if (result === 'ask') setAskSent(true);
    } catch (e) {
      const message = e instanceof Error ? e.message : typeof (e as { message?: unknown })?.message === 'string' ? (e as { message: string }).message : '';
      const offline = /network request failed|failed to fetch/i.test(message);
      setNotice({
        tone: 'error',
        text: message.includes('EXPO_PUBLIC')
          ? message
          : offline || !message
            ? `Couldn't prepare the ${label.toLowerCase()}. Check your internet connection and try again.`
            : `Couldn't prepare the ${label.toLowerCase()}. ${message}`,
      });
    } finally {
      setBusy(false);
    }
  }

  function markSent() {
    setAskSent(false);
    if (doc!.kind === 'quote') markQuoteSent(doc!.id);
    else if (doc!.status === 'Draft') updateDoc(doc!.id, { status: 'Pending' });
    setNotice({ tone: 'ok', text: `${label} sent to ${doc!.client.email.trim()}.` });
  }

  function convert() {
    const invoiceId = convertQuoteToInvoice(doc!);
    router.push({ pathname: '/invoices/[id]', params: { id: invoiceId } });
  }

  async function sendReceiptNow() {
    if (receiptPrompt) {
      setReceiptPrompt(null);
      // Let the pop-up finish closing; iOS can't open the mail app over it.
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    setBusy(true);
    try {
      const result = await sendReceipt(doc!, payment);
      if (result === 'sent') updateDoc(doc!.id, { receiptStatus: 'sent' });
      else if (result === 'ask') setReceiptPrompt('confirm');
    } catch {
      // Mail app or share sheet dismissed or unavailable.
    } finally {
      setBusy(false);
    }
  }

  function changeStatus(status: DocStatus) {
    if (setDocStatus(doc!.id, status)) {
      // Wait for the options sheet to finish closing; iOS can't show two pop-ups at once.
      setTimeout(() => setReceiptPrompt('offer'), 400);
    }
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

      {notice && (
        <View style={[styles.notice, notice.tone === 'error' && styles.noticeError]} accessibilityRole="alert">
          <Text style={[styles.noticeText, notice.tone === 'error' && { color: C.danger }]}>{notice.text}</Text>
          <Pressable onPress={() => setNotice(null)} hitSlop={8} accessibilityLabel="Dismiss">
            <Icon name={{ ios: 'xmark', android: 'close', web: 'close' }} color={C.textSecondary} size={12} />
          </Pressable>
        </View>
      )}

      <View style={styles.statusRow}>
        <StatusPill status={status} />
        <ExpiredTag doc={doc} />
        <Text style={styles.muted}>
          {isPaidInvoice && doc.paidAt
            ? `Paid ${formatShortDate(new Date(doc.paidAt))}`
            : due
              ? `${doc.kind === 'invoice' ? 'Due' : 'Valid until'} ${due}`
              : 'No due date set'}
        </Text>
        {isPaidInvoice && <ReceiptLabel status={doc.receiptStatus} />}
      </View>

      {isQuote && doc.status === 'Accepted' && (
        <Card title="Accepted" icon={OwnerIcons.check}>
          <Text style={styles.muted}>
            {answeredOn ? `${clientName} accepted this quote online on ${answeredOn}. ` : 'The client accepted this quote. '}
            Convert it to an invoice, or confirm the job to pick a date and time and add it to your Jobs page and
            Calendar.
          </Text>
          <ConvertButton invoiceId={invoice?.id} onConvert={convert} />
          <Button
            label="Confirm Job"
            variant="secondary"
            icon={OwnerIcons.calendar}
            onPress={() => router.push({ pathname: '/invoices/confirm/[id]', params: { id: doc.id } })}
          />
        </Card>
      )}
      {isQuote && doc.status === 'Booked' && (
        <Card title="Booked" icon={OwnerIcons.calendar}>
          <Text style={styles.muted}>This quote has been booked in as a job, so it can&apos;t be booked again.</Text>
          <ConvertButton invoiceId={invoice?.id} onConvert={convert} />
          {bookedJob && (
            <Button
              label="View Job"
              variant="secondary"
              onPress={() => router.navigate({ pathname: '/job/[id]', params: { id: bookedJob.id } })}
            />
          )}
        </Card>
      )}
      {isQuote && doc.status === 'Declined' && (
        <Card title="Declined" icon={{ ios: 'xmark.circle.fill', android: 'cancel', web: 'cancel' }}>
          <Text style={styles.muted}>
            {answeredOn ? `${clientName} declined this quote online on ${answeredOn}.` : 'This quote was declined.'} To
            offer a revised quote, tap Edit, make your changes and send it again. The customer can then accept or
            decline it again.
          </Text>
        </Card>
      )}
      {doc.kind === 'invoice' && doc.sourceQuoteId && (
        <Pressable
          onPress={() => router.push({ pathname: '/invoices/[id]', params: { id: doc.sourceQuoteId! } })}
          accessibilityRole="link"
          hitSlop={6}>
          <Text style={styles.link}>Made from a quote · View quote</Text>
        </Pressable>
      )}

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
        <Card title="Payment Details" icon={OwnerIcons.bank}>
          <Text style={styles.muted}>Your business bank details, printed on every invoice (also in Business Profile).</Text>
          <FormField label="Account Name">
            <TextField
              value={payment.accountName}
              onChangeText={(accountName) => updateBusinessPayment({ accountName })}
              placeholder="e.g. Smith Plumbing Pty Ltd"
              autoCapitalize="words"
              accessibilityLabel="Account Name"
            />
          </FormField>
          <View style={styles.row}>
            <FormField label="BSB" style={styles.flex}>
              <TextField
                value={payment.bsb}
                onChangeText={(bsb) => updateBusinessPayment({ bsb: formatBsb(bsb) })}
                placeholder="000-000"
                keyboardType="number-pad"
                accessibilityLabel="BSB"
              />
            </FormField>
            <FormField label="Account Number" style={styles.flex}>
              <TextField
                value={payment.account}
                onChangeText={(account) => updateBusinessPayment({ account })}
                placeholder="12345678"
                keyboardType="number-pad"
                accessibilityLabel="Account Number"
              />
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
            onPress={download}
          />
        </View>
      </View>
      <Button
        label={isPaidInvoice ? 'Send Receipt' : `Send ${label}`}
        icon={{ ios: 'paperplane.fill', android: 'send', web: 'send' }}
        disabled={busy}
        onPress={isPaidInvoice ? sendReceiptNow : sendNow}
      />

      <OptionSheet
        visible={menuOpen}
        title={doc.number}
        options={menuOptions}
        value={`Mark as ${doc.status}`}
        onSelect={(option) => {
          if (option.startsWith('Delete')) setConfirmDelete(true);
          else changeStatus(option.replace('Mark as ', '') as DocStatus);
        }}
        onClose={() => setMenuOpen(false)}
      />

      <ConfirmDialog
        visible={askSent}
        title={`Did you send the ${label.toLowerCase()}? Tap Yes to mark it as ${isQuote ? 'Sent' : 'sent (Pending payment)'}.`}
        confirmLabel="Yes"
        cancelLabel="No"
        onConfirm={markSent}
        onCancel={() => setAskSent(false)}
      />
      <ConfirmDialog
        visible={receiptPrompt === 'offer'}
        title={`Send a receipt to ${doc.client.name || 'the client'}?`}
        confirmLabel="Send receipt"
        cancelLabel="Not now"
        onConfirm={sendReceiptNow}
        onCancel={() => {
          updateDoc(doc.id, { receiptStatus: 'not_sent' });
          setReceiptPrompt(null);
        }}
      />
      <ConfirmDialog
        visible={receiptPrompt === 'confirm'}
        title="Did you send the receipt?"
        confirmLabel="Yes"
        cancelLabel="No"
        onConfirm={() => {
          updateDoc(doc.id, { receiptStatus: 'sent' });
          setReceiptPrompt(null);
        }}
        onCancel={() => {
          updateDoc(doc.id, { receiptStatus: 'not_sent' });
          setReceiptPrompt(null);
        }}
      />
    </OwnerScreen>
  );
}

/** Accepted quotes: make an invoice from it, or open the one already made. */
function ConvertButton({ invoiceId, onConvert }: { invoiceId?: string; onConvert: () => void }) {
  return invoiceId ? (
    <Button
      label="View Invoice"
      variant="secondary"
      icon={OwnerIcons.receipt}
      onPress={() => router.push({ pathname: '/invoices/[id]', params: { id: invoiceId } })}
    />
  ) : (
    <Button label="Convert to Invoice" icon={OwnerIcons.receipt} onPress={onConvert} />
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
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three - 4,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: C.success,
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
  },
  noticeError: {
    borderColor: C.danger,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  noticeText: {
    flex: 1,
    color: C.text,
    fontSize: 14,
  },
  link: {
    color: C.accent,
    fontSize: 14,
    fontWeight: '600',
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
