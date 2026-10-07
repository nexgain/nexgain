import { useState } from 'react';
import { Redirect, router, Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { downloadContractorInvoice } from '@/components/contractor-invoice-pdf';
import { InvoiceStatusPill } from '@/components/employee/invoice-ui';
import { Card, Icon } from '@/components/employee/ui';
import { useNativePicker } from '@/components/pickers/use-native-picker';
import { EmployeeColors as C } from '@/constants/employee-theme';
import { Radius, Spacing } from '@/constants/theme';
import { useBusiness } from '@/data/business';
import { addDaysKey, todayKey } from '@/data/business-time';
import { useClockSessions } from '@/data/clock-records';
import {
  deleteDraftInvoice,
  invoiceTotals,
  lineAmount,
  linesFromClockedHours,
  linesFromCompletedJobs,
  loadInvoiceBank,
  saveDraftInvoice,
  sendInvoice,
  useContractorInvoices,
  type ContractorInvoice,
  type NewLine,
} from '@/data/contractor-invoices';
import { useCurrentEmployee } from '@/data/current-employee';
import { formatShortDate } from '@/data/employee-roster';
import { formatCurrency as money } from '@/data/employee-payslips';
import { employeeFullName, formatAbn, isContractor, type Employee } from '@/data/employees';
import { useJobs } from '@/data/jobs';
import { fromDateKey, toDateKey } from '@/data/shifts';

const PICKER_THEME = { sheet: C.card, border: C.border, text: C.text, muted: C.textSecondary, accent: C.primary, dark: false };

type EditLine = { key: string; description: string; quantity: string; rate: string };

let lineKey = 0;
const toEditLine = (l: NewLine): EditLine => ({
  key: `l${(lineKey += 1)}`,
  description: l.description,
  quantity: l.quantity ? String(l.quantity) : '',
  rate: l.rate ? String(l.rate) : '',
});
const num = (text: string) => {
  const n = Number(text.replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

// A contractor's invoice: editable while Draft (or Declined, to fix and re-send);
// read-only once sent, with a PDF download.
export default function ContractorInvoiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useCurrentEmployee();
  const invoice = useContractorInvoices().find((i) => i.id === id);

  if (me && !isContractor(me)) return <Redirect href="/home" />;
  if (!invoice || !me) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <Stack.Screen options={{ title: 'Invoice' }} />
        {invoice === undefined && me ? <Text style={styles.muted}>This invoice couldn&apos;t be found.</Text> : <ActivityIndicator color={C.primary} />}
      </View>
    );
  }
  const editable = invoice.status === 'draft' || invoice.status === 'declined';
  return editable ? <Editor key={invoice.id} invoice={invoice} me={me} /> : <ReadOnly invoice={invoice} />;
}

// ---------------------------------------------------------------------------
// Editing a draft
// ---------------------------------------------------------------------------

