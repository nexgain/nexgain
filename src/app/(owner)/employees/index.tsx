import { useState } from 'react';
import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar, sendInvite, StatusBadge, type ListStatus } from '@/components/owner/employee-ui';
import { ScreenHeader, SummaryTile } from '@/components/owner/invoices-ui';
import { Button, Card, EmptyState, Icon, OwnerIcons, OwnerScreen, StatGrid } from '@/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { shareInvite, useInvites, type EmployeeInvite } from '@/data/employee-invites';
import { employeeFullName, formatPayRate, useEmployees, type Employee } from '@/data/employees';

type Row =
  | { kind: 'employee'; id: string; name: string; status: ListStatus; employee: Employee }
  | { kind: 'invite'; id: string; name: string; status: ListStatus; invite: EmployeeInvite };

const FILTERS = ['All', 'Active', 'On Leave', 'Inactive', 'Invited'] as const;
type Filter = (typeof FILTERS)[number];
const FILTER_STATUS: Record<Exclude<Filter, 'All'>, ListStatus> = {
  Active: 'active',
  'On Leave': 'on_leave',
  Inactive: 'inactive',
  Invited: 'invited',
};

// Everyone in the business: people who've joined, plus people the owner has
// invited who haven't signed up yet. Bank and tax details are never shown here.
export default function EmployeesScreen() {
  const employees = useEmployees();
  const invites = useInvites();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('All');

  const rows: Row[] = [
    ...employees.map((employee): Row => ({
      kind: 'employee',
      id: employee.id,
      name: employeeFullName(employee),
      status: employee.status,
      employee,
    })),
    ...invites.map((invite): Row => ({ kind: 'invite', id: invite.id, name: invite.fullName, status: 'invited', invite })),
  ];

  const count = (status: ListStatus) => rows.filter((r) => r.status === status).length;
  const query = search.trim().toLowerCase();
  const shown = rows
    .filter((r) => filter === 'All' || r.status === FILTER_STATUS[filter])
    .filter((r) => {
      if (!query) return true;
      const role = r.kind === 'employee' ? r.employee.role : r.invite.role;
      const email = r.kind === 'employee' ? r.employee.email : r.invite.email;
      return [r.name, role, email].some((v) => v.toLowerCase().includes(query));
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <OwnerScreen>
      <ScreenHeader title="Employees" onBack={() => router.navigate('/menu')} />
      <Text style={styles.subtitle}>Manage your team, pay rates, qualifications and more.</Text>

      <View style={styles.actions}>
        <View style={styles.flex}>
          <Button
            label="Add Employee"
            icon={{ ios: 'plus', android: 'add', web: 'add' }}
            onPress={() => router.push('/employees/add' as Href)}
          />
        </View>
        <View style={styles.flex}>
          <Button
            label="Share Invite Code"
            icon={{ ios: 'square.and.arrow.up', android: 'share', web: 'share' }}
            variant="secondary"
            onPress={() => shareInvite().catch(() => {})}
          />
        </View>
      </View>

      <StatGrid columns={4}>
        <SummaryTile label="Total Employees" value={rows.length} tone="blue" />
        <SummaryTile label="Active" value={count('active')} tone="green" />
        <SummaryTile label="On Leave" value={count('on_leave')} tone="amber" />
        <SummaryTile label="Inactive" value={count('inactive')} tone="red" />
      </StatGrid>

      <View style={styles.search}>
        <Icon name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} color={C.textSecondary} size={16} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name, role or email"
          placeholderTextColor={C.textSecondary}
          style={styles.searchInput}
          accessibilityLabel="Search employees"
        />
      </View>

      <View style={styles.filters}>
        {FILTERS.map((f) => {
          const selected = f === filter;
          return (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              style={[styles.filter, selected && styles.filterSelected]}>
              <Text style={[styles.filterText, selected && styles.filterTextSelected]}>{f}</Text>
            </Pressable>
          );
        })}
      </View>

      <Card>
        {shown.length === 0 ? (
          <EmptyState
            icon={OwnerIcons.people}
            message={
              rows.length === 0
                ? 'No employees yet. Tap “Add Employee”, or share your invite code so your team can sign up.'
                : 'No employees match your search.'
            }
          />
        ) : (
          shown.map((row, i) => <EmployeeRow key={row.id} row={row} first={i === 0} />)
        )}
      </Card>
    </OwnerScreen>
  );
}

function EmployeeRow({ row, first }: { row: Row; first: boolean }) {
  const isInvite = row.kind === 'invite';
  const person = isInvite ? row.invite : row.employee;
  const rate = formatPayRate(person.payRate, person.payType);

  function open() {
    if (row.kind === 'employee') {
      router.push({ pathname: '/employee/[id]', params: { id: row.id, from: 'employees' } });
    } else {
      router.push({ pathname: '/employees/add', params: { id: row.id } } as Href);
    }
  }

  return (
    <Pressable
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={`${row.name}, ${person.role || 'no role'}, ${isInvite ? 'invited' : row.status}`}
      style={({ pressed }) => [styles.row, !first && styles.divider, pressed && styles.pressed]}>
      <Avatar name={row.name} photoUrl={isInvite ? null : row.employee.photoUrl} />
      <View style={styles.rowText}>
        <View style={styles.nameLine}>
          <Text style={styles.name} numberOfLines={1}>
            {row.name}
          </Text>
          <StatusBadge status={row.status} />
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {person.role || 'No role set'} · <Text style={styles.rate}>{rate}</Text>
        </Text>
        {person.email ? (
          <Text style={styles.contact} numberOfLines={1}>
            {person.email}
          </Text>
        ) : null}
        {person.phone ? <Text style={styles.contact}>{person.phone}</Text> : null}
      </View>
      {isInvite ? (
        <Pressable
          onPress={() => sendInvite(row.invite)}
          accessibilityRole="button"
          accessibilityLabel={`Send invite to ${row.name}`}
          hitSlop={6}
          style={({ pressed }) => [styles.inviteButton, pressed && styles.pressed]}>
          <Icon name={{ ios: 'paperplane.fill', android: 'send', web: 'send' }} color={C.accent} size={14} />
          <Text style={styles.inviteText}>Invite</Text>
        </Pressable>
      ) : (
        <Icon name={OwnerIcons.chevron} color={C.textSecondary} size={14} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
  },
  subtitle: {
    color: C.textSecondary,
    fontSize: 15,
    lineHeight: 21,
    marginTop: -Spacing.two,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 46,
    paddingHorizontal: Spacing.three - 2,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  searchInput: {
    flex: 1,
    color: C.text,
    fontSize: 15,
    paddingVertical: Spacing.two,
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  filter: {
    paddingVertical: 6,
    paddingHorizontal: Spacing.three - 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.border,
  },
  filterSelected: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  filterText: {
    color: C.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  filterTextSelected: {
    color: '#FFFFFF',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    paddingVertical: Spacing.three - 4,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  nameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  name: {
    flexShrink: 1,
    color: C.text,
    fontSize: 16,
    fontWeight: '700',
  },
  meta: {
    color: C.textSecondary,
    fontSize: 13,
  },
  rate: {
    color: C.text,
    fontWeight: '600',
  },
  contact: {
    color: C.textSecondary,
    fontSize: 13,
  },
  inviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: Spacing.two + 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.accent,
  },
  inviteText: {
    color: C.accent,
    fontSize: 13,
    fontWeight: '700',
  },
});
