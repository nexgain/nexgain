import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, EmptyState, Icon, OwnerIcons, OwnerScreen, PageHeader, RangeSelect, StatCard, StatGrid, TabRow } from '@/components/owner/ui';
import { Colors as C, Spacing } from '@/constants/theme';
import { useDocs } from '@/data/invoices';
import { formatMoney } from '@/data/payroll';
import { router } from '@/lib/nav';
import { InvoiceRow } from '@/systems/hospitality/components/owner/invoice-ui';
import { MenuIcons, saleWhen } from '@/systems/hospitality/components/owner/menu-ui';
import { hospitalityInvoices, hospitalityStatus, invoiceAmounts, paidInvoicesIn } from '@/systems/hospitality/data/invoice-status';
import { useHospitalityLoaded, useSales, type Sale } from '@/systems/hospitality/data/menu';
import { itemSales, salesIn, salesPeriods, salesTotals } from '@/systems/hospitality/data/sales-stats';

const SOURCE_LABEL: Record<Sale['source'], string> = { sale: 'Sale', day: 'End of day', import: 'Imported' };

const TABS = ['All sales', 'Invoices', 'Unpaid', 'Overdue'] as const;
type Tab = (typeof TABS)[number];

// The Sales tab: what's sold in the chosen period, the best sellers, and
// every sale (newest first). Record a sale, or enter a whole day's totals.
// Invoices (catering, functions) are here too: the Invoices, Unpaid and
// Overdue tabs. Paid invoices count in the sales totals as Catering & functions.
export default function SalesScreen() {
  const loaded = useHospitalityLoaded();
  const sales = useSales();
  const invoices = hospitalityInvoices(useDocs());
  const [tab, setTab] = useState<Tab>('All sales');
  const periods = salesPeriods();
  const [periodId, setPeriodId] = useState('today');
  const period = periods.find((p) => p.id === periodId) ?? periods[0];
  const [showAll, setShowAll] = useState(false);

  const inPeriod = salesIn(sales, period.start, period.end);
  const totals = salesTotals(inPeriod);
  // Paid invoices count once, by the day they were paid (never the bank payment as well).
  const catering = paidInvoicesIn(invoices, period.start, period.end).reduce((sum, d) => sum + invoiceAmounts(d).total, 0);
  const revenue = Math.round((totals.revenue + catering) * 100) / 100;
  const best = itemSales(inPeriod);
  const shown = showAll ? inPeriod : inPeriod.slice(0, 20);

  return (
    <OwnerScreen>
      <PageHeader title="Sales" subtitle="What you’ve sold, and your best sellers." />

      <View style={styles.actions}>
        <View style={styles.flex}>
          <Button fill label="Record sale" icon={MenuIcons.sale} onPress={() => router.push('/hospitality/record-sale')} />
        </View>
        <View style={styles.flex}>
          <Button fill label="End of day" icon={MenuIcons.day} variant="secondary" onPress={() => router.push('/hospitality/end-of-day')} />
        </View>
      </View>

      <TabRow tabs={TABS} active={tab} onChange={setTab} />

      {tab !== 'All sales' ? (
        <InvoiceList tab={tab} invoices={invoices} />
      ) : (
        <>
          <RangeSelect options={periods} value={period} onChange={(p) => setPeriodId(p.id)} />

          <StatGrid columns={3}>
            <StatCard
              icon={OwnerIcons.money}
              label="Sales"
              value={formatMoney(revenue)}
              change={null}
              changeLabel={catering > 0 ? `incl. ${formatMoney(catering)} catering & functions` : period.label.toLowerCase()}
            />
            <StatCard icon={MenuIcons.menu} label="Items sold" value={String(totals.itemsSold)} change={null} changeLabel={period.label.toLowerCase()} />
            <StatCard icon={MenuIcons.sale} label="Sales recorded" value={String(totals.sales)} change={null} changeLabel={period.label.toLowerCase()} />
          </StatGrid>

          {!loaded ? (
            <ActivityIndicator color={C.accent} />
          ) : inPeriod.length === 0 ? (
            <Card>
              <EmptyState
                icon={MenuIcons.sale}
                message={`No sales ${period.id === 'today' ? 'today' : `for ${period.label.toLowerCase()}`} yet. Tap Record sale, or End of day to enter a whole day.`}
              />
            </Card>
          ) : (
            <>
              <Card title="Best sellers" icon={MenuIcons.trophy}>
                <View>
                  {best.slice(0, 5).map((r, i) => (
                    <View key={r.key} style={[styles.row, i > 0 && styles.divider]}>
                      <Text style={styles.rank}>{i + 1}</Text>
                      <View style={styles.flex}>
                        <Text style={styles.name} numberOfLines={1}>
                          {r.name}
                        </Text>
                        <Text style={styles.muted}>
                          {r.quantity} sold{r.profit !== null ? ` · ${formatMoney(r.profit)} profit` : ''}
                        </Text>
                      </View>
                      <Text style={styles.amount}>{formatMoney(r.revenue)}</Text>
                    </View>
                  ))}
                </View>
                {best.length > 5 && <Text style={styles.muted}>Full best and worst sellers are coming to Analytics.</Text>}
              </Card>

              <Card title={`${inPeriod.length} sale${inPeriod.length === 1 ? '' : 's'}`} icon={OwnerIcons.clock}>
                <View>
                  {shown.map((s, i) => (
                    <Pressable
                      key={s.id}
                      onPress={() => router.push({ pathname: '/hospitality/sale/[id]', params: { id: s.id } })}
                      accessibilityRole="button"
                      style={({ pressed }) => [styles.row, i > 0 && styles.divider, pressed && styles.pressed]}>
                      <View style={styles.flex}>
                        <Text style={styles.name} numberOfLines={1}>
                          {s.lines.map((l) => `${l.quantity}× ${l.name}`).join(', ') || 'No items'}
                        </Text>
                        <Text style={styles.muted}>
                          {SOURCE_LABEL[s.source]} · {saleWhen(s)}
                        </Text>
                      </View>
                      <Text style={styles.amount}>{formatMoney(s.total)}</Text>
                      <Icon name={OwnerIcons.chevron} color={C.textSecondary} size={12} />
                    </Pressable>
                  ))}
                </View>
                {inPeriod.length > shown.length && (
                  <Pressable onPress={() => setShowAll(true)} accessibilityRole="button" hitSlop={8}>
                    <Text style={styles.link}>Show all {inPeriod.length}</Text>
                  </Pressable>
                )}
              </Card>
            </>
          )}
        </>
      )}
    </OwnerScreen>
  );
}

