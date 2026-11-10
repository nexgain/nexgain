import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/owner/employee-ui';
import { ScreenHeader } from '@/components/owner/invoices-ui';
import { Badge, Button, Card, EmptyState, OwnerIcons, OwnerScreen } from '@/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { useBusiness } from '@/data/business';
import { employeeFullName, formatPayRate, isContractor, isSalaried, useEmployees } from '@/data/employees';
import { periodDates, usePeriodPay } from '@/data/payroll-period';
import { formatMoney, shiftsInPeriod } from '@/data/payroll';
import { businessUsesSuper } from '@/data/super-rules';

const hoursText = (h: number) => `${h.toFixed(2)} h`;
const timeText = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const dateText = (d: Date) => d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
const est = (amount: number | null) => (amount === null ? '—' : formatMoney(amount));

// One employee's hours and estimated pay for one pay period: every shift that
// started in it, and what the pay, tax, super and take-home pay come to so far.
export default function EmployeeStatusDetailScreen() {
  const { id, period: periodId } = useLocalSearchParams<{ id: string; period?: string }>();
  const business = useBusiness();
  const usesSuper = businessUsesSuper(business);
  const employee = useEmployees().find((e) => e.id === id);
  const { now, period, lines, sessions } = usePeriodPay(periodId);
  const line = lines.find((l) => l.employee.id === id);

  if (!employee) {
    return (
      <OwnerScreen>
        <ScreenHeader title="Employee Status" onBack={() => router.back()} />
        <Card>
          <EmptyState icon={OwnerIcons.people} message="This employee couldn't be found." />
        </Card>
      </OwnerScreen>
    );
  }

  const name = employeeFullName(employee);
  const shifts = shiftsInPeriod(sessions, employee.id, period).sort((a, b) => b.start.getTime() - a.start.getTime());
  const onShift = shifts.some((s) => s.end === null);
  const setRate = () => router.push({ pathname: '/employee/[id]', params: { id: employee.id } });
  const bank = employee.bankAccount;
  const salaried = isSalaried(employee);

  return (
    <OwnerScreen>
      <ScreenHeader title={name} onBack={() => router.back()} />
      <View style={styles.header}>
        <Avatar name={name} photoUrl={employee.photoUrl} size={52} />
        <View style={styles.headerText}>
          <View style={styles.nameLine}>
            <Text style={styles.name}>{name}</Text>
            {onShift && <Badge label="On shift" tone="success" />}
          </View>
          <Text style={styles.muted}>Pay period: {periodDates(period)}</Text>
        </View>
      </View>

      {employee.payRate === null && !isContractor(employee) && (
        <View style={styles.warning}>
          <Text style={styles.warningText}>
            {salaried
              ? `Set salary for ${name}. They're left out of pay runs until it's set.`
              : `${name} has no pay rate set, so their pay can't be worked out or paid yet.`}
          </Text>
          <Button label={salaried ? 'Set salary' : 'Set pay rate'} onPress={setRate} />
        </View>
      )}

      <Card title="Hours" icon={OwnerIcons.clock}>
        <Rows
          rows={[
            ['Ordinary hours', hoursText(line?.ordinaryHours ?? 0)],
            ['Overtime hours', hoursText(line?.overtimeHours ?? 0)],
            ['Total hours', hoursText(line?.hours ?? 0)],
          ]}
          bold={2}
        />
        <Text style={styles.subTitle}>Shifts</Text>
        {shifts.length === 0 ? (
          <Text style={styles.muted}>No shifts in this pay period yet.</Text>
        ) : (
          shifts.map((s) => {
            const end = s.end ?? now;
            return (
              <View key={s.id} style={styles.shift}>
                <Text style={styles.shiftDate}>{dateText(s.start)}</Text>
                <Text style={styles.shiftTimes}>
                  {timeText(s.start)} – {s.end ? timeText(s.end) : 'now'}
                </Text>
                <Text style={styles.shiftHours}>{hoursText((end.getTime() - s.start.getTime()) / 3_600_000)}</Text>
              </View>
            );
          })
        )}
      </Card>

      <Card title="Pay" icon={OwnerIcons.wallet}>
        <Rows
          rows={[
            [salaried ? 'Yearly salary' : 'Pay rate', formatPayRate(employee.payRate, employee.payType)],
            ...(line?.overtimeRate ? ([['Overtime rate', `${formatMoney(line.overtimeRate)}/hr`]] as [string, string][]) : []),
            // Salary: the same fixed amount every pay run, whatever hours are clocked.
            [salaried ? 'Salary – fixed (this pay period)' : 'Gross pay so far', est(line?.gross ?? null)],
          ]}
          bold={-1}
        />
      </Card>

      <Card title="Tax" icon={OwnerIcons.bank}>
        <Rows rows={[['Est. tax withheld so far', est(line?.tax ?? null)]]} />
      </Card>

      {usesSuper && (
        <Card title="Super" icon={OwnerIcons.percent}>
          <Rows rows={[['Est. super so far', isContractor(employee) ? 'N/A - contractor' : est(line?.super ?? null)]]} />
        </Card>
      )}

      <Card title="Net Pay" icon={OwnerIcons.check}>
        <Rows rows={[['Est. take-home pay so far', est(line?.net ?? null)]]} bold={0} />
      </Card>

      <Card title="Bank" icon={OwnerIcons.bank}>
        {bank ? (
          <Rows
            rows={[
              ['Account name', bank.accountName || '—'],
              ['Account number', `•••${bank.accountNumber.slice(-3)}`],
            ]}
          />
        ) : (
          <Text style={styles.muted}>No bank details on file yet. {employee.firstName || 'They'} can add them in the app.</Text>
        )}
      </Card>

      <Text style={styles.note}>Tax, super and net pay are estimates until payroll is approved.</Text>
    </OwnerScreen>
  );
}

function Rows({ rows, bold }: { rows: [string, string][]; /** Index of a row to show in bold (-1 = the last). */ bold?: number }) {
  const strong = bold === -1 ? rows.length - 1 : bold;
  return (
    <View>
      {rows.map(([label, value], i) => (
        <View key={label} style={[styles.row, i > 0 && styles.rowDivider]}>
          <Text style={styles.rowLabel}>{label}</Text>
          <Text style={[styles.rowValue, i === strong && styles.rowValueStrong]}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  nameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  name: {
    flexShrink: 1,
    color: C.text,
    fontSize: 18,
    fontWeight: '700',
  },
  muted: {
    color: C.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  warning: {
    gap: Spacing.two,
    padding: Spacing.three - 4,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: C.warningBorder,
    backgroundColor: C.warningSoft,
    alignItems: 'flex-start',
  },
  warningText: {
    color: C.text,
    fontSize: 14,
    lineHeight: 20,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  rowLabel: {
    flex: 1,
    color: C.textSecondary,
    fontSize: 14,
  },
  rowValue: {
    color: C.text,
    fontSize: 14,
    fontWeight: '600',
  },
  rowValueStrong: {
    fontSize: 15,
    fontWeight: '700',
  },
  subTitle: {
    color: C.text,
    fontSize: 14,
    fontWeight: '700',
    marginTop: Spacing.one,
  },
  shift: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one + 2,
  },
  shiftDate: {
    width: 96,
    color: C.text,
    fontSize: 13,
    fontWeight: '600',
  },
  shiftTimes: {
    flex: 1,
    color: C.textSecondary,
    fontSize: 13,
  },
  shiftHours: {
    color: C.text,
    fontSize: 13,
    fontWeight: '600',
  },
  note: {
    color: C.textSecondary,
    fontSize: 12,
    textAlign: 'center',
  },
});
