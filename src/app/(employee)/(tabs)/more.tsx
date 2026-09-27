import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Avatar, Card, EmployeeScreen, IconBadge, ListRow } from '@/components/employee/ui';
import { EmployeeColors as C } from '@/constants/employee-theme';
import { Spacing } from '@/constants/theme';
import { ACCOUNT_SECTIONS } from '@/data/employee-account';
import { currentEmployee, employeeInitials } from '@/data/current-employee';

export default function MoreScreen() {
  return (
    <EmployeeScreen title="More">
      <Card style={styles.profileCard}>
        <Avatar initials={employeeInitials(currentEmployee)} size={60} />
        <View style={styles.profileText}>
          <Text style={styles.name}>
            {currentEmployee ? `${currentEmployee.firstName} ${currentEmployee.lastName}` : 'Your Name'}
          </Text>
          <Text style={styles.employeeId}>Employee ID: {currentEmployee?.employeeId ?? '—'}</Text>
        </View>
      </Card>

      <Card>
        {ACCOUNT_SECTIONS.map((section, i) => (
          <ListRow
            key={section.id}
            icon={<IconBadge name={section.icon} />}
            title={section.title}
            subtitle={section.subtitle}
            showDivider={i > 0}
            onPress={() =>
              router.push(
                section.href ?? { pathname: '/account/[section]', params: { section: section.id } },
              )
            }
          />
        ))}
      </Card>

      {/* No real session yet: logging out just returns to the landing screen. */}
      <Card style={styles.logoutCard}>
        <ListRow
          icon={
            <IconBadge
              name={{
                ios: 'rectangle.portrait.and.arrow.right',
                android: 'logout',
                web: 'logout',
              }}
              color={C.danger}
              background={C.dangerSoft}
            />
          }
          title="Log Out"
          showChevron={false}
          destructive
          onPress={() => router.replace('/')}
        />
      </Card>
    </EmployeeScreen>
  );
}

const styles = StyleSheet.create({
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  profileText: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: C.text,
    fontSize: 20,
    fontWeight: '700',
  },
  employeeId: {
    color: C.textSecondary,
    fontSize: 14,
  },
  logoutCard: {
    marginTop: Spacing.three,
  },
});
