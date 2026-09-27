import { Children, useState, type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors as C, Radius, Spacing } from '@/constants/theme';

export type IconName = SymbolViewProps['name'];

export function Icon({ name, color, size = 18 }: { name: IconName; color: string; size?: number }) {
  return <SymbolView name={name} tintColor={color} size={size} />;
}

export const OwnerIcons = {
  chevron: { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' },
  chevronDown: { ios: 'chevron.down', android: 'expand_more', web: 'expand_more' },
  calendar: { ios: 'calendar', android: 'calendar_month', web: 'calendar_month' },
  bell: { ios: 'bell.fill', android: 'notifications', web: 'notifications' },
  money: { ios: 'dollarsign.circle.fill', android: 'payments', web: 'payments' },
  clock: { ios: 'clock.fill', android: 'schedule', web: 'schedule' },
  people: { ios: 'person.2.fill', android: 'group', web: 'group' },
  chart: { ios: 'chart.bar.fill', android: 'bar_chart', web: 'bar_chart' },
  sparkles: { ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' },
  lightbulb: { ios: 'lightbulb.fill', android: 'lightbulb', web: 'lightbulb' },
  trendingUp: { ios: 'chart.line.uptrend.xyaxis', android: 'trending_up', web: 'trending_up' },
  card: { ios: 'creditcard.fill', android: 'credit_card', web: 'credit_card' },
  wallet: { ios: 'banknote.fill', android: 'account_balance_wallet', web: 'account_balance_wallet' },
  percent: { ios: 'percent', android: 'percent', web: 'percent' },
  bank: { ios: 'building.columns.fill', android: 'account_balance', web: 'account_balance' },
  receipt: { ios: 'doc.text.fill', android: 'receipt_long', web: 'receipt_long' },
  download: { ios: 'arrow.down.circle.fill', android: 'download', web: 'download' },
  check: { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' },
  play: { ios: 'play.fill', android: 'play_arrow', web: 'play_arrow' },
  info: { ios: 'info.circle.fill', android: 'info', web: 'info' },
} as const satisfies Record<string, IconName>;

const WIDE_WIDTH = 720;

/**
 * Measures the space a layout actually has (rather than the window size), so it
 * also lays out correctly after the web build's static pre-render.
 */
function useMeasuredWidth() {
  const [width, setWidth] = useState(0);
  return {
    width,
    onLayout: (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width),
  };
}

export function OwnerScreen({
  children,
  scrollRef,
}: {
  children: ReactNode;
  scrollRef?: React.Ref<ScrollView>;
}) {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <View style={styles.pageHeader}>
      <View style={styles.pageHeaderText}>
        <Text style={styles.pageTitle}>{title}</Text>
        {subtitle ? <Text style={styles.pageSubtitle}>{subtitle}</Text> : null}
      </View>
      {right ? <View style={styles.pageHeaderRight}>{right}</View> : null}
    </View>
  );
}

/** Lays children out side by side on wide screens and stacked on phones. */
export function ResponsiveRow({ children, weights }: { children: ReactNode; weights?: number[] }) {
  const { width, onLayout } = useMeasuredWidth();
  const wide = width >= WIDE_WIDTH;
  return (
    <View onLayout={onLayout} style={[styles.responsiveRow, wide && styles.responsiveRowWide]}>
      {Children.toArray(children).map((child, i) => (
        <View key={i} style={wide ? { flex: weights?.[i] ?? 1 } : undefined}>
          {child}
        </View>
      ))}
    </View>
  );
}

export function Card({
  title,
  icon,
  right,
  children,
  style,
}: {
  title?: string;
  icon?: IconName;
  right?: ReactNode;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.card, style]}>
      {title ? (
        <View style={styles.cardHeader}>
          {icon ? <Icon name={icon} color={C.accent} size={16} /> : null}
          <Text style={styles.cardTitle}>{title}</Text>
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function IconBadge({ name, color = C.accent }: { name: IconName; color?: string }) {
  return (
    <View style={styles.iconBadge}>
      <Icon name={name} color={color} size={18} />
    </View>
  );
}

export function StatCard({
  icon,
  label,
  value,
  change,
  changeLabel = 'vs last week',
}: {
  icon: IconName;
  label: string;
  value: string;
  /** e.g. "+4.2%". null shows "—" until there's data to compare. */
  change?: string | null;
  changeLabel?: string;
}) {
  return (
    <View style={[styles.card, styles.statCard]}>
      <View style={styles.statTop}>
        <Text style={styles.statLabel} numberOfLines={2}>
          {label}
        </Text>
        <IconBadge name={icon} />
      </View>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.statChange}>
        {change ?? '—'} {changeLabel}
      </Text>
    </View>
  );
}

/** Summary cards: all in one row on wide screens, two per row on phones. */
export function StatGrid({ children, columns }: { children: ReactNode; columns: number }) {
  const { width, onLayout } = useMeasuredWidth();
  const perRow = width >= WIDE_WIDTH ? columns : Math.min(columns, 2);
  const gap = Spacing.three - 4;
  const itemWidth = width > 0 ? (width - gap * (perRow - 1)) / perRow : undefined;
  return (
    <View onLayout={onLayout} style={[styles.statGrid, { gap }]}>
      {Children.toArray(children).map((child, i) => (
        <View key={i} style={{ width: itemWidth }}>
          {child}
        </View>
      ))}
    </View>
  );
}

export function TabRow<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: readonly T[];
  active: T;
  onChange: (tab: T) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.tabScroll}
      contentContainerStyle={styles.tabRow}>
      {tabs.map((tab) => {
        const selected = tab === active;
        return (
          <Pressable
            key={tab}
            onPress={() => onChange(tab)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={[styles.tab, selected && styles.tabSelected]}>
            <Text style={[styles.tabText, selected && styles.tabTextSelected]}>{tab}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function EmptyState({ icon, message }: { icon: IconName; message: string }) {
  return (
    <View style={styles.empty}>
      <IconBadge name={icon} color={C.textSecondary} />
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
}

export function Button({
  label,
  icon,
  onPress,
  variant = 'primary',
  disabled,
}: {
  label: string;
  icon?: IconName;
  onPress?: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}) {
  const primary = variant === 'primary';
  const color = primary ? '#FFFFFF' : C.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.buttonPrimary : styles.buttonSecondary,
        disabled && styles.buttonDisabled,
        pressed && styles.pressed,
      ]}>
      {icon ? <Icon name={icon} color={color} size={16} /> : null}
      <Text style={[styles.buttonText, { color }]}>{label}</Text>
    </Pressable>
  );
}

const BADGE_TONES = {
  success: { color: C.success, background: 'rgba(34, 197, 94, 0.14)' },
  warning: { color: C.warning, background: 'rgba(245, 158, 11, 0.14)' },
  danger: { color: C.danger, background: 'rgba(239, 68, 68, 0.14)' },
  neutral: { color: C.textSecondary, background: C.surfaceRaised },
} as const;

export function Badge({ label, tone }: { label: string; tone: keyof typeof BADGE_TONES }) {
  const colors = BADGE_TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: colors.background }]}>
      <Text style={[styles.badgeText, { color: colors.color }]}>{label}</Text>
    </View>
  );
}

export function ActionRow({
  icon,
  label,
  onPress,
  showDivider,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  showDivider?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.actionRow, showDivider && styles.divider, pressed && styles.pressed]}>
      <IconBadge name={icon} />
      <Text style={styles.actionLabel}>{label}</Text>
      <Icon name={OwnerIcons.chevron} color={C.textSecondary} size={14} />
    </Pressable>
  );
}

