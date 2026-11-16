// NexGain Bookings: emails to customers (confirmations, changes, reminders),
// sent from the owner's connected Gmail or Outlook. Shared by the booking-page
// and booking-reminders Edge Functions so both pick the account the same way
// as job reminders do.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { EMAIL_PROVIDERS, type ProviderId } from './connections.ts';
import { ACCOUNT_COLUMNS, EMAIL, sendFromAccount, type AccountRow } from './mail.ts';

export { EMAIL };

const EMAIL_APP_PROVIDER: Record<string, ProviderId> = { gmail: 'google', outlook: 'microsoft' };

/** The booking page's address, for the "change or cancel" links in emails. */
export const bookingPageUrl = () => (Deno.env.get('BOOKING_PAGE_URL')?.trim() || 'https://nexgain.github.io/nexgain/book/').replace(/\/?$/, '/');

/** "$40.00" / "£40.00" in the business's currency. */
export function money(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).format(amount);
  } catch {
    return amount.toFixed(2);
  }
}

/** "Tuesday 18 November 2026" and "10:00 AM" in the business's time zone. */
export function whenText(start: string, timeZone: string) {
  const date = new Date(start);
  return {
    day: date.toLocaleDateString('en-GB', { timeZone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    time: date.toLocaleTimeString('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }),
  };
}

/** The owner's email account to send from: their reminder choice, else their email app's, else whichever is connected. */
export async function ownerMailAccount(db: SupabaseClient, businessId: string, emailApp?: string | null, reminderProvider?: string | null) {
  let app = emailApp;
  let provider = reminderProvider;
  if (app === undefined || provider === undefined) {
    const { data } = await db.from('businesses').select('email_app, reminder_provider').eq('id', businessId).maybeSingle();
    app = data?.email_app ?? null;
    provider = data?.reminder_provider ?? null;
  }
  const { data: accounts } = await db.from('connected_accounts').select(ACCOUNT_COLUMNS).eq('business_id', businessId).in('provider', EMAIL_PROVIDERS);
  const list = (accounts ?? []) as AccountRow[];
  return list.find((a) => a.provider === provider) ?? list.find((a) => a.provider === EMAIL_APP_PROVIDER[app ?? '']) ?? list[0] ?? null;
}

/** Sends a plain email from the account. Throws ReconnectNeeded or an Error when it can't. */
export function sendBookingEmail(db: SupabaseClient, account: AccountRow, to: string, subject: string, body: string, fromName: string) {
  return sendFromAccount(db, account, { to, subject, body, fromName, attachment: null });
}
