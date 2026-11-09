// Pieces shared by the receipt screens: the receipt status icon, the
// "reading your receipt" note, the photo (tap to open full screen and pinch to
// zoom), and the Add receipt flow.
import { useEffect, useState } from 'react';
import { router, type Href } from 'expo-router';
import { Image } from 'expo-image';
import { ActivityIndicator, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  GestureDetector,
  GestureHandlerRootView,
  usePanGesture,
  usePinchGesture,
  useSimultaneousGestures,
  useTapGesture,
} from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, OwnerIcons } from '@/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { addReceipt, receiptFileUrl, type Receipt, type ReceiptLink } from '@/data/receipts';
import { CaptureError, captureReceipt, chooseReceiptSource } from '@/lib/receipt-capture';

export const ReceiptIcons = {
  camera: { ios: 'camera.fill', android: 'photo_camera', web: 'photo_camera' },
  attached: { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' },
  missing: { ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' },
  receipt: OwnerIcons.receipt,
} as const;

/** Green tick: receipt attached. Orange warning: receipt needed (over $82.50) but missing. */
export function ReceiptStatusIcon({ status }: { status: 'attached' | 'missing' | 'none' }) {
  if (status === 'none') return null;
  const attached = status === 'attached';
  return (
    <View accessible accessibilityLabel={attached ? 'Receipt attached' : 'Receipt missing'}>
      <Icon name={attached ? ReceiptIcons.attached : ReceiptIcons.missing} color={attached ? C.success : C.warning} size={14} />
    </View>
  );
}

/** Friendly note while the AI reads a receipt. */
export function ReadingNote() {
  return (
    <View style={styles.reading}>
      <ActivityIndicator color={C.accent} />
      <View style={styles.flex}>
        <Text style={styles.readingTitle}>Reading your receipt…</Text>
        <Text style={styles.muted}>Finding the supplier, date, total and GST. This takes a few seconds.</Text>
      </View>
    </View>
  );
}

/** A private link to the receipt file (they expire, so one is made each time it's shown). */
export function useReceiptUrl(path: string | undefined) {
  // Kept with the path it belongs to, so a replaced receipt never shows the old photo.
  const [loaded, setLoaded] = useState<{ path: string; url: string | null; failed: boolean } | null>(null);
  useEffect(() => {
    let current = true;
    if (path) {
      receiptFileUrl(path)
        .then((url) => current && setLoaded({ path, url, failed: false }))
        .catch(() => current && setLoaded({ path, url: null, failed: true }));
    }
    return () => {
      current = false;
    };
  }, [path]);
  const mine = loaded && loaded.path === path ? loaded : null;
  return { url: mine?.url ?? null, failed: mine?.failed ?? false };
}

/** The receipt photo (tap for full screen with pinch to zoom), or a button to open the PDF. */
export function ReceiptPreview({ receipt }: { receipt: Receipt }) {
  const { url, failed } = useReceiptUrl(receipt.filePath);
  const [fullScreen, setFullScreen] = useState(false);

  if (failed) return <Text style={styles.muted}>Couldn’t load the receipt. Check your internet connection.</Text>;
  if (!url) {
    return (
      <View style={[styles.preview, styles.center]}>
        <ActivityIndicator color={C.accent} />
      </View>
    );
  }
  if (receipt.fileType === 'pdf') {
    return (
      <Pressable
        onPress={() => Linking.openURL(url)}
        accessibilityRole="button"
        accessibilityLabel="Open the receipt PDF"
        style={({ pressed }) => [styles.pdf, pressed && styles.pressed]}>
        <Icon name={OwnerIcons.receipt} color={C.accent} size={28} />
        <Text style={styles.pdfText}>Open PDF</Text>
      </Pressable>
    );
  }
  return (
    <>
      <Pressable onPress={() => setFullScreen(true)} accessibilityRole="imagebutton" accessibilityLabel="Receipt photo. Tap to zoom.">
        <Image source={{ uri: url }} style={styles.preview} contentFit="contain" transition={150} />
        <Text style={styles.hint}>Tap the photo to zoom</Text>
      </Pressable>
      {fullScreen && <ZoomViewer uri={url} onClose={() => setFullScreen(false)} />}
    </>
  );
}

const clamp = (value: number, min: number, max: number) => {
  'worklet';
  return Math.min(max, Math.max(min, value));
};

/** Full-screen photo: pinch to zoom, drag to move, double-tap to zoom in or out. */
function ZoomViewer({ uri, onClose }: { uri: string; onClose: () => void }) {
  const scale = useSharedValue(1);
  const startScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  const pinch = usePinchGesture({
    onActivate: () => {
      'worklet';
      startScale.value = scale.value;
    },
    onUpdate: (e) => {
      'worklet';
      scale.value = clamp(startScale.value * e.scale, 1, 6);
    },
    onDeactivate: () => {
      'worklet';
      if (scale.value <= 1.02) {
        scale.value = withTiming(1);
        x.value = withTiming(0);
        y.value = withTiming(0);
      }
    },
  });
  const pan = usePanGesture({
    onActivate: () => {
      'worklet';
      startX.value = x.value;
      startY.value = y.value;
    },
    onUpdate: (e) => {
      'worklet';
      if (scale.value <= 1) return;
      x.value = startX.value + e.translationX;
      y.value = startY.value + e.translationY;
    },
  });
  const doubleTap = useTapGesture({
    numberOfTaps: 2,
    onActivate: () => {
      'worklet';
      const zoomIn = scale.value < 1.5;
      scale.value = withTiming(zoomIn ? 2.5 : 1);
      if (!zoomIn) {
        x.value = withTiming(0);
        y.value = withTiming(0);
      }
    },
  });
  const gesture = useSimultaneousGestures(pinch, pan, doubleTap);

  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
  }));

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} supportedOrientations={['portrait', 'landscape']}>
      <GestureHandlerRootView style={styles.viewer}>
        <SafeAreaView style={styles.viewer} edges={['top', 'bottom']}>
          <View style={styles.viewerBar}>
            <Text style={styles.muted}>Pinch to zoom · double-tap</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} style={styles.close}>
              <Text style={styles.closeText}>Done</Text>
            </Pressable>
          </View>
          <GestureDetector gesture={gesture}>
            <Animated.View style={[styles.viewer, imageStyle]}>
              <Image source={{ uri }} style={styles.viewer} contentFit="contain" />
            </Animated.View>
          </GestureDetector>
        </SafeAreaView>
      </GestureHandlerRootView>
    </Modal>
  );
}

