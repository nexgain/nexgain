// =============================================================================
//  MESSAGING — every email and text message NexGain Bookings sends to
//  customers (confirmations, changes, cancellations, reminders) goes through here.
// =============================================================================
//
//  EMAIL — recommended provider: Resend (https://resend.com).
//    Until it's set up, emails are sent from the owner's connected Gmail or
//    Outlook (More › Integrations), so confirmations keep working.
//    TO TURN ON RESEND:
//     1. In Resend, add and verify your sending domain (e.g. nexgain.app).
//     2. Save two secrets (never put them in the app):
//          npx supabase secrets set RESEND_API_KEY=re_... --project-ref <your ref>     (you already have one saved)
//          npx supabase secrets set BOOKINGS_FROM_EMAIL=bookings@nexgain.app --project-ref <your ref>
//     3. Redeploy booking-page and booking-reminders. Emails then come from
//        "<Business name> <bookings@nexgain.app>", with replies going to the business.
//
//  TEXT MESSAGES (SMS) — recommended provider: Twilio (https://twilio.com)
//    (Australian alternative: MessageMedia). Until it's set up, texts aren't
//    sent and the customer is told to check their email or the booking page.
//    TO TURN ON TWILIO:
//     1. Buy a Twilio number (or register an alphanumeric sender ID, e.g. "NexGain").
//     2. Save three secrets:
//          npx supabase secrets set TWILIO_ACCOUNT_SID=AC... --project-ref <your ref>
//          npx supabase secrets set TWILIO_AUTH_TOKEN=... --project-ref <your ref>
//          npx supabase secrets set TWILIO_FROM=+61400000000 --project-ref <your ref>
//     3. Redeploy booking-page.
// =============================================================================
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { ownerMailAccount, sendBookingEmail } from './booking-mail.ts';

export type SendResult = { sent: true; via: string } | { sent: false; reason: string };

const env = (name: string) => Deno.env.get(name)?.trim() || '';

/**
 * Sends a plain-text email. Resend when it's set up, otherwise the owner's
 * connected Gmail or Outlook. Never throws.
 */
export async function sendEmail(
  db: SupabaseClient,
  input: { businessId: string; to: string; subject: string; text: string; fromName: string; replyTo: string },
): Promise<SendResult> {
  try {
    const resendKey = env('RESEND_API_KEY');
    const from = env('BOOKINGS_FROM_EMAIL');
    if (resendKey && from) {
      // TODO (Resend): this is the whole integration; nothing else to change.
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: `${input.fromName.replace(/[<>"]/g, '')} <${from}>`,
          to: [input.to],
          subject: input.subject,
          text: input.text,
          ...(input.replyTo ? { reply_to: input.replyTo } : {}),
        }),
      });
      if (res.ok) return { sent: true, via: 'resend' };
      console.error('messaging resend:', res.status, (await res.text()).slice(0, 300));
      // Falls through to Gmail / Outlook.
    }
    const account = await ownerMailAccount(db, input.businessId);
    if (!account) return { sent: false, reason: 'No email provider or Gmail/Outlook account is connected.' };
    await sendBookingEmail(db, account, input.to, input.subject, input.text, input.fromName);
    return { sent: true, via: account.provider };
  } catch (e) {
    console.error('messaging email:', e instanceof Error ? e.message : e);
    return { sent: false, reason: 'The email couldn’t be sent.' };
  }
}

/** A mobile number in international form (+61..., +44..., +1..., +64...) for the business's country. */
export function internationalPhone(raw: string, country: string | null) {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/[^0-9]/g, '');
  if (!digits) return null;
  if (trimmed.startsWith('+')) return `+${digits}`;
  const code = { AU: '61', GB: '44', UK: '44', US: '1', NZ: '64', CA: '1' }[(country ?? 'AU').toUpperCase()] ?? '61';
  if (digits.startsWith('00')) return `+${digits.slice(2)}`;
  if (code === '1') return digits.length === 11 && digits.startsWith('1') ? `+${digits}` : `+1${digits}`;
  return `+${code}${digits.replace(/^0/, '')}`;
}

/** Sends a text message with Twilio, once it's set up. Never throws. */
export async function sendSms(input: { to: string; country: string | null; text: string }): Promise<SendResult> {
  const sid = env('TWILIO_ACCOUNT_SID');
  const token = env('TWILIO_AUTH_TOKEN');
  const from = env('TWILIO_FROM');
  if (!sid || !token || !from) return { sent: false, reason: 'Text messages aren’t set up yet.' };
  const to = internationalPhone(input.to, input.country);
  if (!to) return { sent: false, reason: 'No mobile number.' };
  try {
    // TODO (Twilio): this is the whole integration; nothing else to change.
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${btoa(`${sid}:${token}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: to, From: from, Body: input.text.slice(0, 1500) }),
    });
    if (res.ok) return { sent: true, via: 'twilio' };
    console.error('messaging twilio:', res.status, (await res.text()).slice(0, 300));
    return { sent: false, reason: 'The text message couldn’t be sent.' };
  } catch (e) {
    console.error('messaging sms:', e instanceof Error ? e.message : e);
    return { sent: false, reason: 'The text message couldn’t be sent.' };
  }
}
