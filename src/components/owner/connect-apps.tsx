// The app-connection list, shared by More > Integrations (dark) and owner sign-up
// (light) so both always look and work the same. Gmail, Outlook and Square really
// connect (see src/data/connected-accounts.ts); every other app is just marked as
// used ("Added - coming soon") or requested.
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';

import { Icon, type IconName } from '@/components/owner/ui';
import { SignupColors } from '@/components/signup/fields';
import { BrandLogos, BrandTileColors, type BrandLogoName } from '@/constants/brand-logos';
import { Colors, Palette as ThemePalette } from '@/constants/theme';
import { EMAIL_APP_CHOICES, shownEmailApp, type EmailApp } from '@/data/business';
import { findChosen, type ChosenApp } from '@/data/business-apps';
import {
  connectAccount,
  disconnectAccount,
  EMAIL_PROVIDER,
  findAccount,
  loadIntegrationData,
  PROVIDER_NAME,
  useConnectedAccounts,
  type ConnectedAccount,
  type IntegrationItem,
  type Provider,
} from '@/data/connected-accounts';
import { format12h, formatShortDate } from '@/data/employee-roster';
import { APP_CATALOG, CATEGORY_LABEL, findCatalogApp, type AppCategory, type CatalogApp } from '@/data/integration-apps';
import { emailAppHint } from '@/lib/email';

type Palette = Record<'page' | 'card' | 'raised' | 'border' | 'text' | 'sub' | 'accent' | 'accentSoft' | 'success' | 'danger', string>;
export type ConnectTheme = 'dark' | 'light';

const PALETTES: Record<ConnectTheme, Palette> = {
  dark: {
    page: Colors.background,
    card: Colors.surface,
    raised: Colors.surfaceRaised,
    border: Colors.border,
    text: Colors.text,
    sub: Colors.textSecondary,
    accent: Colors.accent,
    accentSoft: Colors.accentSoft,
    success: Colors.success,
    danger: Colors.danger,
  },
  light: {
    page: SignupColors.page,
    card: SignupColors.card,
    raised: ThemePalette.track,
    border: SignupColors.border,
    text: SignupColors.text,
    sub: SignupColors.textSecondary,
    accent: SignupColors.primary,
    accentSoft: SignupColors.primarySoft,
    success: SignupColors.done,
    danger: SignupColors.danger,
  },
};

type Logo = { brand: BrandLogoName } | { symbol: IconName; tile: string } | { letter: string };

const ON_PHONE = 'Your email will open on your phone to send.';

const EMAIL_ROWS: Record<EmailApp, { logo: Logo; sub?: string }> = {
  gmail: { logo: { brand: 'gmail' } },
  outlook: { logo: { brand: 'outlook' } },
  // Generic envelope (not Apple's logo) for the iPhone Mail app.
  mail: { logo: { symbol: { ios: 'envelope.fill', android: 'mail', web: 'mail' }, tile: '#1A8CFF' }, sub: ON_PHONE },
  other: {
    logo: { symbol: { ios: 'envelope', android: 'alternate_email', web: 'alternate_email' }, tile: ThemePalette.textSecondary },
    sub: `${ON_PHONE} Works with Yahoo, iCloud, your own domain and more.`,
  },
};

const EMAIL_LABEL: Partial<Record<EmailApp, string>> = { gmail: 'Gmail', outlook: 'Outlook' };

