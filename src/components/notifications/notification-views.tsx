import { useState, type ReactNode } from 'react';
import { Image } from 'expo-image';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmployeeColors } from '@/constants/employee-theme';
import { Colors, Radius, Spacing } from '@/constants/theme';
import {
  formatBytes,
  fullTime,
  listTime,
  typeInfo,
  type AppNotification,
  type DateGroup,
  type Tone,
} from '@/data/notifications';

/** Colours for the light (Employee) or dark (Owner) look. */
export type Palette = {
  dark: boolean;
  background: string;
  card: string;
  cardAlt: string;
  border: string;
  text: string;
  textSecondary: string;
  accent: string;
};

type IconName = SymbolViewProps['name'];

export const EMPLOYEE_PALETTE: Palette = {
  dark: false,
  background: EmployeeColors.background,
  card: EmployeeColors.card,
  cardAlt: EmployeeColors.primarySoft,
  border: EmployeeColors.border,
  text: EmployeeColors.text,
  textSecondary: EmployeeColors.textSecondary,
  accent: EmployeeColors.primary,
};

export const OWNER_PALETTE: Palette = {
  dark: true,
  background: Colors.background,
  card: Colors.surface,
  cardAlt: Colors.surfaceRaised,
  border: Colors.border,
  text: Colors.text,
  textSecondary: Colors.textSecondary,
  accent: Colors.accent,
};

const TONES: Record<Tone, { color: string; light: string; dark: string }> = {
  red: { color: '#EF4444', light: '#FDECEC', dark: 'rgba(239, 68, 68, 0.16)' },
  amber: { color: '#F59E0B', light: '#FEF3C7', dark: 'rgba(245, 158, 11, 0.16)' },
  green: { color: '#22C55E', light: '#E8F7EE', dark: 'rgba(34, 197, 94, 0.16)' },
  blue: { color: '#3B82F6', light: '#EAF1FF', dark: 'rgba(59, 130, 246, 0.18)' },
  purple: { color: '#8B5CF6', light: '#F1ECFE', dark: 'rgba(139, 92, 246, 0.18)' },
  grey: { color: '#94A3B8', light: '#F1F5F9', dark: 'rgba(148, 163, 184, 0.16)' },
};

function toneColors(tone: Tone, palette: Palette) {
  const t = TONES[tone];
  return { color: t.color, soft: palette.dark ? t.dark : t.light };
}

function Icon({ name, color, size = 16 }: { name: IconName; color: string; size?: number }) {
  return <SymbolView name={name} tintColor={color} size={size} />;
}

export function NotificationIcon({ n, palette, size = 40 }: { n: AppNotification; palette: Palette; size?: number }) {
  const info = typeInfo(n);
  const { color, soft } = toneColors(info.tone, palette);
  return (
    <View style={[styles.icon, { width: size, height: size, borderRadius: size * 0.3, backgroundColor: soft }]}>
      <Icon name={info.icon} color={color} size={size * 0.45} />
    </View>
  );
}

export function SearchBar({
  value,
  onChange,
  palette,
  placeholder,
}: {
  value: string;
  onChange: (text: string) => void;
  palette: Palette;
  placeholder: string;
}) {
  return (
    <View style={[styles.search, { backgroundColor: palette.card, borderColor: palette.border }]}>
      <Icon name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} color={palette.textSecondary} size={14} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={palette.textSecondary}
        accessibilityLabel={placeholder}
        style={[styles.searchInput, { color: palette.text }]}
      />
    </View>
  );
}

