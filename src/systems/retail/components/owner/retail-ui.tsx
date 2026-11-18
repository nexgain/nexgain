// NexGain Retail's look: dashboard tiles, small coloured pills, segmented tabs,
// quick-action squares, tappable info rows and simple tables. White cards with
// soft borders and NexGain's own blue (the theme colours), so retail matches
// the rest of the app.
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon, type IconName } from '@/systems/retail/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';

export type Tone = 'success' | 'danger' | 'warning' | 'neutral' | 'accent';

const TONES: Record<Tone, { color: string; background: string }> = {
  success: { color: C.success, background: C.successSoft },
  danger: { color: C.danger, background: C.dangerSoft },
  warning: { color: C.warning, background: C.warningSoft },
  neutral: { color: C.textSecondary, background: C.neutralSoft },
  accent: { color: C.accent, background: C.accentSoft },
};

/** A small rounded label, e.g. "8 low items" or "Connected". */
export function Pill({ label, tone, icon }: { label: string; tone: Tone; icon?: IconName }) {
  const t = TONES[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.background }]}>
      {icon && <Icon name={icon} color={t.color} size={11} />}
      <Text style={[styles.pillText, { color: t.color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** An icon in a soft blue rounded square. */
export function IconSquare({ icon, size = 40 }: { icon: IconName; size?: number }) {
  return (
    <View style={[styles.iconSquare, { width: size, height: size, borderRadius: Math.round(size * 0.28) }]}>
      <Icon name={icon} color={C.accent} size={Math.round(size * 0.48)} />
    </View>
  );
}

/** A dashboard tile: icon, title, a big value (optional) and a pill. */
export function Tile({
  icon,
  title,
  value,
  pill,
  onPress,
}: {
  icon: IconName;
  title: string;
  value?: string;
  pill?: { label: string; tone: Tone; icon?: IconName };
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={[title, value, pill?.label].filter(Boolean).join(', ')}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
      <IconSquare icon={icon} size={36} />
      <Text style={styles.tileTitle}>{title}</Text>
      {value ? (
        <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
      ) : null}
      {pill && <Pill {...pill} />}
    </Pressable>
  );
}

/** Two tiles a row. */
export function TileGrid({ children }: { children: ReactNode }) {
  return <View style={styles.tileGrid}>{children}</View>;
}

/** A square quick action: icon above a label. */
export function QuickAction({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [styles.quick, pressed && styles.pressed]}>
      <Icon name={icon} color={C.accent} size={22} />
      <Text style={styles.quickText} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function QuickActions({ children }: { children: ReactNode }) {
  return <View style={styles.quickRow}>{children}</View>;
}

/** Tabs in a rounded track (Stock / Sales / Suppliers / Details). */
export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={styles.segmented} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={({ pressed }) => [styles.segment, on && styles.segmentOn, pressed && styles.pressed]}>
            <Text style={[styles.segmentText, on && styles.segmentTextOn]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A small stat box (Current stock, Reorder point...). `highlight` = the AI's suggestion. */
export function StatBox({ label, value, highlight, icon }: { label: string; value: string; highlight?: boolean; icon?: IconName }) {
  return (
    <View style={[styles.statBox, highlight && styles.statBoxOn]}>
      <View style={styles.statTop}>
        <Text style={[styles.statLabel, highlight && styles.statLabelOn]} numberOfLines={2}>
          {label}
        </Text>
        {icon && <Icon name={icon} color={C.accent} size={13} />}
      </View>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

/** A tappable row: icon, label, value underneath, chevron (Delivery, Requested Delivery...). */
export function InfoRow({
  icon,
  label,
  value,
  onPress,
  showDivider,
}: {
  icon: IconName;
  label: string;
  value: string;
  onPress?: () => void;
  showDivider?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${label}: ${value}`}
      style={({ pressed }) => [styles.infoRow, showDivider && styles.divider, pressed && styles.pressed]}>
      <Icon name={icon} color={C.textSecondary} size={18} />
      <View style={styles.flex}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue} numberOfLines={2}>
          {value}
        </Text>
      </View>
      {onPress && <Icon name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} color={C.textSecondary} size={13} />}
    </Pressable>
  );
}

/** A plain white card with soft border (no title). */
export function Panel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

/** Table header cells. `flex` says how wide each column is. */
export function TableHead({ columns }: { columns: { label: string; flex?: number; align?: 'left' | 'center' | 'right' }[] }) {
  return (
    <View style={styles.tableHead}>
      {columns.map((c) => (
        <Text key={c.label} style={[styles.th, { flex: c.flex ?? 1, textAlign: c.align ?? 'left' }]}>
          {c.label}
        </Text>
      ))}
    </View>
  );
}

export const retailStyles = StyleSheet.create({
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingHorizontal: Spacing.three - 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  td: { color: C.text, fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  tdLow: { color: C.danger },
  sectionTitle: { color: C.text, fontSize: 17, fontWeight: '700' },
  greeting: { color: C.text, fontSize: 22, fontWeight: '700' },
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  pillText: { fontSize: 12, fontWeight: '600' },
  iconSquare: { alignItems: 'center', justifyContent: 'center', backgroundColor: C.accentSoft },
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three - 4 },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    minHeight: 128,
    gap: 6,
    padding: Spacing.three,
    borderRadius: Radius.large - 4,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  tileTitle: { color: C.text, fontSize: 15, fontWeight: '700', marginTop: 4 },
  tileValue: { color: C.text, fontSize: 24, fontWeight: '800', fontVariant: ['tabular-nums'] },
  quickRow: { flexDirection: 'row', gap: Spacing.two },
  quick: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 84,
    paddingHorizontal: 4,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  quickText: { color: C.text, fontSize: 12, fontWeight: '600' },
  segmented: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: Radius.medium, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  segment: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.medium - 4 },
  segmentOn: { backgroundColor: C.accent },
  segmentText: { color: C.text, fontSize: 14, fontWeight: '600' },
  segmentTextOn: { color: C.onAccent },
  statBox: { flex: 1, gap: 6, padding: Spacing.three - 4, borderRadius: Radius.medium, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  statBoxOn: { backgroundColor: C.accentSoft, borderColor: C.accentSoft },
  statTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 4 },
  statLabel: { flex: 1, color: C.textSecondary, fontSize: 12, fontWeight: '600' },
  statLabelOn: { color: C.accent },
  statValue: { color: C.text, fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three - 4, paddingVertical: Spacing.three - 4 },
  infoLabel: { color: C.text, fontSize: 14, fontWeight: '700' },
  infoValue: { color: C.textSecondary, fontSize: 13, marginTop: 2 },
  panel: { padding: Spacing.three, gap: Spacing.three - 4, borderRadius: Radius.large - 4, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  tableHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.three - 4, paddingVertical: Spacing.two, backgroundColor: C.background },
  th: { color: C.textSecondary, fontSize: 13, fontWeight: '700' },
});
