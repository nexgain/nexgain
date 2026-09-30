import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, EmptyState, Icon, IconBadge, OwnerIcons, type IconName } from '@/components/owner/ui';
import { Colors as C, Spacing } from '@/constants/theme';
import {
  upcomingTiming,
  useUpcomingItems,
  type UpcomingItem,
  type UpcomingItemType,
  type UpcomingTone,
} from '@/data/upcoming';

const TYPE_ICONS: Record<UpcomingItemType, IconName> = {
  delivery: { ios: 'truck.box.fill', android: 'local_shipping', web: 'local_shipping' },
  materials: { ios: 'shippingbox.fill', android: 'inventory_2', web: 'inventory_2' },
  job: { ios: 'wrench.and.screwdriver.fill', android: 'build', web: 'build' },
  inspection: { ios: 'doc.text.fill', android: 'description', web: 'description' },
  other: { ios: 'note.text', android: 'sticky_note_2', web: 'sticky_note_2' },
};

const TONE_COLORS: Record<UpcomingTone, { text: string; background: string }> = {
  today: { text: C.success, background: 'rgba(34, 197, 94, 0.14)' },
  tomorrow: { text: C.accent, background: 'rgba(79, 140, 255, 0.14)' },
  soon: { text: C.warning, background: 'rgba(245, 158, 11, 0.14)' },
  later: { text: C.textSecondary, background: C.border },
};

/** Dashboard "Upcoming" card: the next jobs, deliveries and reminders from the Calendar. */
export function UpcomingSection() {
  const items = useUpcomingItems();

  return (
    <Card
      title="Upcoming"
      icon={OwnerIcons.calendar}
      right={
        <Pressable
          onPress={() => router.navigate('/calendar')}
          accessibilityRole="button"
          accessibilityLabel="View all in Calendar"
          hitSlop={8}
          style={({ pressed }) => [styles.viewAll, pressed && styles.pressed]}>
          <Text style={styles.viewAllText}>View all</Text>
          <Icon name={OwnerIcons.chevron} color={C.accent} size={12} />
        </Pressable>
      }>
      <Text style={styles.subtitle}>Jobs, material deliveries and reminders coming up in your Calendar.</Text>

      {items.length === 0 ? (
        <EmptyState
          icon={OwnerIcons.calendar}
          message="Nothing coming up. Confirmed jobs appear here automatically, and you can add deliveries and reminders in the Calendar."
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

  // Jobs open their details; deliveries and reminders open in the Calendar.
  function open() {
    if (item.event.type === 'job' && item.event.jobId) {
      router.navigate({ pathname: '/job/[id]', params: { id: item.event.jobId } });
    } else {
      router.navigate({ pathname: '/calendar', params: { event: item.event.id } });
    }
  }

  return (
    <Pressable
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${timing.label}`}
      style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
      <IconBadge name={TYPE_ICONS[item.type]} />
      <View style={styles.itemText}>
        <Text style={styles.itemTitle} numberOfLines={1}>
          {item.title}
        </Text>
        {item.source ? (
          <Text style={styles.itemMeta} numberOfLines={1}>
            {item.type === 'delivery' ? `From ${item.source}` : item.source}
          </Text>
        ) : null}
        {item.location ? (
          <View style={styles.location}>
            <Icon name={{ ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' }} color={C.textSecondary} size={12} />
            <Text style={styles.itemMeta} numberOfLines={1}>
              {item.location}
            </Text>
          </View>
        ) : null}
        <View style={[styles.pill, { backgroundColor: colors.background }]}>
          <Text style={[styles.pillText, { color: colors.text }]} numberOfLines={1}>
            {timing.label}
          </Text>
        </View>
      </View>
      <Icon name={OwnerIcons.chevron} color={C.textSecondary} size={14} />
    </Pressable>
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
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
    borderRadius: 999,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
