// Reports (NexGain Retail): how the shop is doing over a chosen time.
//   - Sales, gross profit, items sold and sell-through at the top,
//   - sales (and profit) over time,
//   - sales by category, product, size or colour,
//   - most and least profitable products, slowest-selling stock,
//   - what the stock is worth, top staff, each store side by side (2+ stores),
//   - money in vs money out (expenses, wages) and the AI insights.
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AiInsightsList } from '@/systems/retail/components/owner/ai-ui';
import { BarChart, DonutChart, SeriesColors } from '@/systems/retail/components/owner/charts';
import { GROUP_COLORS } from '@/systems/retail/components/owner/money-review';
import { Pill, Segmented, StatBox, TableHead, retailStyles } from '@/systems/retail/components/owner/retail-ui';
import { StockIcons } from '@/systems/retail/components/owner/stock-ui';
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
} from '@/systems/retail/components/owner/ui';
import { Colors as C, Spacing } from '@/constants/theme';
import { transactionItems } from '@/data/bank';
import { useBusiness } from '@/data/business';
import { useClockSessions } from '@/data/clock-records';
import { formatShortDate } from '@/data/employee-roster';
import { useEmployees } from '@/data/employees';
import { expenseEntries, inRange, percentChange, sumEntries, useExpenses } from '@/data/finance';
import { spendingByGroup, useMoneyFeed } from '@/data/money-sorting';
import { formatMoney, getPayPeriods, labourCost, usePayslipRecords } from '@/data/payroll';
import { businessUsesGst } from '@/data/super-rules';
import { periodTotals, productMargins, salesBreakdown, salesOverTime, sellThrough, storeComparison, type BreakdownBy } from '@/systems/retail/data/analytics';
import { hasManyStores, useCategories, useStores } from '@/systems/retail/data/retail';
import { salesByPerson, useSales } from '@/systems/retail/data/sales';
import { stockValue, useProducts, useStockLevels } from '@/systems/retail/data/stock';

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
  { id: '12m', label: 'Last 12 months', buckets: (now: Date) => monthBuckets(now, 12) },
] as const;

const BREAKDOWNS: { value: BreakdownBy; label: string }[] = [
  { value: 'category', label: 'Category' },
  { value: 'product', label: 'Product' },
  { value: 'size', label: 'Size' },
  { value: 'colour', label: 'Colour' },
];

const money = (v: number) => formatMoney(v, { cents: false });
/** Rows shown in the longer tables. */
const SHOW = 8;
/** Under this margin a product shows in "Low Margins". */
const LOW_MARGIN = 30;
const NO_SALES = 'No sales in this time yet';

/** A table row: the first column is the name, the rest are right-aligned numbers. `low` turns the last one red. */
function Row({ cells, low }: { cells: string[]; low?: boolean }) {
  return (
    <View style={retailStyles.tableRow}>
      {cells.map((c, i) => (
        <Text
          key={i}
          numberOfLines={1}
          style={[
            retailStyles.td,
            { flex: i === 0 ? 2 : 1, textAlign: i === 0 ? 'left' : 'right' },
            low && i === cells.length - 1 && retailStyles.tdLow,
          ]}>
          {c}
        </Text>
      ))}
    </View>
  );
}

const head = (first: string, ...rest: string[]) => [{ label: first, flex: 2 }, ...rest.map((label) => ({ label, align: 'right' as const }))];

function Empty({ text }: { text: string }) {
  return <Text style={styles.empty}>{text}</Text>;
}

