import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AiInsightsList } from '@/systems/bookings/components/owner/ai-ui';
import { BarChart, DonutChart, LineChart, SeriesColors } from '@/systems/bookings/components/owner/charts';
import { GROUP_COLORS } from '@/systems/bookings/components/owner/money-review';
import {
  Card,
  goBack,
  OwnerIcons,
  OwnerScreen,
  PageHeader,
  RangeSelect,
  ResponsiveRow,
  StatCard,
  StatGrid,
} from '@/systems/bookings/components/owner/ui';
import { Colors as C, Spacing } from '@/constants/theme';
import { transactionItems } from '@/data/bank';
import { useClockSessions } from '@/data/clock-records';
import { formatShortDate } from '@/data/employee-roster';
import { useEmployees } from '@/data/employees';
import { expenseEntries, inRange, revenueEntries, sumEntries, useExpenses } from '@/data/finance';
import { useDocs } from '@/data/invoices';
import { spendingByGroup, useMoneyFeed } from '@/data/money-sorting';
import { getPayPeriods, labourCost, usePayslipRecords } from '@/data/payroll';
import { bookingRevenueEntries, bookingStats, busiestDay, busiestHour, percent } from '@/systems/bookings/data/booking-stats';
import { formatPrice, useBookings, useBookingStaff, useBusinessTimeZone } from '@/systems/bookings/data/bookings';

