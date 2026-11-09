import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { DateField, FormField } from '@/components/owner/form';
import { ScreenHeader } from '@/components/owner/invoices-ui';
import { Button, Card, goBack, Icon, OwnerIcons, OwnerScreen } from '@/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { isBankConnected, transactionItems, useBankAccounts, useBankConnection, useBankTransactions } from '@/data/bank';
import { useBusiness } from '@/data/business';
import { useEmployees } from '@/data/employees';
import { useExpenses } from '@/data/finance';
import { useDocs } from '@/data/invoices';
import { usePayslipRecords } from '@/data/payroll';
import { useReceipts } from '@/data/receipts';
import { buildRows, exportForAccountant, rangeText, type ExportRange } from '@/lib/accountant-export';

type Choice = { id: string; label: string; range: ExportRange };

/** Last financial year (1 July – 30 June in Australia), this financial year, last quarter, last month. */
function quickRanges(fyStartMonth: number, now = new Date()): Choice[] {
  const m = fyStartMonth - 1;
  const fyYear = now.getMonth() >= m ? now.getFullYear() : now.getFullYear() - 1;
  const fy = (start: number) => {
    const s = new Date(start, m, 1);
    const e = new Date(start + 1, m, 1);
    const short = (d: Date) => `${d.getFullYear()}`.slice(2);
    return { start: s, end: e, label: `FY ${s.getFullYear()}-${short(new Date(start + 1, 0, 1))}` };
  };
  const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 - 3, 1);
  const quarterEnd = new Date(quarterStart.getFullYear(), quarterStart.getMonth() + 3, 1);
  const monthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthName = monthStart.toLocaleDateString([], { month: 'long', year: 'numeric' });
  return [
    { id: 'last-fy', label: 'Last financial year', range: fy(fyYear - 1) },
    { id: 'this-fy', label: 'This financial year (so far)', range: fy(fyYear) },
    { id: 'last-quarter', label: 'Last quarter (for BAS)', range: { start: quarterStart, end: quarterEnd, label: 'Last quarter' } },
    { id: 'last-month', label: 'Last month', range: { start: monthStart, end: monthEnd, label: monthName } },
  ];
}