export function FilterPills({
  filters,
  counts,
  active,
  onChange,
  palette,
}: {
  filters: readonly string[];
  counts: Record<string, number>;
  active: string;
  onChange: (filter: string) => void;
  palette: Palette;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillScroll} contentContainerStyle={styles.pills}>
      {filters.map((f) => {
        const selected = f === active;
        return (
          <Pressable
            key={f}
            onPress={() => onChange(f)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={[
              styles.pill,
              { borderColor: selected ? palette.accent : palette.border, backgroundColor: selected ? palette.accent : palette.card },
            ]}>
            <Text style={[styles.pillText, { color: selected ? '#FFFFFF' : palette.textSecondary }]}>
              {f} ({counts[f] ?? 0})
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function NotificationGroups<T extends AppNotification>({
  groups,
  palette,
  onOpen,
}: {
  groups: { group: DateGroup; items: T[] }[];
  palette: Palette;
  onOpen: (n: T) => void;
}) {
  return (
    <View style={styles.groups}>
      {groups.map(({ group, items }) => (
        <View key={group} style={styles.group}>
          <Text style={[styles.groupLabel, { color: palette.textSecondary }]}>{group}</Text>
          <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
            {items.map((n, i) => (
              <Pressable
                key={n.id}
                onPress={() => onOpen(n)}
                accessibilityRole="button"
                accessibilityLabel={`${n.read ? '' : 'Unread. '}${n.title}`}
                style={({ pressed }) => [
                  styles.row,
                  i > 0 && { borderTopWidth: 1, borderTopColor: palette.border },
                  pressed && styles.pressed,
                ]}>
                <NotificationIcon n={n} palette={palette} />
                <View style={styles.rowText}>
                  <Text style={[styles.rowTitle, { color: palette.text }]} numberOfLines={1}>
                    {n.title}
                  </Text>
                  <Text style={[styles.rowSummary, { color: palette.textSecondary }]} numberOfLines={1}>
                    {n.summary}
                  </Text>
                </View>
                <View style={styles.rowRight}>
                  <Text style={[styles.rowTime, { color: palette.textSecondary }]}>{listTime(n.createdAt)}</Text>
                  {!n.read && <View style={[styles.unread, { backgroundColor: palette.accent }]} />}
                </View>
                <Icon name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} color={palette.textSecondary} size={12} />
              </Pressable>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

export function NotificationsEmpty({ palette, message }: { palette: Palette; message: string }) {
  return (
    <View style={[styles.card, styles.empty, { backgroundColor: palette.card, borderColor: palette.border }]}>
      <View style={[styles.icon, styles.emptyIcon, { backgroundColor: palette.cardAlt }]}>
        <Icon name={{ ios: 'bell.fill', android: 'notifications_none', web: 'notifications_none' }} color={palette.textSecondary} size={20} />
      </View>
      <Text style={[styles.emptyTitle, { color: palette.text }]}>No notifications yet</Text>
      <Text style={[styles.emptyText, { color: palette.textSecondary }]}>{message}</Text>
    </View>
  );
}

export type DetailAction = { label: string; icon?: IconName; onPress?: () => void };

/** Full-screen view of one photo. Tap the ✕ (or anywhere around the photo) to close. */
function PhotoViewer({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={uri !== null} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.viewer}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close photo" />
        {uri && (
          <Image
            source={{ uri }}
            style={[styles.viewerImage, { marginTop: insets.top + 56, marginBottom: insets.bottom + Spacing.four }]}
            contentFit="contain"
            pointerEvents="none"
          />
        )}
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={8}
          style={({ pressed }) => [styles.viewerClose, { top: insets.top + Spacing.two }, pressed && styles.pressed]}>
          <Icon name={{ ios: 'xmark', android: 'close', web: 'close' }} color="#FFFFFF" size={18} />
        </Pressable>
      </View>
    </Modal>
  );
}

/** Detail layout shared by every notification type; sections appear only when they have content. */
export function NotificationDetail({
  n,
  palette,
  actions,
  actionsTitle = 'Actions',
  onOpenRelated,
}: {
  n: AppNotification;
  palette: Palette;
  actions: DetailAction[];
  actionsTitle?: string;
  onOpenRelated?: () => void;
}) {
  const info = typeInfo(n);
  const status = n.status ? toneColors(info.tone, palette) : null;
  const [openPhoto, setOpenPhoto] = useState<string | null>(null);

  return (
    <View style={styles.detail}>
      <View style={styles.detailHeader}>
        <NotificationIcon n={n} palette={palette} size={60} />
        <View style={styles.detailHeaderText}>
          <Text style={[styles.detailTitle, { color: palette.text }]}>{n.title}</Text>
          <Text style={[styles.detailTime, { color: palette.textSecondary }]}>{fullTime(n.createdAt)}</Text>
          {n.status && status && (
            <View style={[styles.status, { backgroundColor: status.soft }]}>
              <Text style={[styles.statusText, { color: status.color }]}>{n.status}</Text>
            </View>
          )}
        </View>
      </View>

      {n.details && n.details.length > 0 && (
        <DetailCard palette={palette}>
          {n.details.map((d, i) => (
            <View key={d.label} style={[styles.keyValue, i > 0 && { borderTopWidth: 1, borderTopColor: palette.border }]}>
              <Text style={[styles.key, { color: palette.textSecondary }]}>{d.label}</Text>
              <Text style={[styles.value, { color: palette.text }]}>{d.value}</Text>
            </View>
          ))}
        </DetailCard>
      )}

      <DetailSection title="Description" palette={palette}>
        <DetailCard palette={palette}>
          <Text style={[styles.body, { color: palette.text }]}>{n.body}</Text>
        </DetailCard>
      </DetailSection>

      {n.photos && n.photos.length > 0 && (
        <DetailSection title={`Photos (${n.photos.length})`} palette={palette}>
          <View style={styles.photos}>
            {n.photos.map((uri, i) => (
              <Pressable
                key={`${uri}-${i}`}
                onPress={() => setOpenPhoto(uri)}
                accessibilityRole="imagebutton"
                accessibilityLabel={`View photo ${i + 1} full size`}
                style={({ pressed }) => pressed && styles.pressed}>
                <Image source={{ uri }} style={[styles.photo, { backgroundColor: palette.cardAlt }]} contentFit="cover" />
              </Pressable>
            ))}
          </View>
        </DetailSection>
      )}
      <PhotoViewer uri={openPhoto} onClose={() => setOpenPhoto(null)} />

      {n.attachments && n.attachments.length > 0 && (
        <DetailSection title="Attachments" palette={palette}>
          <DetailCard palette={palette}>
            {n.attachments.map((a, i) => (
              <View key={a.name} style={[styles.attachment, i > 0 && { borderTopWidth: 1, borderTopColor: palette.border }]}>
                <Icon name={{ ios: 'doc.fill', android: 'attach_file', web: 'attach_file' }} color={palette.accent} size={16} />
                <View style={styles.flex}>
                  <Text style={[styles.value, { color: palette.text }]}>{a.name}</Text>
                  <Text style={[styles.key, { color: palette.textSecondary }]}>{formatBytes(a.sizeBytes)}</Text>
                </View>
                <Icon name={{ ios: 'arrow.down.circle.fill', android: 'download', web: 'download' }} color={palette.accent} size={18} />
              </View>
            ))}
          </DetailCard>
        </DetailSection>
      )}

      {n.relatedShift && (
        <DetailSection title="Related job" palette={palette}>
          <Pressable
            onPress={onOpenRelated}
            disabled={!onOpenRelated}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.card,
              styles.related,
              { backgroundColor: palette.card, borderColor: palette.border },
              pressed && styles.pressed,
            ]}>
            <View style={[styles.icon, styles.relatedIcon, { backgroundColor: palette.cardAlt }]}>
              <Icon name={{ ios: 'briefcase.fill', android: 'work', web: 'work' }} color={palette.accent} size={16} />
            </View>
            <View style={styles.flex}>
              <Text style={[styles.value, { color: palette.text }]}>{n.relatedShift.title}</Text>
              {n.relatedShift.subtitle ? (
                <Text style={[styles.key, { color: palette.textSecondary }]}>{n.relatedShift.subtitle}</Text>
              ) : null}
            </View>
            {onOpenRelated && (
              <Icon name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} color={palette.textSecondary} size={12} />
            )}
          </Pressable>
        </DetailSection>
      )}

      {actions.length > 0 && (
        <DetailSection title={actionsTitle} palette={palette}>
          <DetailCard palette={palette}>
            {actions.map((a, i) => (
              <Pressable
                key={a.label}
                onPress={a.onPress}
                disabled={!a.onPress}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.action,
                  i > 0 && { borderTopWidth: 1, borderTopColor: palette.border },
                  pressed && styles.pressed,
                ]}>
                <Text style={[styles.actionText, { color: a.onPress ? palette.accent : palette.textSecondary }]}>
                  {a.label}
                </Text>
                {a.onPress ? (
                  <Icon name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} color={palette.textSecondary} size={12} />
                ) : (
                  <Text style={[styles.soon, { color: palette.textSecondary }]}>Coming soon</Text>
                )}
              </Pressable>
            ))}
          </DetailCard>
        </DetailSection>
      )}
    </View>
  );
}

function DetailSection({ title, palette, children }: { title: string; palette: Palette; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={[styles.groupLabel, { color: palette.textSecondary }]}>{title}</Text>
      {children}
    </View>
  );
}

function DetailCard({ palette, children }: { palette: Palette; children: ReactNode }) {
  return <View style={[styles.card, styles.detailCard, { backgroundColor: palette.card, borderColor: palette.border }]}>{children}</View>;
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
  },
  icon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 44,
    paddingHorizontal: Spacing.three - 4,
    borderRadius: Radius.medium,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: Spacing.two,
  },
  pillScroll: {
    flexGrow: 0,
  },
  pills: {
    gap: Spacing.two,
    alignItems: 'center',
  },
  pill: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three - 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  groups: {
    gap: Spacing.three,
  },
  group: {
    gap: Spacing.two,
  },
  groupLabel: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    borderRadius: Radius.large - 4,
    borderWidth: 1,
    boxShadow: '0px 2px 8px rgba(15, 23, 42, 0.06)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    padding: Spacing.three - 4,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  rowSummary: {
    fontSize: 13,
  },
  rowRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  rowTime: {
    fontSize: 12,
  },
  unread: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  empty: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.five,
    paddingHorizontal: Spacing.four,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  detail: {
    gap: Spacing.four - 4,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  detailHeaderText: {
    flex: 1,
    gap: 4,
  },
  detailTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  detailTime: {
    fontSize: 13,
  },
  status: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
    borderRadius: 999,
    marginTop: 2,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  detailCard: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  keyValue: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingVertical: Spacing.two + 2,
  },
  key: {
    fontSize: 13,
  },
  value: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    paddingVertical: Spacing.two,
  },
  section: {
    gap: Spacing.two,
  },
  photos: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  photo: {
    width: 96,
    height: 96,
    borderRadius: Radius.medium,
  },
  viewer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
  },
  viewerImage: {
    flex: 1,
    marginHorizontal: Spacing.three,
  },
  viewerClose: {
    position: 'absolute',
    right: Spacing.three,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  attachment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    paddingVertical: Spacing.two + 2,
  },
  related: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    padding: Spacing.three - 4,
  },
  relatedIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.three - 4,
  },
  actionText: {
    fontSize: 15,
    fontWeight: '600',
  },
  soon: {
    fontSize: 12,
  },
});