/** Asks before disconnecting (a plain confirm on the web, where Alert has no buttons). */
function confirmDisconnect(name: string, message: string) {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`Disconnect ${name}?\n\n${message}`));
  return new Promise<boolean>((resolve) =>
    Alert.alert(
      `Disconnect ${name}?`,
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Disconnect', style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  );
}

/** Apps that really connect, and what their data list is called. The rest are a wish list for now. */
const CONNECTABLE: Record<string, { provider: Provider; dataTitle: string }> = {
  Square: { provider: 'square', dataTitle: 'Recent payments' },
};

const PAYMENT_APPS = ['Xero', 'MYOB', 'QuickBooks'];
const MORE_APPS = ['Google Calendar', 'Stripe', 'Square', 'PayPal'];
const LISTED = [...PAYMENT_APPS, ...MORE_APPS];
const isListed = (name: string) => LISTED.some((n) => n.toLowerCase() === name.trim().toLowerCase());

const STATUS_TEXT = { added: 'Added – coming soon', requested: 'Requested' } as const;

const logoFor = (name: string): Logo => {
  const logo = findCatalogApp(name)?.logo;
  return logo ? { brand: logo } : { letter: name.trim().charAt(0).toUpperCase() || '?' };
};

export function ConnectApps({
  theme,
  emailApp,
  onEmailAppChange,
  emailFooter,
  beforeConnect,
  optionalNote,
  apps,
  onToggleApp,
}: {
  theme: ConnectTheme;
  emailApp: EmailApp;
  onEmailAppChange: (app: EmailApp) => void;
  /** Shown under the email choices (e.g. the business email address at sign-up). */
  emailFooter?: ReactNode;
  /** Runs before an account is connected (sign-up: creates the account first). Return false to stop. */
  beforeConnect?: () => Promise<boolean>;
  /** Shown above the optional sections (sign-up). */
  optionalNote?: string;
  apps: ChosenApp[];
  /** Adds the app if it isn't in `apps`, otherwise removes it. */
  onToggleApp: (app: ChosenApp) => void;
}) {
  const p = PALETTES[theme];
  const [search, setSearch] = useState<{ category: AppCategory | null } | null>(null);
  const selectedEmail = shownEmailApp(emailApp);
  const accounts = useConnectedAccounts();
  const [busyProvider, setBusyProvider] = useState<Provider | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);
  // Business apps (Square...): their own message, and the open options sheet.
  const [appMessage, setAppMessage] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const [openApp, setOpenApp] = useState<string | null>(null);
  const selectedAccount = findAccount(accounts, EMAIL_PROVIDER[selectedEmail]);
  const selectedLabel = EMAIL_LABEL[selectedEmail];

  async function connect(app: EmailApp, provider: Provider) {
    const label = EMAIL_LABEL[app];
    setMessage(null);
    setBusyProvider(provider);
    try {
      if (beforeConnect && !(await beforeConnect())) return;
      const result = await connectAccount(provider);
      if (result.status === 'connected') {
        onEmailAppChange(app);
        setMessage({ tone: 'ok', text: `${label} connected. Quotes and invoices will now send from ${result.email}.` });
      } else if (result.status === 'cancelled') {
        setMessage({
          tone: 'info',
          text: `The ${PROVIDER_NAME[provider]} login was closed, so ${label} wasn't connected. Tap Connect to try again.`,
        });
      } else {
        setMessage({ tone: 'error', text: result.message });
      }
    } catch {
      setMessage({ tone: 'error', text: `Couldn't connect ${label}. Check your internet connection and try again.` });
    } finally {
      setBusyProvider(null);
    }
  }

  async function disconnect(app: EmailApp, provider: Provider, email: string) {
    const label = EMAIL_LABEL[app] ?? '';
    const warning = `Quotes and invoices will open in your phone's email app instead of sending from ${email}.`;
    if (!(await confirmDisconnect(label, warning))) return;
    setMessage(null);
    setBusyProvider(provider);
    const error = await disconnectAccount(provider);
    setBusyProvider(null);
    if (error) setMessage({ tone: 'error', text: error });
    else if (provider === 'microsoft') {
      setMessage({
        tone: 'info',
        text: `${label} disconnected. To fully remove NexGain's access, go to account.microsoft.com › Privacy › App access.`,
      });
    } else setMessage({ tone: 'info', text: `${label} disconnected.` });
  }

  /** Opens the app's login (e.g. Square). Returns true once it's connected. */
  async function connectApp(name: string, provider: Provider) {
    setAppMessage(null);
    setBusyProvider(provider);
    try {
      if (beforeConnect && !(await beforeConnect())) return false;
      const result = await connectAccount(provider);
      if (result.status === 'connected') {
        setAppMessage({ tone: 'ok', text: `${name} connected (${result.email}). Tap it to see your latest data.` });
        return true;
      }
      setAppMessage(
        result.status === 'cancelled'
          ? { tone: 'info', text: `Login cancelled, so ${name} wasn't connected. Tap + Add to try again.` }
          : { tone: 'error', text: result.message },
      );
    } catch {
      setAppMessage({ tone: 'error', text: `Couldn't connect ${name}. Check your internet connection and try again.` });
    } finally {
      setBusyProvider(null);
    }
    return false;
  }

  async function disconnectApp(name: string, provider: Provider) {
    if (!(await confirmDisconnect(name, `NexGain will stop seeing your ${name} data. You can connect again at any time.`))) return;
    setBusyProvider(provider);
    const error = await disconnectAccount(provider);
    setBusyProvider(null);
    if (error) {
      setAppMessage({ tone: 'error', text: error });
      return;
    }
    setOpenApp(null);
    setAppMessage({ tone: 'info', text: `${name} disconnected.` });
  }

  const emailRight = (value: EmailApp, selected: boolean) => {
    const radio = selected ? (
      <Icon name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }} color={p.accent} size={20} />
    ) : (
      <View style={[styles.radio, { borderColor: p.border }]} />
    );
    const provider = EMAIL_PROVIDER[value];
    if (!provider) return radio;
    const label = EMAIL_LABEL[value];
    const account = findAccount(accounts, provider);
    let action: ReactNode;
    if (busyProvider === provider) {
      action = <ActivityIndicator color={p.accent} />;
    } else if (account) {
      action = (
        <SmallButton
          p={p}
          label="Disconnect"
          onPress={() => disconnect(value, provider, account.email)}
          accessibilityLabel={`Disconnect ${label} (${account.email})`}
          disabled={busyProvider !== null}
        />
      );
    } else {
      action = (
        <SmallButton
          p={p}
          label="Connect"
          filled
          onPress={() => connect(value, provider)}
          accessibilityLabel={`Connect ${label}`}
          disabled={busyProvider !== null}
        />
      );
    }
    return (
      <View style={styles.rightRow}>
        {action}
        {radio}
      </View>
    );
  };

  // Apps added from the search: payment ones join the Payments list, the rest the last list.
  const extras = apps.filter((a) => !isListed(a.name));
  const paymentExtras = extras.filter((a) => a.category === 'payments');
  const otherExtras = extras.filter((a) => a.category !== 'payments');

  const listedRow = (name: string) => {
    const connectable = CONNECTABLE[name];
    if (connectable) {
      const account = findAccount(accounts, connectable.provider);
      const busy = busyProvider === connectable.provider;
      return (
        <AppRow
          key={name}
          p={p}
          logo={logoFor(name)}
          name={name}
          sub={account ? account.email : undefined}
          onPress={busy || busyProvider !== null ? undefined : () => (account ? setOpenApp(name) : connectApp(name, connectable.provider))}
          accessibilityLabel={account ? `${name}, connected as ${account.email}. Tap for options.` : `${name}, not connected. Tap to connect.`}
          right={busy ? <ActivityIndicator color={p.accent} /> : account ? <ConnectedLabel p={p} /> : <AddLabel p={p} />}
        />
      );
    }
    const app = findCatalogApp(name)!;
    const chosen = findChosen(apps, name);
    return (
      <AppRow
        key={name}
        p={p}
        logo={logoFor(name)}
        name={name}
        onPress={() => onToggleApp({ name, category: app.category, status: 'added' })}
        accessibilityLabel={`${name}, ${chosen ? 'added, coming soon. Tap to remove.' : 'not added. Tap to add.'}`}
        right={chosen ? <StatusPill p={p} text={STATUS_TEXT[chosen.status]} /> : <AddLabel p={p} />}
      />
    );
  };

  const extraRow = (app: ChosenApp) => (
    <AppRow
      key={app.name}
      p={p}
      logo={logoFor(app.name)}
      name={app.name}
      right={
        <View style={styles.rightRow}>
          <StatusPill p={p} text={STATUS_TEXT[app.status]} />
          <Pressable
            onPress={() => onToggleApp(app)}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${app.name}`}
            hitSlop={8}
            style={({ pressed }) => [styles.remove, { backgroundColor: p.raised }, pressed && styles.pressed]}>
            <Icon name={{ ios: 'xmark', android: 'close', web: 'close' }} color={p.sub} size={11} />
          </Pressable>
        </View>
      }
    />
  );

  const openRow = (label: string, category: AppCategory | null) => (
    <AppRow
      p={p}
      logo={{ symbol: { ios: 'plus', android: 'add', web: 'add' }, tile: p.accent }}
      name={label}
      onPress={() => setSearch({ category })}
      accessibilityLabel={`${label}. Search more apps.`}
      right={<Icon name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} color={p.sub} size={14} />}
    />
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.section}>
        <Text style={[styles.heading, { color: p.text }]}>Email</Text>
        <Group p={p}>
          {EMAIL_APP_CHOICES.map(({ value, label }) => {
            const selected = selectedEmail === value;
            const account = findAccount(accounts, EMAIL_PROVIDER[value]);
            return (
              <AppRow
                key={value}
                p={p}
                logo={EMAIL_ROWS[value].logo}
                name={label}
                sub={account ? `Connected: ${account.email}` : EMAIL_ROWS[value].sub}
                subColor={account ? p.success : undefined}
                onPress={() => onEmailAppChange(value)}
                accessibilityRole="radio"
                selected={selected}
                accessibilityLabel={account ? `${label}, connected as ${account.email}` : label}
                right={emailRight(value, selected)}
              />
            );
          })}
        </Group>
        {message && (
          <Text
            accessibilityRole={message.tone === 'error' ? 'alert' : undefined}
            style={[
              styles.message,
              { color: message.tone === 'error' ? p.danger : message.tone === 'ok' ? p.success : p.text },
            ]}>
            {message.text}
          </Text>
        )}
        <Text style={[styles.hint, { color: p.sub }]}>
          {selectedAccount
            ? emailAppHint(selectedEmail, selectedAccount.email)
            : selectedLabel
              ? `Tap Connect to send straight from your ${selectedLabel} address. Until then: ${emailAppHint(selectedEmail)}`
              : emailAppHint(selectedEmail)}
        </Text>
        {emailFooter}
      </View>

      {optionalNote && <Text style={[styles.note, { color: p.sub }]}>{optionalNote}</Text>}

      <View style={styles.section}>
        <Text style={[styles.heading, { color: p.text }]}>Payments</Text>
        <Group p={p}>
          {PAYMENT_APPS.map(listedRow)}
          {paymentExtras.map(extraRow)}
          {openRow('Other', 'payments')}
        </Group>
      </View>

      <View style={styles.section}>
        <Group p={p}>
          {MORE_APPS.map(listedRow)}
          {otherExtras.map(extraRow)}
          {openRow('Other apps', null)}
        </Group>
        {appMessage && (
          <Text
            accessibilityRole={appMessage.tone === 'error' ? 'alert' : undefined}
            style={[
              styles.message,
              { color: appMessage.tone === 'error' ? p.danger : appMessage.tone === 'ok' ? p.success : p.text },
            ]}>
            {appMessage.text}
          </Text>
        )}
      </View>

      {openApp && CONNECTABLE[openApp] && (
        <AppDetails
          p={p}
          name={openApp}
          dataTitle={CONNECTABLE[openApp].dataTitle}
          provider={CONNECTABLE[openApp].provider}
          account={findAccount(accounts, CONNECTABLE[openApp].provider)}
          busy={busyProvider !== null}
          onReconnect={() => connectApp(openApp, CONNECTABLE[openApp].provider)}
          onDisconnect={() => disconnectApp(openApp, CONNECTABLE[openApp].provider)}
          onClose={() => setOpenApp(null)}
        />
      )}

      <AppSearch
        p={p}
        visible={search !== null}
        category={search?.category ?? null}
        apps={apps}
        onToggleApp={onToggleApp}
        onClose={() => setSearch(null)}
      />
    </View>
  );
}

/** A connected app's options: its latest data (so the owner can see it works), Reconnect and Disconnect. */
function AppDetails({
  p,
  name,
  dataTitle,
  provider,
  account,
  busy,
  onReconnect,
  onDisconnect,
  onClose,
}: {
  p: Palette;
  name: string;
  dataTitle: string;
  provider: Provider;
  account: ConnectedAccount | undefined;
  busy: boolean;
  onReconnect: () => Promise<boolean>;
  onDisconnect: () => void;
  onClose: () => void;
}) {
  const [data, setData] = useState<{ items?: IntegrationItem[]; error?: string; reconnect?: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    loadIntegrationData(provider).then((result) => {
      if (current) setData(result);
    });
    return () => {
      current = false;
    };
  }, [provider, attempt]);

  async function reconnect() {
    if (await onReconnect()) {
      // Show the loading spinner again while the fresh data comes in.
      setData(null);
      setAttempt((n) => n + 1);
    }
  }

  return (
    <Modal visible animationType="slide" presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined} onRequestClose={onClose}>
      <SafeAreaView style={[styles.sheet, { backgroundColor: p.page }]} edges={['top', 'bottom']}>
        <View style={styles.sheetHeader}>
          <Text style={[styles.sheetTitle, { color: p.text }]} numberOfLines={1}>
            {name}
          </Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Done" hitSlop={8}>
            {({ pressed }) => <Text style={[styles.done, { color: p.accent }, pressed && styles.pressed]}>Done</Text>}
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.sheetList}>
          {account ? (
            <View style={styles.connectedRow}>
              <Icon name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }} color={p.success} size={18} />
              <Text style={[styles.rowName, { color: p.text, flex: 1 }]}>Connected: {account.email}</Text>
            </View>
          ) : (
            <Text style={[styles.hint, { color: p.sub }]}>{name} isn&apos;t connected any more.</Text>
          )}

          <Text style={[styles.heading, { color: p.text }]}>{dataTitle}</Text>
          {!data ? (
            <ActivityIndicator color={p.accent} />
          ) : data.error ? (
            <Text accessibilityRole="alert" style={[styles.message, { color: p.danger }]}>
              {data.error}
            </Text>
          ) : data.items && data.items.length > 0 ? (
            <Group p={p}>
              {data.items.map((item) => (
                <View key={item.id} style={[styles.row, { borderTopColor: p.border }]}>
                  <View style={styles.rowText}>
                    <Text style={[styles.rowName, { color: p.text }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={[styles.rowSub, { color: p.sub }]} numberOfLines={1}>
                      {[whenText(item.date), item.detail, item.status].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  {item.amount !== null && <Text style={[styles.amount, { color: p.text }]}>{moneyText(item.amount, item.currency)}</Text>}
                </View>
              ))}
            </Group>
          ) : (
            <Text style={[styles.hint, { color: p.sub }]}>Nothing yet. New {name} payments will show here.</Text>
          )}

          <View style={styles.sheetButtons}>
            <SheetButton p={p} label={busy ? 'Please wait…' : 'Reconnect'} filled={!!data?.reconnect || !account} onPress={reconnect} disabled={busy} />
            {account && <SheetButton p={p} label="Disconnect" danger onPress={onDisconnect} disabled={busy} />}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

/** "3 Nov 2026 · 2:15 PM" in the phone's time. */
function whenText(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${formatShortDate(d)} · ${format12h(`${d.getHours()}:${d.getMinutes()}`)}`;
}

function moneyText(amount: number, currency: string | null) {
  try {
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency: currency ?? 'AUD' }).format(amount);
  } catch {
    return `${currency ?? ''} ${amount.toFixed(2)}`.trim();
  }
}