type Bucket = { label: string; start: Date; end: Date };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function monthBuckets(now: Date, count: number): Bucket[] {
  return Array.from({ length: count }, (_, i) => {
    const start = new Date(now.getFullYear(), now.getMonth() - (count - 1 - i), 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    return { label: MONTHS[start.getMonth()], start, end };
  });
}

const RANGES = [
  {
    id: '4w',
    label: 'Last 4 weeks',
    buckets: (now: Date): Bucket[] =>
      getPayPeriods(now, 4)
        .reverse()
        .map((p) => ({ label: formatShortDate(p.start, false), start: p.start, end: p.end })),
  },
  { id: '3m', label: 'Last 3 months', buckets: (now: Date) => monthBuckets(now, 3) },
  { id: '6m', label: 'Last 6 months', buckets: (now: Date) => monthBuckets(now, 6) },
] as const;

const money = (v: number) => formatPrice(v, { whole: true });
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'a' : 'p'}`;

// Analytics (NexGain Bookings): revenue (invoices and bookings), expenses,
// profit and labour cost, then the bookings themselves: revenue per staff
// member (next to their wages), popular services, busiest days and times,
// cancellations and no-shows.
export default function AnalyticsScreen() {
  const now = new Date();
  const employees = useEmployees();
  const sessions = useClockSessions();
  const [range, setRange] = useState<(typeof RANGES)[number]>(RANGES[0]);
  const timeZone = useBusinessTimeZone();
  const bookings = useBookings();
  const staff = useBookingStaff();
  const payslips = usePayslipRecords();

  const buckets = range.buckets(now);
  const whole = { start: buckets[0].start, end: buckets[buckets.length - 1].end };
  const labourByBucket = buckets.map((b) => labourCost(employees, sessions, b, now));
  const totalLabour = labourByBucket.reduce((sum, v) => sum + v, 0);

  // Revenue = paid invoices + bookings that have happened. Expenses = money
  // spent, from the Transactions page (plus wages from payroll without a bank feed).
  const revenue = [...revenueEntries(useDocs()), ...bookingRevenueEntries(bookings, staff, now)];
  const typedExpenses = useExpenses();
  const feed = useMoneyFeed();
  const payrollEntries = expenseEntries([], payslips, employees);
  const spendItems = transactionItems(feed.transactions, feed.accounts, feed.preview ? [] : typedExpenses);
  const wagesIn = (r: { start: Date; end: Date }) => (feed.connected ? 0 : sumEntries(inRange(payrollEntries, r)));
  const spentIn = (r: { start: Date; end: Date }) => spendingByGroup(spendItems, r.start, r.end, wagesIn(r)).reduce((sum, g) => sum + g.total, 0);
  const revenueByBucket = buckets.map((b) => sumEntries(inRange(revenue, b)));
  const expensesByBucket = buckets.map((b) => Math.round(spentIn(b) * 100) / 100);
  const totalRevenue = revenueByBucket.reduce((sum, v) => sum + v, 0);
  const totalExpenses = expensesByBucket.reduce((sum, v) => sum + v, 0);
  const topCategories = spendingByGroup(spendItems, whole.start, whole.end, wagesIn(whole)).map((g) => ({
    name: g.group.name,
    value: g.total,
    color: GROUP_COLORS[g.group.id],
  }));
  const labourPercent = totalRevenue > 0 ? Math.round((totalLabour / totalRevenue) * 100) : 0;

  // Bookings in the period.
  const stats = bookingStats(bookings, staff, whole, timeZone, now);
  const bookingRevenueByBucket = buckets.map((b) => bookingStats(bookings, staff, b, timeZone, now).revenue);
  // Wages paid to each staff member in the period (from payroll), next to what they brought in.
  const wagesFor = (employeeId: string | null) =>
    employeeId
      ? Math.round(
          payslips
            .filter((p) => p.employeeId === employeeId && p.periodEnd >= isoDay(whole.start) && p.periodEnd < isoDay(whole.end))
            .reduce((s, p) => s + p.gross + p.super, 0) * 100,
        ) / 100
      : null;
  const hours = stats.byHour.map((count, h) => ({ count, h })).filter((x, i, all) => {
    const first = all.findIndex((y) => y.count > 0);
    const last = all.length - 1 - [...all].reverse().findIndex((y) => y.count > 0);
    return first >= 0 && i >= first && i <= last;
  });

  return (
    <OwnerScreen>
      <PageHeader
        onBack={() => goBack()}
        title="Analytics"
        subtitle="How your bookings and business are going."
        right={<RangeSelect options={RANGES} value={range} onChange={setRange} />}
      />

      <StatGrid columns={4}>
        <StatCard icon={OwnerIcons.trendingUp} label="Total Revenue" value={money(totalRevenue)} changeLabel="invoices and bookings" />
        <StatCard icon={OwnerIcons.card} label="Total Expenses" value={money(totalExpenses)} changeLabel="vs previous period" />
        <StatCard icon={OwnerIcons.wallet} label="Net Profit" value={money(totalRevenue - totalExpenses)} changeLabel="revenue minus expenses" />
        <StatCard icon={OwnerIcons.percent} label="Labour Cost %" value={`${labourPercent}%`} changeLabel="of revenue" />
      </StatGrid>

      <Card title="Bookings" icon={OwnerIcons.calendar}>
        <StatGrid columns={4}>
          <StatCard icon={OwnerIcons.calendar} label="Bookings" value={String(stats.booked)} changeLabel={`${money(stats.upcomingValue)} still to come`} />
          <StatCard icon={OwnerIcons.money} label="Booking Revenue" value={money(stats.revenue)} changeLabel={`${money(stats.averageValue)} average`} />
          <StatCard
            icon={OwnerIcons.info}
            label="Cancellations"
            value={String(stats.cancelled)}
            changeLabel={`${percent(stats.cancellationRate)} of bookings · ${stats.cancelledByCustomer} by customers`}
          />
          <StatCard
            icon={OwnerIcons.person}
            label="No-shows"
            value={String(stats.noShows)}
            changeLabel={`${percent(stats.noShowRate)} · ${money(stats.noShowValue)} lost`}
          />
        </StatGrid>
      </Card>

      <ResponsiveRow>
        <Card title="Revenue vs Expenses" icon={OwnerIcons.chart}>
          <BarChart
            categories={buckets.map((b) => b.label)}
            series={[
              { name: 'Revenue', color: SeriesColors[0], values: revenueByBucket },
              { name: 'Expenses', color: SeriesColors[1], values: expensesByBucket },
            ]}
            formatValue={money}
          />
        </Card>
        <Card title="Booking Revenue" icon={OwnerIcons.trendingUp}>
          <LineChart
            categories={buckets.map((b) => b.label)}
            series={[
              { name: 'Bookings', color: SeriesColors[0], values: bookingRevenueByBucket },
              { name: 'Labour cost', color: SeriesColors[1], values: labourByBucket },
            ]}
            formatValue={money}
          />
        </Card>
      </ResponsiveRow>

      <ResponsiveRow>
        <Card title="Revenue per Staff Member" icon={OwnerIcons.people}>
          {stats.byStaff.length === 0 ? (
            <Text style={styles.muted}>No bookings in this period yet.</Text>
          ) : (
            stats.byStaff.map((s, i) => {
              const wages = wagesFor(staff.find((x) => x.id === s.staffId)?.employeeId ?? null);
              return (
                <View key={s.staffId} style={[styles.row, i > 0 && styles.divider]}>
                  <View style={styles.flex}>
                    <Text style={styles.title}>{s.name}</Text>
                    <Text style={styles.muted}>
                      {s.booked} booking{s.booked === 1 ? '' : 's'}
                      {wages !== null && wages > 0 ? ` · ${money(wages)} wages` : ''}
                    </Text>
                  </View>
                  <Text style={styles.amount}>{money(s.revenue)}</Text>
                </View>
              );
            })
          )}
        </Card>
        <Card title="Most Popular Services" icon={OwnerIcons.scissors}>
          {stats.byService.length === 0 ? (
            <Text style={styles.muted}>No bookings in this period yet.</Text>
          ) : (
            stats.byService.slice(0, 6).map((s, i) => (
              <View key={s.name} style={[styles.row, i > 0 && styles.divider]}>
                <View style={styles.flex}>
                  <Text style={styles.title}>{s.name}</Text>
                  <Text style={styles.muted}>
                    {s.booked} booking{s.booked === 1 ? '' : 's'}
                  </Text>
                </View>
                <Text style={styles.amount}>{money(s.revenue)}</Text>
              </View>
            ))
          )}
        </Card>
      </ResponsiveRow>

      <ResponsiveRow>
        <Card title="Busiest Days" icon={OwnerIcons.calendar}>
          <BarChart
            categories={WEEKDAYS}
            series={[{ name: 'Bookings', color: SeriesColors[0], values: stats.byWeekday }]}
            formatValue={(v) => String(Math.round(v))}
            emptyMessage="No bookings yet"
          />
          {busiestDay(stats) && <Text style={styles.muted}>Busiest: {busiestDay(stats)}</Text>}
        </Card>
        <Card title="Busiest Times" icon={OwnerIcons.clock}>
          <BarChart
            categories={hours.map((x) => hourLabel(x.h))}
            series={[{ name: 'Bookings', color: SeriesColors[1], values: hours.map((x) => x.count) }]}
            formatValue={(v) => String(Math.round(v))}
            emptyMessage="No bookings yet"
          />
          {busiestHour(stats) && <Text style={styles.muted}>Busiest: {busiestHour(stats)}</Text>}
        </Card>
      </ResponsiveRow>

      <ResponsiveRow>
        <Card title="Top Expense Categories" icon={OwnerIcons.card}>
          <DonutChart segments={topCategories} formatValue={money} showPercent emptyMessage="No spending yet" />
        </Card>
        <Card title="AI Insights" icon={OwnerIcons.sparkles}>
          <AiInsightsList placement="analytics" empty="No data yet" />
        </Card>
      </ResponsiveRow>
    </OwnerScreen>
  );
}

/** A local date as "YYYY-MM-DD" (for comparing with pay periods). */
function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  muted: { color: C.textSecondary, fontSize: 13, lineHeight: 18 },
  title: { color: C.text, fontSize: 15, fontWeight: '600' },
  amount: { color: C.text, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  flex: { flex: 1 },
});
