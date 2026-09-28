import { useState } from 'react';
import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { AuthInput } from '@/components/auth/auth-input';
import { AuthScreen, comingSoon } from '@/components/auth/auth-screen';
import { OptionCard } from '@/components/auth/option-card';
import { AuthColors as C } from '@/components/auth/theme';

/** "Owner Access" / "Employee Access": choose Log In or Sign Up. */
export function AccessScreen({
  title,
  subtitle,
  loginHref,
  signUpSubtitle,
  signUpHref,
}: {
  title: string;
  subtitle: string;
  loginHref: Href;
  signUpSubtitle: string;
  /** Sign-up flow to open; without one, Sign Up shows "coming soon". */
  signUpHref?: Href;
}) {
  return (
    <AuthScreen showBack>
      <Heading title={title} subtitle={subtitle} />
      <View style={styles.cards}>
        <OptionCard
          icon={{ ios: 'person.fill', android: 'person', web: 'person' }}
          title="Log In"
          subtitle="Access your existing account"
          onPress={() => router.push(loginHref)}
        />
        <OptionCard
          icon={{ ios: 'pencil', android: 'edit', web: 'edit' }}
          title="Sign Up"
          subtitle={signUpSubtitle}
          onPress={() => (signUpHref ? router.push(signUpHref) : comingSoon('Sign up'))}
        />
      </View>
    </AuthScreen>
  );
}

/**
 * "Owner Login" / "Employee Login". There are no accounts yet, so Log In goes
 * straight into the app, the same as the previous start screen did.
 */
export function LoginScreen({
  title,
  emailPlaceholder,
  destination,
  signUpHref,
}: {
  title: string;
  emailPlaceholder: string;
  destination: Href;
  /** Sign-up flow to open; without one, Sign Up shows "coming soon". */
  signUpHref?: Href;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <AuthScreen showBack>
      <Heading title={title} subtitle="Welcome back! Log in to your account." />

      <View style={styles.form}>
        <AuthInput
          label="Email address"
          icon={{ ios: 'envelope.fill', android: 'mail', web: 'mail' }}
          value={email}
          onChangeText={setEmail}
          placeholder={emailPlaceholder}
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          returnKeyType="next"
        />
        <View style={styles.passwordBlock}>
          <AuthInput
            label="Password"
            icon={{ ios: 'lock.fill', android: 'lock', web: 'lock' }}
            password
            value={password}
            onChangeText={setPassword}
            placeholder="Enter your password"
            textContentType="password"
            autoComplete="password"
            returnKeyType="go"
            onSubmitEditing={() => router.push(destination)}
          />
          <Pressable
            onPress={() => comingSoon('Password reset')}
            accessibilityRole="link"
            hitSlop={8}
            style={styles.forgot}>
            <Text style={styles.link}>Forgot password?</Text>
          </Pressable>
        </View>

        <Pressable
          onPress={() => router.push(destination)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.loginButton, pressed && styles.pressed]}>
          <Text style={styles.loginText}>Log In</Text>
          <SymbolView
            name={{ ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' }}
            tintColor={C.onBrand}
            size={18}
          />
        </Pressable>

        <View style={styles.signUpRow}>
          <Text style={styles.muted}>Don&apos;t have an account? </Text>
          <Pressable
            onPress={() => (signUpHref ? router.push(signUpHref) : comingSoon('Sign up'))}
            accessibilityRole="link"
            hitSlop={8}>
            <Text style={styles.link}>Sign Up</Text>
          </Pressable>
        </View>
      </View>
    </AuthScreen>
  );
}

function Heading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.heading}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: {
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    marginBottom: 8,
  },
  title: {
    color: C.text,
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    color: C.textSecondary,
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
  },
  cards: {
    gap: 14,
  },
  form: {
    gap: 18,
  },
  passwordBlock: {
    gap: 10,
  },
  forgot: {
    alignSelf: 'flex-end',
  },
  link: {
    color: C.brand,
    fontSize: 14,
    fontWeight: '700',
  },
  loginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 56,
    marginTop: 6,
    borderRadius: 14,
    backgroundColor: C.brand,
  },
  loginText: {
    color: C.onBrand,
    fontSize: 17,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.85,
  },
  signUpRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  muted: {
    color: C.textSecondary,
    fontSize: 14,
  },
});
