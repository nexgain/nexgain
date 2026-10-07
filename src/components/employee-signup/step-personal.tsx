import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { suggestRoles } from '@/components/employee-signup/roles';
import { EMPLOYMENT_TYPES, formatAbnInput, type EmployeeStepProps } from '@/components/employee-signup/types';
import { useNativePicker } from '@/components/pickers/use-native-picker';
import { Button, Field, Icon, Input, SignupColors as C } from '@/components/signup/fields';
import { formatShortDate } from '@/data/employee-roster';

const PICKER_THEME = {
  sheet: '#FFFFFF',
  border: C.border,
  text: C.text,
  muted: C.textSecondary,
  accent: C.primary,
  dark: false,
};

export function StepPersonal({ data, update, onNext, nextLabel }: EmployeeStepProps) {
  const [tried, setTried] = useState(false);
  const roles = suggestRoles(data.business?.industry ?? null, data.business?.industryCategory ?? null);
  const today = new Date();
  const dobPicker = useNativePicker({
    mode: 'date',
    value: data.dateOfBirth ?? new Date(today.getFullYear() - 25, 0, 1),
    onChange: (dateOfBirth) => update({ dateOfBirth }),
    title: 'Date of birth',
    theme: PICKER_THEME,
    maximumDate: today,
  });

  const phoneDigits = data.phone.replace(/\D/g, '');
  const contractor = data.employmentType === 'Contractor';
  const errors = {
    fullName: !data.fullName.trim() && 'Enter your full name.',
    phone: phoneDigits.length < 8 && 'Enter a valid phone number.',
    dateOfBirth: !data.dateOfBirth && 'Choose your date of birth.',
    position: !data.position.trim() && 'Choose or type your position.',
    employmentType: !data.employmentType && 'Choose your employment type.',
    // Only asked of contractors.
    abn: contractor && data.abn.replace(/\D/g, '').length !== 11 && 'Enter your 11-digit ABN.',
    gstRegistered: contractor && data.gstRegistered === null && 'Tell us if you’re registered for GST.',
  };

  return (
    <>
      <Field label="Full name" error={tried && errors.fullName}>
        <Input
          value={data.fullName}
          onChangeText={(fullName) => update({ fullName })}
          autoCapitalize="words"
          accessibilityLabel="Full name"
          icon={{ ios: 'person', android: 'person', web: 'person' }}
          hasError={tried && !!errors.fullName}
        />
      </Field>
      <Field label="Phone number" error={tried && errors.phone}>
        <Input
          value={data.phone}
          onChangeText={(phone) => update({ phone: phone.replace(/[^\d+ ]/g, '') })}
          placeholder="04xx xxx xxx"
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          accessibilityLabel="Phone number"
          icon={{ ios: 'phone', android: 'call', web: 'call' }}
          hasError={tried && !!errors.phone}
        />
      </Field>
      <Field label="Date of birth" error={tried && errors.dateOfBirth}>
        <Pressable
          onPress={dobPicker.open}
          accessibilityRole="button"
          accessibilityLabel="Date of birth"
          style={[styles.dateBox, tried && !!errors.dateOfBirth && styles.dateBoxError]}>
          <Icon name={{ ios: 'calendar', android: 'calendar_month', web: 'calendar_month' }} color={C.muted} size={16} />
          <Text style={[styles.dateText, !data.dateOfBirth && styles.placeholder]}>
            {data.dateOfBirth ? formatShortDate(data.dateOfBirth) : 'Select your date of birth'}
          </Text>
        </Pressable>
        {dobPicker.element}
      </Field>
      <Field label="Address" optional>
        <Input
          value={data.address}
          onChangeText={(address) => update({ address })}
          placeholder="Street, suburb, state, postcode"
          textContentType="fullStreetAddress"
          accessibilityLabel="Address"
          icon={{ ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' }}
        />
      </Field>

      <Field label="Position / Role" error={tried && errors.position} hint={`Suggested for ${data.business?.name ?? 'your business'}`}>
        <View style={styles.chips}>
          {roles.map((role) => {
            const selected = data.position.trim().toLowerCase() === role.toLowerCase();
            return (
              <Pressable
                key={role}
                onPress={() => update({ position: role })}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={[styles.chip, selected && styles.chipSelected]}>
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{role}</Text>
              </Pressable>
            );
          })}
        </View>
        <Input
          value={data.position}
          onChangeText={(position) => update({ position })}
          placeholder="Or type your own"
          autoCapitalize="words"
          accessibilityLabel="Position"
          hasError={tried && !!errors.position}
        />
      </Field>

      <Field label="Employment type" error={tried && errors.employmentType}>
        <View style={styles.types} accessibilityRole="radiogroup">
          {EMPLOYMENT_TYPES.map((type) => {
            const selected = data.employmentType === type;
            return (
              <Pressable
                key={type}
                onPress={() => update({ employmentType: type })}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={[styles.type, selected && styles.typeSelected]}>
                <Text style={[styles.typeText, selected && styles.typeTextSelected]}>{type}</Text>
              </Pressable>
            );
          })}
        </View>
      </Field>

      {contractor && (
        <>
          <Field label="ABN" error={tried && errors.abn} hint="Your Australian Business Number, shown on your invoices.">
            <Input
              value={data.abn}
              onChangeText={(abn) => update({ abn: formatAbnInput(abn) })}
              placeholder="12 345 678 901"
              keyboardType="number-pad"
              accessibilityLabel="ABN"
              icon={{ ios: 'number', android: 'tag', web: 'tag' }}
              hasError={tried && !!errors.abn}
            />
          </Field>
          <Field label="Registered for GST?" error={tried && errors.gstRegistered} hint="If yes, 10% GST is added to your invoices.">
            <View style={styles.types} accessibilityRole="radiogroup">
              {([true, false] as const).map((value) => {
                const selected = data.gstRegistered === value;
                return (
                  <Pressable
                    key={String(value)}
                    onPress={() => update({ gstRegistered: value })}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`Registered for GST: ${value ? 'Yes' : 'No'}`}
                    style={[styles.type, selected && styles.typeSelected]}>
                    <Text style={[styles.typeText, selected && styles.typeTextSelected]}>{value ? 'Yes' : 'No'}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Field>
        </>
      )}

      <Button
        label={nextLabel}
        arrow
        onPress={() => {
          setTried(true);
          if (!Object.values(errors).some(Boolean)) onNext();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  dateBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 50,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.field,
  },
  dateBoxError: {
    borderColor: C.danger,
  },
  dateText: {
    color: C.text,
    fontSize: 16,
  },
  placeholder: {
    color: C.muted,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: '#FFFFFF',
  },
  chipSelected: {
    borderColor: C.primary,
    backgroundColor: C.primarySoft,
  },
  chipText: {
    color: C.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: C.primary,
  },
  types: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  type: {
    flexGrow: 1,
    flexBasis: '45%',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.field,
  },
  typeSelected: {
    borderColor: C.primary,
    backgroundColor: C.primarySoft,
  },
  typeText: {
    color: C.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  typeTextSelected: {
    color: C.primary,
  },
});
