import { useRef, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View, type ScrollView } from 'react-native';

import { ConfirmDialog } from '@/components/owner/confirm-dialog';
import { FormField, TextField } from '@/components/owner/form';
import { downloadPayrollReport } from '@/components/owner/payroll-report-pdf';
import { Table, type Column } from '@/components/owner/table';
import {
  ActionRow,
  Badge,
  Button,
  Card,
  Icon,
  OwnerIcons,
  OwnerScreen,
  ownerStyles,
  PageHeader,
  RangeSelect,
  StatCard,
  StatGrid,
  TabRow,
} from '@/components/owner/ui';
import { Colors as C, Spacing } from '@/constants/theme';
import { overtimeRulesOf, updateBusiness, useBusiness } from '@/data/business';
import { useClockSessions } from '@/data/clock-records';
import { PAY_FREQUENCY } from '@/data/employee-payslips';
import { formatShortDate } from '@/data/employee-roster';
import { employeeFullName, formatPayRate, useEmployees } from '@/data/employees';
import {
  approvePayments,
  calculatePayLines,
  formatHours,
  formatMoney,
  getPayPeriods,
  maskAccountNumber,
  payTotals,
  SUPER_GUARANTEE_RATE,
  TAX_RATE_PLACEHOLDER,
  usePayslipRecords,
  usePayStatuses,
  type PayLine,
  type Period,
} from '@/data/payroll';
import { downloadPaymentFile, markPayRunPaid, todayKey, usePayRuns, type PayRun } from '@/data/pay-runs';
import { fromDateKey } from '@/data/shifts';
import { countryName, paymentFileTypeFor, payrollLabel, payrollReference } from '@/lib/payment-files';

const TABS = ['Employees', 'Summary', 'Tax & Super', 'Bank Accounts'] as const;
type Tab = (typeof TABS)[number];

const TAX_PERCENT = `${TAX_RATE_PLACEHOLDER * 100}%`;
const SUPER_PERCENT = `${SUPER_GUARANTEE_RATE * 100}%`;

const moneyOrDash = (amount: number | null) => (amount === null ? '—' : formatMoney(amount));

function periodSpan(period: Period) {
  const last = new Date(period.end);
  last.setDate(last.getDate() - 1);
  return `${formatShortDate(period.start, false)} – ${formatShortDate(last)}`;
}

/** e.g. "+12.5%" vs the previous period, or null when there's nothing to compare. */
function percentChange(current: number, previous: number) {
  if (previous === 0) return null;
  const change = ((current - previous) / previous) * 100;
  return `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`;
}

