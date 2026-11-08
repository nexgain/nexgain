import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Checkbox } from '@/components/owner/form';
import { Table, type Column } from '@/components/owner/table';
import { Badge, Button, Card, Icon, OwnerIcons, ownerStyles } from '@/components/owner/ui';
import { Colors as C, Spacing } from '@/constants/theme';
import { superRateOf, useBusiness } from '@/data/business';
import { formatShortDate } from '@/data/employee-roster';
import { employeeFullName, getsSuper, isContractor, missingSuperDetails, useEmployees, type Employee } from '@/data/employees';
import { usePayRuns, type PayRun } from '@/data/pay-runs';
import { formatMoney } from '@/data/payroll';
import { fromDateKey } from '@/data/shifts';
import {
  dueStateOf,
  SUPER_STATUS_LABEL,
  useSuperPayments,
  type DueState,
  type SuperPayment,
  type SuperStatus,
} from '@/data/super-payments';
import { payrollLabel } from '@/lib/payment-files';
import { paySuper } from '@/services/super-payments';

const STATUS_TONE: Record<SuperStatus, 'warning' | 'info' | 'success'> = {
  unpaid: 'warning',
  processing: 'info',
  paid: 'success',
};

const DUE_BADGE: Partial<Record<DueState, { label: string; tone: 'danger' | 'warning' }>> = {
  overdue: { label: 'Overdue', tone: 'danger' },
  soon: { label: 'Due soon', tone: 'warning' },
};

const dateText = (key: string) => formatShortDate(fromDateKey(key));

type Row = SuperPayment & { employee: Employee | null };

/**
 * Super for each pay run that still has some to pay. Approving payroll adds
 * everyone's super here as Unpaid; paying it is a separate step from wages.
 * The payment itself happens in services/super-payments.ts.
 */
