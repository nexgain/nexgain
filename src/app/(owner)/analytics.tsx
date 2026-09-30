import { useState } from 'react';

import { BarChart, DonutChart, LineChart, SeriesColors } from '@/components/owner/charts';
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
import { useClockSessions } from '@/data/clock-records';
import { formatShortDate } from '@/data/employee-roster';
import { useEmployees } from '@/data/employees';
import { byCategory, expenseEntries, inRange, revenueEntries, sumEntries, useExpenses } from '@/data/finance';
import { useDocs } from '@/data/invoices';
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

  // Revenue = paid invoices; expenses = approved payroll + entered expenses.
  const revenue = revenueEntries(useDocs());
  const expenses = expenseEntries(useExpenses(), usePayslipRecords(), employees);
  const revenueByBucket = buckets.map((b) => sumEntries(inRange(revenue, b)));
  const expensesByBucket = buckets.map((b) => sumEntries(inRange(expenses, b)));
  const totalRevenue = revenueByBucket.reduce((sum, v) => sum + v, 0);
  const totalExpenses = expensesByBucket.reduce((sum, v) => sum + v, 0);
  const periodExpenses = inRange(expenses, { start: buckets[0].start, end: buckets[buckets.length - 1].end });
  const topCategories = byCategory(periodExpenses)
    .slice(0, SeriesColors.length)
    .map((c, i) => ({ name: c.category, value: c.amount, color: SeriesColors[i] }));
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
              <DonutChart segments={topCategories} formatValue={money} />
            </Card>
            <Card title="AI Insights" icon={OwnerIcons.sparkles}>
              <EmptyState icon={OwnerIcons.sparkles} message="No data yet" />
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