function Editor({ invoice, me }: { invoice: ContractorInvoice; me: Employee }) {
  const insets = useSafeAreaInsets();
  const business = useBusiness();
  const [invoiceDate, setInvoiceDate] = useState(invoice.invoiceDate);
  const [dueDate, setDueDate] = useState<string | null>(invoice.dueDate);
  const [notes, setNotes] = useState(invoice.notes);
  const [lines, setLines] = useState<EditLine[]>(() =>
    invoice.items.length ? invoice.items.map(toEditLine) : [toEditLine({ description: '', quantity: 0, rate: 0 })],
  );
  const [busy, setBusy] = useState<'save' | 'send' | 'delete' | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Filled in from the contractor's profile (what they entered at sign-up).
  const missing = [
    !employeeFullName(me) && 'name',
    !me.phone && 'phone number',
    !me.email && 'email',
    !me.abn && 'ABN',
    !me.bankAccount && 'bank details',
  ].filter(Boolean) as string[];

  const items = lines.map((l) => ({ description: l.description, quantity: num(l.quantity), rate: num(l.rate) }));
  const totals = invoiceTotals(items, me.gstRegistered);
  const hasLines = items.some((i) => lineAmount(i) > 0);
  const dueError = dueDate && dueDate < invoiceDate ? 'The due date can’t be before the invoice date.' : null;

  const update = (key: string, changes: Partial<EditLine>) => {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...changes } : l)));
    setMessage(null);
  };

  const draft = () => ({
    invoiceDate,
    dueDate,
    notes,
    items: items.map((i, idx) => ({ id: lines[idx].key, ...i })),
  });

  async function save() {
    setBusy('save');
    setMessage(null);
    try {
      await saveDraftInvoice(invoice.id, draft());
      setMessage({ tone: 'ok', text: 'Draft saved.' });
    } catch {
      setMessage({ tone: 'error', text: 'Couldn’t save. Check your internet connection and try again.' });
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    if (missing.length || !hasLines || dueError) return;
    setBusy('send');
    setMessage(null);
    try {
      await saveDraftInvoice(invoice.id, draft());
      await sendInvoice(invoice.id);
      setMessage({ tone: 'ok', text: `Sent to ${business?.businessName ?? 'your boss'}.` });
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error && e.message ? e.message : 'Couldn’t send. Please try again.' });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy('delete');
    try {
      await deleteDraftInvoice(invoice.id);
      router.back();
    } catch {
      setBusy(null);
      setMessage({ tone: 'error', text: 'Couldn’t delete the draft. Please try again.' });
    }
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: invoice.number }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.statusRow}>
          <InvoiceStatusPill status={invoice.status} />
          <Text style={styles.muted}>{me.gstRegistered ? 'Tax invoice · GST registered' : 'Not registered for GST'}</Text>
        </View>

        {invoice.status === 'declined' && invoice.declineReason && (
          <View style={[styles.banner, styles.bannerError]}>
            <Text style={styles.bannerTitle}>Declined by your boss</Text>
            <Text style={styles.bannerText}>{invoice.declineReason}</Text>
            <Text style={styles.bannerText}>Fix it below and send it again.</Text>
          </View>
        )}

        {missing.length > 0 && (
          <View style={[styles.banner, styles.bannerWarn]}>
            <Text style={styles.bannerTitle}>Some of your details are missing</Text>
            <Text style={styles.bannerText}>Add your {missing.join(', ')} before you can send this invoice.</Text>
            <Pressable onPress={() => router.push('/profile')} accessibilityRole="link" hitSlop={6}>
              <Text style={styles.link}>Go to My Profile</Text>
            </Pressable>
          </View>
        )}

        <Card style={styles.cardPad}>
          <View style={styles.parties}>
            <View style={styles.flex}>
              <Text style={styles.label}>From</Text>
              <Text style={styles.strong}>{employeeFullName(me) || '—'}</Text>
              <Text style={styles.detail}>{me.abn ? `ABN ${formatAbn(me.abn)}` : 'ABN missing'}</Text>
              <Text style={styles.detail}>{me.phone || 'Phone missing'}</Text>
              <Text style={styles.detail}>{me.email || 'Email missing'}</Text>
              <Text style={styles.detail}>
                {me.bankAccount ? `Paid to account ending ${me.bankAccount.accountNumber}` : 'Bank details missing'}
              </Text>
            </View>
            <View style={styles.flex}>
              <Text style={styles.label}>Bill to</Text>
              <Text style={styles.strong}>{business?.businessName ?? '—'}</Text>
            </View>
          </View>
        </Card>

        <View style={styles.dates}>
          <DateChip label="Invoice date" value={invoiceDate} onChange={setInvoiceDate} />
          <DateChip label="Due date" value={dueDate ?? addDaysKey(invoiceDate, 14)} onChange={setDueDate} />
        </View>
        {dueError && <Text style={styles.error}>{dueError}</Text>}

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Line items</Text>
          <Pressable onPress={() => setImportOpen(true)} accessibilityRole="button" hitSlop={6} style={styles.importButton}>
            <Icon name={{ ios: 'clock.arrow.circlepath', android: 'history', web: 'history' }} color={C.primary} size={16} />
            <Text style={styles.link}>Add hours or jobs</Text>
          </Pressable>
        </View>
        {lines.map((l, idx) => (
          <Card key={l.key} style={styles.lineCard}>
            <TextInput
              value={l.description}
              onChangeText={(description) => update(l.key, { description })}
              placeholder="Description, e.g. House wash – 12 Smith St"
              placeholderTextColor={C.textMuted}
              accessibilityLabel={`Line ${idx + 1} description`}
              style={styles.input}
              multiline
            />
            <View style={styles.lineRow}>
              <View style={styles.flex}>
                <Text style={styles.smallLabel}>Qty / hours</Text>
                <TextInput
                  value={l.quantity}
                  onChangeText={(quantity) => update(l.key, { quantity })}
                  placeholder="1"
                  keyboardType="decimal-pad"
                  placeholderTextColor={C.textMuted}
                  accessibilityLabel={`Line ${idx + 1} quantity`}
                  style={styles.input}
                />
              </View>
              <View style={styles.flex}>
                <Text style={styles.smallLabel}>Rate ($)</Text>
                <TextInput
                  value={l.rate}
                  onChangeText={(rate) => update(l.key, { rate })}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  placeholderTextColor={C.textMuted}
                  accessibilityLabel={`Line ${idx + 1} rate`}
                  style={styles.input}
                />
              </View>
              <View style={styles.lineTotal}>
                <Text style={styles.smallLabel}>Total</Text>
                <Text style={styles.lineTotalText}>{money(lineAmount(items[idx]))}</Text>
              </View>
            </View>
            {lines.length > 1 && (
              <Pressable
                onPress={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                accessibilityRole="button"
                accessibilityLabel={`Remove line ${idx + 1}`}
                hitSlop={6}>
                <Text style={styles.remove}>Remove line</Text>
              </Pressable>
            )}
          </Card>
        ))}
        <Pressable
          onPress={() => setLines((ls) => [...ls, toEditLine({ description: '', quantity: 0, rate: 0 })])}
          accessibilityRole="button"
          style={styles.addLine}>
          <Icon name={{ ios: 'plus', android: 'add', web: 'add' }} color={C.primary} size={16} />
          <Text style={styles.link}>Add line</Text>
        </Pressable>

        <Text style={styles.sectionTitle}>Notes (optional)</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Anything your boss should know"
          placeholderTextColor={C.textMuted}
          multiline
          accessibilityLabel="Invoice notes"
          style={[styles.input, styles.notes]}
        />

        <Totals subtotal={totals.subtotal} gst={totals.gst} total={totals.total} gstRegistered={me.gstRegistered} />

        {message && (
          <View style={[styles.banner, message.tone === 'error' ? styles.bannerError : styles.bannerOk]} accessibilityRole="alert">
            <Text style={styles.bannerText}>{message.text}</Text>
          </View>
        )}

        {invoice.status === 'draft' &&
          (confirmDelete ? (
            <View style={styles.confirm}>
              <Text style={styles.bannerText}>Delete this draft?</Text>
              <Pressable onPress={remove} accessibilityRole="button" disabled={!!busy}>
                <Text style={styles.remove}>{busy === 'delete' ? 'Deleting…' : 'Yes, delete'}</Text>
              </Pressable>
              <Pressable onPress={() => setConfirmDelete(false)} accessibilityRole="button">
                <Text style={styles.link}>Keep</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={() => setConfirmDelete(true)} accessibilityRole="button" style={styles.deleteRow}>
              <Text style={styles.remove}>Delete draft</Text>
            </Pressable>
          ))}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.three }]}>
        <Pressable
          onPress={save}
          disabled={!!busy}
          accessibilityRole="button"
          style={({ pressed }) => [styles.footerButton, styles.secondary, pressed && styles.pressed]}>
          <Text style={styles.secondaryText}>{busy === 'save' ? 'Saving…' : 'Save Draft'}</Text>
        </Pressable>
        <Pressable
          onPress={send}
          disabled={!!busy || missing.length > 0 || !hasLines || !!dueError}
          accessibilityRole="button"
          accessibilityLabel="Send to owner"
          style={({ pressed }) => [
            styles.footerButton,
            styles.primary,
            (missing.length > 0 || !hasLines || !!dueError) && styles.disabled,
            pressed && styles.pressed,
          ]}>
          {busy === 'send' ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Send</Text>}
        </Pressable>
      </View>

      <ImportSheet
        visible={importOpen}
        me={me}
        onClose={() => setImportOpen(false)}
        onAdd={(newLines) => {
          setLines((ls) => [...ls.filter((l) => l.description.trim() || l.quantity || l.rate), ...newLines.map(toEditLine)]);
          setImportOpen(false);
        }}
      />
    </View>
  );
}

