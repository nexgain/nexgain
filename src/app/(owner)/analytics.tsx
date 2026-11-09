import { useState } from 'react';

import { AiInsightsList } from '@/components/owner/ai-ui';
import { BarChart, DonutChart, LineChart, SeriesColors } from '@/components/owner/charts';
import { GROUP_COLORS } from '@/components/owner/money-review';
import {
  Card,
  EmptyState,
  goBack,
  OwnerIcons,
  OwnerScreen,
  PageHeader,
  RangeSelect,
  ResponsiveRow,
  StatCard,
  StatGrid,
  TabRow,
} from '@/components/owner/ui';
import { transactionItems } from '@/data/bank';
import { useClockSessions } from '@/data/clock-records';
import { formatShortDate } from '@/data/employee-roster';
import { useEmployees } from '@/data/employees';
import { expenseEntries, inRange, revenueEntries, sumEntries, useExpenses } from '@/data/finance';
import { useDocs } from '@/data/invoices';
import { spendingByGroup, useMoneyFeed } from '@/data/money-sorting';
import { formatMoney, getPayPeriods, labourCost, usePayslipRecords } from '@/data/payroll';

const TABS = ['Overview', 'Labour Costs', 'Finance', 'Productivity', 'Suppliers', 'Custom'] as const;
type Tab = (typeof TABS)[number];

type Bucket = { label: string; start: Date; end: Date };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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

const money = (v: number) => formatMoney(v, { cents: false });

export default function AnalyticsScreen() {
  const now = new Date();
  const employees = useEmployees();
  const sessions = useClockSessions();
  const [tab, setTab] = useState<Tab>('Overview');
  const [range, setRange] = useState<(typeof RANGES)[number]>(RANGES[0]);

  const buckets = range.buckets(now);
  const labourByBucket = buckets.map((b) => labourCost(employees, sessions, b, now));
  const totalLabour = labourByBucket.reduce((sum, v) => sum + v, 0);

  // Revenue = paid invoices. Expenses = money spent, from the Transactions page
  // (bank + typed-in expenses; not income or transfers). Without a bank feed,
  // wages paid through payroll are added, as the bank isn't there to show them.
  const revenue = revenueEntries(useDocs());
  const typedExpenses = useExpenses();
  const feed = useMoneyFeed();
  const payrollEntries = expenseEntries([], usePayslipRecords(), employees);
  const spendItems = transactionItems(feed.transactions, feed.accounts, feed.preview ? [] : typedExpenses);
  const wagesIn = (range: { start: Date; end: Date }) => (feed.connected ? 0 : sumEntries(inRange(payrollEntries, range)));
  const spentIn = (range: { start: Date; end: Date }) =>
    spendingByGroup(spendItems, range.start, range.end, wagesIn(range)).reduce((sum, g) => sum + g.total, 0);
  const revenueByBucket = buckets.map((b) => sumEntries(inRange(revenue, b)));
  const expensesByBucket = buckets.map((b) => Math.round(spentIn(b) * 100) / 100);
  const totalRevenue = revenueByBucket.reduce((sum, v) => sum + v, 0);
  const totalExpenses = expensesByBucket.reduce((sum, v) => sum + v, 0);
  // The wheel: the same spending, by group (Materials, Labour, Fuel...).
  const whole = { start: buckets[0].start, end: buckets[buckets.length - 1].end };
  const topCategories = spendingByGroup(spendItems, whole.start, whole.end, wagesIn(whole)).map((g) => ({
    name: g.group.name,
    value: g.total,
    color: GROUP_COLORS[g.group.id],
  }));
  const labourPercent = totalRevenue > 0 ? Math.round((totalLabour / totalRevenue) * 100) : 0;

  return (
    <OwnerScreen>
      <PageHeader
        onBack={() => goBack()}
        title="Analytics"
        subtitle="Get deeper insights into your business performance."
        right={<RangeSelect options={RANGES} value={range} onChange={setRange} />}
      />

      <TabRow tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'Overview' ? (
        <>
          <StatGrid columns={4}>
            <StatCard
              icon={OwnerIcons.trendingUp}
              label="Total Revenue"
              value={money(totalRevenue)}
              changeLabel="vs previous period"
            />
            <StatCard
              icon={OwnerIcons.card}
              label="Total Expenses"
              value={money(totalExpenses)}
              changeLabel="vs previous period"
            />
            <StatCard
              icon={OwnerIcons.wallet}
              label="Net Profit"
              value={money(totalRevenue - totalExpenses)}
              changeLabel="vs previous period"
            />
            <StatCard
              icon={OwnerIcons.percent}
              label="Labour Cost %"
              value={`${labourPercent}%`}
              changeLabel="vs previous period"
            />
          </StatGrid>

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
            <Card title="Labour Costs" icon={OwnerIcons.trendingUp}>
              <LineChart
                categories={buckets.map((b) => b.label)}
                series={[{ name: 'Labour cost', color: SeriesColors[0], values: labourByBucket }]}
                formatValue={money}
              />
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
        </>
      ) : (
        <Card title={tab}>
          <EmptyState icon={OwnerIcons.chart} message="No data yet" />
        </Card>
      )}
    </OwnerScreen>
  );
}
