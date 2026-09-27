import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, Icon } from '@/components/employee/ui';
import { useNativePicker } from '@/components/pickers/use-native-picker';
import { EmployeeColors as C } from '@/constants/employee-theme';
import { Radius, Spacing } from '@/constants/theme';
import {
  availabilityFor,
  defaultAvailability,
  saveAvailability,
  useAvailability,
  WEEKDAY_NAMES,
  type WeeklyAvailability,
} from '@/data/availability';
import { currentEmployee } from '@/data/current-employee';
import { format12h } from '@/data/employee-roster';
import { dateToTime, timeToDate, toMinutes } from '@/data/time';

const PICKER_THEME = {
  sheet: C.card,
  border: C.border,
  text: C.text,
  muted: C.textSecondary,
  accent: C.primary,
  dark: false,
};

export default function AvailabilityScreen() {
  const insets = useSafeAreaInsets();
  const employeeId = currentEmployee?.id ?? null;
  const saved = availabilityFor(useAvailability(), employeeId);
  const [week, setWeek] = useState<WeeklyAvailability>(() => saved ?? defaultAvailability());

  function updateDay(index: number, changes: Partial<WeeklyAvailability[number]>) {
    setWeek((prev) => prev.map((day, i) => (i === index ? { ...day, ...changes } : day)));
  }

  const invalidDays = week
    .map((day, i) => (day.available && toMinutes(day.end) <= toMinutes(day.start) ? i : -1))
    .filter((i) => i >= 0);

  function save() {
    if (invalidDays.length > 0) return;
    saveAvailability(employeeId, week);
    router.back();
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.subtitle}>Set the days and times you are available to work.</Text>

        <Card>
          {week.map((day, i) => (
            <View key={WEEKDAY_NAMES[i]} style={[styles.dayRow, i > 0 && styles.divider]}>
              <View style={styles.dayHeader}>
                <Text style={[styles.dayName, !day.available && styles.dayNameOff]}>
                  {WEEKDAY_NAMES[i]}
                </Text>
                <Switch
                  value={day.available}
                  onValueChange={(available) => updateDay(i, { available })}
                  trackColor={{ true: C.primary, false: '#CBD5E1' }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor="#CBD5E1"
                  accessibilityLabel={`Available on ${WEEKDAY_NAMES[i]}`}
                />
              </View>

              {day.available && (
                <>
                  <View style={styles.times}>
                    <TimeChip
                      label={`${WEEKDAY_NAMES[i]} start time`}
                      value={day.start}
                      onChange={(start) => updateDay(i, { start })}
                    />
                    <Text style={styles.to}>to</Text>
                    <TimeChip
                      label={`${WEEKDAY_NAMES[i]} end time`}
                      value={day.end}
                      onChange={(end) => updateDay(i, { end })}
                    />
                  </View>
                  {invalidDays.includes(i) && (
                    <Text style={styles.error}>End time must be after the start time.</Text>
                  )}
                </>
              )}
            </View>
          ))}
        </Card>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.three }]}>
        <Pressable
          onPress={save}
          disabled={invalidDays.length > 0}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.saveButton,
            invalidDays.length > 0 && styles.saveDisabled,
            pressed && styles.pressed,
          ]}>
          <Text style={styles.saveText}>Save Availability</Text>
        </Pressable>
      </View>
    </View>
  );
}

function TimeChip({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (time: string) => void;
}) {
  const picker = useNativePicker({
    mode: 'time',
    value: timeToDate(value),
    onChange: (date) => onChange(dateToTime(date)),
    title: label,
    theme: PICKER_THEME,
  });
  return (
    <>
      <Pressable
        onPress={picker.open}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [styles.timeChip, pressed && styles.pressed]}>
        <Icon name={{ ios: 'clock', android: 'schedule', web: 'schedule' }} color={C.primary} size={14} />
        <Text style={styles.timeText}>{format12h(value)}</Text>
      </Pressable>
      {picker.element}
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.background,
  },
  content: {
    padding: Spacing.four - 4,
    gap: Spacing.three,
  },
  subtitle: {
    color: C.textSecondary,
    fontSize: 15,
    lineHeight: 21,
  },
  dayRow: {
    paddingVertical: Spacing.three - 4,
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dayName: {
    color: C.text,
    fontSize: 16,
    fontWeight: '600',
  },
  dayNameOff: {
    color: C.textMuted,
  },
  times: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  to: {
    color: C.textSecondary,
    fontSize: 14,
  },
  timeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three - 4,
    borderRadius: Radius.medium - 2,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.primarySoft,
  },
  timeText: {
    color: C.text,
    fontSize: 15,
    fontWeight: '600',
  },
  error: {
    color: C.danger,
    fontSize: 13,
  },
  footer: {
    paddingHorizontal: Spacing.four - 4,
    paddingTop: Spacing.three,
    backgroundColor: C.card,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  saveButton: {
    paddingVertical: Spacing.three,
    borderRadius: Radius.medium,
    alignItems: 'center',
    backgroundColor: C.primary,
  },
  saveDisabled: {
    opacity: 0.5,
  },
  saveText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.7,
  },
});
