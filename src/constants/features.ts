/**
 * Switches for parts of NexGain that are built but hidden for now.
 * Change one to `true` to bring it back. Nothing behind a switch is deleted.
 */
export const Features = {
  /**
   * More > Integrations and the owner sign-up "Connect" step show only Email and
   * Bank account. `true` brings back the other apps (Xero, MYOB, QuickBooks,
   * Square, Stripe, PayPal, Google Calendar...), the "Other" buttons and the app
   * search. The Square connection and its server code still work either way.
   */
  showExtraIntegrations: false,
} as const;
