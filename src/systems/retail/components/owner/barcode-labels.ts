// NexGain Retail: printable barcode labels for swing tags and shelves. A PDF
// (A4, 21 labels a page: 3 across, 7 down, the Avery L7160 / J8160 size) with
// each label's product name, size, colour, price and its Code 128 barcode.
// Shared or printed from the phone's share sheet.
import { escapeHtml, sharePdf } from '@/lib/share-pdf';
import { code128Svg } from '@/systems/retail/data/code128';

export type Label = { name: string; option: string; price: string; barcode: string };

export const LABELS_PER_PAGE = 21;

/** The labels as a printable A4 page (or pages). */
export function labelsHtml(labels: Label[]) {
  const cells = labels
    .map(
      (l) => `<div class="label">
  <div class="name">${escapeHtml(l.name)}</div>
  ${l.option ? `<div class="option">${escapeHtml(l.option)}</div>` : ''}
  ${l.price ? `<div class="price">${escapeHtml(l.price)}</div>` : ''}
  <div class="bars">${code128Svg(l.barcode, { height: 60 })}</div>
  <div class="code">${escapeHtml(l.barcode)}</div>
</div>`,
    )
    .join('\n');
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 15.1mm 7.2mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, Helvetica, Arial, sans-serif; color: #000; }
  .sheet { display: grid; grid-template-columns: repeat(3, 63.5mm); grid-auto-rows: 38.1mm; column-gap: 2.5mm; }
  .label { padding: 2.5mm 3mm; overflow: hidden; display: flex; flex-direction: column; align-items: center; text-align: center; page-break-inside: avoid; break-inside: avoid; }
  .name { font-size: 9pt; font-weight: 700; line-height: 1.15; max-height: 2.3em; overflow: hidden; }
  .option { font-size: 8pt; line-height: 1.2; }
  .price { font-size: 11pt; font-weight: 700; line-height: 1.2; }
  .bars { width: 100%; height: 11mm; margin-top: auto; }
  .bars svg { width: 100%; height: 100%; display: block; }
  .code { font-family: Menlo, Consolas, monospace; font-size: 7pt; letter-spacing: 0.5px; }
</style></head><body><div class="sheet">
${cells}
</div></body></html>`;
}

/** Makes the labels PDF and opens the share sheet (Save, Print, AirDrop, email...). */
export function shareLabels(labels: Label[], fileName = 'Barcode labels.pdf') {
  return sharePdf(labelsHtml(labels), fileName);
}
