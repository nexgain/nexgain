import { useState } from 'react';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { downloadPayslip } from '@/components/employee/payslip-pdf';
import { Card, Icon, IconBadge, Icons } from '@/components/employee/ui';
import { EmployeeColors as C } from '@/constants/employee-theme';
import { Radius, Spacing } from '@/constants/theme';
import { useBusiness } from '@/data/business';
import { useCurrentEmployee } from '@/data/current-employee';
import { formatShortDate } from '@/data/employee-roster';
import { formatCurrency as money, formatHrs, usePayslipViews, type PayslipView } from '@/data/employee-payslips';
import { SUPER_GUARANTEE_RATE } from '@/data/payroll';

// One payslip, exactly as it was approved. Download saves it as a PDF.
export default function PayslipScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const payslip = usePayslipViews().find((p) => p.id === id);
  const business = useBusiness();
  const me = useCurrentEmployee();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    if (!payslip || busy) return;
    setBusy(true);
    setError(null);
    try {
      await downloadPayslip(payslip, business, {
        name: me ? `${me.firstName} ${me.lastName}`.trim() : '',
        position: me?.role ?? '',
        employeeId: me?.employeeId ?? '',
      });
    } catch {
      setError('Sorry, the PDF couldn’t be made. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const header = (
    <Stack.Screen
      options={{
        title: 'Payslip',
        headerRight: () =>
          busy ? (
            <ActivityIndicator color={C.primary} />
          ) : (
            <Pressable
              onPress={download}
              disabled={!payslip}
              accessibilityRole="button"
              accessibilityLabel="Download payslip PDF"
              hitSlop={10}>
              <Icon name={{ ios: 'arrow.down.circle', android: 'download', web: 'download' }} color={C.primary} size={24} />
            </Pressable>
          ),
      }}
    />
  );

  if (!payslip) {
    return (
      <View style={[styles.screen, styles.centered]}>
        {header}
        <Text style={styles.muted}>This payslip couldn&apos;t be found.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {header}

      {busy && (
        <View style={styles.notice}>
          <ActivityIndicator color={C.primary} />
          <Text style={styles.noticeText}>Making your PDF…</Text>
        </View>
      )}
      {error && (
        <View style={[styles.notice, styles.noticeError]} accessibilityRole="alert">
          <Text style={[styles.noticeText, { color: C.danger }]}>{error}</Text>
        </View>
      )}

      <Card style={styles.periodCard}>
        <IconBadge name={Icons.calendar} />
        <View style={styles.flex}>
          <Text style={styles.periodRange}>{payslip.rangeLabel}</Text>
          <Text style={styles.muted}>{payslip.frequency} pay period</Text>
        </View>
        <View style={styles.paidCol}>
          <View style={styles.paidBadge}>
            <Text style={styles.paidText}>Paid</Text>
          </View>
          <Text style={styles.smallMuted}>{formatShortDate(payslip.paidAt)}</Text>
        </View>
      </Card>

      <Card style={styles.partiesCard}>
        <View style={styles.biz}>
          {business?.logo ? (
            <Image source={{ uri: business.logo }} style={styles.logo} contentFit="contain" accessibilityLabel="Business logo" />
          ) : (
            <View style={[styles.logo, styles.logoBlank]}>
              <Text style={styles.logoLetter}>{(business?.businessName ?? 'N').trim().charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <Text style={styles.bizName} numberOfLines={2}>
            {business?.businessName ?? ''}
          </Text>
        </View>
        <View style={styles.person}>
          <Text style={styles.personName}>{me ? `${me.firstName} ${me.lastName}` : ''}</Text>
          <Text style={styles.smallMuted}>{me?.role || '—'}</Text>
          <Text style={styles.smallMuted}>ID: {me?.employeeId ?? '—'}</Text>
        </View>
      </Card>

      <View style={styles.summary}>
        <Summary label="Total Pay" value={money(payslip.totalEarnings)} />
        <Summary
          label="Total Hours"
          value={formatHrs(payslip.totalHours)}
          sub={`${formatHrs(payslip.overtimeHours)} hrs overtime`}
        />
        <Summary label="Avg. Hourly Rate" value={payslip.avgHourlyRate === null ? '—' : money(payslip.avgHourlyRate)} />
      </View>

      <Text style={styles.sectionTitle}>Earnings</Text>
      <Card style={styles.tableCard}>
        <Row cells={['Description', 'Hours', 'Rate', 'Amount']} head />
        <Row cells={['Ordinary Hours', formatHrs(payslip.ordinaryHours), rate(payslip, payslip.ordinaryRate), money(payslip.ordinaryPay)]} />
        <Row
          cells={[
            'Overtime',
            formatHrs(payslip.overtimeHours),
            payslip.salaried ? '—' : rate(payslip, payslip.overtimeRate),
            money(payslip.overtimePay),
          ]}
        />
        <Row cells={['Allowances', '—', '—', money(payslip.allowances)]} />
        <Row cells={['Total Earnings', formatHrs(payslip.totalHours), '', money(payslip.totalEarnings)]} total />
      </Card>

      <Text style={styles.sectionTitle}>Deductions</Text>
      <Card style={styles.tableCard}>
        <Row cells={['Description', 'Amount']} head />
        <Row cells={['PAYG Tax', money(payslip.tax)]} />
        <Row cells={['Other Deductions', money(payslip.otherDeductions)]} />
        <Row cells={['Total Deductions', money(payslip.totalDeductions)]} total />
      </Card>

      <Card style={styles.superCard}>
        <View style={styles.superRow}>
          <Text style={styles.cell}>Superannuation ({SUPER_GUARANTEE_RATE * 100}%)</Text>
          <Text style={[styles.cell, styles.bold]}>{money(payslip.super)}</Text>
        </View>
        <Text style={styles.smallMuted}>Paid by your employer on top of your pay. It isn&apos;t taken out of your net pay.</Text>
      </Card>

      <View style={styles.netBox}>
        <Text style={styles.netLabel}>Net Pay</Text>
        <Text style={styles.netValue}>{money(payslip.net)}</Text>
      </View>
    </ScrollView>
  );
}

function rate(p: PayslipView, value: number) {
  return p.salaried ? `${money(value)}/yr` : `${money(value)}/hr`;
}

function Summary({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={styles.summaryItem}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {sub ? <Text style={styles.summarySub}>{sub}</Text> : null}
    </View>
  );
}

function Row({ cells, head, total }: { cells: string[]; head?: boolean; total?: boolean }) {
  const wide = cells.length === 4;
  return (
    <View style={[styles.row, total && styles.totalRow]}>
      {cells.map((c, i) => (
        <Text
          key={i}
          style={[
            head ? styles.headCell : styles.cell,
            total && styles.bold,
            i === 0 ? styles.descCol : !wide ? styles.amountCol : i === 1 ? styles.hoursCol : styles.numCol,
          ]}
          numberOfLines={i === 0 ? 2 : 1}>
          {c}
        </Text>
      ))}
    </View>
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
  bold: {
    fontWeight: '700',
  },
  muted: {
    color: C.textSecondary,
    fontSize: 14,
  },
  smallMuted: {
    color: C.textSecondary,
    fontSize: 12,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three - 4,
    borderRadius: Radius.medium,
    backgroundColor: C.primarySoft,
  },
  noticeError: {
    backgroundColor: C.dangerSoft,
  },
  noticeText: {
    flex: 1,
    color: C.text,
    fontSize: 14,
  },
  periodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    padding: Spacing.three,
  },
  periodRange: {
    color: C.text,
    fontSize: 16,
    fontWeight: '700',
  },
  paidCol: {
    alignItems: 'flex-end',
    gap: 4,
  },
  paidBadge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: C.successSoft,
  },
  paidText: {
    color: C.success,
    fontSize: 12,
    fontWeight: '700',
  },
  partiesCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  biz: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
  },
  logo: {
    width: 44,
    height: 44,
    borderRadius: 10,
  },
  logoBlank: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.primarySoft,
  },
  logoLetter: {
    color: C.primary,
    fontSize: 20,
    fontWeight: '700',
  },
  bizName: {
    flex: 1,
    color: C.text,
    fontSize: 15,
    fontWeight: '700',
  },
  person: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 2,
  },
  personName: {
    color: C.text,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'right',
  },
  summary: {
    flexDirection: 'row',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: 16,
    backgroundColor: C.successSoft,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  summaryLabel: {
    color: '#166534',
    fontSize: 12,
    textAlign: 'center',
  },
  summaryValue: {
    color: C.success,
    fontSize: 19,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  summarySub: {
    color: '#166534',
    fontSize: 11,
    textAlign: 'center',
  },
  sectionTitle: {
    color: C.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: -Spacing.two,
  },
  tableCard: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two + 2,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  totalRow: {
    borderBottomWidth: 0,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  headCell: {
    color: C.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  cell: {
    color: C.text,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  descCol: {
    flex: 1,
  },
  hoursCol: {
    width: 44,
    textAlign: 'right',
  },
  numCol: {
    width: 86,
    textAlign: 'right',
  },
  amountCol: {
    width: 110,
    textAlign: 'right',
  },
  superCard: {
    gap: 4,
    padding: Spacing.three,
  },
  superRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  netBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.three + 4,
    borderRadius: 16,
    backgroundColor: C.success,
  },
  netLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  netValue: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
});
