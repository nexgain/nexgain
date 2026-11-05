// The owner's connected accounts: email (Gmail, Outlook) and business apps
// (Square so far). Connecting opens the provider's login inside the app; the Edge Functions in supabase/functions
// do the rest and keep the login tokens encrypted on the server. The app never
// sees a token: it only reads the "my_connected_accounts" view (provider, email
// address, when it was connected), so "Connected" only shows for a real connection.
import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';

import type { EmailApp } from '@/data/business';
import { createStore } from '@/data/store';
import { supabase } from '@/lib/supabase';

/** Providers the server knows (supabase/functions/_shared/connections.ts). */
export type Provider = 'google' | 'microsoft' | 'square';

/** The ones quotes, invoices and reminders can send from. */
export const EMAIL_PROVIDERS: Provider[] = ['google', 'microsoft'];

/** Only the email accounts (not business apps like Square). */
export function emailAccounts(accounts: ConnectedAccount[]) {
  return accounts.filter((a) => EMAIL_PROVIDERS.includes(a.provider));
}

export type ConnectedAccount = {
  provider: Provider;
  /** The email address, or the business name for apps like Square. */
  email: string;
  connectedAt: string;
};

type AccountRow = { provider: Provider; account_email: string; connected_at: string };

/** The email app each provider sends as. */
export const EMAIL_PROVIDER: Partial<Record<EmailApp, Provider>> = { gmail: 'google', outlook: 'microsoft' };

export const PROVIDER_NAME: Record<Provider, string> = { google: 'Google', microsoft: 'Microsoft', square: 'Square' };

export const connectedAccountsStore = createStore<ConnectedAccount[]>([]);

export function useConnectedAccounts() {
  return connectedAccountsStore.use();
}

export function findAccount(accounts: ConnectedAccount[], provider: Provider | undefined) {
  return provider ? accounts.find((a) => a.provider === provider) : undefined;
}

/** The connected account emails are sent from: the one for the owner's chosen email app, if connected. */
export function sendingAccount(app: EmailApp) {
  return findAccount(connectedAccountsStore.get(), EMAIL_PROVIDER[app]);
}

export async function loadConnectedAccounts() {
  const { data, error } = await supabase.from('my_connected_accounts').select('*');
  if (error) throw error;
  connectedAccountsStore.set(
    (data as AccountRow[]).map((r) => ({ provider: r.provider, email: r.account_email, connectedAt: r.connected_at })),
  );
}

/**
 * Checks the server again each time the screen comes into view. The server can
 * remove a connection by itself (Google or Microsoft cancelled NexGain's access,
 * found while sending), so the list loaded at login can go out of date.
 */
export function useRefreshConnectedAccountsOnFocus() {
  useFocusEffect(
    useCallback(() => {
      loadConnectedAccounts().catch(() => {});
    }, []),
  );
}

export function clearConnectedAccounts() {
  connectedAccountsStore.set([]);
}

/** The server's message from a failed Edge Function call, or a friendly fallback. */
export async function functionError(error: unknown, fallback: string): Promise<{ code?: string; message: string }> {
  if (error instanceof FunctionsHttpError) {
    // Our functions reply { error, message } (or just { error: "A sentence." }).
    const body = await error.context.json().catch(() => null);
    if (body) return { code: body.error, message: body.message ?? body.error ?? fallback };
  }
  if (error instanceof FunctionsFetchError) {
    return { message: 'No internet connection. Check your connection and try again.' };
  }
  return { message: fallback };
}

type ReturnParams = Record<string, string>;

/**
 * A login finished in another browser (e.g. the owner tapped Share > Open in Chrome)
 * comes back to the app as a link instead of to the in-app login. The
 * oauth-return screen hands its details here so connectAccount can still use them.
 */
let lastReturn: { params: ReturnParams; at: number } | null = null;

export function noteOAuthReturn(params: ReturnParams) {
  lastReturn = { params, at: Date.now() };
}