export function SuperCard() {
  const business = useBusiness();
  const employees = useEmployees();
  const records = useSuperPayments();
  const runs = usePayRuns();
  // Ticked super records (by id).
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busyRunId, setBusyRunId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ runId: string; tone: 'info' | 'warn'; text: string } | null>(null);

  const ratePercent = `${Math.round(superRateOf(business) * 10000) / 100}%`;
  const withEmployee = (s: SuperPayment): Row => ({ ...s, employee: employees.find((e) => e.id === s.employeeId) ?? null });

  // Pay runs with any super still to pay, oldest due first.
  const open = runs
    .map((run) => ({ run, rows: records.filter((s) => s.payRunId === run.id).map(withEmployee) }))
    .filter((g) => g.rows.some((r) => r.status !== 'paid'))
    .sort((a, b) => a.run.payDate.localeCompare(b.run.payDate));

  const current = employees.filter((e) => e.status !== 'inactive');
  const missing = current.filter((e) => getsSuper(e) && missingSuperDetails(e).length > 0);
  const contractors = current.filter(isContractor);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }


  /** Pay Super (everyone unpaid in the run, or the ticked people). Not connected to a clearing house yet. */
  async function pay(run: PayRun, employeeIds?: string[]) {
    setBusyRunId(run.id);
    setMessage(null);
    const result = await paySuper(run.id, employeeIds);
    setBusyRunId(null);
    setMessage({ runId: run.id, tone: result.status === 'coming-soon' ? 'info' : 'warn', text: result.message });
  }

  return (
    <Card title="Super" icon={OwnerIcons.percent}>
      <Text style={ownerStyles.mutedText}>
        {ratePercent} of each employee&apos;s qualifying earnings, worked out when payroll is approved. Pay super separately
        from wages; it&apos;s due 7 business days after payday.
      </Text>

      {missing.length > 0 && (
        <View style={styles.warning}>
          <Icon name={OwnerIcons.info} color={C.warning} size={14} />
          <Text style={styles.warningText}>
            Missing super details: {missing.map(employeeFullName).join(', ')}. Ask them to add their super fund in their
            NexGain profile.
          </Text>
        </View>
      )}

      {open.length === 0 ? (
        <Text style={styles.allPaid}>
          {records.length === 0 ? 'No super yet. Approving payroll adds each person’s super here.' : 'All super is paid.'}
        </Text>
      ) : (
        open.map(({ run, rows }) => {
          const unpaid = rows.filter((r) => r.status === 'unpaid');
          const unpaidTotal = unpaid.reduce((sum, r) => sum + r.superAmount, 0);
          const total = rows.reduce((sum, r) => sum + r.superAmount, 0);
          const ticked = unpaid.filter((r) => selected.has(r.id));
          // Earliest due date of what's left to pay (all the same unless the pay date moved).
          const dueDate = rows.filter((r) => r.status !== 'paid').map((r) => r.dueDate).sort()[0];
          const due = unpaid.length > 0 ? DUE_BADGE[dueStateOf({ status: 'unpaid', dueDate })] : undefined;
          const busy = busyRunId === run.id;

          const columns: Column<Row>[] = [
            {
              key: 'select',
              label: '',
              width: 40,
              render: (r) =>
                r.status === 'unpaid' ? (
                  <Pressable
                    onPress={() => toggle(r.id)}
                    disabled={busyRunId !== null}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected.has(r.id) }}
                    accessibilityLabel={`Select ${r.employee ? employeeFullName(r.employee) : 'employee'}`}
                    hitSlop={8}>
                    <Checkbox checked={selected.has(r.id)} />
                  </Pressable>
                ) : null,
            },
            {
              key: 'name',
              label: 'Name',
              width: 150,
              render: (r) => (r.employee ? employeeFullName(r.employee) : 'Former employee'),
            },
            {
              key: 'qualifying',
              label: 'Qualifying Earnings',
              width: 120,
              align: 'right',
              render: (r) => formatMoney(r.qualifyingEarnings),
            },
            { key: 'super', label: 'Super', width: 90, align: 'right', render: (r) => formatMoney(r.superAmount) },
            {
              key: 'fund',
              label: 'Super Fund',
              width: 160,
              render: (r) =>
                r.employee && missingSuperDetails(r.employee).length > 0 ? (
                  <View style={styles.fundCell}>
                    {r.employee.superFund ? <Text style={styles.cellText}>{r.employee.superFund}</Text> : null}
                    <Badge label="Missing super details" tone="warning" />
                  </View>
                ) : (
                  (r.employee?.superFund ?? '—')
                ),
            },
            { key: 'due', label: 'Due Date', width: 100, render: (r) => dateText(r.dueDate) },
            {
              key: 'status',
              label: 'Status',
              width: 100,
              render: (r) => <Badge label={SUPER_STATUS_LABEL[r.status]} tone={STATUS_TONE[r.status]} />,
            },
          ];

          return (
            <View key={run.id} style={styles.run}>
              <View style={styles.runTop}>
                <View style={styles.flex}>
                  <Text style={styles.runTitle}>{payrollLabel(run.payrollNumber)}</Text>
                  <Text style={styles.runMeta}>
                    Payday {dateText(run.payDate)} · Due {dateText(dueDate)} · {formatMoney(unpaidTotal)} unpaid
                  </Text>
                </View>
                {due && <Badge label={due.label} tone={due.tone} />}
              </View>

              <Table
                columns={columns}
                rows={rows}
                rowKey={(r) => r.id}
                emptyMessage="No super in this pay run."
                footer={{ name: 'Total', super: formatMoney(total) }}
              />

              <View style={styles.buttons}>
                <Button
                  label={busy ? 'Working…' : `Pay Super · ${formatMoney(unpaidTotal)}`}
                  icon={OwnerIcons.check}
                  disabled={unpaid.length === 0 || busyRunId !== null}
                  onPress={() => pay(run)}
                />
                <Button
                  label={`Pay selected (${ticked.length})`}
                  variant="secondary"
                  disabled={ticked.length === 0 || busyRunId !== null}
                  onPress={() => pay(run, ticked.map((r) => r.employeeId))}
                />
              </View>

              {message?.runId === run.id && (
                <Text style={[styles.messageText, message.tone === 'warn' ? styles.warningText : styles.infoText]}>{message.text}</Text>
              )}
            </View>
          );
        })
      )}

      {/* Paid runs drop out of the list above, so show the last result here. */}
      {message && !open.some((g) => g.run.id === message.runId) && (
        <Text style={[styles.messageText, message.tone === 'warn' ? styles.warningText : styles.infoText]}>{message.text}</Text>
      )}

      {contractors.length > 0 && (
        <View style={styles.contractors}>
          {contractors.map((e) => (
            <View key={e.id} style={styles.contractorRow}>
              <Text style={[styles.cellText, styles.flex]}>{employeeFullName(e)}</Text>
              <Badge label="N/A - contractor" tone="neutral" />
            </View>
          ))}
          <Text style={ownerStyles.mutedText}>Contractors don&apos;t get super through payroll.</Text>
        </View>
      )}

    </Card>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  warning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  warningText: {
    flex: 1,
    color: C.warning,
    fontSize: 13,
  },
  allPaid: {
    color: C.text,
    fontSize: 15,
  },
  run: {
    gap: Spacing.two,
    paddingTop: Spacing.two,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  runTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  runTitle: {
    color: C.text,
    fontSize: 15,
    fontWeight: '700',
  },
  runMeta: {
    color: C.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  fundCell: {
    gap: 4,
  },
  cellText: {
    color: C.text,
    fontSize: 14,
  },
  buttons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three - 4,
  },
  messageText: {
    fontSize: 13,
    lineHeight: 18,
  },
  infoText: {
    color: C.accent,
  },
  contractors: {
    gap: Spacing.two,
    paddingTop: Spacing.two,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  contractorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
