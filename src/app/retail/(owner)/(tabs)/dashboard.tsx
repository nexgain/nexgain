// Home (NexGain Retail): a greeting with the owner's and business's names, four
// tiles (Sales with the change on last month, low stock items, orders pending,
// suppliers connected), the AI Business Watchdog (what's ready to reorder,
// best sellers and slow stock), Quick Actions (Add Stock, New Order, Scan
// Item, Reports), then the GST, receipts, notifications and AI insights.
import { Image } from 'expo-image';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AiInsightsList } from '@/systems/retail/components/owner/ai-ui';
import { BarcodeScanner } from '@/systems/retail/components/barcode-scanner';
import { GstTile } from '@/systems/retail/components/owner/gst-tile';
import { NotificationsSection } from '@/systems/retail/components/owner/notifications-section';
import { Panel, QuickAction, QuickActions, Tile, TileGrid, retailStyles } from '@/systems/retail/components/owner/retail-ui';
import { StockIcons } from '@/systems/retail/components/owner/stock-ui';
import { TodayRoster } from '@/systems/retail/components/owner/today-roster';
import { Button, Card, DesktopColumns, Icon, OwnerIcons, OwnerScreen } from '@/systems/retail/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { transactionItems, useBankAccounts, useBankTransactions } from '@/data/bank';
import { ownerFirstName, useBusiness } from '@/data/business';
import { financeRanges, inRange, percentChange, sumEntries, useExpenses } from '@/data/finance';
import { ownerNotifications, useNotifications } from '@/data/notifications';
import { formatMoney } from '@/data/payroll';
import { indexReceipts, receiptStatus, useReceipts } from '@/data/receipts';
import { isOpen, onOrder, useOrders } from '@/systems/retail/data/orders';
import { bestSellers, reorderAdvice, slowSellers } from '@/systems/retail/data/reorder';
import { useRetailRevenue } from '@/systems/retail/data/retail-revenue';
import { salesAsMovements, useSales } from '@/systems/retail/data/sales';
import { findBarcode, isConnected, productStatus, useProducts, useStockLevels, useSuppliers } from '@/systems/retail/data/stock';

