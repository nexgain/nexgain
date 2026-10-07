import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/employee/ui';
import { EmployeeColors as C } from '@/constants/employee-theme';
import { Radius, Spacing } from '@/constants/theme';
import { useCurrentEmployee } from '@/data/current-employee';
import { formatShortDate } from '@/data/employee-roster';
import { formatAbnInput, formatBsb } from '@/components/employee-signup/types';
import { employeeFullName, isContractor, updateEmployee, updateMyBankDetails } from '@/data/employees';
import { fromDateKey } from '@/data/shifts';

// The employee's own profile. Phone and position can be updated here; the
// change shows everywhere (including for their owner) because there's only one profile.
export default function MyProfileScreen() {
  const me = useCurrentEmployee();
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState<string | null>(null);
  const [position, setPosition] = useState<string | null>(null);
  const [abn, setAbn] = useState<string | null>(null);
  const [gst, setGst] = useState<boolean | null>(null);
  const [bank, setBank] = useState({ accountName: '', bsb: '', accountNumber: '' });
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');

  if (!me) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <Text style={styles.muted}>Log in to see your profile.</Text>
      </View>
    );
  }

  const contractor = isContractor(me);
  const phoneValue = phone ?? me.phone;
  const positionValue = position ?? me.role;
  const abnValue = abn ?? formatAbnInput(me.abn);
  const gstValue = gst ?? me.gstRegistered;
  const bankChanged = !!(bank.accountName.trim() || bank.bsb.trim() || bank.accountNumber.trim());
  const changed =
    phoneValue.trim() !== me.phone ||
    positionValue.trim() !== me.role ||
    (contractor && (abnValue.replace(/\D/g, '') !== me.abn || gstValue !== me.gstRegistered || bankChanged));
  const phoneError = phoneValue.replace(/\D/g, '').length < 8 ? 'Enter a valid phone number.' : null;
  const positionError = positionValue.trim() ? null : 'Enter your position.';
  // Contractors: ABN shown on invoices, and the bank account invoices are paid into.
  const abnError = contractor && abnValue.replace(/\D/g, '').length !== 11 ? 'Enter your 11-digit ABN.' : null;
  const bankError =
    contractor && bankChanged
      ? !bank.accountName.trim()
        ? 'Enter the account name.'
        : bank.bsb.replace(/\D/g, '').length !== 6
          ? 'Enter a 6-digit BSB.'
          : bank.accountNumber.replace(/\D/g, '').length < 5
            ? 'Enter your account number.'
            : null
      : null;
  const invalid = !!(phoneError || positionError || abnError || bankError);

  async function save() {
    if (!me || invalid) return;
    setStatus('saving');
    let ok = await updateEmployee(me.id, {
      phone: phoneValue.trim(),
      role: positionValue.trim(),
      ...(contractor ? { abn: abnValue.replace(/\D/g, ''), gstRegistered: gstValue } : {}),
    });
    if (ok && contractor && bankChanged) ok = await updateMyBankDetails(me.id, bank);
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

        {contractor && (
          <>
            <Text style={styles.sectionTitle}>Invoicing details</Text>
            <Card style={styles.form}>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>ABN</Text>
                <TextInput
                  value={abnValue}
                  onChangeText={(t) => setAbn(formatAbnInput(t))}
                  keyboardType="number-pad"
                  placeholder="12 345 678 901"
                  placeholderTextColor={C.textMuted}
                  accessibilityLabel="ABN"
                  style={[styles.input, abnError && styles.inputError]}
                />
                {abnError ? <Text style={styles.error}>{abnError}</Text> : null}
              </View>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Registered for GST?</Text>
                <View style={styles.choiceRow}>
                  {([true, false] as const).map((v) => (
                    <Pressable
                      key={String(v)}
                      onPress={() => setGst(v)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: gstValue === v }}
                      accessibilityLabel={`Registered for GST: ${v ? 'Yes' : 'No'}`}
                      style={[styles.choice, gstValue === v && styles.choiceSelected]}>
                      <Text style={[styles.choiceText, gstValue === v && styles.choiceTextSelected]}>{v ? 'Yes' : 'No'}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Bank account for payments</Text>
                <Text style={styles.hint}>
                  {me.bankAccount ? `Account ending ${me.bankAccount.accountNumber} is saved.` : 'No bank account saved yet.'} Fill in
                  all three below only if you want to change it.
                </Text>
                <TextInput
                  value={bank.accountName}
                  onChangeText={(accountName) => setBank((b) => ({ ...b, accountName }))}
                  placeholder="Account name"
                  placeholderTextColor={C.textMuted}
                  accessibilityLabel="Account name"
                  style={styles.input}
                />
                <TextInput
                  value={bank.bsb}
                  onChangeText={(bsb) => setBank((b) => ({ ...b, bsb: formatBsb(bsb) }))}
                  placeholder="BSB (e.g. 062-000)"
                  keyboardType="number-pad"
                  placeholderTextColor={C.textMuted}
                  accessibilityLabel="BSB"
                  style={styles.input}
                />
                <TextInput
                  value={bank.accountNumber}
                  onChangeText={(accountNumber) => setBank((b) => ({ ...b, accountNumber: accountNumber.replace(/\D/g, '') }))}
                  placeholder="Account number"
                  keyboardType="number-pad"
                  placeholderTextColor={C.textMuted}
                  accessibilityLabel="Account number"
                  style={styles.input}
                />
                {bankError ? <Text style={styles.error}>{bankError}</Text> : null}
              </View>
            </Card>
          </>
        )}
        {status === 'error' && (
          <Text style={styles.error}>Couldn&apos;t save your changes. Check your internet connection and try again.</Text>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.three }]}>
        <Pressable
          onPress={save}
          disabled={!changed || invalid || status === 'saving'}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.saveButton,
            (!changed || invalid || status === 'saving') && styles.saveDisabled,
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
  hint: {
    color: C.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  choiceRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  choice: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.three - 4,
    borderRadius: Radius.medium - 2,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.card,
  },
  choiceSelected: {
    borderColor: C.primary,
    backgroundColor: C.primarySoft,
  },
  choiceText: {
    color: C.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  choiceTextSelected: {
    color: C.primary,
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
