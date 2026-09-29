import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/employee/ui';
import { EmployeeColors as C } from '@/constants/employee-theme';
import { Radius, Spacing } from '@/constants/theme';
import { useCurrentEmployee } from '@/data/current-employee';
import { formatShortDate } from '@/data/employee-roster';
import { employeeFullName, updateEmployee } from '@/data/employees';
import { fromDateKey } from '@/data/shifts';

// The employee's own profile. Phone and position can be updated here; the
// change shows everywhere (including for their owner) because there's only one profile.
export default function MyProfileScreen() {
  const me = useCurrentEmployee();
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState<string | null>(null);
  const [position, setPosition] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');

  if (!me) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <Text style={styles.muted}>Log in to see your profile.</Text>
      </View>
    );
  }

  const phoneValue = phone ?? me.phone;
  const positionValue = position ?? me.role;
  const changed = phoneValue.trim() !== me.phone || positionValue.trim() !== me.role;
  const phoneError = phoneValue.replace(/\D/g, '').length < 8 ? 'Enter a valid phone number.' : null;
  const positionError = positionValue.trim() ? null : 'Enter your position.';

  async function save() {
    if (!me || phoneError || positionError) return;
    setStatus('saving');
    const ok = await updateEmployee(me.id, { phone: phoneValue.trim(), role: positionValue.trim() });
    if (!ok) {
      setStatus('error');
      return;
    }
    router.back();
  }

  const details: [string, string][] = [
    ['Name', employeeFullName(me)],
    ['Email', me.email],
    ['Date of birth', me.dateOfBirth ? formatShortDate(fromDateKey(me.dateOfBirth)) : '—'],
    ['Address', me.address || '—'],
    ['Employment type', me.employmentType || '—'],
    ['Workplace', me.site || '—'],
    ['Emergency contact', [me.emergencyContactName, me.emergencyContactPhone].filter(Boolean).join(' · ') || '—'],
  ];

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card>
          {details.map(([label, value], i) => (
            <View key={label} style={[styles.row, i > 0 && styles.divider]}>
              <Text style={styles.label}>{label}</Text>
              <Text style={styles.value}>{value}</Text>
            </View>
          ))}
        </Card>

        <Text style={styles.sectionTitle}>Update your details</Text>
        <Card style={styles.form}>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Phone number</Text>
            <TextInput
              value={phoneValue}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder="e.g. 0412 345 678"
              placeholderTextColor={C.textMuted}
              accessibilityLabel="Phone number"
              style={[styles.input, phoneError && styles.inputError]}
            />
            {phoneError ? <Text style={styles.error}>{phoneError}</Text> : null}
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Position / Role</Text>
            <TextInput
              value={positionValue}
              onChangeText={setPosition}
              placeholder="e.g. Cleaner"
              placeholderTextColor={C.textMuted}
              accessibilityLabel="Position"
              style={[styles.input, positionError && styles.inputError]}
            />
            {positionError ? <Text style={styles.error}>{positionError}</Text> : null}
          </View>
        </Card>
        {status === 'error' && (
          <Text style={styles.error}>Couldn&apos;t save your changes. Check your internet connection and try again.</Text>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.three }]}>
        <Pressable
          onPress={save}
          disabled={!changed || !!phoneError || !!positionError || status === 'saving'}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.saveButton,
            (!changed || phoneError || positionError || status === 'saving') && styles.saveDisabled,
            pressed && styles.pressed,
          ]}>
          <Text style={styles.saveText}>{status === 'saving' ? 'Saving…' : 'Save Changes'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.background,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: Spacing.four - 4,
    gap: Spacing.three,
  },
  muted: {
    color: C.textSecondary,
    fontSize: 15,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.three,
    paddingVertical: Spacing.three - 4,
    paddingHorizontal: Spacing.three,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  label: {
    flex: 1,
    color: C.textSecondary,
    fontSize: 15,
  },
  value: {
    flexShrink: 1,
    color: C.text,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'right',
  },
  sectionTitle: {
    color: C.text,
    fontSize: 17,
    fontWeight: '700',
    marginTop: Spacing.two,
  },
  form: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    color: C.text,
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    paddingVertical: Spacing.three - 4,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.medium - 2,
    borderWidth: 1,
    borderColor: C.border,
    color: C.text,
    fontSize: 16,
    backgroundColor: C.card,
  },
  inputError: {
    borderColor: C.danger,
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