const NO_INSIGHTS = 'No insights yet — check back once you have more activity data.';
const SPARKLES = { ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' } as const;
const UP = { ios: 'arrowtriangle.up.fill', android: 'arrow_drop_up', web: 'arrow_drop_up' } as const;
const DOWN = { ios: 'arrowtriangle.down.fill', android: 'arrow_drop_down', web: 'arrow_drop_down' } as const;

function greetingFor(date: Date) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function RetailHomeScreen() {
  const now = new Date();
  const business = useBusiness();
  const firstName = ownerFirstName(business);
  const unread = ownerNotifications(useNotifications()).filter((n) => !n.read).length;

  const products = useProducts().filter((p) => !p.archived);
  const levels = useStockLevels();
  // Every sale (not just the latest stock changes), for the watchdog.
  const movements = salesAsMovements(useSales());
  const suppliers = useSuppliers();
  const orders = useOrders();
  const [scanning, setScanning] = useState(false);

  // Sales this month vs last month (stock marked Sold, minus returns).
  const [thisMonth, lastMonth] = financeRanges(now);
  const revenue = useRetailRevenue();
  const salesNow = sumEntries(inRange(revenue, thisMonth));
  const change = percentChange(salesNow, sumEntries(inRange(revenue, lastMonth)));

  const lowItems = products.filter((p) => productStatus(levels, p) !== 'ok').length;
  const pending = orders.filter(isOpen).length;
  const connected = suppliers.filter(isConnected).length;

  // The watchdog.
  const advice = reorderAdvice(products, levels, movements, suppliers, onOrder(orders));
  const toReorder = advice.filter((a) => a.needsReorder);
  const best = bestSellers(products, movements)[0];
  const slow = slowSellers(products, levels, movements);
  const nameOf = (id: string) => products.find((p) => p.id === id)?.name ?? '';

  // Expenses over $82.50 this financial year with no receipt (needed to claim the GST).
  const thisFy = financeRanges(now)[2];
  const receiptIndex = indexReceipts(useReceipts());
  const missingReceipts = transactionItems(useBankTransactions(), useBankAccounts(), useExpenses()).filter(
    (i) => i.date >= thisFy.start && i.date < thisFy.end && receiptStatus(i, receiptIndex) === 'missing',
  ).length;

  function onScan(code: string) {
    const found = findBarcode(products, code);
    if (found) router.push({ pathname: '/retail/stock-item/[id]', params: { id: found.product.id, variant: found.variant.id } } as Href);
    else router.push({ pathname: '/retail/product/[id]', params: { id: 'new', barcode: code } } as Href);
  }

  return (
    <OwnerScreen>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text style={retailStyles.greeting}>{firstName ? `${greetingFor(now)}, ${firstName}` : greetingFor(now)} 👋</Text>
          <Text style={styles.business}>{business?.businessName || 'Your shop'}</Text>
        </View>
        <Pressable
          onPress={() => router.navigate({ pathname: '/retail/alerts', params: { from: 'dashboard' } } as Href)}
          accessibilityRole="button"
          accessibilityLabel={unread > 0 ? `Notifications, ${unread} new` : 'Notifications'}
          style={({ pressed }) => [styles.round, pressed && styles.pressed]}>
          <Icon name={OwnerIcons.bell} color={C.text} size={18} />
          {unread > 0 && <View style={styles.dot} />}
        </Pressable>
        {business?.logo ? (
          <Pressable onPress={() => router.navigate('/retail/business-profile')} accessibilityRole="button" accessibilityLabel="Business profile" style={styles.round}>
            <Image source={{ uri: business.logo }} style={styles.logo} contentFit="cover" />
          </Pressable>
        ) : null}
      </View>

      <TileGrid>
        <Tile
          icon={OwnerIcons.receipt}
          title="Sales"
          value={formatMoney(salesNow, { cents: false })}
          pill={
            change
              ? { label: change, tone: change.startsWith('-') ? 'danger' : 'success', icon: change.startsWith('-') ? DOWN : UP }
              : { label: 'This month', tone: 'neutral' }
          }
          onPress={() => router.navigate('/retail/revenue')}
        />
        <Tile
          icon={StockIcons.box}
          title="Stock"
          pill={lowItems > 0 ? { label: `${lowItems} low item${lowItems === 1 ? '' : 's'}`, tone: 'danger' } : { label: 'All good', tone: 'success' }}
          onPress={() => router.navigate('/retail/products' as Href)}
        />
        <Tile
          icon={StockIcons.cart}
          title="Orders"
          pill={pending > 0 ? { label: `${pending} pending`, tone: 'danger' } : { label: 'None pending', tone: 'neutral' }}
          onPress={() => router.navigate('/retail/orders' as Href)}
        />
        <Tile
          icon={StockIcons.truck}
          title="Suppliers"
          pill={{ label: `${connected} connected`, tone: 'neutral' }}
          onPress={() => router.navigate('/retail/suppliers' as Href)}
        />
      </TileGrid>

      <Pressable onPress={() => router.push('/retail/reorder' as Href)} accessibilityRole="button" style={({ pressed }) => [styles.watchdog, pressed && styles.pressed]}>
        <View style={styles.watchdogHead}>
          <Icon name={SPARKLES} color={C.accent} size={20} />
          <Text style={styles.watchdogTitle}>AI Business Watchdog</Text>
          <Icon name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} color={C.textSecondary} size={14} />
        </View>
        <Text style={styles.watchdogText}>
          {toReorder.length > 0
            ? `${toReorder.length} item${toReorder.length === 1 ? ' is' : 's are'} running low and ready to reorder.`
            : products.length === 0
              ? 'Add your products and I’ll watch your stock, and tell you when to reorder and how much.'
              : 'Stock looks good. Nothing needs reordering yet.'}
        </Text>
        {best && (
          <Text style={styles.watchdogNote}>
            Best seller: {nameOf(best.productId)} ({best.units} sold in 4 weeks).
          </Text>
        )}
        {slow[0] && (
          <Text style={styles.watchdogNote}>
            Slow: {nameOf(slow[0].productId)} hasn’t sold in {slow[0].daysSinceSale ?? 60}+ days{slow.length > 1 ? ` (and ${slow.length - 1} more)` : ''}.
          </Text>
        )}
        {toReorder.length > 0 && <Button label="Review & Order Stock" onPress={() => router.push('/retail/reorder' as Href)} />}
      </Pressable>

      <Text style={retailStyles.sectionTitle}>Quick Actions</Text>
      <QuickActions>
        <QuickAction icon={StockIcons.plus} label="Add Stock" onPress={() => router.push({ pathname: '/retail/product/[id]', params: { id: 'new' } } as Href)} />
        <QuickAction icon={StockIcons.cart} label="New Order" onPress={() => router.push({ pathname: '/retail/order/[id]', params: { id: 'new' } } as Href)} />
        <QuickAction icon={StockIcons.barcode} label="Scan Item" onPress={() => setScanning(true)} />
        <QuickAction icon={OwnerIcons.chart} label="Reports" onPress={() => router.navigate('/retail/analytics')} />
      </QuickActions>

      <GstTile />

      {missingReceipts > 0 && (
        <Pressable
          onPress={() => router.navigate({ pathname: '/retail/transactions', params: { filter: 'missing', range: 'this-fy' } } as Href)}
          accessibilityRole="button"
          accessibilityLabel={`${missingReceipts} receipts missing this financial year. Open the list.`}
          style={({ pressed }) => [styles.receiptsCard, pressed && styles.pressed]}>
          <Icon name={{ ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' }} color={C.warning} size={18} />
          <View style={styles.flex}>
            <Text style={styles.receiptsTitle}>
              {missingReceipts} receipt{missingReceipts === 1 ? '' : 's'} missing
            </Text>
            <Text style={styles.receiptsText}>Expenses over $82.50 this financial year. Add them to claim the GST.</Text>
          </View>
          <Icon name={OwnerIcons.chevron} color={C.textSecondary} size={12} />
        </Pressable>
      )}

      <DesktopColumns>
        <TodayRoster />
        <NotificationsSection />
      </DesktopColumns>

      <Card title="AI Insights & Recommendations" icon={OwnerIcons.sparkles}>
        <AiInsightsList placement="attention" empty={NO_INSIGHTS} />
      </Card>
      <Panel>
        <Text style={retailStyles.sectionTitle}>Other Insights</Text>
        <AiInsightsList placement="other" empty={NO_INSIGHTS} emptyIcon={OwnerIcons.lightbulb} />
      </Panel>

      <BarcodeScanner visible={scanning} title="Scan Item" hint="Scan a barcode to open the product." onScan={onScan} onClose={() => setScanning(false)} />
    </OwnerScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  business: { color: C.textSecondary, fontSize: 16, fontWeight: '600', marginTop: 2 },
  round: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  dot: { position: 'absolute', top: 9, right: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: C.danger },
  logo: { width: '100%', height: '100%' },
  watchdog: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.large - 4,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  watchdogHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  watchdogTitle: { flex: 1, color: C.text, fontSize: 17, fontWeight: '700' },
  watchdogText: { color: C.text, fontSize: 15, lineHeight: 21 },
  watchdogNote: { color: C.textSecondary, fontSize: 13, lineHeight: 18 },
  receiptsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    padding: Spacing.three,
    borderRadius: Radius.large - 4,
    backgroundColor: C.warningSoft,
    borderWidth: 1,
    borderColor: C.warning,
  },
  receiptsTitle: { color: C.text, fontSize: 16, fontWeight: '700' },
  receiptsText: { color: C.textSecondary, fontSize: 13, lineHeight: 18 },
});
