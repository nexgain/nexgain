import { useEffect, useState } from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { downloadContractorInvoice, type InvoiceBank } from '@/components/contractor-invoice-pdf';
import { FormField, TextField } from '@/components/owner/form';
import { ConfirmDialog, ScreenHeader } from '@/components/owner/invoices-ui';
import { Badge, Button, Card, EmptyState, goBack, OwnerIcons, OwnerScreen } from '@/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { INVOICE_STATUS_LABEL, loadInvoiceBank, setInvoiceStatus, useContractorInvoices } from '@/data/contractor-invoices';
import { useCurrentEmployee } from '@/data/current-employee';
import { formatShortDate } from '@/data/employee-roster';
import { formatAbn } from '@/data/employees';
import { formatMoney } from '@/data/payroll';
import { fromDateKey } from '@/data/shifts';

const TONE = { draft: 'neutral', sent: 'info', approved: 'warning', declined: 'danger', paid: 'success' } as const;

// One contractor invoice for the owner: details (incl. bank, for paying it) and actions.
export default function TeamInvoiceScreen() {
  const me = useCurrentEmployee();
  const { id } = useLocalSearchParams<{ id: string }>();
  const invoice = useContractorInvoices().find((i) => i.id === id);
  const [bank, setBank] = useState<InvoiceBank | 'loading' | 'error'>('loading');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmPaid, setConfirmPaid] = useState(false);

  // Bank details are decrypted by the database only for this business's owner.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    loadInvoiceBank(id)
      .then((b) => !cancelled && setBank(b))
      .catch(() => !cancelled && setBank('error'));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (me) return <Redirect href="/home" />;

  if (!invoice) {
    return (
      <OwnerScreen>
        <ScreenHeader title="Invoice" onBack={() => goBack('/contractor-invoices')} />
        <Card>
          <EmptyState icon={OwnerIcons.receipt} message="This invoice couldn't be found." />
        </Card>
      </OwnerScreen>
    );
  }

  const d = invoice.sentDetails;
  const bankDetails = bank !== 'loading' && bank !== 'error' ? bank : null;

  async function act(status: 'approved' | 'declined' | 'paid', why?: string) {
    setBusy(status);
    setMessage(null);
    try {
      await setInvoiceStatus(invoice!.id, status, why);
      setDeclining(false);
      setReason('');
      setMessage({
        tone: 'ok',
        text:
          status === 'approved'
            ? 'Approved. The contractor has been told.'
            : status === 'declined'
              ? 'Declined. The contractor can fix it and send it again.'
              : 'Marked as paid. The contractor has been told.',
      });
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error && e.message ? e.message : 'Couldn’t update the invoice.' });
    } finally {
      setBusy(null);
    }
  }

  async function download() {
    setBusy('pdf');
    try {
      await downloadContractorInvoice(invoice!, bankDetails);
    } catch {
      setMessage({ tone: 'error', text: 'Sorry, the PDF couldn’t be made. Please try again.' });
    } finally {
      setBusy(null);
    }
  }

  const open = invoice.status === 'sent' || invoice.status === 'approved';

  return (
    <OwnerScreen>
      <ScreenHeader title={invoice.number} onBack={() => goBack('/contractor-invoices')} />

      <View style={styles.top}>
        <Badge label={INVOICE_STATUS_LABEL[invoice.status]} tone={TONE[invoice.status]} />
        <Text style={styles.muted}>
          {invoice.status === 'paid' && invoice.paidAt
            ? `Paid ${formatShortDate(new Date(invoice.paidAt))}`
            : invoice.sentAt
              ? `Received ${formatShortDate(new Date(invoice.sentAt))}`
              : ''}
        </Text>
      </View>

      {invoice.status === 'declined' && invoice.declineReason && (
        <View style={[styles.message, styles.messageError]}>
          <Text style={styles.messageText}>Declined: {invoice.declineReason}</Text>
        </View>
      )}

      {message && (
        <View style={[styles.message, message.tone === 'error' && styles.messageError]} accessibilityRole="alert">
          <Text style={styles.messageText}>{message.text}</Text>
        </View>
      )}

      <Card title="Contractor" icon={OwnerIcons.people}>
        <Text style={styles.name}>{d?.name}</Text>
        <Rows
          rows={[
            ['ABN', d?.abn ? formatAbn(d.abn) : '—'],
            ['Phone', d?.phone || '—'],
            ['Email', d?.email || '—'],
          ]}
        />
        <View style={styles.contactButtons}>
          {d?.phone ? <Button label="Call" variant="secondary" onPress={() => Linking.openURL(`tel:${d.phone.replace(/[^\d+]/g, '')}`)} /> : null}
          {d?.email ? <Button label="Email" variant="secondary" onPress={() => Linking.openURL(`mailto:${d.email}`)} /> : null}
        </View>
      </Card>

      <Card title="Pay To" icon={OwnerIcons.bank}>
        {bank === 'loading' ? (
          <ActivityIndicator color={C.accent} />
        ) : bank === 'error' || !bank ? (
          <Text style={styles.muted}>Bank details couldn&apos;t be loaded (account ending {invoice.bankLast4 ?? '—'}).</Text>
        ) : (
          <Rows
            rows={[
              ['Account name', bank.accountName || '—'],
              ['BSB', bank.bsb || '—'],
              ['Account number', bank.accountNumber || '—'],
              ['Reference', invoice.number],
            ]}
          />
        )}
        <Text style={styles.muted}>Only you and this contractor can see these details.</Text>
      </Card>

      <Card title="Invoice" icon={OwnerIcons.receipt}>
        <Rows
          rows={[
            ['Invoice date', formatShortDate(fromDateKey(invoice.invoiceDate))],
            ['Due date', invoice.dueDate ? formatShortDate(fromDateKey(invoice.dueDate)) : '—'],
          ]}
        />
        {invoice.items.map((i) => (
          <View key={i.id} style={[styles.itemRow, styles.divider]}>
            <View style={styles.flex}>
              <Text style={styles.value}>{i.description || '—'}</Text>
              <Text style={styles.muted}>
                {i.quantity} × {formatMoney(i.rate)}
              </Text>
            </View>
            <Text style={styles.value}>{formatMoney(i.amount)}</Text>
          </View>
        ))}
        <View style={[styles.itemRow, styles.divider]}>
          <Text style={[styles.muted, styles.flex]}>Subtotal</Text>
          <Text style={styles.value}>{formatMoney(invoice.subtotal)}</Text>
        </View>
        <View style={styles.itemRow}>
          <Text style={[styles.muted, styles.flex]}>{invoice.gstRegistered ? 'GST (10%)' : 'GST (not registered)'}</Text>
          <Text style={styles.value}>{formatMoney(invoice.gst)}</Text>
        </View>
        <View style={[styles.itemRow, styles.divider]}>
          <Text style={[styles.total, styles.flex]}>Total</Text>
          <Text style={styles.total}>{formatMoney(invoice.total)}</Text>
        </View>
        {invoice.notes ? <Text style={styles.muted}>Notes: {invoice.notes}</Text> : null}
      </Card>

      {busy && busy !== 'pdf' && <ActivityIndicator color={C.accent} />}

      {open && !declining && (
        <View style={styles.actions}>
          {invoice.status === 'sent' && (
            <Button label="Approve" icon={OwnerIcons.check} disabled={!!busy} onPress={() => act('approved')} />
          )}
          <Button label="Mark as Paid" icon={OwnerIcons.money} disabled={!!busy} onPress={() => setConfirmPaid(true)} />
          <Pressable onPress={() => setDeclining(true)} accessibilityRole="button" style={styles.declineLink}>
            <Text style={styles.declineText}>Decline…</Text>
          </Pressable>
        </View>
      )}

      {declining && (
        <Card title="Decline invoice">
          <FormField label="Reason (the contractor will see this)">
            <TextField
              value={reason}
              onChangeText={setReason}
              placeholder="e.g. Hours on 5 Oct don't match the roster"
              multiline
              accessibilityLabel="Decline reason"
            />
          </FormField>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Button label="Cancel" variant="secondary" onPress={() => setDeclining(false)} />
            </View>
            <View style={styles.flex}>
              <Button label="Decline" disabled={!reason.trim() || !!busy} onPress={() => act('declined', reason)} />
            </View>
          </View>
        </Card>
      )}

      <Button
        label={busy === 'pdf' ? 'Making PDF…' : 'Download PDF'}
        variant="secondary"
        icon={OwnerIcons.download}
        disabled={!!busy}
        onPress={download}
      />

      <ConfirmDialog
        visible={confirmPaid}
        title={`Mark ${invoice.number} (${formatMoney(invoice.total)}) as paid? Today's date is saved as the paid date.`}
        confirmLabel="Mark as Paid"
        cancelLabel="Not yet"
        onConfirm={() => {
          setConfirmPaid(false);
          act('paid');
        }}
        onCancel={() => setConfirmPaid(false)}
      />
    </OwnerScreen>
  );
}

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <View>
      {rows.map(([label, value], i) => (
        <View key={label} style={[styles.itemRow, i > 0 && styles.divider]}>
          <Text style={[styles.muted, styles.flex]}>{label}</Text>
          <Text style={styles.value} selectable>
            {value}
          </Text>
        </View>
      ))}
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
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  muted: {
    color: C.textSecondary,
    fontSize: 13,
  },
  name: {
    color: C.text,
    fontSize: 18,
    fontWeight: '700',
  },
  value: {
    color: C.text,
    fontSize: 14,
    fontWeight: '600',
  },
  total: {
    color: C.text,
    fontSize: 17,
    fontWeight: '800',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  contactButtons: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  message: {
    padding: Spacing.three - 4,
    borderRadius: Radius.medium,
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
  },
  messageError: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
  },
  messageText: {
    color: C.text,
    fontSize: 14,
  },
  actions: {
    gap: Spacing.three - 4,
  },
  declineLink: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
  declineText: {
    color: C.danger,
    fontSize: 15,
    fontWeight: '600',
  },
});
