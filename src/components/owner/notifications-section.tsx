import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { NotificationIcon, OWNER_PALETTE } from '@/components/notifications/notification-views';
import { Button, Card, EmptyState, Icon, OwnerIcons } from '@/components/owner/ui';
import { Colors as C, Spacing } from '@/constants/theme';
import { listTime, ownerNotifications, useNotifications, type OwnerNotification } from '@/data/notifications';

const SHOWN = 3;

/**
 * Dashboard "Notifications" card: the 3 newest owner notifications and a "See more"
 * button with how many are still unopened (the same count as the More tab).
 */
export function NotificationsSection() {
  const all = ownerNotifications(useNotifications());
  const latest = [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, SHOWN);
  const unread = all.filter((n) => !n.read).length;

  return (
    <Card title="Notifications" icon={OwnerIcons.bell}>
      {latest.length === 0 ? (
        <EmptyState
          icon={OwnerIcons.bell}
          message="You're all caught up. Job reports, quote replies, payments and team updates will show up here."
        />
      ) : (
        <View style={styles.list}>
          {latest.map((n) => (
            <NotificationRow key={n.id} n={n} />
          ))}
        </View>
      )}

      <Button
        label={unread > 0 ? `See more (${unread})` : 'See more'}
        variant="secondary"
        // Typed routes only list '/alerts/index' for a folder index screen.
        onPress={() => router.navigate({ pathname: '/alerts', params: { from: 'dashboard' } } as Href)}
      />
    </Card>
  );
}

function NotificationRow({ n }: { n: OwnerNotification }) {
  return (
    <Pressable
      // The detail page marks it as read, so the unopened count drops by one.
      onPress={() => router.navigate({ pathname: '/alerts/[id]', params: { id: n.id, from: 'dashboard' } })}
      accessibilityRole="button"
      accessibilityLabel={`${n.read ? '' : 'Unread. '}${n.title}. ${n.summary}`}
      style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
      <NotificationIcon n={n} palette={OWNER_PALETTE} size={36} />
      <View style={styles.itemText}>
        <View style={styles.titleRow}>
          <Text style={[styles.itemTitle, !n.read && styles.unreadTitle]} numberOfLines={1}>
            {n.title}
          </Text>
          <Text style={styles.time}>{listTime(n.createdAt)}</Text>
        </View>
        <Text style={styles.itemMeta} numberOfLines={1}>
          {n.summary}
        </Text>
      </View>
      {!n.read && <View style={styles.dot} accessibilityElementsHidden importantForAccessibility="no" />}
      <Icon name={OwnerIcons.chevron} color={C.textSecondary} size={14} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  itemTitle: {
    flex: 1,
    color: C.text,
    fontSize: 15,
    fontWeight: '600',
  },
  unreadTitle: {
    fontWeight: '700',
  },
  time: {
    color: C.textSecondary,
    fontSize: 12,
  },
  itemMeta: {
    color: C.textSecondary,
    fontSize: 13,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.accent,
  },
});
