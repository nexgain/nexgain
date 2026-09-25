import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { fakeEmployee } from '@/data/fake-employee';

type Session = {
  start: Date;
  end: Date | null;
};

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(':');
}

function formatClockTime(date: Date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function HomeScreen() {
  const now = useNow();
  // Sessions only live in memory for now; they reset when the app restarts.
  const [sessions, setSessions] = useState<Session[]>([]);

  const isClockedIn = sessions.at(-1)?.end === null;
  const workedMs = sessions.reduce(
    (total, s) => total + ((s.end ?? now).getTime() - s.start.getTime()),
    0,
  );

  function toggleClock() {
    const time = new Date();
    if (isClockedIn) {
      setSessions((prev) => prev.map((s, i) => (i === prev.length - 1 ? { ...s, end: time } : s)));
    } else {
      setSessions((prev) => [...prev, { start: time, end: null }]);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View>
          <Text style={styles.greeting}>Hi, {fakeEmployee.firstName}</Text>
          <Text style={styles.date}>
            {now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}
          </Text>
        </View>

        <View style={styles.clockCard}>
          <Text style={styles.time}>
            {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </Text>
          <View style={[styles.statusPill, isClockedIn && styles.statusPillActive]}>
            <View style={[styles.statusDot, isClockedIn && styles.statusDotActive]} />
            <Text style={styles.statusText}>
              {isClockedIn ? `Clocked in at ${fakeEmployee.site}` : 'Not clocked in'}
            </Text>
          </View>
        </View>

        <Pressable
          onPress={toggleClock}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.clockButton,
            isClockedIn ? styles.clockOutButton : styles.clockInButton,
            pressed && styles.pressed,
          ]}>
          <Text style={styles.clockButtonText}>{isClockedIn ? 'Clock Out' : 'Clock In'}</Text>
        </Pressable>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Time worked today</Text>
          <Text style={styles.worked}>{formatDuration(workedMs)}</Text>
        </View>

        {sessions.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Today&apos;s activity</Text>
            {sessions.map((s, i) => (
              <View key={i} style={styles.sessionRow}>
                <Text style={styles.sessionText}>
                  {formatClockTime(s.start)} – {s.end ? formatClockTime(s.end) : 'now'}
                </Text>
                <Text style={styles.sessionDuration}>
                  {formatDuration((s.end ?? now).getTime() - s.start.getTime())}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.four,
  },
  greeting: {
    color: Colors.text,
    fontSize: 32,
    fontWeight: '700',
  },
  date: {
    color: Colors.textSecondary,
    fontSize: 16,
    marginTop: Spacing.one,
  },
  clockCard: {
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.four,
    backgroundColor: Colors.surface,
    borderRadius: Radius.large,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  time: {
    color: Colors.text,
    fontSize: 48,
    fontWeight: '300',
    fontVariant: ['tabular-nums'],
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one + 2,
    paddingHorizontal: Spacing.three,
    borderRadius: 999,
    backgroundColor: Colors.surfaceRaised,
  },
  statusPillActive: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.textSecondary,
  },
  statusDotActive: {
    backgroundColor: Colors.success,
  },
  statusText: {
    color: Colors.text,
    fontSize: 14,
  },
  clockButton: {
    alignSelf: 'center',
    width: 200,
    height: 200,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 6,
  },
  clockInButton: {
    backgroundColor: Colors.success,
    borderColor: 'rgba(34, 197, 94, 0.35)',
  },
  clockOutButton: {
    backgroundColor: Colors.danger,
    borderColor: 'rgba(239, 68, 68, 0.35)',
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  clockButtonText: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '700',
  },
  card: {
    padding: Spacing.four,
    gap: Spacing.two,
    backgroundColor: Colors.surface,
    borderRadius: Radius.large,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardLabel: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  worked: {
    color: Colors.text,
    fontSize: 40,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  sessionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.one,
  },
  sessionText: {
    color: Colors.text,
    fontSize: 16,
  },
  sessionDuration: {
    color: Colors.textSecondary,
    fontSize: 16,
    fontVariant: ['tabular-nums'],
  },
});
