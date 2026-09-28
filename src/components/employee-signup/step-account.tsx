import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { EmployeeStepProps } from '@/components/employee-signup/types';
import { Button, Field, Input, SignupColors as C } from '@/components/signup/fields';
import { isValidEmail, PASSWORD_RULES, PasswordChecklist } from '@/components/signup/step-account';

export function StepAccount({ data, update, onNext, nextLabel }: EmployeeStepProps) {
  const [tried, setTried] = useState(false);
  const errors = {
    fullName: !data.fullName.trim() && 'Enter your full name.',
    email: !isValidEmail(data.email) && 'Enter a valid email address, like you@email.com.',
    password: !PASSWORD_RULES.every((r) => r.test(data.password)) && 'Your password needs to meet all the requirements below.',
  };

  return (
    <>
      <Field label="Full name" error={tried && errors.fullName}>
        <Input
          value={data.fullName}
          onChangeText={(fullName) => update({ fullName })}
          placeholder="e.g. Alex Smith"
          autoCapitalize="words"
          textContentType="name"
          autoComplete="name"
          accessibilityLabel="Full name"
          icon={{ ios: 'person', android: 'person', web: 'person' }}
          hasError={tried && !!errors.fullName}
        />
      </Field>
      <Field label="Email address" error={tried && errors.email}>
        <Input
          value={data.email}
          onChangeText={(email) => update({ email })}
          placeholder="you@email.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="emailAddress"
          autoComplete="email"
          accessibilityLabel="Email address"
          icon={{ ios: 'envelope', android: 'mail', web: 'mail' }}
          hasError={tried && !!errors.email}
        />
      </Field>
      <Field label="Create a password" error={tried && errors.password}>
        <Input
          value={data.password}
          onChangeText={(password) => update({ password })}
          placeholder="Create a password"
          password
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
          autoComplete="new-password"
          accessibilityLabel="Password"
          icon={{ ios: 'lock', android: 'lock', web: 'lock' }}
          hasError={tried && !!errors.password}
        />
        <PasswordChecklist password={data.password} />
      </Field>

      <Button
        label={nextLabel}
        arrow
        onPress={() => {
          setTried(true);
          if (!Object.values(errors).some(Boolean)) onNext();
        }}
      />

      <View style={styles.signIn}>
        <Text style={styles.muted}>Already have an account? </Text>
        <Pressable onPress={() => router.replace('/employee-login')} accessibilityRole="link" hitSlop={8}>
          <Text style={styles.link}>Sign in</Text>
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  signIn: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  muted: {
    color: C.textSecondary,
    fontSize: 14,
  },
  link: {
    color: C.primary,
    fontSize: 14,
    fontWeight: '700',
  },
});
