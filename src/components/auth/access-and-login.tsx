import { useEffect, useState, type ReactNode } from 'react';
import { router, type Href } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { SymbolView } from 'expo-symbols';

import { AuthInput } from '@/components/auth/auth-input';
import { AuthScreen, comingSoon } from '@/components/auth/auth-screen';
import { OptionCard } from '@/components/auth/option-card';
import { AuthColors as C } from '@/components/auth/theme';
import { logIn, sendPasswordReset, setNewPassword, signInFromResetLink, signInWithResetCode } from '@/lib/auth';

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
            onPress={() => router.push({ pathname: '/forgot-password', params: { email: email.trim() } })}
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

/**
 * "Forgot password?": emails a reset link to the address the account signed up
 * with. The link opens a web page to choose a new password. If the email has a
 * code instead (a custom Supabase email template), it can be entered here.
 */
export function ForgotPasswordScreen({ initialEmail = '' }: { initialEmail?: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [code, setCode] = useState('');
  const [withCode, setWithCode] = useState(false);
  const [done, setDone] = useState(false);

  async function send() {
    if (busy) return;
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Enter the email address you signed up with.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const problem = await sendPasswordReset(email);
      if (problem) setError(problem);
      else {
        setResent(sentTo !== null);
        setSentTo(email.trim());
      }
    } catch {
      setError("Can't reach NexGain. Check your internet connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function save(password: string) {
    if (!/^\d{6,10}$/.test(code.replace(/\s/g, ''))) return 'Enter the code from the email.';
    const problem = await signInWithResetCode(sentTo!, code);
    return problem ?? setNewPassword(password);
  }

  if (done) return <PasswordChanged />;

  const sendAgain = (
    <View style={styles.signUpRow}>
      <Text style={styles.muted}>{resent ? 'Sent again. ' : 'Didn’t get it? Check your junk folder, or '}</Text>
      {!resent && (
        <Pressable onPress={send} disabled={busy} accessibilityRole="link" hitSlop={8}>
          <Text style={styles.link}>{busy ? 'sending…' : 'send it again'}</Text>
        </Pressable>
      )}
    </View>
  );

  if (sentTo && !withCode) {
    return (
      <AuthScreen showBack>
        <Heading
          title="Check your email"
          subtitle={`If there's a NexGain account for ${sentTo}, we've emailed it a link. Tap the link to choose a new password, then come back here and log in.`}
        />
        <View style={styles.form}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            style={({ pressed }) => [styles.loginButton, pressed && styles.pressed]}>
            <Text style={styles.loginText}>Back to log in</Text>
          </Pressable>
          {sendAgain}
          <View style={styles.signUpRow}>
            <Text style={styles.muted}>Got a code in the email instead? </Text>
            <Pressable onPress={() => setWithCode(true)} accessibilityRole="link" hitSlop={8}>
              <Text style={styles.link}>Enter it</Text>
            </Pressable>
          </View>
        </View>
      </AuthScreen>
    );
  }

  if (sentTo) {
    return (
      <AuthScreen showBack>
        <Heading
          title="Check your email"
          subtitle="Enter the code from the email and your new password."
        />
        <NewPasswordForm
          onSave={save}
          onDone={() => setDone(true)}
          before={
            <AuthInput
              label="Code from the email"
              icon={{ ios: 'number', android: 'pin', web: 'pin' }}
              value={code}
              onChangeText={setCode}
              placeholder="6-digit code"
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              returnKeyType="next"
            />
          }
          after={sendAgain}
        />
      </AuthScreen>
    );
  }

  return (
    <AuthScreen showBack>
      <Heading title="Forgot password?" subtitle="Enter the email you signed up with and we'll send you a link to reset your password." />
      <View style={styles.form}>
        <AuthInput
          label="Email address"
          icon={{ ios: 'envelope.fill', android: 'mail', web: 'mail' }}
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          returnKeyType="send"
          onSubmitEditing={send}
        />
        {error && (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        )}
        <Pressable
          onPress={send}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          style={({ pressed }) => [styles.loginButton, (pressed || busy) && styles.pressed]}>
          {busy && <ActivityIndicator color={C.onBrand} />}
          <Text style={styles.loginText}>{busy ? 'Sending…' : 'Send reset link'}</Text>
        </Pressable>
      </View>
    </AuthScreen>
  );
}

/** Opened from the reset email's link (when the phone can open it): choose a new password. */
export function ResetPasswordScreen() {
  const url = Linking.useLinkingURL();
  const [checking, setChecking] = useState(true);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Sign in with the one-time login in the link, so the new password can be saved.
  useEffect(() => {
    let cancelled = false;
    signInFromResetLink(url ?? '')
      .then((problem) => !cancelled && setLinkError(problem))
      .catch(() => {})
      .finally(() => !cancelled && setChecking(false));
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (checking) {
    return (
      <AuthScreen>
        <ActivityIndicator color={C.brand} />
      </AuthScreen>
    );
  }
  if (done) return <PasswordChanged />;
  if (linkError) {
    return (
      <AuthScreen>
        <Heading title="Link not working" subtitle={linkError} />
        <View style={styles.form}>
          <Pressable
            onPress={() => router.replace('/forgot-password')}
            accessibilityRole="button"
            style={({ pressed }) => [styles.loginButton, pressed && styles.pressed]}>
            <Text style={styles.loginText}>Ask for a new code</Text>
          </Pressable>
        </View>
      </AuthScreen>
    );
  }
  return (
    <AuthScreen>
      <Heading title="Set a new password" subtitle="Choose a new password for your NexGain account." />
      <NewPasswordForm onSave={setNewPassword} onDone={() => setDone(true)} />
    </AuthScreen>
  );
}

/** New password + confirm, and the Save button. `onSave` returns an error message, or null. */
function NewPasswordForm({
  onSave,
  onDone,
  before,
  after,
}: {
  onSave: (password: string) => Promise<string | null>;
  onDone: () => void;
  before?: ReactNode;
  after?: ReactNode;
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (busy) return;
    if (password.length < 6) {
      setError('Use at least 6 characters for your new password.');
      return;
    }
    if (password !== confirm) {
      setError('The two passwords don’t match.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const problem = await onSave(password);
      if (problem) setError(problem);
      else onDone();
    } catch {
      setError("Can't reach NexGain. Check your internet connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.form}>
      {before}
      <AuthInput
        label="New password"
        icon={{ ios: 'lock.fill', android: 'lock', web: 'lock' }}
        password
        value={password}
        onChangeText={setPassword}
        placeholder="At least 6 characters"
        textContentType="newPassword"
        autoComplete="new-password"
        returnKeyType="next"
      />
      <AuthInput
        label="Confirm new password"
        icon={{ ios: 'lock.fill', android: 'lock', web: 'lock' }}
        password
        value={confirm}
        onChangeText={setConfirm}
        placeholder="Type it again"
        textContentType="newPassword"
        autoComplete="new-password"
        returnKeyType="go"
        onSubmitEditing={save}
      />
      {error && (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      )}
      <Pressable
        onPress={save}
        disabled={busy}
        accessibilityRole="button"
        accessibilityState={{ disabled: busy }}
        style={({ pressed }) => [styles.loginButton, (pressed || busy) && styles.pressed]}>
        {busy && <ActivityIndicator color={C.onBrand} />}
        <Text style={styles.loginText}>{busy ? 'Saving…' : 'Save new password'}</Text>
      </Pressable>
      {after}
    </View>
  );
}

function PasswordChanged() {
  return (
    <AuthScreen>
      <Heading title="Password changed" subtitle="Your new password is saved. Log in with it now." />
      <View style={styles.form}>
        <Pressable
          onPress={() => router.replace('/')}
          accessibilityRole="button"
          style={({ pressed }) => [styles.loginButton, pressed && styles.pressed]}>
          <Text style={styles.loginText}>Log in</Text>
        </Pressable>
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