export type ConnectResult =
  | { status: 'connected'; email: string }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

/**
 * Opens the Google or Microsoft login inside the app. The owner logs in and taps
 * Allow, and the account is connected. Works in Expo Go and in real builds.
 */
export async function connectAccount(provider: Provider): Promise<ConnectResult> {
  const name = PROVIDER_NAME[provider];
  // e.g. nexgain://oauth-return (real builds) or exp://192.168.1.5:8081/--/oauth-return (Expo Go).
  const redirect = Linking.createURL('oauth-return');
  const { data, error } = await supabase.functions.invoke<{ url: string }>('oauth-start', { body: { provider, redirect } });
  if (error || !data?.url) {
    const failure = await functionError(error, `Couldn't open the ${name} login. Please try again.`);
    // Not ready on the server yet (no keys added, or an older server that doesn't know this app).
    if (failure.code === 'not_set_up' || /unknown provider/i.test(failure.message)) {
      return { status: 'error', message: `${name} isn't set up yet. Please try again later.` };
    }
    return { status: 'error', message: failure.message };
  }

  const startedAt = Date.now();
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirect);
  let params: ReturnParams;
  if (result.type === 'success') {
    const { queryParams } = Linking.parse(result.url);
    params = Object.fromEntries(
      Object.entries(queryParams ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    );
  } else if (lastReturn && lastReturn.at >= startedAt) {
    // Finished in another browser, then the in-app login was closed: use what came back.
    params = lastReturn.params;
  } else {
    // Closed without an answer. It may still have connected elsewhere, so ask the server.
    await loadConnectedAccounts().catch(() => {});
    const account = findAccount(connectedAccountsStore.get(), provider);
    return account && Date.parse(account.connectedAt) >= startedAt
      ? { status: 'connected', email: account.email }
      : { status: 'cancelled' };
  }
  lastReturn = null;
  const param = (key: string) => params[key] ?? '';
  if (param('status') === 'cancelled') return { status: 'cancelled' };
  if (param('status') !== 'connected') {
    return { status: 'error', message: param('message') || `Couldn't connect your ${name} account. Please try again.` };
  }

  // Only trust what's really saved on the server.
  await loadConnectedAccounts().catch(() => {});
  const account = findAccount(connectedAccountsStore.get(), provider);
  return account
    ? { status: 'connected', email: account.email }
    : { status: 'error', message: `Couldn't confirm the ${name} connection. Check your internet connection and try again.` };
}

/** One recent item from a connected app (e.g. a Square payment), from the integration-data function. */
export type IntegrationItem = {
  id: string;
  title: string;
  detail: string;
  /** In dollars. */
  amount: number | null;
  currency: string | null;
  /** ISO timestamp. */
  date: string;
  status: string;
};

/** The latest data from a connected app, so the owner can see the connection works. */
export async function loadIntegrationData(provider: Provider): Promise<{ items?: IntegrationItem[]; error?: string; reconnect?: boolean }> {
  const { data, error } = await supabase.functions.invoke<{ items: IntegrationItem[] }>('integration-data', { body: { provider } });
  if (error || !data) {
    const failure = await functionError(error, `Couldn't load your ${PROVIDER_NAME[provider]} data. Please try again.`);
    const reconnect = failure.code === 'reconnect' || failure.code === 'not_connected';
    // The server removed a connection that stopped working: show "+ Add" again.
    if (reconnect) await loadConnectedAccounts().catch(() => {});
    return { error: failure.message, reconnect };
  }
  return { items: data.items };
}

/** Disconnects the account (and cancels NexGain's access with Google or Square). Returns an error message if it failed. */
export async function disconnectAccount(provider: Provider): Promise<string | null> {
  const { error } = await supabase.functions.invoke('oauth-disconnect', { body: { provider } });
  if (error) return (await functionError(error, "Couldn't disconnect. Please try again.")).message;
  connectedAccountsStore.set((all) => all.filter((a) => a.provider !== provider));
  return null;
}
