import { Image } from 'expo-image';
import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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
import { NotificationsSection } from '@/components/owner/notifications-section';
import { UpcomingSection } from '@/components/owner/upcoming';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { transactionItems, useBankAccounts, useBankTransactions } from '@/data/bank';
import { ownerFirstName, useBusiness } from '@/data/business';
import { useEmployees } from '@/data/employees';
import {
  expenseEntries,
  financeRanges,
  inRange,
  percentChange,
  revenueEntries,
  sumEntries,
  useExpenses,
} from '@/data/finance';
import { useDocs } from '@/data/invoices';
import { formatMoney, usePayslipRecords } from '@/data/payroll';
import { indexReceipts, receiptStatus, useReceipts } from '@/data/receipts';

const NO_INSIGHTS = 'No insights yet — check back once you have more activity data.';

function greetingFor(date: Date) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function OwnerDashboardScreen() {
  const now = new Date();
  // Filled in by owner sign-up; before that the greeting stays as it was.
  const business = useBusiness();
  const firstName = ownerFirstName(business);

  // This month's money in and out, compared with last month.
  const [thisMonth, lastMonth] = financeRanges(now);
  const revenue = revenueEntries(useDocs());
  const expenses = expenseEntries(useExpenses(), usePayslipRecords(), useEmployees());
  const revenueNow = sumEntries(inRange(revenue, thisMonth));
  const expensesNow = sumEntries(inRange(expenses, thisMonth));

  // Expenses over $82.50 this financial year with no receipt (needed to claim the GST).
  const thisFy = financeRanges(now)[2];
  const receiptIndex = indexReceipts(useReceipts());
  const missingReceipts = transactionItems(useBankTransactions(), useBankAccounts(), useExpenses()).filter(
    (i) => i.date >= thisFy.start && i.date < thisFy.end && receiptStatus(i, receiptIndex) === 'missing',
  ).length;

  return (
    <OwnerScreen>
      <PageHeader
        title={firstName ? `${greetingFor(now)}, ${firstName}` : greetingFor(now)}
        subtitle={`${now.toLocaleDateString([], {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}\n${business?.businessName || "Here's what's happening with your business today."}`}
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={business?.logo ? `${business.businessName} logo` : 'Notifications'}
            style={({ pressed }) => [styles.bell, pressed && styles.pressed]}>
            {business?.logo ? (
              <Image source={{ uri: business.logo }} style={styles.logo} contentFit="cover" />
            ) : (
              <Icon name={OwnerIcons.bell} color={C.text} size={18} />
            )}
          </Pressable>
        }
      />

      <StatGrid columns={2}>
        <Pressable
          onPress={() => router.navigate('/revenue')}
          accessibilityRole="button"
          accessibilityLabel={`Revenue this month ${formatMoney(revenueNow)}. Open revenue.`}
          style={({ pressed }) => pressed && styles.pressed}>
          <StatCard
            icon={OwnerIcons.trendingUp}
            label="Revenue (This Month)"
            value={formatMoney(revenueNow, { cents: false })}
            change={percentChange(revenueNow, sumEntries(inRange(revenue, lastMonth)))}
            changeLabel="vs last month"
          />
        </Pressable>
        <Pressable
          onPress={() => router.navigate('/expenses' as Href)}
          accessibilityRole="button"
          accessibilityLabel={`Expenses this month ${formatMoney(expensesNow)}. Open expenses.`}
          style={({ pressed }) => pressed && styles.pressed}>
          <StatCard
            icon={OwnerIcons.card}
            label="Expenses (This Month)"
            value={formatMoney(expensesNow, { cents: false })}
            change={percentChange(expensesNow, sumEntries(inRange(expenses, lastMonth)))}
            changeLabel="vs last month"
          />
        </Pressable>
      </StatGrid>

      {missingReceipts > 0 && (
        <Pressable
          onPress={() => router.navigate({ pathname: '/transactions', params: { filter: 'missing', range: 'this-fy' } } as Href)}
          accessibilityRole="button"
          accessibilityLabel={`${missingReceipts} receipts missing this financial year. Open the list.`}
          style={({ pressed }) => [styles.receiptsCard, pressed && styles.pressed]}>
          <View style={styles.receiptsIcon}>
            <Icon name={{ ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' }} color={C.warning} size={18} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.receiptsTitle}>
              {missingReceipts} receipt{missingReceipts === 1 ? '' : 's'} missing
            </Text>
            <Text style={styles.receiptsText}>Expenses over $82.50 this financial year. Add them to claim the GST.</Text>
          </View>
          <Icon name={OwnerIcons.chevron} color={C.textSecondary} size={12} />
        </Pressable>
      )}

      <UpcomingSection />

      <NotificationsSection />

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
              icon={OwnerIcons.people}
              label="Employees"
              // Typed routes only list '/employees/index' for a folder index screen.
              onPress={() => router.navigate('/employees' as Href)}
              showDivider
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
  flex: {
    flex: 1,
  },
  receiptsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    padding: Spacing.three,
    borderRadius: Radius.large - 4,
    backgroundColor: 'rgba(245, 158, 11, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  receiptsIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.16)',
  },
  receiptsTitle: {
    color: C.text,
    fontSize: 16,
    fontWeight: '700',
  },
  receiptsText: {
    color: C.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
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
  logo: {
    width: '100%',
    height: '100%',
    borderRadius: 21,
  },
});
