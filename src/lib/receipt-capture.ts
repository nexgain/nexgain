// Taking or picking a receipt: a photo (camera or photo library) or a PDF.
// Photos are shrunk to at most 1600 pixels on the long side and saved as JPEG,
// so they upload quickly and are still sharp enough to read.
// After the AI has read a photo, tidyReceiptPhoto() trims it to the receipt and
// turns it upright.
import * as DocumentPicker from 'expo-document-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Platform } from 'react-native';

export type ReceiptFile = {
  uri: string;
  kind: 'image' | 'pdf';
  mimeType: 'image/jpeg' | 'application/pdf';
};

export type ReceiptSource = 'camera' | 'library' | 'pdf';

const LONG_EDGE = 1600;
const MAX_PDF_BYTES = 10 * 1024 * 1024;

export class CaptureError extends Error {}

async function shrink(uri: string): Promise<ReceiptFile> {
  const image = await ImageManipulator.manipulate(uri, { maxWidth: LONG_EDGE, maxHeight: LONG_EDGE }).renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.7 });
  return { uri: saved.uri, kind: 'image', mimeType: 'image/jpeg' };
}

/** Opens the camera, photo library or file picker. Returns null if the owner cancelled. */
export async function captureReceipt(source: ReceiptSource): Promise<ReceiptFile | null> {
  if (source === 'pdf') {
    const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
    if (result.canceled) return null;
    const file = result.assets[0];
    if (file.mimeType?.startsWith('image/')) return shrink(file.uri);
    if ((file.size ?? 0) > MAX_PDF_BYTES) throw new CaptureError('That PDF is larger than 10MB. Please choose a smaller one.');
    return { uri: file.uri, kind: 'pdf', mimeType: 'application/pdf' };
  }

  // Android's editor lets the owner crop freely and rotate. iPhone's only crops to a
  // square (which would cut a receipt off), so there the AI trims the photo afterwards.
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, allowsEditing: Platform.OS === 'android' };
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new CaptureError('Camera access is turned off. Turn it on in Settings, or choose a photo instead.');
    const result = await ImagePicker.launchCameraAsync(options);
    return result.canceled ? null : shrink(result.assets[0].uri);
  }
  const result = await ImagePicker.launchImageLibraryAsync(options);
  return result.canceled ? null : shrink(result.assets[0].uri);
}

/** Asks where the receipt is: Take Photo, Choose Photo or Choose PDF. (Web: a file picker.) */
export function chooseReceiptSource(): Promise<ReceiptSource | null> {
  if (Platform.OS === 'web') return Promise.resolve('pdf');
  return new Promise((resolve) =>
    Alert.alert(
      'Add receipt',
      undefined,
      [
        { text: 'Take Photo', onPress: () => resolve('camera') },
        { text: 'Choose Photo', onPress: () => resolve('library') },
        { text: 'Choose PDF', onPress: () => resolve('pdf') },
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    ),
  );
}

export type Crop = { left: number; top: number; right: number; bottom: number };

/**
 * Trims a receipt photo to the edges the AI found (with a little margin) and
 * turns it upright. Returns null if there's nothing to change.
 */
export async function tidyReceiptPhoto(uri: string, crop: Crop | null, rotation: number): Promise<ReceiptFile | null> {
  if (!crop && !rotation) return null;
  const context = ImageManipulator.manipulate(uri);
  if (crop) {
    const image = await ImageManipulator.manipulate(uri).renderAsync();
    const margin = 0.03;
    const left = Math.max(0, crop.left - margin);
    const top = Math.max(0, crop.top - margin);
    const right = Math.min(1, crop.right + margin);
    const bottom = Math.min(1, crop.bottom + margin);
    context.crop({
      originX: Math.round(left * image.width),
      originY: Math.round(top * image.height),
      width: Math.round((right - left) * image.width),
      height: Math.round((bottom - top) * image.height),
    });
  }
  if (rotation) context.rotate(rotation);
  const saved = await (await context.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  return { uri: saved.uri, kind: 'image', mimeType: 'image/jpeg' };
}
