import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/systems/bookings/components/owner/invoices-ui';
import { Card, EmptyState, Icon, OwnerIcons, OwnerScreen, RangeSelect } from '@/systems/bookings/components/owner/ui';
import { Colors as C, Spacing } from '@/constants/theme';
import { formatShortDate } from '@/data/employee-roster';
import { financeRanges, inRange, percentChange, revenueEntries, sumEntries } from '@/data/finance';
import { docTotals, useDocs } from '@/data/invoices';
import { bookingRevenueEntries } from '@/systems/bookings/data/booking-stats';
import { formatPrice, useBookings, useBookingStaff } from '@/systems/bookings/data/bookings';

const formatMoney = (amount: number) => formatPrice(amount);

// Money coming in (NexGain Bookings): bookings that have happened and every
// invoice marked Paid, newest first. Opened from the Revenue box on the Dashboard.
export default function RevenueScreen() {
  const docs = useDocs();
  const ranges = financeRanges();
  const [rangeId, setRangeId] = useState('this-month');
  const range = ranges.find((r) => r.id === rangeId) ?? ranges[0];

  const bookings = useBookings();
  const staff = useBookingStaff();
  const all = [...revenueEntries(docs), ...bookingRevenueEntries(bookings, staff)].sort((a, b) => b.date.getTime() - a.date.getTime());
  const bookingCount = (list: typeof all) => list.filter((e) => e.source === 'booking').length;
  const entries = inRange(all, range);
  const total = sumEntries(entries);
  const previous = rangeId === 'this-month' ? sumEntries(inRange(all, ranges[1])) : null;

  // Invoices sent but not paid yet: money still to come in.
  const outstanding = docs.filter((d) => d.kind === 'invoice' && d.status === 'Pending');
  const outstandingTotal = outstanding.reduce((sum, d) => sum + docTotals(d.items, d.gstRate).total, 0);

  return (
    <OwnerScreen>
      <ScreenHeader title="Revenue" onBack={() => router.navigate('/bookings/dashboard')} />

      <View style={styles.rangeRow}>
        <RangeSelect options={ranges} value={range} onChange={(r) => setRangeId(r.id)} />
      </View>

      <Card>
        <Text style={styles.label}>Total received · {range.label.toLowerCase()}</Text>
        <Text style={styles.total}>{formatMoney(total)}</Text>
        <Text style={styles.muted}>
          {bookingCount(entries)} booking{bookingCount(entries) === 1 ? '' : 's'} · {entries.length - bookingCount(entries)} paid invoice
          {entries.length - bookingCount(entries) === 1 ? '' : 's'}
          {previous !== null ? ` · ${percentChange(total, previous) ?? '—'} vs last month` : ''}
        </Text>
        {outstanding.length > 0 && (
          <Text style={styles.outstanding}>
            {formatMoney(outstandingTotal)} still owed on {outstanding.length} unpaid invoice{outstanding.length === 1 ? '' : 's'}
          </Text>
        )}
      </Card>

      <Card title="Payments Received" icon={OwnerIcons.trendingUp}>
        {entries.length === 0 ? (
          <EmptyState
            icon={OwnerIcons.receipt}
            message={
              all.length === 0
                ? 'Nothing yet. Bookings show up here once they’ve happened, and invoices once they’re marked Paid.'
                : 'Nothing in this period.'
            }
          />
        ) : (
          entries.map((e, i) => (
            <Pressable
              key={e.id}
              // Bookings open; older paid invoices (from before invoices were removed) are just listed.
              onPress={e.bookingId ? () => router.push({ pathname: '/bookings/booking/[id]', params: { id: e.bookingId! } }) : undefined}
              disabled={!e.bookingId}
              accessibilityRole="button"
              accessibilityLabel={`${e.title}, ${formatMoney(e.amount)}, paid ${formatShortDate(e.date)}`}
              style={({ pressed }) => [styles.row, i > 0 && styles.divider, pressed && styles.pressed]}>
              <View style={styles.icon}>
                <Icon name={{ ios: 'arrow.down.left', android: 'south_west', web: 'south_west' }} color={C.success} size={16} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.title} numberOfLines={1}>
                  {e.title}
                </Text>
                <Text style={styles.muted} numberOfLines={1}>
                  {[formatShortDate(e.date), e.subtitle].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Text style={styles.amount}>+{formatMoney(e.amount)}</Text>
              <Icon name={OwnerIcons.chevron} color={C.textSecondary} size={12} />
            </Pressable>
          ))
        )}
      </Card>

      <Text style={styles.footnote}>
        Revenue is bookings once their time has passed (not cancelled or no-shows) plus invoices marked as Paid, including GST.
      </Text>
    </OwnerScreen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
  },
  rangeRow: {
    flexDirection: 'row',
  },
  label: {
    color: C.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  total: {
    color: C.text,
    fontSize: 34,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  muted: {
    color: C.textSecondary,
    fontSize: 13,
  },
  outstanding: {
    color: C.warning,
    fontSize: 13,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    paddingVertical: Spacing.three - 4,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.successSoft,
  },
  title: {
    color: C.text,
    fontSize: 15,
    fontWeight: '600',
  },
  amount: {
    color: C.success,
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  footnote: {
    color: C.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
});
