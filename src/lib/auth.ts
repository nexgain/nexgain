// Real accounts (Supabase Auth): sign up, log in, log out, and working out
// whether the signed-in person is an owner or an employee.
import { clearBusiness, loadMyBusiness } from '@/data/business';
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
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) return friendlyAuthError(error.message);

  const role = await getMyRole();
  if (role !== expected) {
    await supabase.auth.signOut();
    if (role === 'none') return "This account isn't linked to a business yet. Please sign up first.";
    return expected === 'owner'
      ? 'This is an employee account. Please use Employee Login.'
      : 'This is an owner account. Please use Owner Login.';
  }
  await loadMyBusiness();
  return null;
}

export async function logOut() {
  await supabase.auth.signOut();
  clearBusiness();
}

// Load the business whenever someone is signed in (including when the app
// reopens with a saved session), and clear it when they sign out.
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT' || !session) {
    clearBusiness();
    return;
  }
  if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
    // Run outside the auth callback, as Supabase recommends.
    setTimeout(() => {
      loadMyBusiness().catch((e) => console.warn('Could not load business:', e.message));
    }, 0);
  }
});
