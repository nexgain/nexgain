import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router, usePathname, type Href } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';

import { Desktop, FontSize, Palette, Radius, Spacing } from '@/constants/theme';
import { useIsDesktop } from '@/hooks/use-desktop';

const LOGO = require('@/assets/nexgain-logo.png');
const LOGO_RATIO = 978 / 634;

export type NavItem = {
  label: string;
  icon: SymbolViewProps['name'];
  href: Href;
  /** Addresses that also highlight this item (sub-pages), e.g. '/job/' for each job. */
  match: string[];
  /** A count shown on the right, e.g. unread notifications. Hidden when 0. */
  badge?: number;
  /** Hidden from the menu (e.g. contractor-only pages for other workers). */
  hidden?: boolean;
};

export type NavSection = { title?: string; items: NavItem[] };

/**
 * The computer layout: a fixed menu down the left and the page beside it.
 * On phones (and narrow browser windows) it shows the page only, exactly as before,
 * and the app keeps its bottom tab bar.
 *
 * The page is always the same child in the same place, so switching between
 * layouts never resets the screen that's open.
 */
export function DesktopShell({
  sections,
  footer,
  children,
}: {
  sections: NavSection[];
  footer?: NavItem & { onPress: () => void };
  children: ReactNode;
}) {
  const desktop = useIsDesktop();
  return (
    <View style={styles.root}>
      {desktop && <Sidebar sections={sections} footer={footer} />}
      <View style={styles.page}>{children}</View>
    </View>
  );
}

function isActive(pathname: string, item: NavItem) {
  return item.match.some((m) => (m.endsWith('/') ? pathname.startsWith(m) : pathname === m || pathname.startsWith(`${m}/`)));
}

function Sidebar({ sections, footer }: { sections: NavSection[]; footer?: NavItem & { onPress: () => void } }) {
  const pathname = usePathname();
  return (
    <View style={styles.sidebar} accessibilityRole="navigation">
      <Image source={LOGO} style={styles.logo} contentFit="contain" accessibilityLabel="NexGain" />
      <ScrollView style={styles.navScroll} contentContainerStyle={styles.nav}>
        {sections.map((section, i) => (
          <View key={section.title ?? i} style={styles.section}>
            {section.title ? <Text style={styles.sectionTitle}>{section.title}</Text> : null}
            {section.items
              .filter((item) => !item.hidden)
              .map((item) => (
                <NavRow
                  key={item.label}
                  item={item}
                  active={isActive(pathname, item)}
                  onPress={() => router.navigate(item.href)}
                />
              ))}
          </View>
        ))}
      </ScrollView>
      {footer ? (
        <View style={styles.footer}>
          <NavRow item={footer} active={false} onPress={footer.onPress} />
        </View>
      ) : null}
    </View>
  );
}

function NavRow({ item, active, onPress }: { item: NavItem; active: boolean; onPress: () => void }) {
  const [hovered, setHovered] = useState(false);
  const color = active ? Palette.onPrimary : hovered ? '#E2E8F0' : SIDEBAR_MUTED;
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="link"
      accessibilityState={{ selected: active }}
      accessibilityLabel={item.badge ? `${item.label}, ${item.badge}` : item.label}
      style={[styles.item, hovered && !active && styles.itemHovered, active && styles.itemActive]}>
      <SymbolView name={item.icon} tintColor={color} size={18} />
      <Text style={[styles.itemLabel, { color }, active && styles.itemLabelActive]} numberOfLines={1}>
        {item.label}
      </Text>
      {item.badge ? (
        <View style={[styles.badge, active && styles.badgeActive]}>
          <Text style={[styles.badgeText, active && styles.badgeTextActive]}>{item.badge > 99 ? '99+' : item.badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const SIDEBAR_MUTED = '#9AA4B6';

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
  },
  page: {
    flex: 1,
    minWidth: 0,
  },
  sidebar: {
    width: Desktop.sidebarWidth,
    backgroundColor: Palette.logoBackground,
    paddingTop: Spacing.four - 4,
    paddingBottom: Spacing.three - 4,
    paddingHorizontal: Spacing.three - 4,
  },
  logo: {
    width: 96,
    aspectRatio: LOGO_RATIO,
    marginLeft: Spacing.two,
    marginBottom: Spacing.four - 4,
  },
  navScroll: {
    flex: 1,
  },
  nav: {
    gap: Spacing.three,
    paddingBottom: Spacing.three,
  },
  section: {
    gap: 2,
  },
  sectionTitle: {
    color: '#6B7588',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    paddingHorizontal: Spacing.three - 4,
    marginBottom: Spacing.one + 2,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    height: 36,
    paddingHorizontal: Spacing.three - 4,
    borderRadius: Radius.small + 2,
  },
  itemHovered: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  itemActive: {
    backgroundColor: Palette.primary,
  },
  itemLabel: {
    flex: 1,
    fontSize: FontSize.small + 1,
    fontWeight: '500',
  },
  itemLabelActive: {
    fontWeight: '600',
  },
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: Radius.pill,
    backgroundColor: Palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeActive: {
    backgroundColor: Palette.onPrimary,
  },
  badgeText: {
    color: Palette.onPrimary,
    fontSize: 11,
    fontWeight: '700',
  },
  badgeTextActive: {
    color: Palette.primary,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    paddingTop: Spacing.two,
  },
});
