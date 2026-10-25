// Every email the app sends (quotes, invoices, receipts, job confirmations) goes
// from the owner's own address and appears in their Sent folder, one of two ways:
//
// 1. Connected Gmail / Outlook account (More > Integrations > Connect): a preview
//    screen shows the email (components/email-preview.tsx), and Send sends it
//    straight from that account through the "send-email" Edge Function.
// 2. Otherwise: the email opens written in the owner's email app, ready to send.
//
// For the email app (2), phones differ in what they allow:
// - iPhone: Gmail and Outlook can be opened with the email filled in, but they
//   can't receive an attached file from another app. So emails with a PDF use
//   Apple's built-in email screen (the PDF attached), which sends from whichever
//   account is set up in the iPhone Mail app (Gmail and Outlook accounts can be added).
//   "Mail" (the Apple Mail app) and "Other" always use that built-in email screen.
// - Android: opens a short list of the phone's email apps (Gmail, Outlook...)
//   with everything filled in and the PDF attached.
import { File } from 'expo-file-system';
import * as MailComposer from 'expo-mail-composer';
import * as Sharing from 'expo-sharing';
import { Linking, Platform, Share } from 'react-native';

import { businessStore, type EmailApp } from '@/data/business';
import {
  connectedAccountsStore,
  functionError,
  sendingAccount,
  type ConnectedAccount,
} from '@/data/connected-accounts';
import { createStore } from '@/data/store';
import { supabase } from '@/lib/supabase';

export type EmailDraft = {
  to: string;
  subject: string;
  body: string;
  /** Local PDF file to attach. */
  attachmentUri?: string;
};

/**
 * - "sent": sent from the connected account, or the email app confirmed it was
 *   sent (iPhone's built-in email screen only)
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

/**
 * Sends the email from the owner's connected Gmail / Outlook account (after a
 * preview), or opens it in their email app when that account isn't connected.
 */
export async function openEmailDraft(draft: EmailDraft, app: EmailApp): Promise<EmailResult> {
  const account = sendingAccount(app);
  return account ? previewAndSend(draft, app, account) : openInEmailApp(draft, app);
}

// ---------- Connected account ----------

/** The email waiting on the preview screen (shown by <EmailPreviewHost /> in the root layout). */
export type EmailPreviewRequest = {
  draft: EmailDraft;
  app: EmailApp;
  account: ConnectedAccount;
  /** Closes the preview with this result (or a later one, e.g. from the email app). */
  finish: (result: EmailResult | Promise<EmailResult>) => void;
};

export const emailPreviewStore = createStore<EmailPreviewRequest | null>(null);

function previewAndSend(draft: EmailDraft, app: EmailApp, account: ConnectedAccount) {
  // Only one preview at a time: an older one counts as not sent.
  emailPreviewStore.get()?.finish('not_sent');
  return new Promise<EmailResult>((resolve) => {
    emailPreviewStore.set({
      draft,
      app,
      account,
      finish: (result) => {
        emailPreviewStore.set(null);
        resolve(result);
      },
    });
  });
}

/** The attachment's file name, e.g. "Quote-0001.pdf". */
export function attachmentName(uri: string) {
  return decodeURIComponent(uri.split('/').pop() ?? '') || 'document.pdf';
}

export type SendFailure = {
  /** The account no longer works: the owner needs to connect it again. */
  reconnect: boolean;
  message: string;
};

/** Sends from the connected account. Returns null when sent. */
export async function sendFromAccount(draft: EmailDraft, account: ConnectedAccount): Promise<SendFailure | null> {
  let attachment: { fileName: string; base64: string } | undefined;
  if (draft.attachmentUri) {
    try {
      attachment = { fileName: attachmentName(draft.attachmentUri), base64: await new File(draft.attachmentUri).base64() };
    } catch {
      return { reconnect: false, message: "Couldn't attach the PDF. Please try again." };
    }
  }
  const { error } = await supabase.functions.invoke('send-email', {
    body: {
      provider: account.provider,
      to: draft.to,
      subject: draft.subject,
      body: draft.body,
      fromName: businessStore.get()?.businessName.trim() ?? '',
      attachment,
    },
  });
  if (!error) return null;
  const { code, message } = await functionError(error, "The email couldn't be sent. Please try again.");
  const reconnect = code === 'reconnect' || code === 'not_connected';
  // The server has removed a connection that stopped working; stop showing it as connected.
  if (reconnect) connectedAccountsStore.set((all) => all.filter((a) => a.provider !== account.provider));
  return { reconnect, message };
}

// ---------- Email app on the phone ----------

/** Opens the owner's email app with the email written and (if given) the PDF attached. */
export async function openInEmailApp(draft: EmailDraft, app: EmailApp): Promise<EmailResult> {
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

/** One-line explanation of how emails will be sent, shown under the email app choice. */
export function emailAppHint(app: EmailApp, connectedEmail?: string) {
  if (connectedEmail) return `Emails are sent straight from ${connectedEmail}, with the PDF attached. You'll see each one before it's sent.`;
  const name = app === 'gmail' ? 'Gmail' : app === 'outlook' ? 'Outlook' : 'your email app';
  if (Platform.OS === 'ios') {
    if (app === 'mail') return 'Emails open in the iPhone Mail app with the PDF attached, ready to send.';
    return app === 'other'
      ? "Emails open in your iPhone's own email screen, written and ready to send."
      : `Emails with a PDF open in Apple's email screen so the PDF can be attached (${name} on iPhone can't accept attachments from other apps). To send them from your ${name} address, add the account in iPhone Settings › Apps › Mail › Mail Accounts.`;
  }
  if (Platform.OS === 'android') {
    return `Emails open with everything filled in and the PDF attached. Choose ${name} from the list that appears.`;
  }
  return `Emails open in ${name}, written and ready to send.`;
}
