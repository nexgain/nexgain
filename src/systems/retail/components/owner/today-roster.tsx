// Dashboard (NexGain Retail): who's rostered on today, when, and at which
// store (when the shop has more than one). Replaces System 1's "Upcoming"
// jobs and quotes, which retail shops don't have.
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, EmptyState, OwnerIcons } from '@/systems/retail/components/owner/ui';
import { Colors as C, Spacing } from '@/constants/theme';
import { format12h } from '@/data/employee-roster';
import { employeeFullName, useEmployees } from '@/data/employees';
import { sortShifts, toDateKey, useShifts } from '@/data/shifts';
import { hasManyStores, useStores } from '@/systems/retail/data/retail';

export function TodayRoster() {
  const today = toDateKey(new Date());
  const shifts = sortShifts(useShifts().filter((s) => s.date === today));
  const employees = useEmployees();
  const manyStores = hasManyStores(useStores());
  const nameOf = (id: string) => {
    const e = employees.find((x) => x.id === id);
    return e ? employeeFullName(e) : 'Former employee';
  };
  const rows = shifts.flatMap((s) => s.employeeIds.map((id) => ({ key: `${s.id}-${id}`, shift: s, name: nameOf(id) })));

  return (
    <Card
      title={`Rostered On Today (${rows.length})`}
      icon={OwnerIcons.calendar}
      right={
        <Pressable onPress={() => router.navigate('/retail/roster')} accessibilityRole="link" hitSlop={8}>
          <Text style={styles.link}>Roster</Text>
        </Pressable>
      }>
      {rows.length === 0 ? (
        <EmptyState icon={OwnerIcons.calendar} message="Nobody is rostered on today. Open the Roster to add shifts." />
      ) : (
        rows.slice(0, 8).map((r, i) => (
          <View key={r.key} style={[styles.row, i > 0 && styles.divider]}>
            <Text style={styles.time}>
              {format12h(r.shift.start)} – {format12h(r.shift.end)}
            </Text>
            <View style={styles.flex}>
              <Text style={styles.name} numberOfLines={1}>
                {r.name}
              </Text>
              {(manyStores && r.shift.location) || r.shift.notes ? (
                <Text style={styles.muted} numberOfLines={1}>
                  {[manyStores ? r.shift.location : '', r.shift.notes].filter(Boolean).join(' · ')}
                </Text>
              ) : null}
            </View>
          </View>
        ))
      )}
      {rows.length > 8 && <Text style={styles.muted}>And {rows.length - 8} more.</Text>}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three - 4, paddingVertical: Spacing.two },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  time: { color: C.text, fontSize: 13, fontWeight: '700', width: 132, fontVariant: ['tabular-nums'] },
  name: { color: C.text, fontSize: 15, fontWeight: '600' },
  muted: { color: C.textSecondary, fontSize: 13 },
  link: { color: C.accent, fontSize: 14, fontWeight: '600' },
});