function SheetButton({
  p,
  label,
  filled,
  danger,
  onPress,
  disabled,
}: {
  p: Palette;
  label: string;
  filled?: boolean;
  danger?: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.sheetButton,
        filled ? { backgroundColor: p.accent } : { backgroundColor: p.raised, borderColor: p.border, borderWidth: 1 },
        (pressed || disabled) && styles.pressed,
      ]}>
      <Text style={[styles.sheetButtonText, { color: filled ? ThemePalette.onPrimary : danger ? p.danger : p.text }]}>{label}</Text>
    </Pressable>
  );
}

/** Full-screen search of well-known apps; anything not listed can be requested by name. */
function AppSearch({
  p,
  visible,
  category,
  apps,
  onToggleApp,
  onClose,
}: {
  p: Palette;
  visible: boolean;
  category: AppCategory | null;
  apps: ChosenApp[];
  onToggleApp: (app: ChosenApp) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined}
      onRequestClose={onClose}>
      {/* Mounted only while open, so it starts fresh each time. */}
      {visible && <AppSearchContent p={p} category={category} apps={apps} onToggleApp={onToggleApp} onClose={onClose} />}
    </Modal>
  );
}

function AppSearchContent({
  p,
  category: startCategory,
  apps,
  onToggleApp,
  onClose,
}: {
  p: Palette;
  category: AppCategory | null;
  apps: ChosenApp[];
  onToggleApp: (app: ChosenApp) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(startCategory);
  const q = query.trim().toLowerCase();

  // Well-known apps, plus any the owner typed in themselves.
  const custom: CatalogApp[] = apps
    .filter((a) => !findCatalogApp(a.name))
    .map((a) => ({ name: a.name, category: a.category }));
  const results = [...APP_CATALOG, ...custom].filter(
    (a) => (!category || a.category === category) && (!q || a.name.toLowerCase().includes(q)),
  );

  const toggle = (app: CatalogApp) =>
    onToggleApp({ name: app.name, category: app.category, status: isListed(app.name) ? 'added' : 'requested' });

  return (
    <SafeAreaView style={[styles.sheet, { backgroundColor: p.page }]} edges={['top', 'bottom']}>
      <View style={styles.sheetHeader}>
        <Text style={[styles.sheetTitle, { color: p.text }]} numberOfLines={1}>
          {category === 'payments' ? 'Payment & accounting apps' : 'Other apps'}
        </Text>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Done" hitSlop={8}>
          {({ pressed }) => <Text style={[styles.done, { color: p.accent }, pressed && styles.pressed]}>Done</Text>}
        </Pressable>
      </View>

      <View style={[styles.search, { backgroundColor: p.raised, borderColor: p.border }]}>
        <Icon name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} color={p.sub} size={14} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search apps"
          placeholderTextColor={p.sub}
          autoFocus
          maxLength={80}
          autoCorrect={false}
          style={[styles.searchInput, { color: p.text }]}
          accessibilityLabel="Search apps"
        />
      </View>

      {category && (
        <Pressable
          onPress={() => setCategory(null)}
          accessibilityRole="button"
          accessibilityLabel={`Showing ${CATEGORY_LABEL[category]} only. Show all apps.`}
          style={({ pressed }) => [styles.chip, { backgroundColor: p.accentSoft }, pressed && styles.pressed]}>
          <Text style={[styles.chipText, { color: p.accent }]}>{CATEGORY_LABEL[category]}</Text>
          <Icon name={{ ios: 'xmark', android: 'close', web: 'close' }} color={p.accent} size={10} />
        </Pressable>
      )}

      <ScrollView contentContainerStyle={styles.sheetList} keyboardShouldPersistTaps="handled">
        {results.length > 0 ? (
          <Group p={p}>
            {results.map((app) => {
              const chosen = findChosen(apps, app.name);
              return (
                <AppRow
                  key={app.name}
                  p={p}
                  logo={logoFor(app.name)}
                  name={app.name}
                  sub={CATEGORY_LABEL[app.category]}
                  onPress={() => toggle(app)}
                  accessibilityLabel={`${app.name}, ${chosen ? `${STATUS_TEXT[chosen.status]}. Tap to remove.` : 'tap to add.'}`}
                  right={chosen ? <StatusPill p={p} text={STATUS_TEXT[chosen.status]} /> : <AddLabel p={p} />}
                />
              );
            })}
          </Group>
        ) : (
          <View style={styles.empty}>
            <Text style={[styles.hint, { color: p.sub }]}>No apps match “{query.trim()}”.</Text>
            {q.length > 0 && (
              <Pressable
                onPress={() => onToggleApp({ name: query.trim(), category: category ?? 'other', status: 'requested' })}
                accessibilityRole="button"
                style={({ pressed }) => [styles.requestButton, { backgroundColor: p.accent }, pressed && styles.pressed]}>
                <Text style={styles.requestText} numberOfLines={1}>
                  Request “{query.trim()}”
                </Text>
              </Pressable>
            )}
          </View>
        )}
        <Text style={[styles.note, { color: p.sub }]}>
          These apps can&apos;t connect yet. Adding one tells us which connections to build first.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Group({ p, children }: { p: Palette; children: ReactNode }) {
  return <View style={[styles.group, { backgroundColor: p.card, borderColor: p.border }]}>{children}</View>;
}

function AppRow({
  p,
  logo,
  name,
  sub,
  subColor,
  right,
  onPress,
  accessibilityLabel,
  accessibilityRole = 'button',
  selected,
}: {
  p: Palette;
  logo: Logo;
  name: string;
  sub?: string;
  subColor?: string;
  right: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'radio';
  selected?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? accessibilityRole : undefined}
      accessibilityState={selected !== undefined ? { selected } : undefined}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.row, { borderTopColor: p.border }, pressed && { backgroundColor: p.raised }]}>
      <LogoTile p={p} logo={logo} />
      <View style={styles.rowText}>
        <Text style={[styles.rowName, { color: p.text }]} numberOfLines={1}>
          {name}
        </Text>
        {sub && <Text style={[styles.rowSub, { color: subColor ?? p.sub }]}>{sub}</Text>}
      </View>
      {right}
    </Pressable>
  );
}