function DateChip({ label, value, onChange }: { label: string; value: string; onChange: (key: string) => void }) {
  const picker = useNativePicker({
    mode: 'date',
    value: fromDateKey(value),
    onChange: (d) => onChange(toDateKey(d)),
    title: label,
    theme: PICKER_THEME,
  });
  return (
    <View style={styles.flex}>
      <Text style={styles.smallLabel}>{label}</Text>
      <Pressable onPress={picker.open} accessibilityRole="button" accessibilityLabel={label} style={styles.dateChip}>
        <Icon name={{ ios: 'calendar', android: 'calendar_month', web: 'calendar_month' }} color={C.primary} size={14} />
        <Text style={styles.dateText}>{formatShortDate(fromDateKey(value))}</Text>
      </Pressable>
      {picker.element}
    </View>
  );
}

/** Pull clocked hours or completed jobs for a date range into the invoice. */
function ImportSheet({
  visible,
  me,
  onClose,
  onAdd,
}: {
  visible: boolean;
  me: Employee;
  onClose: () => void;
  onAdd: (lines: NewLine[]) => void;
}) {
  const insets = useSafeAreaInsets();
  const sessions = useClockSessions();
  const jobs = useJobs();
  const today = todayKey();
  const [from, setFrom] = useState(addDaysKey(today, -((fromDateKey(today).getDay() + 6) % 7)));
  const [to, setTo] = useState(today);
  const [source, setSource] = useState<'hours' | 'jobs'>('hours');
  const rate = me.payType === 'hourly' && me.payRate ? me.payRate : 0;
  const preview =
    source === 'hours' ? linesFromClockedHours(sessions, me.id, from, to, rate) : linesFromCompletedJobs(jobs, from, to, rate);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.three }]}>
        <Text style={styles.sheetTitle}>Add hours or jobs</Text>
        <View style={styles.toggle}>
          {(['hours', 'jobs'] as const).map((s) => (
            <Pressable
              key={s}
              onPress={() => setSource(s)}
              accessibilityRole="tab"
              accessibilityState={{ selected: source === s }}
              style={[styles.toggleTab, source === s && styles.toggleTabSelected]}>
              <Text style={[styles.toggleText, source === s && styles.toggleTextSelected]}>
                {s === 'hours' ? 'Clocked hours' : 'Completed jobs'}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.dates}>
          <DateChip label="From" value={from} onChange={setFrom} />
          <DateChip label="To" value={to} onChange={setTo} />
        </View>
        <Text style={styles.muted}>
          {preview.length === 0
            ? source === 'hours'
              ? 'No clocked hours in these dates.'
              : 'No completed jobs in these dates.'
            : `${preview.length} line${preview.length === 1 ? '' : 's'} · ${preview.reduce((s, l) => s + l.quantity, 0).toFixed(2)} hrs${
                rate ? ` at ${money(rate)}/hr` : ' (enter your rate after adding)'
              }`}
        </Text>
        <Pressable
          onPress={() => onAdd(preview)}
          disabled={preview.length === 0}
          accessibilityRole="button"
          style={({ pressed }) => [styles.footerButton, styles.primary, preview.length === 0 && styles.disabled, pressed && styles.pressed]}>
          <Text style={styles.primaryText}>Add to invoice</Text>
        </Pressable>
        <Text style={styles.muted}>You can edit or remove any line afterwards.</Text>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Sent / approved / paid: read-only, with PDF download
// ---------------------------------------------------------------------------

function ReadOnly({ invoice }: { invoice: ContractorInvoice }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const d = invoice.sentDetails;

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const bank = await loadInvoiceBank(invoice.id).catch(() => null);
      await downloadContractorInvoice(invoice, bank);
    } catch {
      setError('Sorry, the PDF couldn’t be made. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{
          title: invoice.number,
          headerRight: () =>
            busy ? (
              <ActivityIndicator color={C.primary} />
            ) : (
              <Pressable onPress={download} accessibilityRole="button" accessibilityLabel="Download invoice PDF" hitSlop={10}>
                <Icon name={{ ios: 'arrow.down.circle', android: 'download', web: 'download' }} color={C.primary} size={24} />
              </Pressable>
            ),
        }}
      />
      <View style={styles.statusRow}>
        <InvoiceStatusPill status={invoice.status} />
        <Text style={styles.muted}>
          {invoice.status === 'paid' && invoice.paidAt
            ? `Paid ${formatShortDate(new Date(invoice.paidAt))}`
            : invoice.sentAt
              ? `Sent ${formatShortDate(new Date(invoice.sentAt))}`
              : ''}
        </Text>
      </View>
      {error && (
        <View style={[styles.banner, styles.bannerError]}>
          <Text style={styles.bannerText}>{error}</Text>
        </View>
      )}

      <Card style={styles.cardPad}>
        <View style={styles.parties}>
          <View style={styles.flex}>
            <Text style={styles.label}>From</Text>
            <Text style={styles.strong}>{d?.name}</Text>
            {d?.abn ? <Text style={styles.detail}>ABN {formatAbn(d.abn)}</Text> : null}
            <Text style={styles.detail}>{d?.phone}</Text>
            <Text style={styles.detail}>{d?.email}</Text>
            <Text style={styles.detail}>Paid to account ending {invoice.bankLast4 ?? '—'}</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.label}>Bill to</Text>
            <Text style={styles.strong}>{d?.billTo}</Text>
            <Text style={[styles.label, styles.gapTop]}>Invoice date</Text>
            <Text style={styles.detail}>{formatShortDate(fromDateKey(invoice.invoiceDate))}</Text>
            <Text style={[styles.label, styles.gapTop]}>Due date</Text>
            <Text style={styles.detail}>{invoice.dueDate ? formatShortDate(fromDateKey(invoice.dueDate)) : '—'}</Text>
          </View>
        </View>
      </Card>

      <Text style={styles.sectionTitle}>Line items</Text>
      <Card style={styles.cardPad}>
        {invoice.items.map((i, idx) => (
          <View key={i.id} style={[styles.itemRow, idx > 0 && styles.divider]}>
            <View style={styles.flex}>
              <Text style={styles.strongSmall}>{i.description || '—'}</Text>
              <Text style={styles.detail}>
                {i.quantity} × {money(i.rate)}
              </Text>
            </View>
            <Text style={styles.strongSmall}>{money(i.amount)}</Text>
          </View>
        ))}
      </Card>
      {invoice.notes ? (
        <>
          <Text style={styles.sectionTitle}>Notes</Text>
          <Text style={styles.detail}>{invoice.notes}</Text>
        </>
      ) : null}
      <Totals subtotal={invoice.subtotal} gst={invoice.gst} total={invoice.total} gstRegistered={invoice.gstRegistered} />
      <Pressable
        onPress={download}
        disabled={busy}
        accessibilityRole="button"
        style={({ pressed }) => [styles.footerButton, styles.secondary, pressed && styles.pressed]}>
        <Text style={styles.secondaryText}>{busy ? 'Making PDF…' : 'Download / Share PDF'}</Text>
      </Pressable>
    </ScrollView>
  );
}

