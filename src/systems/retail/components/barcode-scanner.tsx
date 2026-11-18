// NexGain Retail: scan a barcode with the phone's camera (expo-camera), or type
// it in when the camera won't read it. Used by the owner (Add Product, Receive
// a Delivery, Stocktake, finding a product) and by staff (the Scanner tab).
// Reads supplier barcodes (EAN, UPC) and NexGain's own Code 128 labels.
import { CameraView, useCameraPermissions, type BarcodeType } from 'expo-camera';
import { useRef, useState } from 'react';
import { Linking, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';

/** The kinds of barcode on products and shop labels. */
export const PRODUCT_BARCODES: BarcodeType[] = ['code128', 'ean13', 'ean8', 'upc_a', 'upc_e', 'code39', 'code93', 'itf14', 'qr'];

/** The same barcode again within this long is ignored (cameras read it many times a second). */
const REPEAT_MS = 2000;

export function BarcodeScanner({
  visible,
  title = 'Scan a barcode',
  hint = 'Point the camera at the barcode.',
  onScan,
  onClose,
  keepOpen = false,
  lastScan,
}: {
  visible: boolean;
  title?: string;
  hint?: string;
  /** Called with the barcode's text (scanned or typed). */
  onScan: (code: string) => void;
  onClose: () => void;
  /** Stay open after each scan (e.g. scanning a whole delivery). */
  keepOpen?: boolean;
  /** Shown under the camera, e.g. "Added: Black Tee M (3)". */
  lastScan?: string | null;
}) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [typed, setTyped] = useState('');
  const last = useRef<{ code: string; at: number } | null>(null);

  function handle(code: string) {
    const clean = code.trim();
    if (!clean) return;
    const now = Date.now();
    if (last.current && last.current.code === clean && now - last.current.at < REPEAT_MS) return;
    last.current = { code: clean, at: now };
    onScan(clean);
    if (!keepOpen) onClose();
  }

  function submitTyped() {
    const code = typed.trim();
    if (!code) return;
    setTyped('');
    // Typed codes always count, even if the same one was just scanned.
    last.current = null;
    handle(code);
  }

  const canUseCamera = Platform.OS !== 'web' || typeof navigator !== 'undefined';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close" style={styles.close}>
            <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} tintColor="#fff" size={18} />
          </Pressable>
          <View style={styles.flex}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.hint}>{hint}</Text>
          </View>
        </View>

        <View style={styles.cameraBox}>
          {!permission ? (
            <Text style={styles.message}>Starting the camera…</Text>
          ) : !permission.granted ? (
            <View style={styles.permission}>
              <Text style={styles.message}>NexGain needs your camera to scan barcodes. You can also type the barcode below.</Text>
              {permission.canAskAgain ? (
                <Pressable onPress={requestPermission} accessibilityRole="button" style={styles.button}>
                  <Text style={styles.buttonText}>Allow camera</Text>
                </Pressable>
              ) : (
                <Pressable onPress={() => Linking.openSettings()} accessibilityRole="button" style={styles.button}>
                  <Text style={styles.buttonText}>Open Settings</Text>
                </Pressable>
              )}
            </View>
          ) : canUseCamera && visible ? (
            <>
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: PRODUCT_BARCODES }}
                onBarcodeScanned={(result) => handle(result.data)}
              />
              <View style={styles.frame} pointerEvents="none" />
            </>
          ) : null}
        </View>

        {lastScan ? (
          <Text style={styles.lastScan} accessibilityLiveRegion="polite">
            {lastScan}
          </Text>
        ) : null}

        <View style={styles.typeRow}>
          <TextInput
            value={typed}
            onChangeText={setTyped}
            onSubmitEditing={submitTyped}
            placeholder="Or type the barcode"
            placeholderTextColor="#8a8f98"
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Type the barcode"
            style={styles.input}
          />
          <Pressable onPress={submitTyped} accessibilityRole="button" accessibilityLabel="Find this barcode" style={styles.go}>
            <Text style={styles.buttonText}>Go</Text>
          </Pressable>
        </View>
        {keepOpen && (
          <Pressable onPress={onClose} accessibilityRole="button" style={styles.done}>
            <Text style={styles.buttonText}>Done scanning</Text>
          </Pressable>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0b0d10', gap: 12 },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 8 },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#22262d' },
  title: { color: '#fff', fontSize: 18, fontWeight: '700' },
  hint: { color: '#b4b9c2', fontSize: 13, marginTop: 2 },
  cameraBox: { flex: 1, marginHorizontal: 16, borderRadius: 16, overflow: 'hidden', backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  frame: { width: '78%', height: 150, borderRadius: 14, borderWidth: 3, borderColor: 'rgba(255,255,255,0.85)' },
  permission: { padding: 24, gap: 16, alignItems: 'center' },
  message: { color: '#e5e7eb', fontSize: 15, textAlign: 'center', lineHeight: 21, paddingHorizontal: 24 },
  lastScan: { color: '#86efac', fontSize: 15, fontWeight: '600', textAlign: 'center', paddingHorizontal: 16 },
  typeRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16 },
  input: { flex: 1, minHeight: 48, paddingHorizontal: 14, borderRadius: 12, backgroundColor: '#1b1f25', color: '#fff', fontSize: 16 },
  go: { minWidth: 64, minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2563eb', paddingHorizontal: 16 },
  button: { minHeight: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2563eb', paddingHorizontal: 20 },
  done: { marginHorizontal: 16, minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#16a34a' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
