// The owner's view of one employee's super: their choice of fund, the fund
// details, the TFN and SMSF bank numbers (masked until "Reveal"), when the
// choice was received and actioned, and the history of earlier choices.
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Badge, Button, Card, OwnerIcons } from '@/components/owner/ui';
import { Colors as C, Spacing } from '@/constants/theme';
import {
  choiceText,
  loadSuperHistory,
  markChoiceActioned,
  revealSuperNumbers,
  revealTfn,
  superStatusOf,
  useEmployeeSuper,
  type SuperHistoryEntry,
} from '@/data/employee-super';
import type { Employee } from '@/data/employees';
import { formatAbn, formatBsb } from '@/lib/super-validation';

const TONE = { Complete: 'success', 'Missing details': 'warning', 'Needs stapled fund request': 'danger', 'Not needed': 'neutral' } as const;
/** Revealed numbers hide again after this long. */
const REVEAL_MS = 30_000;

const dateText = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const formatTfn = (d: string) => d.replace(/(\d{3})(?=\d)/g, '$1 ');

function Row({ label, value, action }: { label: string; value: string; action?: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value} selectable={false}>
        {value}
      </Text>
      {action}
    </View>
  );
}

export function EmployeeSuperCard({ employee }: { employee: Employee }) {
  const record = useEmployeeSuper().find((s) => s.employeeId === employee.id);
  const status = superStatusOf(employee, record);
  const [history, setHistory] = useState<SuperHistoryEntry[]>([]);
  const [shown, setShown] = useState<{ tfn?: string | null; bsb?: string | null; account?: string | null }>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadSuperHistory(employee.id).then(setHistory);
  }, [employee.id, record?.updatedAt]);
  // Hide anything revealed when leaving the screen.
  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);

  function hideLater() {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShown({}), REVEAL_MS);
  }

  async function reveal(what: 'tfn' | 'bank') {
    setError(null);
    try {
      if (what === 'tfn') setShown((s) => ({ ...s, tfn: null }));
      const value = what === 'tfn' ? { tfn: (await revealTfn(employee.id)) ?? '' } : await revealSuperNumbers(employee.id).then((n) => ({ bsb: n.bsb, account: n.accountNumber }));
      setShown((s) => ({ ...s, ...value }));
      hideLater();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t show that. Please try again.');
    }
  }

  async function action(done: boolean) {
    setBusy(true);
    setError(await markChoiceActioned(employee.id, done));
    setBusy(false);
  }

  if (status === 'Not needed') return null;

  const revealButton = (what: 'tfn' | 'bank', isShown: boolean) => (
    <Text
      onPress={() => (isShown ? setShown({}) : reveal(what))}
      accessibilityRole="button"
      accessibilityLabel={isShown ? 'Hide' : 'Reveal'}
      style={styles.link}
      suppressHighlighting>
      {isShown ? 'Hide' : 'Reveal'}
    </Text>
  );

  return (
    <Card title="Super" icon={OwnerIcons.wallet} right={<Badge label={status} tone={TONE[status]} />}>
      {!record ? (
        <Text style={styles.muted}>
          {employee.firstName || 'They'} haven&apos;t chosen a super fund yet. They can do it in the app under My Profile → Super
          details.
        </Text>
      ) : (
        <>
          <Row label="Paid into" value={choiceText(record.choice, record.fundName)} />
          {record.choice === 'unsure' && (
            <Text style={styles.warning}>
              Request their existing (&quot;stapled&quot;) super fund from the ATO: ATO Online services for business → Employee
              commencement → Request stapled super fund. Then mark it as actioned below.
            </Text>
          )}
          {(record.choice === 'own' || record.choice === 'smsf') && (
            <>
              <Row label="Fund ABN" value={record.fundAbn ? formatAbn(record.fundAbn) : '—'} />
              {record.choice === 'own' && (
                <>
                  <Row label="USI" value={record.usi ?? '—'} />
                  <Row label="Member number" value={record.memberNumber ?? '—'} />
                  <Row label="Account name" value={record.accountName ?? '—'} />
                </>
              )}
              {record.choice === 'smsf' && (
                <>
                  <Row label="ESA" value={record.esa ?? '—'} />
                  <Row label="Bank account name" value={record.smsfAccountName ?? '—'} />
                  <Row
                    label="BSB / account"
                    value={
                      shown.bsb !== undefined
                        ? `${shown.bsb ? formatBsb(shown.bsb) : '—'} / ${shown.account ?? '—'}`
                        : `•••${record.smsfBsbLast3 ?? ''} / •••${record.smsfAccountLast3 ?? ''}`
                    }
                    action={revealButton('bank', shown.bsb !== undefined)}
                  />
                </>
              )}
            </>
          )}
        </>
      )}

      <Row
        label="TFN"
        value={!employee.hasTfn ? 'Not given' : shown.tfn ? formatTfn(shown.tfn) : '••• ••• •••'}
        action={employee.hasTfn ? revealButton('tfn', !!shown.tfn) : undefined}
      />
      {(shown.tfn || shown.bsb !== undefined) && (
        <Text style={styles.muted}>Only use these for super and tax. They hide again in 30 seconds.</Text>
      )}

      {record && (
        <>
          <View style={styles.divider} />
          <Row label="Declaration ticked" value={dateText(record.declaredAt)} />
          <Row label="Choice received" value={dateText(record.choiceReceivedAt)} />
          <Row label="Choice actioned" value={record.choiceActionedAt ? dateText(record.choiceActionedAt) : 'Not yet'} />
          {record.choiceActionedAt ? (
            <Button label="Mark as not actioned" variant="secondary" onPress={() => action(false)} disabled={busy} />
          ) : (
            <Button label="Mark as actioned" icon={OwnerIcons.check} onPress={() => action(true)} disabled={busy} />
          )}
          <Text style={styles.muted}>
            &quot;Actioned&quot; means you&apos;ve set up their choice with the fund or your super provider. Keep these records for at least 5
            years; NexGain keeps them for you.
          </Text>
        </>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      {history.length > 0 && (
        <>
          <View style={styles.divider} />
          <Text style={styles.subTitle}>Earlier choices</Text>
          {history.map((h) => (
            <View key={h.id} style={styles.historyRow}>
              <Text style={styles.value}>{choiceText(h.choice, h.fundName)}</Text>
              <Text style={styles.muted}>
                Received {dateText(h.choiceReceivedAt)} · Actioned {dateText(h.choiceActionedAt)} · Replaced {dateText(h.replacedAt)}
              </Text>
            </View>
          ))}
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 32,
  },
  label: {
    width: 130,
    color: C.textSecondary,
    fontSize: 13,
  },
  value: {
    flex: 1,
    color: C.text,
    fontSize: 14,
    fontWeight: '600',
  },
  link: {
    color: C.accent,
    fontSize: 14,
    fontWeight: '700',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.one,
  },
  muted: {
    color: C.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  warning: {
    color: C.warning,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  error: {
    color: C.danger,
    fontSize: 13,
  },
  divider: {
    height: 1,
    backgroundColor: C.border,
  },
  subTitle: {
    color: C.text,
    fontSize: 14,
    fontWeight: '700',
  },
  historyRow: {
    gap: 2,
  },
});
