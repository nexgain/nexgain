import { useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/owner/invoices-ui';
import { Badge, Card, EmptyState, Icon, OwnerIcons, OwnerScreen } from '@/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { useBusiness } from '@/data/business';
import {
  getEmployeeSuperFund,
  loadEmployeeSuper,
  superStatusOf,
  useEmployeeSuper,
  useSuperSettings,
  type EmployeeSuper,
  type SuperStatus,
} from '@/data/employee-super';
import { employeeFullName, isContractor, useEmployees, type Employee } from '@/data/employees';
import { businessUsesSuper } from '@/data/super-rules';

const OPTION: Record<string, string> = {
  default: 'Employer’s fund',
  own: 'Own fund',
  smsf: 'Self-managed fund',
  unsure: 'Not sure yet',
};
const TONE: Record<SuperStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  Ready: 'success',
  'Stapled fund check needed': 'danger',
  'Not chosen yet': 'warning',
  'Missing details': 'warning',
  'Not needed': 'neutral',
};
/** Who needs the owner first. */
const ORDER: SuperStatus[] = ['Stapled fund check needed', 'Missing details', 'Not chosen yet', 'Ready'];

const dateText = (iso: string) => new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });

// The owner's Super page (Australian businesses only): every employee's super
// choice, straight from what they saved (it updates by itself when they change
// it). Anyone who isn't sure is listed first: by law the employer has to check
// with the ATO for their existing "stapled" fund before using the default fund.
export default function SuperScreen() {
  const business = useBusiness();
  const employees = useEmployees();
  const records = useEmployeeSuper();
  const settings = useSuperSettings();

  // Fresh when the page opens, as well as live.
  useFocusEffect(
    useCallback(() => {
      loadEmployeeSuper().catch(() => {});
    }, []),
  );

  if (!businessUsesSuper(business)) {
    return (
      <OwnerScreen>
        <ScreenHeader title="Super" />
        <Card>
          <EmptyState icon={OwnerIcons.wallet} message="Super is only for Australian businesses. Your business's country is set in Payroll → Payroll bank details." />
        </Card>
      </OwnerScreen>
    );
  }

  const people = employees
    .filter((e) => !isContractor(e) && e.status !== 'inactive')
    .map((e) => {
      const record = records.find((r) => r.employeeId === e.id);
      return { employee: e, record, status: superStatusOf(e, record) };
    })
    .sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || employeeFullName(a.employee).localeCompare(employeeFullName(b.employee)));
  const stapled = people.filter((p) => p.status === 'Stapled fund check needed');
  const others = people.filter((p) => p.status !== 'Stapled fund check needed');
  const ready = people.filter((p) => p.status === 'Ready').length;

  return (
    <OwnerScreen>
      <ScreenHeader title="Super" />
      <Text style={styles.summary}>
        {people.length === 0
          ? 'No employees yet.'
          : `${ready} of ${people.length} ready${stapled.length ? ` · ${stapled.length} need a stapled fund check` : ''}`}
      </Text>
      {!settings.defaultFundName && (
        <Pressable onPress={() => router.navigate('/business-profile')} accessibilityRole="button" style={({ pressed }) => [styles.setup, pressed && styles.pressed]}>
          <Icon name={OwnerIcons.info} color={C.warning} size={16} />
          <Text style={styles.setupText}>Add your default super fund in Business Profile → Super settings.</Text>
        </Pressable>
      )}

      {stapled.length > 0 && (
        <View style={styles.alert} accessibilityRole="summary">
          <View style={styles.alertTop}>
            <Icon name={OwnerIcons.info} color={C.danger} size={18} />
            <Text style={styles.alertTitle}>
              {stapled.length === 1 ? '1 person needs' : `${stapled.length} people need`} a stapled fund check
            </Text>
          </View>
          <Text style={styles.alertText}>
            They weren&apos;t sure which fund to use. Before paying them into your default fund, check with the ATO for a fund they
            already have: ATO Online services for business → Employee commencement → Request stapled super fund.
          </Text>
          {stapled.map((p) => (
            <PersonRow key={p.employee.id} employee={p.employee} record={p.record} status={p.status} />
          ))}
        </View>
      )}

      <Card title="All employees" icon={OwnerIcons.people}>
        {others.length === 0 ? (
          <Text style={styles.muted}>{people.length === 0 ? 'Employees appear here once they join.' : 'Everyone else is listed above.'}</Text>
        ) : (
          others.map((p, i) => <PersonRow key={p.employee.id} employee={p.employee} record={p.record} status={p.status} divider={i > 0} />)
        )}
      </Card>
      <Text style={styles.muted}>
        This list updates by itself whenever someone chooses or changes their super fund in the app.
      </Text>
    </OwnerScreen>
  );
}

function PersonRow({ employee, record, status, divider }: { employee: Employee; record: EmployeeSuper | undefined; status: SuperStatus; divider?: boolean }) {
  const fund = getEmployeeSuperFund(employee);
  const details: [string, string][] = [];
  if (fund.kind === 'employer' || fund.kind === 'own') {
    details.push(['Fund', fund.fundName || '—'], ['USI', fund.usi || '—']);
    if (fund.kind === 'own') details.push(['Member number', fund.memberNumber || '—']);
  } else if (fund.kind === 'smsf') {
    details.push(['Fund', fund.fundName || '—']);
  }
  if (record) details.push(['Chosen', dateText(record.choiceReceivedAt)]);

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/employee/[id]', params: { id: employee.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${employeeFullName(employee)}, ${status}`}
      style={({ pressed }) => [styles.person, divider && styles.divider, pressed && styles.pressed]}>
      <View style={styles.personTop}>
        <Text style={styles.name} numberOfLines={1}>
          {employeeFullName(employee)}
        </Text>
        <Badge label={status} tone={TONE[status]} />
      </View>
      <Text style={styles.option}>{record ? OPTION[record.choice] : 'Hasn’t chosen yet'}</Text>
      {details.map(([label, value]) => (
        <View key={label} style={styles.detail}>
          <Text style={styles.detailLabel}>{label}</Text>
          <Text style={styles.detailValue} numberOfLines={1}>
            {value}
          </Text>
        </View>
      ))}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.7,
  },
  summary: {
    color: C.text,
    fontSize: 15,
    fontWeight: '600',
  },
  muted: {
    color: C.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  setup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three - 4,
    borderRadius: Radius.medium,
    backgroundColor: C.warningSoft,
    borderWidth: 1,
    borderColor: C.warningBorder,
  },
  setupText: {
    flex: 1,
    color: C.text,
    fontSize: 14,
  },
  alert: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.large - 4,
    backgroundColor: C.dangerSoft,
    borderWidth: 2,
    borderColor: C.danger,
  },
  alertTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  alertTitle: {
    flex: 1,
    color: C.danger,
    fontSize: 16,
    fontWeight: '700',
  },
  alertText: {
    color: C.text,
    fontSize: 13,
    lineHeight: 18,
  },
  person: {
    gap: 4,
    paddingVertical: Spacing.two + 2,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  personTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  name: {
    flex: 1,
    color: C.text,
    fontSize: 15,
    fontWeight: '700',
  },
  option: {
    color: C.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  detail: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  detailLabel: {
    width: 110,
    color: C.textSecondary,
    fontSize: 13,
  },
  detailValue: {
    flex: 1,
    color: C.text,
    fontSize: 13,
  },
});
