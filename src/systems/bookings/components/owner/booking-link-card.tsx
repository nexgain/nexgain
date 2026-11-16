import { useMemo, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { Linking, Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import QRCode from 'qrcode';
import Svg, { Path, Rect } from 'react-native-svg';

import { Button, Card, OwnerIcons } from '@/systems/bookings/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { useBusiness } from '@/data/business';
import { bookingLink, useBookingSettings, useBookingsLoad } from '@/systems/bookings/data/bookings';

/** A QR code for some text, drawn as one shape (dark squares on white). */
export function QrCode({ value, size = 168 }: { value: string; size?: number }) {
  const qr = useMemo(() => {
    const { modules } = QRCode.create(value, { errorCorrectionLevel: 'M' });
    let d = '';
    for (let row = 0; row < modules.size; row++) {
      for (let col = 0; col < modules.size; col++) if (modules.get(row, col)) d += `M${col + 4} ${row + 4}h1v1h-1z`;
    }
    return { d, cells: modules.size + 8 };
  }, [value]);
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${qr.cells} ${qr.cells}`} accessibilityLabel="QR code for your booking page">
      <Rect width={qr.cells} height={qr.cells} fill="#ffffff" />
      <Path d={qr.d} fill="#000000" />
    </Svg>
  );
}

/**
 * "Share my booking link": the business's public booking page address with
 * Copy, Share and a QR code (for the shop window, business cards or flyers).
 * Customers book there without the app.
 */
export function BookingLinkCard({ showSettingsLink = false }: { showSettingsLink?: boolean }) {
  const business = useBusiness();
  const settings = useBookingSettings();
  const load = useBookingsLoad();
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);

  if (!settings) {
    return (
      <Card title="Share My Booking Link" icon={OwnerIcons.link}>
        <Text style={styles.muted}>
          {load === 'loading' || load === 'idle'
            ? 'Loading your booking link…'
            : 'Your booking page isn’t set up yet. Check your internet connection, or ask NexGain support to run the bookings setup.'}
        </Text>
      </Card>
    );
  }
  const link = bookingLink(settings.slug);

  async function copy() {
    setMessage(null);
    try {
      await Clipboard.setStringAsync(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setMessage('Couldn’t copy. Press and hold the link to copy it.');
    }
  }

  async function share() {
    setMessage(null);
    const text = `Book with ${business?.businessName ?? 'us'} online: ${link}`;
    try {
      // On a computer without a share menu, copy instead.
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && !navigator.share) {
        await Clipboard.setStringAsync(text);
        setMessage('Copied the link and a short message, ready to paste.');
        return;
      }
      await Share.share(Platform.OS === 'ios' ? { message: `Book with ${business?.businessName ?? 'us'} online`, url: link } : { message: text });
    } catch {
      // Closed the share menu: nothing to do.
    }
  }

  return (
    <Card title="Share My Booking Link" icon={OwnerIcons.link}>
      <Text style={styles.muted}>
        Customers book here without downloading anything. Put it in your Instagram bio, on your website, or in messages.
      </Text>
      <Pressable onPress={() => Linking.openURL(link)} accessibilityRole="link" accessibilityLabel="Open your booking page">
        <Text style={styles.link} selectable>
          {link}
        </Text>
      </Pressable>
      {!settings.accepting && (
        <Text style={styles.warning}>Online bookings are turned off, so this page says you aren’t taking bookings.</Text>
      )}
      <View style={styles.row}>
        <View style={styles.flex}>
          <Button label={copied ? 'Copied!' : 'Copy link'} variant="secondary" icon={OwnerIcons.copy} onPress={copy} fill />
        </View>
        <View style={styles.flex}>
          <Button label="Share" icon={OwnerIcons.share} onPress={share} fill />
        </View>
      </View>
      <Pressable onPress={() => setShowQr((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: showQr }} hitSlop={6}>
        <Text style={styles.toggle}>{showQr ? 'Hide QR code' : 'Show QR code'}</Text>
      </Pressable>
      {showQr && (
        <View style={styles.qrBox}>
          <QrCode value={link} />
          <Text style={styles.muted}>Customers scan this with their phone camera to open your booking page. Screenshot it to print.</Text>
        </View>
      )}
      {message && (
        <Text style={styles.muted} accessibilityRole="alert">
          {message}
        </Text>
      )}
      {showSettingsLink && (
        <Pressable onPress={() => router.navigate('/bookings/booking-settings')} accessibilityRole="link" hitSlop={6}>
          <Text style={styles.toggle}>Bookings settings</Text>
        </Pressable>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  muted: { color: C.textSecondary, fontSize: 14, lineHeight: 20 },
  warning: { color: C.warning, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  link: { color: C.accent, fontSize: 15, fontWeight: '600', paddingVertical: Spacing.one },
  row: { flexDirection: 'row', gap: Spacing.two },
  flex: { flex: 1 },
  toggle: { color: C.accent, fontSize: 15, fontWeight: '600' },
  qrBox: { alignItems: 'center', gap: Spacing.two, padding: Spacing.three, borderRadius: Radius.medium, backgroundColor: C.background },
});