/** Invoices, Unpaid or Overdue, with what's owing. */
function InvoiceList({ tab, invoices }: { tab: Exclude<Tab, 'All sales'>; invoices: ReturnType<typeof hospitalityInvoices> }) {
  const shown = invoices.filter((d) => tab === 'Invoices' || hospitalityStatus(d) === (tab === 'Unpaid' ? 'Unpaid' : 'Overdue'));
  const owing = shown.reduce((sum, d) => sum + invoiceAmounts(d).owing, 0);
  return (
    <>
      {tab !== 'Invoices' && (
        <View style={styles.owingBox}>
          <Text style={styles.owingLabel}>{tab === 'Unpaid' ? 'Total unpaid' : 'Total overdue'}</Text>
          <Text style={[styles.owingValue, tab === 'Overdue' && owing > 0 && { color: C.danger }]}>{formatMoney(owing)}</Text>
        </View>
      )}
      <Button
        label="New invoice"
        icon={MenuIcons.plus}
        variant="secondary"
        onPress={() => router.push({ pathname: '/hospitality/record-sale', params: { mode: 'invoice' } })}
      />
      <Card>
        {shown.length === 0 ? (
          <EmptyState
            icon={OwnerIcons.receipt}
            message={
              tab === 'Invoices'
                ? 'No invoices yet. For catering, functions or business customers, tap New invoice (or Record sale › Send as invoice).'
                : tab === 'Unpaid'
                  ? 'No unpaid invoices.'
                  : 'No overdue invoices. Nice!'
            }
          />
        ) : (
          <View>
            {shown.map((d, i) => (
              <InvoiceRow key={d.id} doc={d} showDivider={i > 0} onPress={() => router.push({ pathname: '/hospitality/invoice/[id]', params: { id: d.id } })} />
            ))}
          </View>
        )}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  owingBox: { gap: 4, padding: Spacing.three, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  owingLabel: { color: C.textSecondary, fontSize: 13, fontWeight: '600' },
  owingValue: { color: C.text, fontSize: 24, fontWeight: '700', fontVariant: ['tabular-nums'] },
  flex: { flex: 1, gap: 2 },
  pressed: { opacity: 0.7 },
  actions: { flexDirection: 'row', gap: Spacing.three - 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three - 4, paddingVertical: Spacing.two, minHeight: 48 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  rank: { width: 22, color: C.accent, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  name: { color: C.text, fontSize: 15, fontWeight: '600' },
  muted: { color: C.textSecondary, fontSize: 13 },
  amount: { color: C.text, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  link: { color: C.accent, fontSize: 14, fontWeight: '700' },
});
