import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Field, Icon, Input, SignupColors as C } from '@/components/signup/fields';
import type { StepProps } from '@/components/signup/types';

export const PASSWORD_RULES = [
  { label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { label: '1 uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { label: '1 lowercase letter', test: (p: string) => /[a-z]/.test(p) },
  { label: '1 number', test: (p: string) => /\d/.test(p) },
];

export const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

/** Live password checklist with green ticks (shared by owner and employee sign-up). */
export function PasswordChecklist({ password }: { password: string }) {
  return (
    <View style={styles.checklist}>
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(password);
        return (
          <View key={rule.label} style={styles.rule} accessibilityLabel={`${rule.label}: ${met ? 'done' : 'not yet'}`}>
            <View style={[styles.tick, met && styles.tickMet]}>
              {met && <Icon name={{ ios: 'checkmark', android: 'check', web: 'check' }} color="#FFFFFF" size={9} />}
            </View>
            <Text style={[styles.ruleText, met && styles.ruleTextMet]}>{rule.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

export function StepAccount({ data, update, onNext }: StepProps) {
  const [tried, setTried] = useState(false);

  const errors = {
    fullName: !data.fullName.trim() && 'Enter your full name.',
    email: !isValidEmail(data.email) && 'Enter a valid email address, like you@business.com.',
    password: !PASSWORD_RULES.every((r) => r.test(data.password)) && 'Your password needs to meet all the requirements below.',
    confirmPassword:
      (!data.confirmPassword && 'Re-enter your password.') ||
      (data.confirmPassword !== data.password && "Passwords don't match."),
  };
  const valid = !Object.values(errors).some(Boolean);

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
          placeholder="you@business.com"
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
      <Field label="Password" error={tried && errors.password}>
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
      <Field label="Confirm password" error={tried && errors.confirmPassword}>
        <Input
          value={data.confirmPassword}
          onChangeText={(confirmPassword) => update({ confirmPassword })}
          placeholder="Re-enter your password"
          password
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
          accessibilityLabel="Confirm password"
          icon={{ ios: 'lock', android: 'lock', web: 'lock' }}
          hasError={tried && !!errors.confirmPassword}
        />
      </Field>

      <Button
        label="Next"
        arrow
        onPress={() => {
          setTried(true);
          if (valid) onNext();
        }}
      />

      <View style={styles.signIn}>
        <Text style={styles.muted}>Already have an account? </Text>
        <Pressable onPress={() => router.replace('/owner-login')} accessibilityRole="link" hitSlop={8}>
          <Text style={styles.link}>Sign in</Text>
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  checklist: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    rowGap: 8,
    marginTop: 2,
  },
  rule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: '45%',
  },
  tick: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: C.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickMet: {
    backgroundColor: C.done,
    borderColor: C.done,
  },
  ruleText: {
    color: C.textSecondary,
    fontSize: 13,
  },
  ruleTextMet: {
    color: C.done,
    fontWeight: '600',
  },
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
