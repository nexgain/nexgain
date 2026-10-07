// Turns an HTML page into a PDF with a clear file name and opens the phone's
// share sheet (Save to Files, email, print...). On the web, opens the browser's
// print dialog instead, where it can be saved as a PDF.
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

/** A4 in PDF points (1/72 inch). */
const A4 = { width: 595, height: 842 };

/**
 * Web: prints the document itself (not the app screen) from a hidden frame.
 * Returns the frame's document so it can be checked in tests.
 */
function printHtmlOnWeb(html: string, title: string) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.dataset.pdf = title;
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(html.replace('<head>', `<head><title>${escapeHtml(title.replace(/\.pdf$/i, ''))}</title>`));
  doc.close();
  // Give images (e.g. the logo) a moment to load, then print; remove the frame afterwards.
  setTimeout(() => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 60_000);
  }, 300);
}

export async function sharePdf(html: string, fileName: string, { landscape = false } = {}) {
  if (Platform.OS === 'web') {
    printHtmlOnWeb(html, fileName);
    return;
  }
  const size = landscape ? { width: A4.height, height: A4.width } : A4;
  const { uri } = await Print.printToFileAsync({ html, ...size });

  // printToFileAsync picks a random name; give it a readable one before sharing.
  const named = new File(Paths.cache, fileName.replace(/[\\/:*?"<>|]+/g, '-'));
  await new File(uri).move(named, { overwrite: true });

  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(named.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: fileName });
}

export function escapeHtml(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
