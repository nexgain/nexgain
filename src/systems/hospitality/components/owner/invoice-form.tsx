// NexGain Hospitality: the "Send as invoice" part of Record sale. The menu
// items and quantities come from the item list above it; this adds custom
// lines (e.g. "Room hire $200"), the customer, due date, deposit and a note,
// then saves the invoice (and sends it from the owner's own email).
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DateField, FormField, SwitchRow, TextField } from '@/components/owner/form';
import { Button, Card, Icon, OwnerIcons } from '@/components/owner/ui';
import { Colors as C, Spacing } from '@/constants/theme';
import { docTotals, gstLabel } from '@/data/invoices';
import { formatMoney } from '@/data/payroll';
import { router } from '@/lib/nav';
import { createInvoice, dayKey, invoiceGstRate, invoiceLine, sendInvoice, validateInvoice } from '@/systems/hospitality/data/invoices';
import type { MenuItem } from '@/systems/hospitality/data/menu';

import { MenuIcons } from './menu-ui';

type CustomLine = { key: number; description: string; amount: string; qty: string };

const parseMoney = (text: string) => {
  const t = text.replace(/[$,\s]/g, '');
  return t === '' ? null : Number(t);
};

export function InvoiceForm({ entries, onDone }: { entries: { item: MenuItem; quantity: number }[]; onDone: () => void }) {
  const today = new Date();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [business, setBusiness] = useState('');
  const [due, setDue] = useState(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7));
  const [depositText, setDepositText] = useState('');
  const [depositPaid, setDepositPaid] = useState(false);
  const [note, setNote] = useState('');
  const [custom, setCustom] = useState<CustomLine[]>([]);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gstRate = invoiceGstRate();
  const customValid = custom.filter((l) => l.description.trim() && (parseMoney(l.amount) ?? 0) > 0);
  const badCustom = custom.some((l) => (l.description.trim() || l.amount.trim()) && !customValid.includes(l));
  const lines = [
    ...entries.map((e) => invoiceLine(e.item.name, e.quantity, e.item.price, gstRate, e.item.id)),
    ...customValid.map((l) => invoiceLine(l.description, Math.max(1, Number(l.qty) || 1), parseMoney(l.amount)!, gstRate)),
  ];
  const { gst, total } = docTotals(lines, gstRate);
  const deposit = parseMoney(depositText);
  const owing = Math.round((total - (deposit && depositPaid ? deposit : 0)) * 100) / 100;
  const draft = {
    lines,
    client: { name, email, phone, address: '', business },
    dueDate: dayKey(due),
    deposit,
    depositPaid,
    note,
  };
  const problem = badCustom ? 'Each custom line needs a description and an amount.' : validateInvoice(draft);

  async function save(send: boolean) {
    setTried(true);
    if (problem) return;
    setBusy(true);
    setError(null);
    try {
      const id = createInvoice(draft);
      if (send) {
        const result = await sendInvoice(id);
        router.replace({ pathname: '/hospitality/invoice/[id]', params: { id, ...(result === 'ask' ? { askSent: '1' } : {}) } });
      } else {
        router.replace({ pathname: '/hospitality/invoice/[id]', params: { id } });
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The invoice wasn’t saved. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const setLine = (key: number, change: Partial<CustomLine>) => setCustom((all) => all.map((l) => (l.key === key ? { ...l, ...change } : l)));

  return (
    <>
      <Card title="Other lines" icon={MenuIcons.plus}>
        <Text style={styles.muted}>Anything not on the menu, e.g. Room hire $200. Amounts include GST.</Text>
        {custom.map((l) => (
          <View key={l.key} style={styles.lineRow}>
            <View style={styles.lineDesc}>
              <TextField value={l.description} onChangeText={(description) => setLine(l.key, { description })} placeholder="e.g. Room hire" accessibilityLabel="Line description" />
            </View>
            <View style={styles.lineQty}>
              <TextField value={l.qty} onChangeText={(qty) => setLine(l.key, { qty: qty.replace(/\D/g, '') })} placeholder="1" keyboardType="number-pad" accessibilityLabel="Quantity" />
            </View>
            <View style={styles.lineAmount}>
              <TextField value={l.amount} onChangeText={(amount) => setLine(l.key, { amount })} placeholder="$0.00" keyboardType="decimal-pad" accessibilityLabel="Amount each" />
            </View>
            <Pressable onPress={() => setCustom((all) => all.filter((x) => x.key !== l.key))} accessibilityRole="button" accessibilityLabel="Remove line" hitSlop={6} style={styles.remove}>
              <Icon name={{ ios: 'trash', android: 'delete', web: 'delete' }} color={C.textSecondary} size={16} />
            </Pressable>
          </View>
        ))}
        <Button label="Add a line" variant="secondary" icon={MenuIcons.plus} onPress={() => setCustom((all) => [...all, { key: Date.now(), description: '', amount: '', qty: '1' }])} />
      </Card>

      <Card title="Customer" icon={OwnerIcons.people}>
        <FormField label="Name" error={tried && !name.trim() ? 'Enter the customer’s name.' : undefined}>
          <TextField value={name} onChangeText={setName} placeholder="e.g. Sam Smith" autoCapitalize="words" accessibilityLabel="Customer name" />
        </FormField>
        <FormField label="Email" error={tried && problem?.includes('email') ? problem : undefined}>
          <TextField value={email} onChangeText={setEmail} placeholder="sam@example.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} accessibilityLabel="Customer email" />
        </FormField>
        <FormField label="Phone (optional)">
          <TextField value={phone} onChangeText={setPhone} placeholder="0412 345 678" keyboardType="phone-pad" accessibilityLabel="Customer phone" />
        </FormField>
        <FormField label="Business name (optional)">
          <TextField value={business} onChangeText={setBusiness} placeholder="e.g. Smith Co" autoCapitalize="words" accessibilityLabel="Customer business name" />
        </FormField>
      </Card>

      <Card title="Payment" icon={OwnerIcons.money}>
        <FormField label="Due date">
          <DateField label="Due date" value={due} onChange={setDue} />
        </FormField>
        <FormField label="Deposit (optional)" error={tried && problem?.includes('deposit') ? problem : undefined}>
          <TextField value={depositText} onChangeText={setDepositText} placeholder="$0.00" keyboardType="decimal-pad" accessibilityLabel="Deposit amount" />
        </FormField>
        {(deposit ?? 0) > 0 && <SwitchRow label="Deposit already paid" value={depositPaid} onChange={setDepositPaid} />}
        <FormField label="Note (optional)">
          <TextField value={note} onChangeText={setNote} placeholder="e.g. Function on Sat 6 Dec, 40 guests" multiline maxLength={500} accessibilityLabel="Note" />
        </FormField>

        <View style={styles.totals}>
          <Row label="Total" value={formatMoney(total)} bold />
          {gstRate > 0 && <Row label={`Includes ${gstLabel(gstRate)}`} value={formatMoney(gst)} />}
          {(deposit ?? 0) > 0 && <Row label={depositPaid ? 'Deposit paid' : 'Deposit (due now)'} value={formatMoney(deposit!)} />}
          {(deposit ?? 0) > 0 && depositPaid && <Row label="Amount owing" value={formatMoney(owing)} bold />}
        </View>

        {tried && problem && <Text style={styles.error}>{problem}</Text>}
        {error && (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        )}
        <Button label={busy ? 'Saving…' : 'Save & send invoice'} icon={{ ios: 'paperplane.fill', android: 'send', web: 'send' }} onPress={() => save(true)} disabled={busy} />
        <Button label="Save without sending" variant="secondary" onPress={() => save(false)} disabled={busy} />
        <Text style={styles.muted}>Sent from your own email, like your other emails. Invoice numbers (INV-0001…) are added automatically.</Text>
      </Card>
    </>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, bold && styles.bold]}>{label}</Text>
      <Text style={[styles.rowValue, bold && styles.bold]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  muted: { color: C.textSecondary, fontSize: 13, lineHeight: 18 },
  error: { color: C.danger, fontSize: 13, fontWeight: '600' },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  lineDesc: { flex: 3 },
  lineQty: { width: 56 },
  lineAmount: { flex: 2 },
  remove: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },
  totals: { gap: 4, paddingTop: Spacing.two, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  rowLabel: { color: C.textSecondary, fontSize: 14 },
  rowValue: { color: C.text, fontSize: 14, fontVariant: ['tabular-nums'] },
  bold: { color: C.text, fontSize: 17, fontWeight: '700' },
});
