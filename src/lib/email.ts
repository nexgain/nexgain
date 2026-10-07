// Every email the app sends (quotes, invoices, receipts, job confirmations) is
// written here and opened in the owner's own email app, ready to send. Nothing
// is sent from a server, so emails come from the owner's address and appear in
// their Sent folder.
//
// Phones differ in what they allow:
// - iPhone: Gmail and Outlook can be opened with the email filled in, but they
//   can't receive an attached file from another app. So emails with a PDF use
//   Apple's built-in email screen (the PDF attached), which sends from whichever
//   account is set up in the iPhone Mail app (Gmail and Outlook accounts can be added).
// - Android: opens a short list of the phone's email apps (Gmail, Outlook...)
//   with everything filled in and the PDF attached.
import * as MailComposer from 'expo-mail-composer';
import * as Sharing from 'expo-sharing';
import { Linking, Platform, Share } from 'react-native';

import type { EmailApp } from '@/data/business';

export type EmailDraft = {
  to: string;
  subject: string;
  body: string;
  /** Local PDF file to attach. */
  attachmentUri?: string;
};

/**
 * - "sent": the email app confirmed it was sent (iPhone's built-in email screen only)
 * - "not_sent": the email was cancelled or saved as a draft
 * - "ask": we can't tell (Android, Gmail/Outlook, share sheet), so ask the owner
 */
export type EmailResult = 'sent' | 'not_sent' | 'ask';

const query = (params: Record<string, string>) =>
  Object.entries(params)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');

const mailtoUrl = ({ to, subject, body }: EmailDraft) => `mailto:${encodeURIComponent(to)}?${query({ subject, body })}`;

/** iPhone links that open Gmail or Outlook with a new email filled in (no attachments). */
function appComposeUrl(app: EmailApp, draft: EmailDraft) {
  if (app === 'gmail') return `googlegmail:///co?${query({ to: draft.to, subject: draft.subject, body: draft.body })}`;
  if (app === 'outlook') return `ms-outlook://compose?${query({ to: draft.to, subject: draft.subject, body: draft.body })}`;
  return null;
}

async function tryOpen(url: string) {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/** Opens the owner's email app with the email written and (if given) the PDF attached. */
export async function openEmailDraft(draft: EmailDraft, app: EmailApp): Promise<EmailResult> {
  // Browsers can't attach files; open a written email instead.
  if (Platform.OS === 'web') {
    await Linking.openURL(mailtoUrl(draft));
    return 'ask';
  }

  if (!draft.attachmentUri && Platform.OS === 'ios') {
    // No attachment: open Gmail / Outlook themselves when that's what the owner uses.
    const url = appComposeUrl(app, draft);
    if (url && (await tryOpen(url))) return 'ask';
  }

  if (!draft.attachmentUri && Platform.OS === 'android') {
    // Opens the phone's default email app (or asks which one).
    if (await tryOpen(mailtoUrl(draft))) return 'ask';
  }

  if (await MailComposer.isAvailableAsync()) {
    const result = await MailComposer.composeAsync({
      recipients: draft.to ? [draft.to] : [],
      subject: draft.subject,
      body: draft.body,
      attachments: draft.attachmentUri ? [draft.attachmentUri] : [],
    });
    // Android always reports "sent", even when cancelled, so only trust it on iPhone.
    if (Platform.OS !== 'ios') return 'ask';
    return result.status === MailComposer.MailComposerStatus.SENT ? 'sent' : 'not_sent';
  }

  // No email account set up on the phone (iPhone Mail app, or no email app on
  // Android): the share sheet, where the owner picks Gmail or Outlook. On iPhone the
  // PDF and message go across; the "To" is typed there.
  if (draft.attachmentUri && Platform.OS === 'ios') {
    await Share.share({ url: draft.attachmentUri, message: draft.body }, { subject: draft.subject });
    return 'ask';
  }
  if (draft.attachmentUri) {
    await Sharing.shareAsync(draft.attachmentUri, { mimeType: 'application/pdf', dialogTitle: draft.subject });
    return 'ask';
  }
  await Linking.openURL(mailtoUrl(draft));
  return 'ask';
}

/** One-line explanation of how emails will open on this phone, shown under the email app choice. */
export function emailAppHint(app: EmailApp) {
  const name = app === 'gmail' ? 'Gmail' : app === 'outlook' ? 'Outlook' : 'your email app';
  if (Platform.OS === 'ios') {
    return app === 'other'
      ? 'Emails open in the iPhone Mail app, written and ready to send.'
      : `Emails with a PDF open in Apple's email screen so the PDF can be attached (${name} on iPhone can't accept attachments from other apps). To send them from your ${name} address, add the account in iPhone Settings › Apps › Mail › Mail Accounts.`;
  }
  if (Platform.OS === 'android') {
    return `Emails open with everything filled in and the PDF attached. Choose ${name} from the list that appears.`;
  }
  return `Emails open in ${name}, written and ready to send.`;
}
