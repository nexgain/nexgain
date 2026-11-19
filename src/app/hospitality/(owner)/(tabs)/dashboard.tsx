import { StyleSheet, Text, View } from 'react-native';

import { ActionRow, Card, EmptyState, OwnerIcons, OwnerScreen, PageHeader, StatCard, StatGrid } from '@/components/owner/ui';
import { Colors as C, Spacing } from '@/constants/theme';
import { useBusiness } from '@/data/business';
import { formatMoney } from '@/data/payroll';
import { router } from '@/lib/nav';
import { MenuIcons, MenuItemRow } from '@/systems/hospitality/components/owner/menu-ui';
import { useMenuItems, useSales } from '@/systems/hospitality/data/menu';
import { addDays, dateKey, isSpecialNow, itemSales, salesIn, salesPeriods, salesTotals, specialEnded } from '@/systems/hospitality/data/sales-stats';

/** "+12%" against the period before (null when there's nothing to compare). */
function change(now: number, before: number) {
  if (before <= 0) return null;
  const pct = Math.round(((now - before) / before) * 100);
  return `${pct >= 0 ? '+' : ''}${pct}%`;
}

// The hospitality Dashboard: today's and this week's sales, best sellers,
// today's specials, and quick links to record sales and edit the menu.
export default function HospitalityDashboard() {
  const business = useBusiness();
  const sales = useSales();
  const items = useMenuItems();
  const now = new Date();
  const today = dateKey(now);
  const [todayP, week, month] = salesPeriods(now);

  const todayTotals = salesTotals(salesIn(sales, todayP.start, todayP.end));
  const sameDayLastWeek = salesTotals(salesIn(sales, addDays(todayP.start, -7), addDays(todayP.end, -7)));
  const weekSales = salesIn(sales, week.start, week.end);
  const weekTotals = salesTotals(weekSales);
  const lastWeekTotals = salesTotals(salesIn(sales, addDays(week.start, -7), addDays(week.end, -7)));
  const monthTotals = salesTotals(salesIn(sales, month.start, month.end));
  const best = itemSales(weekSales).slice(0, 3);
  const specials = items.filter((i) => isSpecialNow(i, today));
  const ended = items.filter((i) => i.active && specialEnded(i, today));
  const hidden = items.filter((i) => !i.active).length;

  return (
    <OwnerScreen>
      <PageHeader title={business?.businessName || 'Dashboard'} subtitle={now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })} />

      <StatGrid columns={3}>
        <StatCard icon={OwnerIcons.money} label="Sales today" value={formatMoney(todayTotals.revenue)} change={change(todayTotals.revenue, sameDayLastWeek.revenue)} changeLabel="vs same day last week" />
        <StatCard icon={OwnerIcons.trendingUp} label="This week" value={formatMoney(weekTotals.revenue)} change={change(weekTotals.revenue, lastWeekTotals.revenue)} changeLabel="vs last week" />
        <StatCard icon={OwnerIcons.calendar} label="This month" value={formatMoney(monthTotals.revenue)} change={null} changeLabel={`${monthTotals.itemsSold} items sold`} />
      </StatGrid>

      <Card>
        <View>
          <ActionRow icon={MenuIcons.sale} label="Record a sale" onPress={() => router.push('/hospitality/record-sale')} />
          <ActionRow icon={MenuIcons.day} label="End of day sales" onPress={() => router.push('/hospitality/end-of-day')} showDivider />
          <ActionRow icon={MenuIcons.plus} label="Add a menu item" onPress={() => router.push({ pathname: '/hospitality/menu-item/[id]', params: { id: 'new' } })} showDivider />
        </View>
      </Card>

      <Card title="Best sellers this week" icon={MenuIcons.trophy}>
        {best.length === 0 ? (
          <EmptyState icon={MenuIcons.sale} message="Once you record sales, your best sellers show here." />
        ) : (
          <View>
            {best.map((r, i) => (
              <View key={r.key} style={[styles.row, i > 0 && styles.divider]}>
                <Text style={styles.rank}>{i + 1}</Text>
                <Text style={[styles.name, styles.flex]} numberOfLines={1}>
                  {r.name}
                </Text>
                <Text style={styles.muted}>{r.quantity} sold</Text>
                <Text style={styles.amount}>{formatMoney(r.revenue)}</Text>
              </View>
            ))}
          </View>
        )}
      </Card>

      {specials.length > 0 && (
        <Card title="Specials today" icon={MenuIcons.star}>
          <View>
            {specials.map((item, i) => (
              <MenuItemRow
                key={item.id}
                item={item}
                showDivider={i > 0}
                special
                onPress={() => router.push({ pathname: '/hospitality/menu-item/[id]', params: { id: item.id } })}
              />
            ))}
          </View>
        </Card>
      )}

      {(ended.length > 0 || hidden > 0 || items.length === 0) && (
        <Card title="Your menu" icon={MenuIcons.menu}>
          {items.length === 0 && <Text style={styles.muted}>Your menu is empty. Add your items and prices on the Menu tab.</Text>}
          {ended.length > 0 && (
            <Text style={styles.warning}>
              {ended.length === 1 ? `“${ended[0].name}” is a special that has ended` : `${ended.length} specials have ended`}. Hide it or change its dates on the Menu tab.
            </Text>
          )}
          {hidden > 0 && (
            <Text style={styles.muted}>
              {hidden} item{hidden === 1 ? ' is' : 's are'} hidden (not on sale).
            </Text>
          )}
          <ActionRow icon={MenuIcons.menu} label="Open the menu" onPress={() => router.navigate('/hospitality/menu-items')} />
        </Card>
      )}
    </OwnerScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three - 4, paddingVertical: Spacing.two, minHeight: 44 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  rank: { width: 22, color: C.accent, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  name: { color: C.text, fontSize: 15, fontWeight: '600' },
  muted: { color: C.textSecondary, fontSize: 13, lineHeight: 18 },
  warning: { color: C.warning, fontSize: 13, lineHeight: 18 },
  amount: { color: C.text, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'], minWidth: 70, textAlign: 'right' },
});
