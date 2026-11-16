// Pieces shared by the NexGain Bookings owner screens: a setting with a list of
// choices, a tappable list row, and a week of hours (opening hours, staff hours).
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { FieldButton, OptionSheet, TimeField } from '@/systems/bookings/components/owner/form';
import { Icon, OwnerIcons } from '@/systems/bookings/components/owner/ui';
import { Colors as C, Spacing } from '@/constants/theme';
import { format12h, LONG_DAYS, minutesOf } from '@/systems/bookings/data/booking-time';

/** A setting that opens a list of choices, e.g. "Buffer between bookings: 10 min". */
export function ChoiceRow<T extends string | number>({
  label,
  hint,
  choices,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  choices: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = choices.find((c) => c.value === value)?.label ?? String(value);
  return (
    <View style={styles.choice}>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      <FieldButton value={current} icon={OwnerIcons.chevronDown} onPress={() => setOpen(true)} accessibilityLabel={`${label}: ${current}`} />
      <OptionSheet
        visible={open}
        title={label}
        options={choices.map((c) => c.label)}
        value={current}
        onSelect={(picked) => {
          const choice = choices.find((c) => c.label === picked);
          if (choice) onChange(choice.value);
        }}
        onClose={() => setOpen(false)}
      />
    </View>
  );
}

/** A row that opens something: title, a line underneath, and a chevron. */
export function ListRow({
  title,
  subtitle,
  right,
  onPress,
  showDivider,
  muted,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress: () => void;
  showDivider?: boolean;
  muted?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      style={({ pressed }) => [styles.row, showDivider && styles.divider, pressed && styles.pressed]}>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, muted && styles.mutedTitle]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.hint} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      <Icon name={OwnerIcons.chevron} color={C.textSecondary} size={14} />
    </Pressable>
  );
}

export type DayHours = { on: boolean; start: string; end: string };

/**
 * Seven days (Monday first): an on/off switch and start and end times for each.
 * `onChange` gets the whole week; a day whose end isn't after its start is refused.
 */
export function WeekHours({
  days,
  onLabel,
  offLabel,
  onChange,
}: {
  days: DayHours[];
  onLabel: string;
  offLabel: string;
  onChange: (days: DayHours[]) => void;
}) {
  const [problem, setProblem] = useState<string | null>(null);
  function change(i: number, next: DayHours) {
    if (next.on && minutesOf(next.end) <= minutesOf(next.start)) {
      setProblem(`${LONG_DAYS[i]}: the finish time must be after the start time.`);
      return;
    }
    setProblem(null);
    onChange(days.map((d, j) => (j === i ? next : d)));
  }
  return (
    <View>
      {days.map((d, i) => (
        <View key={LONG_DAYS[i]} style={[styles.day, i > 0 && styles.divider]}>
          <View style={styles.dayTop}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{LONG_DAYS[i]}</Text>
              <Text style={styles.hint}>{d.on ? `${onLabel} ${format12h(d.start)} – ${format12h(d.end)}` : offLabel}</Text>
            </View>
            <Switch
              value={d.on}
              onValueChange={(on) => change(i, { ...d, on })}
              trackColor={{ true: C.accent, false: C.inputBorder }}
              thumbColor={C.onAccent}
              ios_backgroundColor={C.inputBorder}
              accessibilityLabel={`${LONG_DAYS[i]} ${onLabel.toLowerCase()}`}
            />
          </View>
          {d.on && (
            <View style={styles.times}>
              <View style={styles.flex}>
                <TimeField label={`${LONG_DAYS[i]} start`} value={d.start} onChange={(start) => change(i, { ...d, start })} />
              </View>
              <Text style={styles.hint}>to</Text>
              <View style={styles.flex}>
                <TimeField label={`${LONG_DAYS[i]} finish`} value={d.end} onChange={(end) => change(i, { ...d, end })} />
              </View>
            </View>
          )}
        </View>
      ))}
      {problem && (
        <Text style={styles.error} accessibilityRole="alert">
          {problem}
        </Text>
      )}
    </View>
  );
}

/** A short line of feedback after saving: green when it worked, red when it didn't. */
export function SaveNote({ message }: { message: { tone: 'ok' | 'error'; text: string } | null }) {
  if (!message) return null;
  return (
    <Text style={[styles.note, message.tone === 'error' && styles.error]} accessibilityRole="alert">
      {message.text}
    </Text>
  );
}

const styles = StyleSheet.create({
  choice: { gap: Spacing.one },
  label: { color: C.text, fontSize: 15, fontWeight: '600' },
  hint: { color: C.textSecondary, fontSize: 13, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 52, paddingVertical: Spacing.two },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { color: C.text, fontSize: 15, fontWeight: '600' },
  mutedTitle: { color: C.textSecondary },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  pressed: { opacity: 0.6 },
  day: { paddingVertical: Spacing.two, gap: Spacing.two },
  dayTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  times: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1 },
  note: { color: C.success, fontSize: 14, fontWeight: '600' },
  error: { color: C.danger, fontSize: 14, fontWeight: '600' },
});
