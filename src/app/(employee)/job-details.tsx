import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card, employeeStyles, Icon, IconBadge, Icons } from '@/components/employee/ui';
import { EmployeeColors as C } from '@/constants/employee-theme';
import { Spacing } from '@/constants/theme';
import {
  dateKey,
  formatShiftTime,
  getShiftForDate,
  shiftDurationMs,
} from '@/data/employee-roster';
import { currentEmployee } from '@/data/current-employee';
import { useShifts } from '@/data/shifts';

export default function JobDetailsScreen() {
  const { date } = useLocalSearchParams<{ date?: string }>();
  const shiftSource = { shifts: useShifts(), employeeId: currentEmployee?.id ?? null };
  const day = getShiftForDate(date ?? dateKey(new Date()), new Date(), shiftSource);
  const shift = day?.shift ?? null;
  // Task progress lives in memory and isn't sent anywhere yet.
  const [done, setDone] = useState<Set<number>>(new Set());

  // Shifts and tasks will come from the Owner's Roster once a database is connected.
  const tasks = shift?.tasks ?? [];

  function toggleTask(index: number) {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card style={styles.infoCard}>
        <Text style={styles.date}>
          {(day?.date ?? new Date()).toLocaleDateString([], {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </Text>
        <Text style={styles.role}>{shift?.role ?? 'No job assigned yet'}</Text>

        <View style={styles.detailRow}>
          <IconBadge name={Icons.clock} />
          <View>
            <Text style={styles.detailLabel}>Time</Text>
            <Text style={styles.detailValue}>
              {shift ? `${formatShiftTime(shift)} · ${shiftDurationMs(shift) / 3_600_000}h` : '—'}
            </Text>
          </View>
        </View>
        <View style={styles.detailRow}>
          <IconBadge name={Icons.location} />
          <View>
            <Text style={styles.detailLabel}>Location</Text>
            <Text style={styles.detailValue}>{shift?.location ?? '—'}</Text>
          </View>
        </View>
      </Card>

      <View style={styles.tasksHeader}>
        <Text style={employeeStyles.sectionLabel}>Tasks</Text>
        <Text style={styles.progress}>
          {done.size} of {tasks.length} done
        </Text>
      </View>

      <Card>
        {tasks.length === 0 && <Text style={styles.emptyTasks}>No tasks yet</Text>}
        {tasks.map((task, i) => {
          const isDone = done.has(i);
          return (
            <Pressable
              key={task}
              onPress={() => toggleTask(i)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isDone }}
              style={({ pressed }) => [
                styles.taskRow,
                i > 0 && styles.taskDivider,
                pressed && styles.pressed,
              ]}>
              <Icon
                name={isDone ? Icons.checked : Icons.unchecked}
                color={isDone ? C.success : C.textMuted}
                size={22}
              />
              <Text style={[styles.taskText, isDone && styles.taskTextDone]}>{task}</Text>
            </Pressable>
          );
        })}
      </Card>
    </ScrollView>
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
  emptyTasks: {
    color: C.textSecondary,
    fontSize: 15,
    textAlign: 'center',
    paddingVertical: Spacing.four,
  },
  infoCard: {
    padding: Spacing.three,
    gap: Spacing.three - 4,
  },
  date: {
    color: C.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  role: {
    color: C.text,
    fontSize: 24,
    fontWeight: '700',
    marginTop: -Spacing.two,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
  },
  detailLabel: {
    color: C.textSecondary,
    fontSize: 12,
  },
  detailValue: {
    color: C.text,
    fontSize: 15,
    fontWeight: '600',
  },
  tasksHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  progress: {
    color: C.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    paddingVertical: Spacing.three - 2,
    paddingHorizontal: Spacing.three,
  },
  taskDivider: {
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  pressed: {
    opacity: 0.6,
  },
  taskText: {
    flex: 1,
    color: C.text,
    fontSize: 15,
  },
  taskTextDone: {
    color: C.textMuted,
    textDecorationLine: 'line-through',
  },
});