/** Pill button showing the selected range; opens a bottom sheet of options. */
export function RangeSelect<T extends { id: string; label: string }>({
  options,
  value,
  onChange,
  detail,
}: {
  options: readonly T[];
  value: T;
  onChange: (option: T) => void;
  /** Extra text after the label, e.g. the date span. */
  detail?: string;
}) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Date range"
        style={({ pressed }) => [styles.rangeButton, pressed && styles.pressed]}>
        <Icon name={OwnerIcons.calendar} color={C.textSecondary} size={14} />
        <Text style={styles.rangeText} numberOfLines={1}>
          {value.label}
          {detail ? <Text style={styles.rangeDetail}>{`  ${detail}`}</Text> : null}
        </Text>
        <Icon name={OwnerIcons.chevronDown} color={C.textSecondary} size={12} />
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.two }]}>
          <Text style={styles.sheetTitle}>Date range</Text>
          {options.map((option, i) => {
            const selected = option.id === value.id;
            return (
              <Pressable
                key={option.id}
                onPress={() => {
                  onChange(option);
                  setOpen(false);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={({ pressed }) => [styles.option, i > 0 && styles.divider, pressed && styles.pressed]}>
                <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                  {option.label}
                </Text>
                {selected && (
                  <Icon name={{ ios: 'checkmark', android: 'check', web: 'check' }} color={C.accent} size={16} />
                )}
              </Pressable>
            );
          })}
        </View>
      </Modal>
    </>
  );
}