function Totals({ subtotal, gst, total, gstRegistered }: { subtotal: number; gst: number; total: number; gstRegistered: boolean }) {
  return (
    <Card style={styles.cardPad}>
      <View style={styles.totalRow}>
        <Text style={styles.detail}>Subtotal</Text>
        <Text style={styles.strongSmall}>{money(subtotal)}</Text>
      </View>
      <View style={styles.totalRow}>
        <Text style={styles.detail}>{gstRegistered ? 'GST (10%)' : 'GST (not registered)'}</Text>
        <Text style={styles.strongSmall}>{money(gst)}</Text>
      </View>
      <View style={[styles.totalRow, styles.divider, styles.grand]}>
        <Text style={styles.strong}>Total</Text>
        <Text style={styles.grandValue}>{money(total)}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.background,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: Spacing.four - 4,
    gap: Spacing.three,
    paddingBottom: Spacing.five,
  },
  flex: {
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
  },
  muted: {
    color: C.textSecondary,
    fontSize: 13,
  },
  error: {
    color: C.danger,
    fontSize: 13,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  banner: {
    gap: 4,
    padding: Spacing.three - 2,
    borderRadius: Radius.medium,
    borderWidth: 1,
  },
  bannerWarn: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FCD34D',
  },
  bannerError: {
    backgroundColor: C.dangerSoft,
    borderColor: '#FCA5A5',
  },
  bannerOk: {
    backgroundColor: C.successSoft,
    borderColor: '#86EFAC',
  },
  bannerTitle: {
    color: C.text,
    fontSize: 15,
    fontWeight: '700',
  },
  bannerText: {
    color: C.text,
    fontSize: 14,
    lineHeight: 20,
  },
  link: {
    color: C.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  cardPad: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  parties: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  label: {
    color: C.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  gapTop: {
    marginTop: Spacing.two,
  },
  strong: {
    color: C.text,
    fontSize: 16,
    fontWeight: '700',
  },
  strongSmall: {
    color: C.text,
    fontSize: 15,
    fontWeight: '600',
  },
  detail: {
    color: C.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  dates: {
    flexDirection: 'row',
    gap: Spacing.three - 4,
  },
  dateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.three - 4,
    borderRadius: Radius.medium - 2,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
  },
  dateText: {
    color: C.text,
    fontSize: 15,
    fontWeight: '600',
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: C.text,
    fontSize: 16,
    fontWeight: '700',
  },
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  lineCard: {
    padding: Spacing.three - 2,
    gap: Spacing.two,
  },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
  },
  smallLabel: {
    color: C.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  input: {
    marginTop: 4,
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.three - 4,
    borderRadius: Radius.medium - 2,
    borderWidth: 1,
    borderColor: C.border,
    color: C.text,
    fontSize: 15,
    backgroundColor: C.card,
  },
  notes: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  lineTotal: {
    width: 96,
    alignItems: 'flex-end',
    paddingBottom: Spacing.two + 2,
  },
  lineTotalText: {
    color: C.text,
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    marginTop: 4,
  },
  remove: {
    color: C.danger,
    fontSize: 14,
    fontWeight: '600',
  },
  addLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing.three - 4,
    borderRadius: Radius.medium,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: C.border,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  grand: {
    paddingTop: Spacing.two,
  },
  grandValue: {
    color: C.text,
    fontSize: 20,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  confirm: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  deleteRow: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
  footer: {
    flexDirection: 'row',
    gap: Spacing.three - 4,
    paddingHorizontal: Spacing.four - 4,
    paddingTop: Spacing.three,
    backgroundColor: C.card,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  footerButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    borderRadius: Radius.medium,
  },
  primary: {
    backgroundColor: C.primary,
  },
  primaryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondary: {
    borderWidth: 1.5,
    borderColor: C.primary,
    backgroundColor: C.card,
  },
  secondaryText: {
    color: C.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.45,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
  },
  sheet: {
    gap: Spacing.three,
    padding: Spacing.four - 4,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: C.background,
  },
  sheetTitle: {
    color: C.text,
    fontSize: 18,
    fontWeight: '700',
  },
  toggle: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: Radius.medium,
    backgroundColor: '#E9EDF3',
  },
  toggleTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.two + 2,
    borderRadius: Radius.medium - 3,
  },
  toggleTabSelected: {
    backgroundColor: C.card,
  },
  toggleText: {
    color: C.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  toggleTextSelected: {
    color: C.primary,
  },
});
