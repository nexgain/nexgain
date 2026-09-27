import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  ActionRow,
  Card,
  EmptyState,
  Icon,
  OwnerIcons,
  OwnerScreen,
  PageHeader,
  ResponsiveRow,
  StatCard,
  StatGrid,
} from '@/components/owner/ui';
import { UpcomingSection } from '@/components/owner/upcoming';
import { Colors as C } from '@/constants/theme';
import { useClockSessions } from '@/data/clock-records';
import { useEmployees } from '@/data/employees';
import { calculatePayLines, formatHours, formatMoney, getPayPeriods, payTotals } from '@/data/payroll';

const NO_INSIGHTS = 'No insights yet — check back once you have more activity data.';

function greetingFor(date: Date) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function OwnerDashboardScreen() {
  const now = new Date();
  const employees = useEmployees();
  const sessions = useClockSessions();

  const [thisWeek] = getPayPeriods(now, 1);
  const totals = payTotals(calculatePayLines(employees, sessions, thisWeek, {}, now));

  return (
    <OwnerScreen>
      <PageHeader
        title={greetingFor(now)}
        subtitle={`${now.toLocaleDateString([], {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}\nHere's what's happening with your business today.`}
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Notifications"
            style={({ pressed }) => [styles.bell, pressed && styles.pressed]}>
            <Icon name={OwnerIcons.bell} color={C.text} size={18} />
          </Pressable>
        }
      />

      <StatGrid columns={3}>
        <StatCard
          icon={OwnerIcons.money}
          label="Total Payroll (This Week)"
          value={formatMoney(totals.gross, { cents: false })}
        />
        <StatCard
          icon={OwnerIcons.clock}
          label="Hours Worked"
          value={`${formatHours(totals.hours)} hrs`}
        />
        <StatCard icon={OwnerIcons.people} label="Active Employees" value={`${employees.length}`} />
      </StatGrid>

      <UpcomingSection />

      <ResponsiveRow weights={[1.6, 1]}>
        <Card title="AI Insights & Recommendations" icon={OwnerIcons.sparkles}>
          <EmptyState icon={OwnerIcons.sparkles} message={NO_INSIGHTS} />
        </Card>

        <Card title="Quick Actions">
          <View>
            <ActionRow
              icon={OwnerIcons.calendar}
              label="Create Roster"
              onPress={() => router.navigate('/roster')}
            />
            <ActionRow
              icon={OwnerIcons.money}
              label="Run Payroll"
              onPress={() => router.navigate('/payroll')}
              showDivider
            />
            <ActionRow
              icon={OwnerIcons.receipt}
              label="Invoices & Quotes"
              // Typed routes only list '/invoices/index' for a folder index screen.
              onPress={() => router.navigate('/invoices' as Href)}
              showDivider
            />
            <ActionRow
              icon={OwnerIcons.chart}
              label="View Reports"
              onPress={() => router.navigate('/analytics')}
              showDivider
            />
            <ActionRow
              icon={OwnerIcons.sparkles}
              label="Ask AI Assistant"
              onPress={() => router.navigate('/ai-assistant')}
              showDivider
            />
          </View>
        </Card>
      </ResponsiveRow>

      <Card title="Other Insights" icon={OwnerIcons.lightbulb}>
        <EmptyState icon={OwnerIcons.lightbulb} message={NO_INSIGHTS} />
      </Card>
    </OwnerScreen>
  );
}

const styles = StyleSheet.create({
  bell: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  pressed: {
    opacity: 0.7,
  },
});
