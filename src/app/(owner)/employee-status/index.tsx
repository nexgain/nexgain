import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar } from '@/components/owner/employee-ui';
import { ScreenHeader } from '@/components/owner/invoices-ui';
import { Badge, Card, EmptyState, Icon, OwnerIcons, OwnerScreen, RangeSelect } from '@/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { useBusiness } from '@/data/business';
import { employeeFullName, isSalaried } from '@/data/employees';
import { periodDates, usePeriodPay } from '@/data/payroll-period';
import { formatMoney, type PayLine } from '@/data/payroll';
import { shiftHours, shiftsInRange, useShifts } from '@/data/shifts';
import { businessUsesSuper } from '@/data/super-rules';

const hoursText = (h: number) => `${h.toFixed(1)} h`;

// Employee Status: everyone's hours and estimated pay for one pay period
// (this one by default; earlier ones from the period picker). Only shifts that
// started in the period count, and it updates by itself as people clock in/out.
export default function EmployeeStatusScreen() {
  const params = useLocalSearchParams<{ period?: string }>();
  const [periodId, setPeriodId] = useState(params.period);
  const [search, setSearch] = useState('');
  const business = useBusiness();
  const usesSuper = businessUsesSuper(business);
  const roster = useShifts();
  const { periods, period, lines, totals, sessions } = usePeriodPay(periodId);

  const options = periods.map((p, i) => ({
    ...p,
    label: i === 0 ? 'This Pay Period' : i === 1 ? 'Last Pay Period' : periodDates(p),
  }));
  const chosen = options.find((p) => p.id === period.id) ?? options[0];

  // Rostered hours in the period: what each person is expected to work.
  const rostered = shiftsInRange(roster, period.start, new Date(period.end.getTime() - 1));
  const expectedHours = (employeeId: string) =>
    rostered.filter((s) => s.employeeIds.includes(employeeId)).reduce((sum, s) => sum + shiftHours(s), 0);

  const query = search.trim().toLowerCase();
  const shown = lines
    .filter((l) => !query || `${employeeFullName(l.employee)} ${l.employee.email}`.toLowerCase().includes(query))
    .sort((a, b) => employeeFullName(a.employee).localeCompare(employeeFullName(b.employee)));
  const approved = lines.filter((l) => l.status !== 'Pending').length;
  const percent = lines.length ? Math.round((approved / lines.length) * 100) : 0;
  const onShift = (id: string) => sessions.some((s) => s.employeeId === id && s.end === null);

  return (
    <OwnerScreen>
      <ScreenHeader title="Employee Status" onBack={() => router.back()} />
      <View style={styles.periodRow}>
        <RangeSelect
          options={options}
          value={chosen}
          onChange={(p) => setPeriodId(p.id)}
          detail={`(${periodDates(period)})`}
        />
      </View>

      <Card>
        <View style={styles.summary}>
          <Summary label="Total Hours" value={hoursText(totals.hours)} />
          <View style={styles.summaryDivider} />
          <Summary label="Est. Net Pay" value={formatMoney(totals.net)} />
          <View style={styles.summaryDivider} />
          {usesSuper ? (
            <Summary label="Est. Super" value={formatMoney(totals.super)} />
          ) : (
            <Summary label="Est. Tax" value={formatMoney(totals.tax)} />
          )}
        </View>
      </Card>

      <View style={styles.search}>
        <Icon name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} color={C.textSecondary} size={16} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search employees..."
          placeholderTextColor={C.textSecondary}
          autoCorrect={false}
          style={styles.searchInput}
          accessibilityLabel="Search employees"
        />
      </View>

      <Card>
        {shown.length === 0 ? (
          <EmptyState
            icon={OwnerIcons.people}
            message={lines.length === 0 ? 'No employees in this pay period yet.' : 'No employees match your search.'}
          />
        ) : (
          shown.map((l, i) => (
            <EmployeeRow
              key={l.employee.id}
              line={l}
              expected={expectedHours(l.employee.id)}
              onShift={onShift(l.employee.id)}
              divider={i > 0}
              onPress={() => router.push({ pathname: '/employee-status/[id]', params: { id: l.employee.id, period: period.id } })}
            />
          ))
        )}
      </Card>

      {lines.length > 0 && (
        <Card title="Payroll Progress" icon={OwnerIcons.check}>
          <View style={styles.progressTop}>
            <Text style={styles.progressText}>
              Hours approved: {approved} of {lines.length}
            </Text>
            <Text style={styles.progressPercent}>{percent}%</Text>
          </View>
          <View style={styles.track}>
            <View style={[styles.fill, styles.fillDone, { width: `${percent}%` }]} />
          </View>
        </Card>
      )}
      <Text style={styles.note}>Tax, super and net pay are estimates until payroll is approved.</Text>
    </OwnerScreen>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryItem}>
      <Text style={styles.summaryValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function EmployeeRow({
  line,
  expected,
  onShift,
  divider,
  onPress,
}: {
  line: PayLine;
  expected: number;
  onShift: boolean;
  divider: boolean;
  onPress: () => void;
}) {
  const name = employeeFullName(line.employee);
  const progress = expected > 0 ? Math.min(1, line.hours / expected) : 0;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${hoursText(line.hours)}, ${line.gross === null ? 'pay rate not set' : formatMoney(line.gross)}`}
      style={({ pressed }) => [styles.row, divider && styles.rowDivider, pressed && styles.pressed]}>
      <Avatar name={name} photoUrl={line.employee.photoUrl} size={40} />
      <View style={styles.rowMain}>
        <View style={styles.nameLine}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          {onShift && <Badge label="On shift" tone="success" />}
        </View>
        {/* Email tells apart two records with the same name. */}
        <Text style={styles.email} numberOfLines={1}>
          {line.employee.email}
        </Text>
        {/* Salaried workers are paid the same each pay run; their hours are just attendance. */}
        {isSalaried(line.employee) && <Text style={styles.salary}>Salary – fixed</Text>}
        <Text style={styles.hours}>
          {hoursText(line.hours)}
          {expected > 0 ? <Text style={styles.expected}>{` of ${hoursText(expected)} rostered`}</Text> : null}
        </Text>
        {expected > 0 && (
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
        )}
      </View>
      <View style={styles.rowRight}>
        {line.gross === null ? <Badge label={isSalaried(line.employee) ? 'No salary set' : 'No pay rate'} tone="warning" /> : <Text style={styles.pay}>{formatMoney(line.gross)}</Text>}
        <Icon name={OwnerIcons.chevron} color={C.textSecondary} size={14} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  periodRow: {
    flexDirection: 'row',
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: Spacing.one,
  },
  summaryDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: C.border,
  },
  summaryValue: {
    color: C.text,
    fontSize: 18,
    fontWeight: '700',
  },
  summaryLabel: {
    color: C.textSecondary,
    fontSize: 12,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 46,
    paddingHorizontal: Spacing.three - 2,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: C.inputBorder,
    backgroundColor: C.surface,
  },
  searchInput: {
    flex: 1,
    color: C.text,
    fontSize: 15,
    paddingVertical: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    paddingVertical: Spacing.three - 4,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  pressed: {
    opacity: 0.7,
  },
  rowMain: {
    flex: 1,
    gap: 3,
  },
  nameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  name: {
    flexShrink: 1,
    color: C.text,
    fontSize: 15,
    fontWeight: '700',
  },
  email: {
    color: C.textSecondary,
    fontSize: 12,
  },
  hours: {
    color: C.text,
    fontSize: 13,
    fontWeight: '600',
  },
  salary: {
    color: C.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  expected: {
    color: C.textSecondary,
    fontWeight: '400',
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  pay: {
    color: C.text,
    fontSize: 15,
    fontWeight: '700',
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: C.surfaceRaised,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: C.accent,
  },
  fillDone: {
    backgroundColor: C.success,
  },
  progressTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressText: {
    color: C.text,
    fontSize: 14,
    fontWeight: '600',
  },
  progressPercent: {
    color: C.success,
    fontSize: 14,
    fontWeight: '700',
  },
  note: {
    color: C.textSecondary,
    fontSize: 12,
    textAlign: 'center',
  },
});