export default function PayrollScreen() {
  const now = new Date();
  const employees = useEmployees();
  const sessions = useClockSessions();
  const periods = getPayPeriods(now, 4);
  const [periodId, setPeriodId] = useState(periods[0].id);
  const [tab, setTab] = useState<Tab>('Employees');
  const scrollRef = useRef<ScrollView>(null);
  const approveCardY = useRef(0);
  const business = useBusiness();
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const periodIndex = Math.max(0, periods.findIndex((p) => p.id === periodId));
  const period = periods[periodIndex];
  const statuses = usePayStatuses(period.id);
  // Approved weeks show exactly what was saved on their payslips.
  const payslips = usePayslipRecords();
  const lines = calculatePayLines(employees, sessions, period, statuses, now, payslips);
  const totals = payTotals(lines);

  const previousPeriod = getPayPeriods(period.start, 2)[1];
  const previousTotals = payTotals(
    calculatePayLines(employees, sessions, previousPeriod, {}, now, payslips),
  );

  const [approveBusy, setApproveBusy] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  async function approve() {
    setApproveBusy(true);
    setApproveError(null);
    try {
      await approvePayments(period.id, payable.map((l) => l.employee.id), todayKey());
    } catch (e) {
      setApproveError(`Couldn’t approve payroll: ${e instanceof Error ? e.message : 'please try again.'}`);
    } finally {
      setApproveBusy(false);
    }
  }

  async function downloadReport() {
    setReportBusy(true);
    setReportError(null);
    try {
      await downloadPayrollReport(period, PAY_FREQUENCY, business, lines);
    } catch {
      setReportError('Sorry, the report PDF couldn’t be made. Please try again.');
    } finally {
      setReportBusy(false);
    }
  }

  const payable = lines.filter((l) => l.gross !== null && l.status === 'Pending');
  const missingRate = lines.filter((l) => l.rate === null);
  const missingBank = lines.filter((l) => !l.employee.bankAccount);
  const paidCount = lines.filter((l) => l.status === 'Paid').length;
  // Approved (in a pay run) or already paid.
  const approvedCount = lines.filter((l) => l.status !== 'Pending').length;
  const allPaid = lines.length > 0 && approvedCount === lines.length;

  const nameColumn: Column<PayLine> = {
    key: 'name',
    label: 'Name',
    width: 170,
    render: (l) => employeeFullName(l.employee),
  };

  const employeeColumns: Column<PayLine>[] = [
    nameColumn,
    { key: 'hours', label: 'Hours', width: 70, align: 'right', render: (l) => formatHours(l.ordinaryHours) },
    {
      key: 'overtime',
      label: 'OT Hours',
      width: 80,
      align: 'right',
      render: (l) => formatHours(l.overtimeHours),
    },
    {
      key: 'rate',
      label: 'Rate',
      width: 100,
      align: 'right',
      render: (l) =>
        l.rate === null ? <Badge label="Not set" tone="warning" /> : formatPayRate(l.rate, l.employee.payType),
    },
    {
      key: 'otRate',
      label: 'OT Rate',
      width: 90,
      align: 'right',
      render: (l) => (l.overtimeRate === null ? '—' : `${formatMoney(l.overtimeRate)}/hr`),
    },
    { key: 'gross', label: 'Gross Pay', width: 100, align: 'right', render: (l) => moneyOrDash(l.gross) },
    { key: 'tax', label: 'Tax', width: 90, align: 'right', render: (l) => moneyOrDash(l.tax) },
    { key: 'net', label: 'Net Pay', width: 100, align: 'right', render: (l) => moneyOrDash(l.net) },
    {
      key: 'status',
      label: 'Status',
      width: 90,
      render: (l) => (
        <Badge label={l.status} tone={l.status === 'Paid' ? 'success' : l.status === 'Approved' ? 'info' : 'warning'} />
      ),
    },
  ];

  const taxColumns: Column<PayLine>[] = [
    nameColumn,
    { key: 'gross', label: 'Gross Pay', width: 110, align: 'right', render: (l) => moneyOrDash(l.gross) },
    { key: 'tax', label: `Tax (${TAX_PERCENT})`, width: 110, align: 'right', render: (l) => moneyOrDash(l.tax) },
    {
      key: 'super',
      label: `Super (${SUPER_PERCENT})`,
      width: 120,
      align: 'right',
      render: (l) => moneyOrDash(l.super),
    },
  ];

  const bankColumns: Column<PayLine>[] = [
    nameColumn,
    {
      key: 'accountName',
      label: 'Account Name',
      width: 160,
      render: (l) => l.employee.bankAccount?.accountName ?? '—',
    },
    {
      key: 'account',
      label: 'Account',
      width: 120,
      render: (l) => (l.employee.bankAccount ? maskAccountNumber(l.employee.bankAccount.accountNumber) : '—'),
    },
    {
      key: 'status',
      label: 'Status',
      width: 120,
      render: (l) =>
        l.employee.bankAccount ? (
          <Badge label="Connected" tone="success" />
        ) : (
          <Badge label="Not connected" tone="neutral" />
        ),
    },
  ];

  const noEmployees = 'No employees yet. They will appear here once they have been added.';

  return (
    <OwnerScreen scrollRef={scrollRef}>
      <PageHeader
        title="Payroll"
        subtitle="Review hours, approve payments and manage your payroll."
        right={
          <>
            <RangeSelect
              options={periods}
              value={period}
              onChange={(p) => setPeriodId(p.id)}
              detail={periodSpan(period)}
            />
            <Button
              label="Run Payroll"
              icon={OwnerIcons.play}
              onPress={() => scrollRef.current?.scrollTo({ y: approveCardY.current, animated: true })}
            />
          </>
        }
      />

      <StatGrid columns={3}>
        <StatCard
          icon={OwnerIcons.money}
          label="Total Gross Pay"
          value={formatMoney(totals.gross)}
          change={percentChange(totals.gross, previousTotals.gross)}
          changeLabel="vs last period"
        />
        <StatCard
          icon={OwnerIcons.bank}
          label="Total Tax"
          value={formatMoney(totals.tax)}
          change={percentChange(totals.tax, previousTotals.tax)}
          changeLabel="vs last period"
        />
        <StatCard
          icon={OwnerIcons.wallet}
          label="Total Net Pay"
          value={formatMoney(totals.net)}
          change={percentChange(totals.net, previousTotals.net)}
          changeLabel="vs last period"
        />
      </StatGrid>

      <TabRow tabs={TABS} active={tab} onChange={setTab} />

      <Card>
        {tab === 'Employees' && (
          <Table
            columns={employeeColumns}
            rows={lines}
            rowKey={(l) => l.employee.id}
            emptyMessage={noEmployees}
            footer={{
              name: 'Total',
              hours: formatHours(totals.ordinaryHours),
              overtime: formatHours(totals.overtimeHours),
              gross: formatMoney(totals.gross),
              tax: formatMoney(totals.tax),
              net: formatMoney(totals.net),
            }}
          />
        )}

        {tab === 'Summary' && (
          <View style={styles.summary}>
            {[
              ['Pay period', periodSpan(period)],
              ['Employees', `${lines.length}`],
              ['Normal hours', formatHours(totals.ordinaryHours)],
              ['Overtime hours', formatHours(totals.overtimeHours)],
              ['Total gross pay', formatMoney(totals.gross)],
              [`Tax withheld (${TAX_PERCENT} placeholder)`, formatMoney(totals.tax)],
              ['Total net pay', formatMoney(totals.net)],
              [`Employer super (${SUPER_PERCENT})`, formatMoney(totals.super)],
              ['Approved', `${approvedCount} of ${lines.length}`],
              ['Paid', `${paidCount} of ${lines.length}`],
            ].map(([label, value], i) => (
              <View key={label} style={[styles.summaryRow, i > 0 && styles.summaryDivider]}>
                <Text style={styles.summaryLabel}>{label}</Text>
                <Text style={styles.summaryValue}>{value}</Text>
              </View>
            ))}
          </View>
        )}

        {tab === 'Tax & Super' && (
          <View style={styles.tabContent}>
            <Table
              columns={taxColumns}
              rows={lines}
              rowKey={(l) => l.employee.id}
              emptyMessage={noEmployees}
              footer={{
                name: 'Total',
                gross: formatMoney(totals.gross),
                tax: formatMoney(totals.tax),
                super: formatMoney(totals.super),
              }}
            />
            <Text style={ownerStyles.mutedText}>
              Tax is a flat {TAX_PERCENT} placeholder until proper PAYG withholding is set up. Super is
              the {SUPER_PERCENT} Superannuation Guarantee on normal (ordinary-time) pay, not overtime, paid by
              you on top of gross pay.
            </Text>
          </View>
        )}

        {tab === 'Bank Accounts' && (
          <View style={styles.tabContent}>
            <Table columns={bankColumns} rows={lines} rowKey={(l) => l.employee.id} emptyMessage={noEmployees} />
            <Text style={ownerStyles.mutedText}>
              Bank details come from each employee&apos;s Payment section in their own profile.
            </Text>
          </View>
        )}
      </Card>

      <View
        onLayout={(e) => {
          approveCardY.current = e.nativeEvent.layout.y;
        }}>
        <Card title="Approve Payroll" icon={OwnerIcons.check}>
          <Text style={styles.approveSummary}>
            {lines.length === 0
              ? 'Nothing to approve yet.'
              : allPaid
                ? `All payments for ${period.label.toLowerCase()} have been approved.`
                : payable.length === 0
                  ? `${approvedCount} of ${lines.length} payments approved.`
                  : `${payable.length} of ${lines.length} payments ready · ${formatMoney(
                      payable.reduce((sum, l) => sum + (l.net ?? 0), 0),
                    )} net`}
          </Text>

          {missingRate.length > 0 && (
            <Warning text={`${missingRate.length} employee(s) have no pay rate set and can't be paid yet.`} />
          )}
          {missingBank.length > 0 && (
            <Warning text={`${missingBank.length} employee(s) haven't added bank account details.`} />
          )}

          <View style={styles.approveButtons}>
            <Button
              label={approveBusy ? 'Approving…' : 'Approve All Payments'}
              icon={OwnerIcons.check}
              disabled={payable.length === 0 || approveBusy}
              onPress={approve}
            />
            <Button
              label={reportBusy ? 'Making PDF…' : 'Download Report (PDF)'}
              icon={OwnerIcons.download}
              variant="secondary"
              disabled={lines.length === 0 || reportBusy}
              onPress={downloadReport}
            />
          </View>
          {(reportBusy || approveBusy) && <ActivityIndicator color={C.accent} />}
          {reportError && <Warning text={reportError} />}
          {approveError && <Warning text={approveError} />}

          <Text style={ownerStyles.mutedText}>
            Approving makes a pay run with its own payroll number. Download its payment file, upload it to
            your bank, then mark it as paid. NexGain never moves money itself.
          </Text>
        </Card>
      </View>

      <PayRunsCard />

      <PayrollSettingsCard />
    </OwnerScreen>
  );
}

