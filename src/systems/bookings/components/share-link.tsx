// NexGain Bookings: a booking link with Copy, Share and a QR code. Used by the
// owner's business link and each staff member's personal link, and by staff
// for their own link. No card around it, so it fits owner and employee screens.
import { useMemo, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { Linking, Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import QRCode from 'qrcode';
import Svg, { Path, Rect } from 'react-native-svg';

import { Button, OwnerIcons } from '@/systems/bookings/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';

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
    <Svg width={size} height={size} viewBox={`0 0 ${qr.cells} ${qr.cells}`} accessibilityLabel="QR code for the booking page">
      <Rect width={qr.cells} height={qr.cells} fill="#ffffff" />
      <Path d={qr.d} fill="#000000" />
    </Svg>
  );
}

/**
 * The link (tap to open), "Copy booking link", "Share" and "Show QR code".
 * `shareText` is the message that goes with it when shared, e.g. "Book with Sam at Fade Lab".
 */
export function ShareLinkBox({ link, shareText }: { link: string; shareText: string }) {
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);

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
    try {
      // On a computer without a share menu, copy instead.
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && !navigator.share) {
        await Clipboard.setStringAsync(`${shareText}: ${link}`);
        setMessage('Copied the link and a short message, ready to paste.');
        return;
      }
      await Share.share(Platform.OS === 'ios' ? { message: shareText, url: link } : { message: `${shareText}: ${link}` });
    } catch {
      // Closed the share menu: nothing to do.
    }
  }

  return (
    <View style={styles.box}>
      <Pressable onPress={() => Linking.openURL(link)} accessibilityRole="link" accessibilityLabel="Open the booking page">
        <Text style={styles.link} selectable>
          {link}
        </Text>
      </Pressable>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Button label={copied ? 'Copied!' : 'Copy booking link'} variant="secondary" icon={OwnerIcons.copy} onPress={copy} fill />
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
          <Text style={styles.muted}>Customers scan this with their phone camera to open the booking page. Screenshot it to print.</Text>
        </View>
      )}
      {message && (
        <Text style={styles.muted} accessibilityRole="alert">
          {message}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: Spacing.two },
  muted: { color: C.textSecondary, fontSize: 14, lineHeight: 20 },
  link: { color: C.accent, fontSize: 15, fontWeight: '600', paddingVertical: Spacing.one },
  row: { flexDirection: 'row', gap: Spacing.two },
  flex: { flex: 1 },
  toggle: { color: C.accent, fontSize: 15, fontWeight: '600' },
  qrBox: { alignItems: 'center', gap: Spacing.two, padding: Spacing.three, borderRadius: Radius.medium, backgroundColor: C.background },
});