export default function AnalyticsScreen() {
  const [now] = useState(() => new Date());
  const employees = useEmployees();
  const sessions = useClockSessions();
  const [range, setRange] = useState<(typeof RANGES)[number]>(RANGES[0]);
  const [by, setBy] = useState<BreakdownBy>('category');
  const usesGst = businessUsesGst(useBusiness());

  const sales = useSales();
  const products = useProducts();
  const levels = useStockLevels();
  const categories = useCategories();
  const stores = useStores();

  const buckets = range.buckets(now);
  const whole = { start: buckets[0].start, end: buckets[buckets.length - 1].end };
  // The same length of time just before, for "vs previous period".
  const length = whole.end.getTime() - whole.start.getTime();
  const before = { start: new Date(whole.start.getTime() - length), end: whole.start };

  // ---- Sales and stock ----
  const totals = periodTotals(sales, products, whole);
  const previous = periodTotals(sales, products, before);
  const overTime = salesOverTime(sales, products, buckets);
  const breakdown = salesBreakdown(sales, products, categories, whole, by);
  const through = sellThrough(sales, products, levels, whole);
  const margins = productMargins(sales, products, whole);
  const lowMargins = [...margins].sort((a, b) => a.margin - b.margin).filter((m) => m.margin < LOW_MARGIN).slice(0, 5);
  const value = stockValue(products, levels);
  const sellValue = usesGst ? value.sell / 1.1 : value.sell;
  const staff = salesByPerson(sales, whole.start, whole.end);
  const manyStores = hasManyStores(stores);
  const storeRows = manyStores ? storeComparison(sales, products, levels, stores, whole) : [];

  // ---- Money in vs money out ----
  // Expenses = money spent, from the Transactions page (bank + typed-in expenses).
  // Without a bank feed, wages paid through payroll are added.
  const totalLabour = buckets.reduce((sum, b) => sum + labourCost(employees, sessions, b, now), 0);
  const typedExpenses = useExpenses();
  const feed = useMoneyFeed();
  const payrollEntries = expenseEntries([], usePayslipRecords(), employees);
  const spendItems = transactionItems(feed.transactions, feed.accounts, feed.preview ? [] : typedExpenses);
  const wagesIn = (r: { start: Date; end: Date }) => (feed.connected ? 0 : sumEntries(inRange(payrollEntries, r)));
  const spentIn = (r: { start: Date; end: Date }) => spendingByGroup(spendItems, r.start, r.end, wagesIn(r)).reduce((sum, g) => sum + g.total, 0);
  const expensesByBucket = buckets.map((b) => Math.round(spentIn(b) * 100) / 100);
  const totalExpenses = expensesByBucket.reduce((sum, v) => sum + v, 0);
  const topCategories = spendingByGroup(spendItems, whole.start, whole.end, wagesIn(whole)).map((g) => ({
    name: g.group.name,
    value: g.total,
    color: GROUP_COLORS[g.group.id],
  }));
  const labourPercent = totals.total > 0 ? Math.round((totalLabour / totals.total) * 100) : 0;

  const byLabel = BREAKDOWNS.find((b) => b.value === by)!.label;
  const insights = (
    <Card title="AI Insights" icon={OwnerIcons.sparkles}>
      <AiInsightsList placement="analytics" empty="No data yet" />
    </Card>
  );

  return (
    <OwnerScreen>
      <PageHeader
        onBack={() => goBack()}
        title="Reports"
        subtitle="Sales, profit, stock and staff — see what's selling and what isn't."
        right={<RangeSelect options={RANGES} value={range} onChange={setRange} />}
      />

      <StatGrid columns={4}>
        <StatCard icon={OwnerIcons.trendingUp} label="Sales" value={money(totals.total)} change={percentChange(totals.total, previous.total)} changeLabel="vs previous period" />
        <StatCard icon={OwnerIcons.wallet} label="Gross Profit" value={money(totals.profit)} change={percentChange(totals.profit, previous.profit)} changeLabel={`${totals.margin}% margin`} />
        <StatCard
          icon={StockIcons.tag}
          label="Items Sold"
          value={String(totals.items)}
          change={percentChange(totals.items, previous.items)}
          changeLabel={totals.returned ? `${totals.returned} returned` : 'vs previous period'}
        />
        <StatCard icon={OwnerIcons.percent} label="Sell-through" value={`${through.rate}%`} changeLabel="of your stock sold" />
      </StatGrid>

      <Card title="Sales Over Time" icon={OwnerIcons.chart}>
        <BarChart
          categories={buckets.map((b) => b.label)}
          series={[
            { name: 'Sales', color: SeriesColors[0], values: overTime.map((o) => o.sales) },
            { name: 'Gross profit', color: SeriesColors[2], values: overTime.map((o) => Math.max(0, o.profit)) },
          ]}
          formatValue={money}
          emptyMessage={NO_SALES}
        />
      </Card>

      <Card title={`Sales by ${byLabel}`} icon={StockIcons.tag}>
        <Segmented options={BREAKDOWNS} value={by} onChange={setBy} />
        {breakdown.length === 0 ? (
          <Empty text={NO_SALES} />
        ) : (
          <View>
            <TableHead columns={head(byLabel, 'Sold', 'Sales', 'Share')} />
            {breakdown.slice(0, SHOW).map((r) => (
              <Row key={r.name} cells={[r.name, String(r.units), money(r.sales), `${r.share}%`]} />
            ))}
            {breakdown.length > SHOW && <Text style={styles.more}>+ {breakdown.length - SHOW} more</Text>}
          </View>
        )}
      </Card>

      <ResponsiveRow>
        <Card title="Most Profitable" icon={OwnerIcons.wallet}>
          {margins.length === 0 ? (
            <Empty text="Add cost prices to your products to see profit" />
          ) : (
            <View>
              <TableHead columns={head('Product', 'Sold', 'Profit', 'Margin')} />
              {margins.slice(0, 5).map((m) => (
                <Row key={m.productId} cells={[m.name, String(m.units), money(m.profit), `${m.margin}%`]} />
              ))}
            </View>
          )}
        </Card>
        <Card title="Low Margins" icon={OwnerIcons.percent}>
          {lowMargins.length === 0 ? (
            <Empty text={margins.length ? `Everything sold makes at least ${LOW_MARGIN}% — nice.` : 'Nothing to show yet'} />
          ) : (
            <View style={styles.gap}>
              <Text style={styles.hint}>Under {LOW_MARGIN}% profit — think about a price rise or a cheaper supplier.</Text>
              <View>
                <TableHead columns={head('Product', 'Sold', 'Profit', 'Margin')} />
                {lowMargins.map((m) => (
                  <Row key={m.productId} low cells={[m.name, String(m.units), money(m.profit), `${m.margin}%`]} />
                ))}
              </View>
            </View>
          )}
        </Card>
      </ResponsiveRow>

      <ResponsiveRow>
        <Card title="Sell-through" icon={StockIcons.box} right={<Pill label={`${through.rate}% sold`} tone={through.rate >= 50 ? 'success' : 'warning'} />}>
          <Text style={styles.hint}>
            Of the stock you had, how much sold. You sold {through.sold} and have {through.inStock} left. Slowest first:
          </Text>
          {through.rows.length === 0 ? (
            <Empty text="No stock or sales yet" />
          ) : (
            <View>
              <TableHead columns={head('Product', 'Sold', 'In stock', 'Rate')} />
              {through.rows.slice(0, 6).map((r) => (
                <Row key={r.productId} low={r.rate < 20} cells={[r.name, String(r.sold), String(r.inStock), `${r.rate}%`]} />
              ))}
            </View>
          )}
        </Card>
        <Card title="Stock Value" icon={StockIcons.box}>
          <View style={styles.boxes}>
            <StatBox label="At cost price" value={money(value.cost)} />
            <StatBox label="At sell price" value={money(value.sell)} />
          </View>
          <StatBox label="Profit if it all sells" value={money(Math.max(0, sellValue - value.cost))} highlight icon={OwnerIcons.sparkles} />
          <Text style={styles.hint}>What everything in stock right now is worth{manyStores ? ' (all stores)' : ''}.</Text>
        </Card>
      </ResponsiveRow>

      <ResponsiveRow>
        <Card title="Top Staff" icon={OwnerIcons.people}>
          {staff.length === 0 ? (
            <Empty text={NO_SALES} />
          ) : (
            <View>
              <TableHead columns={head('Name', 'Items', 'Sales', 'Share')} />
              {staff.slice(0, SHOW).map((p, i) => (
                <Row key={`${p.name}-${i}`} cells={[p.name, String(p.items), money(p.total), `${totals.total > 0 ? Math.round((p.total / totals.total) * 100) : 0}%`]} />
              ))}
            </View>
          )}
        </Card>
        {manyStores ? (
          <Card title="Store Comparison" icon={StockIcons.truck}>
            <View>
              <TableHead columns={head('Store', 'Sales', 'Profit', 'Sold %')} />
              {storeRows.map((s) => (
                <Row key={s.storeId ?? 'none'} cells={[s.name, money(s.sales), s.profit === null ? '—' : money(s.profit), `${s.sellThrough}%`]} />
              ))}
            </View>
            <Text style={styles.hint}>Stock at cost: {storeRows.map((s) => `${s.name} ${money(s.stockCost)}`).join(' · ')}</Text>
          </Card>
        ) : (
          insights
        )}
      </ResponsiveRow>

      <StatGrid columns={3}>
        <StatCard icon={OwnerIcons.card} label="Expenses" value={money(totalExpenses)} changeLabel="money spent" />
        <StatCard icon={OwnerIcons.wallet} label="Net Profit" value={money(totals.exGst - totalExpenses)} changeLabel={usesGst ? 'sales (ex GST) less expenses' : 'sales less expenses'} />
        <StatCard icon={OwnerIcons.percent} label="Wages % of Sales" value={`${labourPercent}%`} changeLabel="from clock-ins" />
      </StatGrid>

      <ResponsiveRow>
        <Card title="Sales vs Expenses" icon={OwnerIcons.chart}>
          <BarChart
            categories={buckets.map((b) => b.label)}
            series={[
              { name: 'Sales', color: SeriesColors[0], values: overTime.map((o) => o.sales) },
              { name: 'Expenses', color: SeriesColors[1], values: expensesByBucket },
            ]}
            formatValue={money}
          />
        </Card>
        <Card title="Top Expense Categories" icon={OwnerIcons.card}>
          <DonutChart segments={topCategories} formatValue={money} showPercent emptyMessage="No spending yet" />
        </Card>
      </ResponsiveRow>

      {manyStores && insights}
    </OwnerScreen>
  );
}

const styles = StyleSheet.create({
  gap: { gap: Spacing.two },
  empty: { color: C.textSecondary, fontSize: 14, paddingVertical: Spacing.three, textAlign: 'center' },
  hint: { color: C.textSecondary, fontSize: 13, lineHeight: 18 },
  more: { color: C.textSecondary, fontSize: 13, paddingTop: Spacing.two, textAlign: 'center' },
  boxes: { flexDirection: 'row', gap: Spacing.two },
});
