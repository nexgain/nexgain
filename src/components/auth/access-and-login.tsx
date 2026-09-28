import { useState } from 'react';
import { router, type Href } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { AuthInput } from '@/components/auth/auth-input';
import { AuthScreen, comingSoon } from '@/components/auth/auth-screen';
import { OptionCard } from '@/components/auth/option-card';
import { AuthColors as C } from '@/components/auth/theme';
import { logIn } from '@/lib/auth';

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
 * "Owner Login" / "Employee Login". With `accountType`, Log In checks the email
 * and password against real accounts; without it, Log In goes straight into the
 * app as the original start screen did.
 */
export function LoginScreen({
  title,
  emailPlaceholder,
  destination,
  signUpHref,
  accountType,
}: {
  title: string;
  emailPlaceholder: string;
  destination: Href;
  /** Sign-up flow to open; without one, Sign Up shows "coming soon". */
  signUpHref?: Href;
  /** Which kind of real account to log in to. */
  accountType?: 'owner' | 'employee';
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (busy) return;
    if (!accountType) {
      router.push(destination);
      return;
    }
    if (!email.trim() || !password) {
      setError('Enter your email address and password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const problem = await logIn(email, password, accountType);
      if (problem) setError(problem);
      else router.replace(destination);
    } catch {
      setError("Can't reach NexGain. Check your internet connection and try again.");
    } finally {
      setBusy(false);
    }
  }

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
            onSubmitEditing={submit}
          />
          <Pressable
            onPress={() => comingSoon('Password reset')}
            accessibilityRole="link"
            hitSlop={8}
            style={styles.forgot}>
            <Text style={styles.link}>Forgot password?</Text>
          </Pressable>
        </View>

        {error && (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        )}

        <Pressable
          onPress={submit}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          style={({ pressed }) => [styles.loginButton, (pressed || busy) && styles.pressed]}>
          {busy && <ActivityIndicator color={C.onBrand} />}
          <Text style={styles.loginText}>{busy ? 'Logging in…' : 'Log In'}</Text>
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
  error: {
    color: '#FF6B6B',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
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
