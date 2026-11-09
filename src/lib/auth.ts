// Real accounts (Supabase Auth): sign up, log in, log out, and working out
// whether the signed-in person is an owner or an employee.
import * as Linking from 'expo-linking';

import { endSession, startSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export type Role = 'owner' | 'employee' | 'none';

/** Turns Supabase error messages into plain English. */
export function friendlyAuthError(message: string) {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'That email or password is incorrect.';
  if (m.includes('already registered') || m.includes('already been registered')) {
    return 'An account with this email already exists. Try signing in instead.';
  }
  if (m.includes('email not confirmed')) return 'Please confirm your email address first (check your inbox), then log in.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts. Please wait a minute and try again.';
  if (m.includes('network') || m.includes('fetch')) return "Can't reach NexGain. Check your internet connection and try again.";
  if (m.includes('password')) return 'Please choose a stronger password.';
  return message;
}

/** Creates an account and signs straight in. Returns an error message, or null. */
export async function signUp(email: string, password: string, fullName: string) {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { full_name: fullName.trim() } },
  });
  if (error) return friendlyAuthError(error.message);
  // With "Confirm email" turned on in Supabase, there's no session until the email is confirmed.
  if (!data.session) return 'We sent you an email. Please confirm your address, then log in.';
  return null;
}

export async function getMyRole(): Promise<Role> {
  const { data, error } = await supabase.rpc('my_role');
  if (error) throw error;
  return (data as Role) ?? 'none';
}

/** Logs in and checks the account is the expected kind. Returns an error message, or null. */
export async function logIn(email: string, password: string, expected: 'owner' | 'employee') {
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) return friendlyAuthError(error.message);

  const role = await getMyRole();
  if (role !== expected) {
    await supabase.auth.signOut();
    if (role === 'none') return "This account isn't linked to a business yet. Please sign up first.";
    return expected === 'owner'
      ? 'This is an employee account. Please use Employee Login.'
      : 'This is an owner account. Please use Owner Login.';
  }
  // Load their data before opening the dashboard.
  await startSession(data.user.id);
  return null;
}

export async function logOut() {
  await supabase.auth.signOut();
  endSession();
}

// Load everyone's data whenever they're signed in (including when the app
// reopens with a saved session), and clear it when they sign out.
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT' || !session) {
    endSession();
    return;
  }
  if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
    // Run outside the auth callback, as Supabase recommends.
    setTimeout(() => {
      startSession(session.user.id).catch((e) => console.warn('Could not load your data:', e.message));
    }, 0);
  }
});

// ---------------------------------------------------------------------------
// Forgot password
// ---------------------------------------------------------------------------

/**
 * Where the reset email's link opens: the "Choose a new password" web page
 * (docs/reset-password, next to the quote page on GitHub Pages). A web page
 * opens from any email app on any phone or computer; links straight into the
 * app often don't (and never do in Expo Go). Without the quote page address,
 * the app's own screen.
 */
export function resetPasswordLink() {
  const base = process.env.EXPO_PUBLIC_QUOTE_PAGE_URL;
  if (base) {
    try {
      return new URL('../reset-password/', base).toString();
    } catch {
      // Not a valid address: fall back to the app.
    }
  }
  return Linking.createURL('/reset-password');
}

/**
 * Emails a "reset your password" link to the address the account signed up
 * with. Returns an error message, or null. For privacy it doesn't say whether
 * there's an account with that email.
 */
export async function sendPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: resetPasswordLink() });
  if (error) return friendlyAuthError(error.message);
  return null;
}

/**
 * Signs in with the one-time login from the reset email's link (it's in the
 * part after "#"). Returns an error message, or null.
 */
export async function signInFromResetLink(url: string) {
  const hash = url.includes('#') ? url.slice(url.indexOf('#') + 1) : '';
  const query = url.includes('?') ? url.slice(url.indexOf('?') + 1).split('#')[0] : '';
  const params = new URLSearchParams(hash || query);
  if (params.get('error_code') === 'otp_expired' || params.get('error')) {
    return 'This reset link has expired or was already used. Ask for a new one.';
  }
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (!access_token || !refresh_token) return null; // not a reset link (yet)
  const { error } = await supabase.auth.setSession({ access_token, refresh_token });
  if (error) return 'This reset link has expired or was already used. Ask for a new one.';
  return null;
}

/**
 * Signs in with the code from the reset email (works anywhere, even when the
 * email's link can't open the app). Returns an error message, or null.
 */
export async function signInWithResetCode(email: string, code: string) {
  const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.replace(/\s/g, ''), type: 'recovery' });
  if (!error) return null;
  const m = error.message.toLowerCase();
  if (m.includes('expired') || m.includes('invalid')) return 'That code is wrong or has expired. Check the latest email, or send a new code.';
  return friendlyAuthError(error.message);
}

/** Saves the new password, then signs out so they log in with it. Returns an error message, or null. */
export async function setNewPassword(password: string) {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return 'This reset link has expired or was already used. Ask for a new one.';
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.message.toLowerCase().includes('different from the old')) return 'Choose a password that’s different from your old one.';
    return friendlyAuthError(error.message);
  }
  await logOut();
  return null;
}