function LogoTile({ p, logo }: { p: Palette; logo: Logo }) {
  if ('brand' in logo) {
    const tile = BrandTileColors[logo.brand];
    return (
      <View style={[styles.logo, { backgroundColor: tile ?? ThemePalette.card }, !tile && { borderWidth: 1, borderColor: p.border }]}>
        <SvgXml xml={BrandLogos[logo.brand]} width={tile ? 20 : 22} height={tile ? 20 : 22} />
      </View>
    );
  }
  if ('symbol' in logo) {
    return (
      <View style={[styles.logo, { backgroundColor: logo.tile }]}>
        <Icon name={logo.symbol} color={ThemePalette.onPrimary} size={18} />
      </View>
    );
  }
  return (
    <View style={[styles.logo, { backgroundColor: p.accentSoft }]}>
      <Text style={[styles.letter, { color: p.accent }]}>{logo.letter}</Text>
    </View>
  );
}

function StatusPill({ p, text }: { p: Palette; text: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: p.raised }]}>
      <Text style={[styles.pillText, { color: p.sub }]}>{text}</Text>
    </View>
  );
}

function SmallButton({
  p,
  label,
  filled,
  onPress,
  accessibilityLabel,
  disabled,
}: {
  p: Palette;
  label: string;
  filled?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      hitSlop={6}
      style={({ pressed }) => [
        styles.smallButton,
        filled ? { backgroundColor: p.accent } : { backgroundColor: p.raised, borderColor: p.border, borderWidth: 1 },
        (pressed || disabled) && styles.pressed,
      ]}>
      <Text style={[styles.smallButtonText, { color: filled ? ThemePalette.onPrimary : p.text }]}>{label}</Text>
    </Pressable>
  );
}

