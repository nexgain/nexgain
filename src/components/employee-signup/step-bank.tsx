import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SelectField } from '@/components/employee/form-fields';
import { signupBankForm, type EmployeeSignupData, type EmployeeStepProps } from '@/components/employee-signup/types';
import { Button, Field, Icon, Input, SignupColors as C, type IconName } from '@/components/signup/fields';
import { bankFieldsFor, needsAccountType, validateBankForm, type BankTextField } from '@/lib/payment-files/bank-details';
import { bankFieldSetFor } from '@/lib/payment-files/countries';

/** Where each bank box is kept in the sign-up data. */
const DATA_KEY: Record<BankTextField, 'accountName' | 'bsb' | 'accountNumber' | 'iban' | 'bic'> = {
  accountName: 'accountName',
  branchCode: 'bsb',
  accountNumber: 'accountNumber',
  iban: 'iban',
  bic: 'bic',
};

const ICONS: Record<BankTextField, IconName> = {
  accountName: { ios: 'person', android: 'person', web: 'person' },
  branchCode: { ios: 'building.columns', android: 'account_balance', web: 'account_balance' },
  accountNumber: { ios: 'number', android: 'tag', web: 'tag' },
  iban: { ios: 'number', android: 'tag', web: 'tag' },
  bic: { ios: 'building.columns', android: 'account_balance', web: 'account_balance' },
};

const ACCOUNT_TYPES = ['Checking', 'Savings'] as const;

// The bank boxes match the business's country (BSB in Australia, routing
// number in the US, sort code in the UK, IBAN in the eurozone).
export function StepBank({ data, update, onNext, nextLabel }: EmployeeStepProps) {
  const [tried, setTried] = useState(false);
  const set = bankFieldSetFor(data.business?.country);
  const errors = validateBankForm(set, signupBankForm(data));

  return (
    <>
      {bankFieldsFor(set).map((f) => {
        const key = DATA_KEY[f.key];
        return (
          <Field key={f.key} label={f.label} hint={f.key === 'accountName' ? undefined : f.hint} error={tried && errors[f.key]}>
            <Input
              value={data[key]}
              onChangeText={(t) => update({ [key]: f.format ? f.format(t) : t } as Partial<EmployeeSignupData>)}
              placeholder={f.placeholder}
              keyboardType={f.numeric ? 'number-pad' : 'default'}
              autoCapitalize={f.key === 'accountName' ? 'words' : 'characters'}
              autoComplete="off"
              accessibilityLabel={f.label}
              icon={ICONS[f.key]}
              hasError={tried && !!errors[f.key]}
            />
          </Field>
        );
      })}

      {needsAccountType(set) && (
        <Field label="Account type" error={tried && errors.accountType}>
          <SelectField
            title="Account type"
            value={data.accountType === 'checking' ? 'Checking' : data.accountType === 'savings' ? 'Savings' : null}
            options={ACCOUNT_TYPES}
            placeholder="Checking or savings"
            onChange={(v) => update({ accountType: v === 'Savings' ? 'savings' : 'checking' })}
            hasError={tried && !!errors.accountType}
          />
        </Field>
      )}

      <View style={styles.secure}>
        <Icon name={{ ios: 'lock.fill', android: 'lock', web: 'lock' }} color={C.done} size={16} />
        <Text style={styles.secureText}>
          Your bank details are encrypted and stored securely. They are only used for payroll payments.
        </Text>
      </View>

      <Button
        label={nextLabel}
        arrow
        onPress={() => {
          setTried(true);
          if (Object.keys(errors).length === 0) onNext();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  secure: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#F0FDF4',
  },
  secureText: {
    flex: 1,
    color: C.text,
    fontSize: 14,
    lineHeight: 20,
  },
});
