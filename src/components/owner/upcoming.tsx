import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, EmptyState, Icon, IconBadge, OwnerIcons, type IconName } from '@/components/owner/ui';
import { Colors as C, Spacing } from '@/constants/theme';
import {
  getUpcomingItems,
  upcomingTiming,
  type UpcomingItem,
  type UpcomingItemType,
  type UpcomingTone,
} from '@/data/upcoming';

const TYPE_ICONS: Record<UpcomingItemType, IconName> = {
  delivery: { ios: 'truck.box.fill', android: 'local_shipping', web: 'local_shipping' },
  materials: { ios: 'shippingbox.fill', android: 'inventory_2', web: 'inventory_2' },
  job: { ios: 'wrench.and.screwdriver.fill', android: 'build', web: 'build' },
  inspection: { ios: 'doc.text.fill', android: 'description', web: 'description' },
};

const TONE_COLORS: Record<UpcomingTone, { text: string; background: string }> = {
  today: { text: C.success, background: 'rgba(34, 197, 94, 0.14)' },
  tomorrow: { text: C.accent, background: 'rgba(79, 140, 255, 0.14)' },
  soon: { text: C.warning, background: 'rgba(245, 158, 11, 0.14)' },
  later: { text: C.textSecondary, background: C.border },
};

/** Dashboard "Upcoming" card: deliveries, orders and important dates. */
export function UpcomingSection() {
  const items = getUpcomingItems();

  return (
    <Card
      title="Upcoming"
      icon={OwnerIcons.calendar}
      right={
        <Pressable
          disabled={items.length === 0}
          accessibilityRole="button"
          accessibilityLabel="View all upcoming items"
          hitSlop={8}
          style={({ pressed }) => [
            styles.viewAll,
            items.length === 0 && styles.disabled,
            pressed && styles.pressed,
          ]}>
          <Text style={styles.viewAllText}>View all</Text>
          <Icon name={OwnerIcons.chevron} color={C.accent} size={12} />
        </Pressable>
      }>
      <Text style={styles.subtitle}>
        Items, deliveries and important events from your emails and integrations.
      </Text>

      {items.length === 0 ? (
        <EmptyState
          icon={OwnerIcons.calendar}
          message="No upcoming items yet — once you connect your email and integrations, we'll show deliveries, orders and important dates here automatically."
        />
      ) : (
        <View style={styles.list}>
          {items.map((item) => (
            <UpcomingCard key={item.id} item={item} />
          ))}
        </View>
      )}
    </Card>
  );
}

function UpcomingCard({ item }: { item: UpcomingItem }) {
  const timing = upcomingTiming(item);
  const colors = TONE_COLORS[timing.tone];

  return (
    <View style={styles.item}>
      <IconBadge name={TYPE_ICONS[item.type]} />
      <View style={styles.itemText}>
        <Text style={styles.itemTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.itemMeta} numberOfLines={1}>
          From {item.source}
        </Text>
        <View style={styles.location}>
          <Icon name={{ ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' }} color={C.textSecondary} size={12} />
          <Text style={styles.itemMeta} numberOfLines={1}>
            {item.location}
          </Text>
        </View>
      </View>
      <View style={[styles.pill, { backgroundColor: colors.background }]}>
        <Text style={[styles.pillText, { color: colors.text }]} numberOfLines={1}>
          {timing.label}
        </Text>
      </View>
      <Icon name={OwnerIcons.chevron} color={C.textSecondary} size={14} />
    </View>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    color: C.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: -Spacing.one,
  },
  viewAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewAllText: {
    color: C.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.7,
  },
  list: {
    gap: Spacing.two,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    padding: Spacing.three - 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceRaised,
  },
  itemText: {
    flex: 1,
    gap: 2,
  },
  itemTitle: {
    color: C.text,
    fontSize: 15,
    fontWeight: '700',
  },
  itemMeta: {
    color: C.textSecondary,
    fontSize: 13,
  },
  location: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pill: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
    borderRadius: 999,
    flexShrink: 0,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