export const ownerStyles = StyleSheet.create({
  mutedText: {
    color: C.textSecondary,
    fontSize: 13,
    lineHeight: 18,
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
    width: '100%',
    maxWidth: 1200,
    alignSelf: 'center',
  },
  pageHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.three - 4,
    marginTop: Spacing.two,
  },
  pageHeaderText: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 260,
    gap: Spacing.one,
  },
  pageHeaderRight: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
  },
  pageTitle: {
    color: C.text,
    fontSize: 28,
    fontWeight: '700',
  },
  pageSubtitle: {
    color: C.textSecondary,
    fontSize: 15,
    lineHeight: 21,
  },
  responsiveRow: {
    gap: Spacing.three,
  },
  responsiveRowWide: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  card: {
    flexGrow: 1,
    backgroundColor: C.surface,
    borderRadius: Radius.large - 4,
    borderWidth: 1,
    borderColor: C.border,
    padding: Spacing.three,
    gap: Spacing.three - 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  cardTitle: {
    flex: 1,
    color: C.text,
    fontSize: 16,
    fontWeight: '700',
  },
  iconBadge: {
    width: 34,
    height: 34,
    borderRadius: Radius.medium - 2,
    backgroundColor: C.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  statCard: {
    gap: Spacing.one + 2,
  },
  statTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  statLabel: {
    flex: 1,
    color: C.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  statValue: {
    color: C.text,
    fontSize: 28,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  statChange: {
    color: C.textSecondary,
    fontSize: 12,
  },
  tabScroll: {
    flexGrow: 0,
  },
  tabRow: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  tab: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three - 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.border,
  },
  tabSelected: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  tabText: {
    color: C.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  tabTextSelected: {
    color: '#FFFFFF',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.four,
    paddingHorizontal: Spacing.three,
  },
  emptyText: {
    color: C.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 320,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.medium,
    borderWidth: 1,
  },
  buttonPrimary: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  buttonSecondary: {
    backgroundColor: C.surfaceRaised,
    borderColor: C.border,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    paddingVertical: Spacing.two + 2,
  },
  actionLabel: {
    flex: 1,
    color: C.text,
    fontSize: 15,
    fontWeight: '600',
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  pressed: {
    opacity: 0.7,
  },
  rangeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.three - 4,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    maxWidth: 320,
  },
  rangeText: {
    flexShrink: 1,
    color: C.text,
    fontSize: 14,
    fontWeight: '600',
  },
  rangeDetail: {
    color: C.textSecondary,
    fontWeight: '400',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: Radius.large,
    borderTopRightRadius: Radius.large,
    paddingTop: Spacing.three,
    paddingHorizontal: Spacing.four - 4,
  },
  sheetTitle: {
    color: C.text,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: Spacing.two,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.three - 2,
  },
  optionText: {
    color: C.text,
    fontSize: 16,
  },
  optionTextSelected: {
    color: C.accent,
    fontWeight: '600',
  },
});
