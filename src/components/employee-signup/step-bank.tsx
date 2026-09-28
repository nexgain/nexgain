import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { formatBsb, type EmployeeStepProps } from '@/components/employee-signup/types';
import { Button, Field, Icon, Input, SignupColors as C } from '@/components/signup/fields';

export function StepBank({ data, update, onNext, nextLabel }: EmployeeStepProps) {
  const [tried, setTried] = useState(false);
  const bsbDigits = data.bsb.replace(/\D/g, '');
  const errors = {
    accountName: !data.accountName.trim() && 'Enter the name on the account.',
    bsb: bsbDigits.length !== 6 && 'A BSB has 6 digits, e.g. 062-000.',
    accountNumber: (data.accountNumber.length < 5 || data.accountNumber.length > 10) && 'Enter a valid account number (5–10 digits).',
  };

  return (
    <>
      <Field label="Account name" error={tried && errors.accountName}>
        <Input
          value={data.accountName}
          onChangeText={(accountName) => update({ accountName })}
          placeholder="Name on the account"
          autoCapitalize="words"
          autoComplete="off"
          accessibilityLabel="Account name"
          icon={{ ios: 'person', android: 'person', web: 'person' }}
          hasError={tried && !!errors.accountName}
        />
      </Field>
      <Field label="BSB" error={tried && errors.bsb}>
        <Input
          value={data.bsb}
          onChangeText={(t) => update({ bsb: formatBsb(t) })}
          placeholder="000-000"
          keyboardType="number-pad"
          autoComplete="off"
          accessibilityLabel="BSB"
          icon={{ ios: 'building.columns', android: 'account_balance', web: 'account_balance' }}
          hasError={tried && !!errors.bsb}
        />
      </Field>
      <Field label="Account number" error={tried && errors.accountNumber}>
        <Input
          value={data.accountNumber}
          onChangeText={(t) => update({ accountNumber: t.replace(/\D/g, '').slice(0, 10) })}
          placeholder="12345678"
          keyboardType="number-pad"
          autoComplete="off"
          accessibilityLabel="Account number"
          icon={{ ios: 'number', android: 'tag', web: 'tag' }}
          hasError={tried && !!errors.accountNumber}
        />
      </Field>

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
          if (!Object.values(errors).some(Boolean)) onNext();
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