/** Owner-only payroll settings: when overtime starts. Approved payrolls keep the rule they were paid under. */
function PayrollSettingsCard() {
  const business = useBusiness();
  const saved = overtimeRulesOf(business).dailyAfterHours;
  const [text, setText] = useState<string | null>(null);
  const value = text ?? String(saved);
  const hours = Number(value.trim());
  const error = !value.trim()
    ? 'Enter a number of hours, e.g. 8'
    : !Number.isFinite(hours) || hours < 0.5 || hours > 24
      ? 'Enter between 0.5 and 24 hours.'
      : (hours * 2) % 1 !== 0
        ? 'Use whole or half hours, e.g. 7.5'
        : null;

  return (
    <Card title="Payroll Settings" icon={{ ios: 'gearshape.fill', android: 'settings', web: 'settings' }}>
      <FormField label="Overtime starts after (hours in a day)" error={error ?? undefined}>
        <View style={styles.settingRow}>
          <TextField
            value={value}
            onChangeText={(t) => {
              setText(t);
              const h = Number(t.trim());
              if (t.trim() && Number.isFinite(h) && h >= 0.5 && h <= 24 && (h * 2) % 1 === 0) {
                updateBusiness({ overtimeRules: { ...overtimeRulesOf(business), dailyAfterHours: h } });
              }
            }}
            onBlur={() => setText(null)}
            keyboardType="decimal-pad"
            accessibilityLabel="Overtime starts after hours"
            style={styles.settingInput}
          />
          <Text style={styles.settingUnit}>hours</Text>
        </View>
      </FormField>
      <Text style={ownerStyles.mutedText}>
        Hours worked past this in a single day are paid at the employee&apos;s overtime rate.
      </Text>
      <View style={styles.divider} />
      <ActionRow
        icon={OwnerIcons.bank}
        label={`Payroll bank details · ${countryName(business?.country)}`}
        onPress={() => router.navigate({ pathname: '/payroll-bank', params: { from: 'payroll' } })}
      />
    </Card>
  );
}