// Export for my accountant: pick a period, then NexGain makes a PDF report, a
// spreadsheet and a zip of the receipts, and opens an email with them attached.
export default function AccountantExportScreen() {
  const business = useBusiness();
  const accounts = useBankAccounts();
  const txns = useBankTransactions();
  const expenses = useExpenses();
  const receipts = useReceipts();
  const payslips = usePayslipRecords();
  const employees = useEmployees();
  const docs = useDocs();
  const bankConnected = isBankConnected(useBankConnection());

  const choices = quickRanges(business?.financialYearStartMonth ?? 7);
  const [choiceId, setChoiceId] = useState<string>('last-fy');
  const today = new Date();
  const [customStart, setCustomStart] = useState(new Date(today.getFullYear(), today.getMonth() - 1, 1));
  const [customEnd, setCustomEnd] = useState(today);
  const [progress, setProgress] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const range: ExportRange =
    choiceId === 'custom'
      ? {
          start: new Date(customStart.getFullYear(), customStart.getMonth(), customStart.getDate()),
          end: new Date(customEnd.getFullYear(), customEnd.getMonth(), customEnd.getDate() + 1),
          label: 'Custom dates',
        }
      : (choices.find((c) => c.id === choiceId) ?? choices[0]).range;

  const input = { range, business, items: transactionItems(txns, accounts, expenses), receipts, payslips, employees, docs, bankConnected };
  const { rows, files } = buildRows(input);
  const count = (type: string) => rows.filter((r) => r.type === type).length;
  const missing = rows.filter((r) => r.receipt === 'Missing').length;
  const validRange = range.end > range.start;

  async function run() {
    setMessage(null);
    setProgress('Getting started…');
    try {
      const how = await exportForAccountant(input, setProgress);
      setMessage({
        tone: 'ok',
        text:
          how === 'email'
            ? 'Your email is ready with the report, spreadsheet and receipts attached. Add your accountant’s address and send.'
            : 'Choose where to send it (e.g. Gmail, Outlook or Google Drive). Everything is in one zip file.',
      });
    } catch {
      setMessage({ tone: 'error', text: 'Couldn’t make the export. Check your internet connection and try again.' });
    } finally {
      setProgress(null);
    }
  }

  return (
    <OwnerScreen>
      <ScreenHeader title="Export for my accountant" onBack={() => goBack('/transactions')} />
      <Text style={styles.muted}>
        Makes a PDF report and a spreadsheet of your income, expenses (with categories and GST) and wages, plus a zip of all
        your receipts named by date and supplier. Then you can email them straight from your phone.
      </Text>

      <Card title="Period" icon={OwnerIcons.calendar}>
        <View>
          {[...choices, { id: 'custom', label: 'Choose dates', range }].map((c, i) => {
            const selected = c.id === choiceId;
            return (
              <Pressable
                key={c.id}
                onPress={() => setChoiceId(c.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={({ pressed }) => [styles.option, i > 0 && styles.divider, pressed && styles.pressed]}>
                <View style={styles.flex}>
                  <Text style={[styles.optionText, selected && styles.optionSelected]}>{c.label}</Text>
                  {c.id !== 'custom' && <Text style={styles.muted}>{rangeText(c.range)}</Text>}
                </View>
                {selected ? (
                  <Icon name={OwnerIcons.check} color={C.accent} size={20} />
                ) : (
                  <View style={styles.radio} />
                )}
              </Pressable>
            );
          })}
        </View>
        {choiceId === 'custom' && (
          <View style={styles.row}>
            <FormField label="From" style={styles.flex}>
              <DateField label="From" value={customStart} onChange={setCustomStart} />
            </FormField>
            <FormField label="To" style={styles.flex}>
              <DateField label="To" value={customEnd} onChange={setCustomEnd} />
            </FormField>
          </View>
        )}
      </Card>

      <Card title="What’s included" icon={OwnerIcons.receipt}>
        <Summary label="Income" value={count('Income')} />
        <Summary label="Expenses" value={count('Expense')} />
        <Summary label="Wages" value={count('Wages')} />
        <Summary label="Receipt photos" value={files.length} />
        {missing > 0 && (
          <View style={styles.warn}>
            <Icon name={{ ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' }} color={C.warning} size={16} />
            <Text style={[styles.muted, styles.flex]}>
              {missing} expense{missing === 1 ? '' : 's'} over $82.50 {missing === 1 ? 'has' : 'have'} no receipt. You can still
              export; they’re marked “Missing” in the report.
            </Text>
          </View>
        )}
      </Card>

      {message && (
        <Text accessibilityRole={message.tone === 'error' ? 'alert' : undefined} style={message.tone === 'error' ? styles.error : styles.ok}>
          {message.text}
        </Text>
      )}

      {progress ? (
        <View style={styles.progress}>
          <ActivityIndicator color={C.accent} />
          <Text style={styles.progressText}>{progress}</Text>
        </View>
      ) : (
        <Button
          label="Create and share"
          icon={{ ios: 'square.and.arrow.up', android: 'share', web: 'share' }}
          onPress={run}
          disabled={!validRange || rows.length === 0}
        />
      )}
      {!validRange && <Text style={styles.error}>The “To” date must be after the “From” date.</Text>}
      {validRange && rows.length === 0 && <Text style={styles.muted}>Nothing to export in this period.</Text>}
    </OwnerScreen>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.summary}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.three - 4,
  },
  muted: {
    color: C.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  error: {
    color: C.danger,
    fontSize: 13,
    fontWeight: '600',
  },
  ok: {
    color: C.success,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    minHeight: 56,
    paddingVertical: Spacing.two,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  optionText: {
    color: C.text,
    fontSize: 15,
    fontWeight: '600',
  },
  optionSelected: {
    color: C.accent,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: C.border,
  },
  summary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryLabel: {
    color: C.text,
    fontSize: 15,
  },
  summaryValue: {
    color: C.text,
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  warn: {
    flexDirection: 'row',
    gap: Spacing.two,
    padding: Spacing.three - 4,
    borderRadius: Radius.medium,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
  },
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    minHeight: 48,
  },
  progressText: {
    color: C.text,
    fontSize: 15,
    fontWeight: '600',
  },
});