/**
 * The Add receipt flow: asks Take Photo / Choose Photo / Choose PDF, saves the
 * receipt (linked to `link` if given) and opens its page, where the AI's
 * reading appears.
 */
export function useAddReceipt() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(link?: ReceiptLink) {
    setError(null);
    const source = await chooseReceiptSource();
    if (!source) return;
    try {
      const file = await captureReceipt(source);
      if (!file) return;
      setBusy(true);
      const id = await addReceipt(file, link);
      router.push({ pathname: '/receipt/[id]', params: { id } } as Href);
    } catch (e) {
      setError(e instanceof CaptureError ? e.message : 'Couldn’t save the receipt. Check your internet connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return { add, busy, error };
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  muted: {
    color: C.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  reading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    padding: Spacing.three - 4,
    borderRadius: Radius.medium,
    backgroundColor: 'rgba(79, 140, 255, 0.10)',
  },
  readingTitle: {
    color: C.text,
    fontSize: 15,
    fontWeight: '700',
  },
  preview: {
    width: '100%',
    height: 320,
    borderRadius: Radius.medium,
    backgroundColor: C.surfaceRaised,
  },
  hint: {
    color: C.textSecondary,
    fontSize: 12,
    textAlign: 'center',
    marginTop: Spacing.one,
  },
  pdf: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 140,
    borderRadius: Radius.medium,
    backgroundColor: C.surfaceRaised,
  },
  pdfText: {
    color: C.accent,
    fontSize: 15,
    fontWeight: '700',
  },
  viewer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  viewerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    backgroundColor: '#000000',
    zIndex: 1,
  },
  close: {
    minHeight: 44,
    justifyContent: 'center',
  },
  closeText: {
    color: C.accent,
    fontSize: 16,
    fontWeight: '700',
  },
});