const SHOWN_RUNS = 5;

/**
 * Pay run history. Each approval is one pay run with a payroll number. For an
 * approved run: download the bank file, then mark it as paid once it's been
 * uploaded to the bank.
 */
function PayRunsCard() {
  const runs = usePayRuns();
  const business = useBusiness();
  const [showAll, setShowAll] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ runId: string; tone: 'ok' | 'warn'; text: string; names?: string[] } | null>(null);
  const [confirm, setConfirm] = useState<PayRun | null>(null);
  const fileType = paymentFileTypeFor(business?.country);

  async function download(run: PayRun) {
    setBusyId(run.id);
    setMessage(null);
    const result = await downloadPaymentFile(run);
    setBusyId(null);
    if (result.ok) {
      setMessage({
        runId: run.id,
        tone: 'ok',
        text: `${result.fileName} is ready. Upload it to your bank's bulk payments page, then come back and press Mark as paid.`,
      });
    } else if (result.reason === 'setup') {
      // Can't make a file without the business's own bank details: go and set them up.
      router.navigate({ pathname: '/payroll-bank', params: { from: 'payroll' } });
    } else if (result.reason === 'unsupported') {
      setMessage({
        runId: run.id,
        tone: 'warn',
        text: result.country
          ? `Bank payment files aren't available for ${countryName(result.country)} yet. Pay your team through your bank, then press Mark as paid.`
          : 'Choose your country in Payroll bank details so NexGain knows which bank file to make.',
      });
    } else if (result.reason === 'employees') {
      setMessage({
        runId: run.id,
        tone: 'warn',
        text: 'The file can’t be made yet. These people need to add or fix their bank details in their NexGain profile:',
        names: result.problems.map((p) => `${p.name}: ${p.problem}`),
      });
    } else {
      setMessage({ runId: run.id, tone: 'warn', text: result.message });
    }
  }

  async function markPaid(run: PayRun) {
    setConfirm(null);
    setBusyId(run.id);
    setMessage(null);
    try {
      await markPayRunPaid(run.id);
      setMessage({ runId: run.id, tone: 'ok', text: `${payrollLabel(run.payrollNumber)} is marked as paid. Your team has been told.` });
    } catch {
      setMessage({ runId: run.id, tone: 'warn', text: 'Couldn’t mark it as paid. Check your internet connection and try again.' });
    } finally {
      setBusyId(null);
    }
  }

  const shown = showAll ? runs : runs.slice(0, SHOWN_RUNS);

  return (
    <Card title="Pay Runs" icon={OwnerIcons.receipt}>
      {runs.length === 0 ? (
        <Text style={ownerStyles.mutedText}>No pay runs yet. Approving payroll makes your first one (Payroll 001).</Text>
      ) : (
        shown.map((run, i) => (
          <View key={run.id} style={[styles.run, i > 0 && styles.runDivider]}>
            <View style={styles.runTop}>
              <View style={styles.flex}>
                <Text style={styles.runTitle}>{payrollLabel(run.payrollNumber)}</Text>
                <Text style={styles.runMeta}>
                  {formatShortDate(fromDateKey(run.periodStart), false)} – {formatShortDate(fromDateKey(run.periodEnd))} ·{' '}
                  {run.employeeCount} {run.employeeCount === 1 ? 'person' : 'people'} · {formatMoney(run.totalNet)} net
                </Text>
                <Text style={styles.runMeta}>
                  {run.status === 'paid' && run.paidAt
                    ? `Paid ${formatShortDate(new Date(run.paidAt))}`
                    : `Pay date ${formatShortDate(fromDateKey(run.payDate))}`}
                  {run.fileDownloadedAt ? ' · File downloaded' : ''}
                </Text>
              </View>
              <Badge label={run.status === 'paid' ? 'Paid' : 'Approved'} tone={run.status === 'paid' ? 'success' : 'info'} />
            </View>

            {run.status === 'approved' && (
              <View style={styles.approveButtons}>
                {fileType && (
                  <Button
                    label={busyId === run.id ? 'Working…' : 'Download payment file'}
                    icon={OwnerIcons.download}
                    disabled={busyId !== null}
                    onPress={() => download(run)}
                  />
                )}
                <Button
                  label="Mark as paid"
                  icon={OwnerIcons.check}
                  variant="secondary"
                  disabled={busyId !== null}
                  onPress={() => setConfirm(run)}
                />
              </View>
            )}

            {message?.runId === run.id && (
              <View style={styles.message}>
                <Text style={[styles.messageText, message.tone === 'warn' && styles.warningText]}>{message.text}</Text>
                {message.names?.map((n) => (
                  <Text key={n} style={styles.warningText}>
                    • {n}
                  </Text>
                ))}
              </View>
            )}
          </View>
        ))
      )}
      {runs.length > SHOWN_RUNS && (
        <Button label={showAll ? 'Show fewer' : `See all ${runs.length} pay runs`} variant="secondary" onPress={() => setShowAll(!showAll)} />
      )}
      {!fileType && runs.some((r) => r.status === 'approved') && (
        <Text style={ownerStyles.mutedText}>
          {business?.country
            ? `Bank payment files aren't available for ${countryName(business.country)} yet, so pay your team through your bank and then mark the pay run as paid.`
            : 'Set your country in Payroll bank details to download bank payment files.'}
        </Text>
      )}

      <ConfirmDialog
        visible={confirm !== null}
        destructive={false}
        message={
          confirm?.fileDownloadedAt
            ? `Have you uploaded the ${confirm ? payrollReference(confirm.payrollNumber, true) : ''} file to your bank? Marking it as paid tells each employee they've been paid.`
            : `You haven't downloaded the payment file for ${confirm ? payrollLabel(confirm.payrollNumber) : ''}. Mark it as paid anyway (for example, if you paid your team another way)? Each employee will be told they've been paid.`
        }
        confirmLabel="Yes, mark as paid"
        onConfirm={() => confirm && markPaid(confirm)}
        onCancel={() => setConfirm(null)}
      />
    </Card>
  );
}

function Warning({ text }: { text: string }) {
  return (
    <View style={styles.warning}>
      <Icon name={OwnerIcons.info} color={C.warning} size={14} />
      <Text style={styles.warningText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tabContent: {
    gap: Spacing.three - 4,
  },
  summary: {
    paddingHorizontal: Spacing.one,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingVertical: Spacing.three - 4,
  },
  summaryDivider: {
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  summaryLabel: {
    flex: 1,
    color: C.textSecondary,
    fontSize: 14,
  },
  summaryValue: {
    color: C.text,
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  approveSummary: {
    color: C.text,
    fontSize: 15,
  },
  approveButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three - 4,
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
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  settingInput: {
    width: 96,
  },
  flex: {
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: C.border,
  },
  run: {
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  runDivider: {
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
  message: {
    gap: 4,
  },
  messageText: {
    color: C.success,
    fontSize: 13,
  },
  settingUnit: {
    color: C.textSecondary,
    fontSize: 15,
  },
});
