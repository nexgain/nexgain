// Shift details (NexGain Retail staff): one day's shift at the shop: the time,
// which store (when there's more than one) and the owner's notes. Shops have
// no jobs, tasks or job reports.
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card, employeeStyles, Icon, IconBadge, Icons } from '@/systems/retail/components/employee/ui';
import { EmployeeColors as C } from '@/constants/employee-theme';
import { Spacing } from '@/constants/theme';
import { dateKey, formatShiftTime, getShiftForDate, shiftDurationMs } from '@/data/employee-roster';
import { useCurrentEmployee } from '@/data/current-employee';
import { useShifts } from '@/data/shifts';
import { useDesktopPageStyle } from '@/hooks/use-desktop';

const BARCODE = { ios: 'barcode.viewfinder', android: 'qr_code_scanner', web: 'qr_code_scanner' } as const;

export default function ShiftDetailsScreen() {
  const desktopPage = useDesktopPageStyle('form');
  const me = useCurrentEmployee();
  const { date } = useLocalSearchParams<{ date?: string }>();
  const shifts = useShifts();
  const shiftDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : dateKey(new Date());
  const day = getShiftForDate(shiftDate, new Date(), { shifts, employeeId: me?.id ?? null });
  const shift = day?.shift ?? null;
  const mine = shifts.filter((s) => s.date === shiftDate && me && s.employeeIds.includes(me.id));
  const notes = mine.map((s) => s.notes.trim()).filter(Boolean).join('\n');
  const store = mine.map((s) => s.location).find(Boolean) ?? '';

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, desktopPage]}>
      <Card style={styles.card}>
        <Text style={styles.date}>{(day?.date ?? new Date()).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
        <Text style={styles.title}>{shift ? 'Rostered on' : 'Not rostered on'}</Text>
        <View style={styles.row}>
          <IconBadge name={Icons.clock} />
          <View>
            <Text style={styles.label}>Time</Text>
            <Text style={styles.value}>{shift ? `${formatShiftTime(shift)} · ${shiftDurationMs(shift) / 3_600_000}h` : '—'}</Text>
          </View>
        </View>
        {store ? (
          <View style={styles.row}>
            <IconBadge name={Icons.location} />
            <View>
              <Text style={styles.label}>Store</Text>
              <Text style={styles.value}>{store}</Text>
            </View>
          </View>
        ) : null}
      </Card>

      {notes ? (
        <>
          <Text style={[employeeStyles.sectionLabel, styles.gap]}>Notes from your manager</Text>
          <Card style={styles.card}>
            <Text style={styles.notes}>{notes}</Text>
          </Card>
        </>
      ) : null}

      <Pressable onPress={() => router.navigate('/retail/scanner' as Href)} accessibilityRole="button" style={({ pressed }) => [styles.scanner, pressed && styles.pressed]}>
        <Icon name={BARCODE} color={C.primary} size={20} />
        <Text style={styles.scannerText}>Open the Scanner</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background },
  content: { padding: Spacing.four - 4, gap: Spacing.three },
  card: { padding: Spacing.three, gap: Spacing.three - 4 },
  date: { color: C.textSecondary, fontSize: 14, fontWeight: '600' },
  title: { color: C.text, fontSize: 24, fontWeight: '700', marginTop: -Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three - 4 },
  label: { color: C.textSecondary, fontSize: 12 },
  value: { color: C.text, fontSize: 15, fontWeight: '600' },
  gap: { marginTop: Spacing.two },
  notes: { color: C.text, fontSize: 15, lineHeight: 22 },
  scanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two, minHeight: 50, borderRadius: 14, backgroundColor: C.primarySoft },
  scannerText: { color: C.primary, fontSize: 16, fontWeight: '700' },
  pressed: { opacity: 0.7 },
});