function AddLabel({ p }: { p: Palette }) {
  return <Text style={[styles.add, { color: p.accent }]}>+ Add</Text>;
}

function ConnectedLabel({ p }: { p: Palette }) {
  return (
    <View style={styles.rightRow}>
      <Icon name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }} color={p.success} size={16} />
      <Text style={[styles.add, { color: p.success }]}>Connected</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 20,
  },
  section: {
    gap: 8,
  },
  heading: {
    fontSize: 17,
    fontWeight: '700',
  },
  group: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: -StyleSheet.hairlineWidth,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowName: {
    fontSize: 15,
    fontWeight: '600',
  },
  rowSub: {
    fontSize: 12,
  },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: {
    fontSize: 16,
    fontWeight: '700',
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
  },
  rightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  remove: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  add: {
    fontSize: 14,
    fontWeight: '700',
  },
  smallButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  smallButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
  message: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  hint: {
    fontSize: 13,
    lineHeight: 18,
  },
  note: {
    fontSize: 13,
    lineHeight: 18,
  },
  pressed: {
    opacity: 0.7,
  },
  connectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  amount: {
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  sheetButtons: {
    gap: 10,
  },
  sheetButton: {
    alignItems: 'center',
    paddingVertical: 13,
    borderRadius: 12,
  },
  sheetButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  sheet: {
    flex: 1,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  sheetTitle: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
  },
  done: {
    fontSize: 16,
    fontWeight: '700',
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    paddingHorizontal: 12,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginHorizontal: 20,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  sheetList: {
    padding: 20,
    gap: 16,
  },
  empty: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
  },
  requestButton: {
    maxWidth: '100%',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
  },
  requestText: {
    color: ThemePalette.onPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
});
