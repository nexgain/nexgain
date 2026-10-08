import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/employee/ui';
import { EmployeeColors as C } from '@/constants/employee-theme';
import { Radius, Spacing } from '@/constants/theme';
import { useBusiness } from '@/data/business';
import { useCurrentEmployee } from '@/data/current-employee';
import { formatShortDate } from '@/data/employee-roster';
import { formatAbnInput } from '@/components/employee-signup/types';
import { employeeFullName, isContractor, updateEmployee, updateMyBankDetails } from '@/data/employees';
import { fromDateKey } from '@/data/shifts';
import {
  bankFieldsFor,
  EMPTY_BANK_FORM,
  needsAccountType,
  validateBankForm,
  type BankForm,
} from '@/lib/payment-files/bank-details';
import { bankFieldSetFor } from '@/lib/payment-files/countries';

// The employee's own profile. Phone and position can be updated here; the
// change shows everywhere (including for their owner) because there's only one profile.
export default function MyProfileScreen() {
  const me = useCurrentEmployee();
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState<string | null>(null);
  const [position, setPosition] = useState<string | null>(null);
  const [abn, setAbn] = useState<string | null>(null);
  const [gst, setGst] = useState<boolean | null>(null);
  const [bank, setBank] = useState<BankForm>(EMPTY_BANK_FORM);
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  // Bank boxes match the business's country (BSB, routing number, sort code or IBAN).
  const bankSet = bankFieldSetFor(useBusiness()?.country);

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
  const bankChanged = !!(bank.accountName.trim() || bank.branchCode.trim() || bank.accountNumber.trim() || bank.iban.trim());
  const changed =
    phoneValue.trim() !== me.phone ||
    positionValue.trim() !== me.role ||
    bankChanged ||
    (contractor && (abnValue.replace(/\D/g, '') !== me.abn || gstValue !== me.gstRegistered));
  const phoneError = phoneValue.replace(/\D/g, '').length < 8 ? 'Enter a valid phone number.' : null;
  const positionError = positionValue.trim() ? null : 'Enter your position.';
  // Contractors: ABN shown on invoices.
  const abnError = contractor && abnValue.replace(/\D/g, '').length !== 11 ? 'Enter your 11-digit ABN.' : null;
  const bankError = bankChanged ? (Object.values(validateBankForm(bankSet, bank))[0] ?? null) : null;
  const invalid = !!(phoneError || positionError || abnError || bankError);

  async function save() {
    if (!me || invalid) return;
    setStatus('saving');
    let ok = await updateEmployee(me.id, {
      phone: phoneValue.trim(),
      role: positionValue.trim(),
      ...(contractor ? { abn: abnValue.replace(/\D/g, ''), gstRegistered: gstValue } : {}),
    });
    if (ok && bankChanged) ok = await updateMyBankDetails(me.id, bankSet, bank);
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

  // Saved details in another country's format (e.g. the business changed country) need entering again.
  const savedForOtherCountry = !!me.bankAccount && (me.bankCountry ?? 'AU') !== bankSet;
  const bankFields = (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{contractor ? 'Bank account for payments' : 'Bank account for your pay'}</Text>
      <Text style={styles.hint}>
        {savedForOtherCountry
          ? 'Your saved bank details are in a different format. Please enter them again below.'
          : me.bankAccount
            ? `Account ending ${me.bankAccount.accountNumber} is saved.`
            : 'No bank account saved yet.'}{' '}
        Fill in the boxes below only if you want to change it.
      </Text>
      {bankFieldsFor(bankSet).map((f) => (
        <TextInput
          key={f.key}
          value={bank[f.key]}
          onChangeText={(t) => setBank((b) => ({ ...b, [f.key]: f.format ? f.format(t) : t }))}
          placeholder={`${f.label} (e.g. ${f.placeholder})`}
          keyboardType={f.numeric ? 'number-pad' : 'default'}
          autoCapitalize={f.key === 'accountName' ? 'words' : 'characters'}
          placeholderTextColor={C.textMuted}
          accessibilityLabel={f.label}
          style={styles.input}
        />
      ))}
      {needsAccountType(bankSet) && (
        <View style={styles.choiceRow}>
          {(['checking', 'savings'] as const).map((v) => (
            <Pressable
              key={v}
              onPress={() => setBank((b) => ({ ...b, accountType: v }))}
              accessibilityRole="radio"
              accessibilityState={{ selected: bank.accountType === v }}
              accessibilityLabel={`Account type: ${v}`}
              style={[styles.choice, bank.accountType === v && styles.choiceSelected]}>
              <Text style={[styles.choiceText, bank.accountType === v && styles.choiceTextSelected]}>
                {v === 'checking' ? 'Checking' : 'Savings'}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      {bankError ? <Text style={styles.error}>{bankError}</Text> : null}
    </View>
  );

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

        {contractor ? (
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
              {bankFields}
            </Card>
          </>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Bank details</Text>
            <Card style={styles.form}>{bankFields}</Card>
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
