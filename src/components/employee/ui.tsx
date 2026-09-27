import type { ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { SafeAreaView } from 'react-native-safe-area-context';

import { cardShadow, EmployeeColors as C } from '@/constants/employee-theme';
import { Radius, Spacing } from '@/constants/theme';

export type IconName = SymbolViewProps['name'];

export function Icon({ name, color, size = 20 }: { name: IconName; color: string; size?: number }) {
  return <SymbolView name={name} tintColor={color} size={size} />;
}

export const Icons = {
  chevron: { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' },
  calendar: { ios: 'calendar', android: 'calendar_month', web: 'calendar_month' },
  clock: { ios: 'clock.fill', android: 'schedule', web: 'schedule' },
  location: { ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' },
  work: { ios: 'briefcase.fill', android: 'work', web: 'work' },
  payslip: { ios: 'doc.text.fill', android: 'receipt_long', web: 'receipt_long' },
  sparkles: { ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' },
  checked: { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' },
  unchecked: { ios: 'circle', android: 'radio_button_unchecked', web: 'radio_button_unchecked' },
} as const satisfies Record<string, IconName>;

/** Full-screen scrollable page with a large title, used by each Employee tab. */
export function EmployeeScreen({
  title,
  headerRight,
  children,
  scrollRef,
  onScroll,
  stickyHeaderIndices,
}: {
  title?: string;
  headerRight?: ReactNode;
  children: ReactNode;
  scrollRef?: React.Ref<ScrollView>;
  onScroll?: React.ComponentProps<typeof ScrollView>['onScroll'];
  /** Indexes of children to pin while scrolling (the title row, when shown, is index 0). */
  stickyHeaderIndices?: number[];
}) {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        stickyHeaderIndices={stickyHeaderIndices}
        contentContainerStyle={styles.content}>
        {title !== undefined && (
          <View style={styles.titleRow}>
            <Text style={styles.title}>{title}</Text>
            {headerRight}
          </View>
        )}
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function IconBadge({
  name,
  color = C.primary,
  background = C.primarySoft,
}: {
  name: IconName;
  color?: string;
  background?: string;
}) {
  return (
    <View style={[styles.iconBadge, { backgroundColor: background }]}>
      <Icon name={name} color={color} size={18} />
    </View>
  );
}

/** Shows initials, or a generic person icon when there is no signed-in employee yet. */
export function Avatar({ initials, size = 40 }: { initials?: string; size?: number }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      {initials ? (
        <Text style={[styles.avatarText, { fontSize: size * 0.38 }]}>{initials}</Text>
      ) : (
        <Icon
          name={{ ios: 'person.fill', android: 'person', web: 'person' }}
          color="#FFFFFF"
          size={size * 0.5}
        />
      )}
    </View>
  );
}

/** A tappable row inside a Card: icon, title, subtitle, optional right content and chevron. */
export function ListRow({
  icon,
  title,
  subtitle,
  right,
  onPress,
  showDivider = false,
  showChevron = true,
  destructive = false,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
  showDivider?: boolean;
  showChevron?: boolean;
  destructive?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [styles.row, showDivider && styles.rowDivider, pressed && styles.pressed]}>
      {icon}
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, destructive && styles.rowTitleDestructive]}>{title}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {right}
      {showChevron && <Icon name={Icons.chevron} color={C.textMuted} size={14} />}
    </Pressable>
  );
}

export const employeeStyles = StyleSheet.create({
  sectionLabel: {
    color: C.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: C.background,
  },
  content: {
    padding: Spacing.four - 4,
    paddingBottom: Spacing.five,
    gap: Spacing.three,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.two,
    marginBottom: Spacing.one,
  },
  title: {
    color: C.text,
    fontSize: 30,
    fontWeight: '700',
  },
  card: {
    backgroundColor: C.card,
    borderRadius: Radius.large - 4,
    borderWidth: 1,
    borderColor: C.border,
    ...cardShadow,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: Radius.medium - 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    paddingVertical: Spacing.three - 2,
    paddingHorizontal: Spacing.three,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    color: C.text,
    fontSize: 16,
    fontWeight: '600',
  },
  rowTitleDestructive: {
    color: C.danger,
  },
  rowSubtitle: {
    color: C.textSecondary,
    fontSize: 13,
  },
  pressed: {
    opacity: 0.6,
  },
});
