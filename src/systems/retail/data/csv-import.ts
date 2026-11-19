// NexGain Retail: bulk import products from a CSV file (saved from Excel,
// Google Sheets or Numbers). One row per variant: rows with the same product
// name (and brand) become one product with several sizes / colours.
//
// Columns are matched by their heading, in any order and with any capitals:
//   Name (required), Category, Brand, Description, Supplier, Cost price,
//   Sell price, GST included, Size, Colour, SKU, Barcode, Stock, Low stock alert.

export type ImportedVariant = { size: string; colour: string; sku: string; barcode: string; stock: number };

export type ImportedProduct = {
  name: string;
  category: string;
  brand: string;
  description: string;
  supplier: string;
  costPrice: number | null;
  sellPrice: number | null;
  gstIncluded: boolean;
  lowStockLevel: number;
  variants: ImportedVariant[];
};

export type ImportResult = { products: ImportedProduct[]; problems: string[] };

/** A ready-to-fill example file (the headings and two products). */
export const CSV_TEMPLATE = [
  'Name,Category,Brand,Description,Supplier,Cost price,Sell price,GST included,Size,Colour,SKU,Barcode,Stock,Low stock alert',
  'Classic Tee,Tops,Your Brand,100% cotton,ABC Wholesale,12.50,39.95,Yes,S,Black,TEE-S-BLK,,10,3',
  'Classic Tee,Tops,Your Brand,100% cotton,ABC Wholesale,12.50,39.95,Yes,M,Black,TEE-M-BLK,,12,3',
  'Hair Gel 150ml,Products,Your Brand,,,4.20,19.00,Yes,,,GEL-150,9312345678901,40,10',
].join('\n');

/** Splits CSV text into rows of cells (handles quotes, commas inside quotes and Windows line endings). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

type Field = 'name' | 'category' | 'brand' | 'description' | 'supplier' | 'cost' | 'sell' | 'gst' | 'size' | 'colour' | 'sku' | 'barcode' | 'stock' | 'low';

/** Headings each column can have (lower case, spaces and symbols removed). */
const HEADINGS: Record<Field, string[]> = {
  name: ['name', 'productname', 'product', 'item', 'title'],
  category: ['category', 'type', 'group'],
  brand: ['brand', 'label', 'vendor'],
  description: ['description', 'details', 'notes'],
  supplier: ['supplier', 'wholesaler'],
  cost: ['costprice', 'cost', 'buyprice', 'wholesaleprice', 'unitcost'],
  sell: ['sellprice', 'price', 'retailprice', 'saleprice', 'rrp'],
  gst: ['gstincluded', 'gst', 'incgst', 'includesgst', 'taxincluded'],
  size: ['size'],
  colour: ['colour', 'color'],
  sku: ['sku', 'code', 'productcode', 'itemcode'],
  barcode: ['barcode', 'ean', 'upc', 'gtin'],
  stock: ['stock', 'quantity', 'qty', 'onhand', 'stockonhand', 'startingstock'],
  low: ['lowstockalert', 'lowstock', 'alertlevel', 'reorderlevel', 'reorderpoint', 'minstock'],
};

const clean = (h: string) => h.toLowerCase().replace(/[^a-z]/g, '');

/** "$1,234.50" -> 1234.5; blank -> null; not a number -> NaN. */
function money(text: string): number | null {
  const t = text.replace(/[$£€,\s]/g, '');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

const yes = (text: string) => !/^(n|no|false|0|ex|excl|exclusive)$/i.test(text.trim());

/**
 * Turns the file's rows into products. Rows with problems are skipped and
 * listed (with their row number in the file), so the owner can fix them.
 */
export function importProducts(rows: string[][]): ImportResult {
  const problems: string[] = [];
  if (rows.length < 2) return { products: [], problems: ['The file needs a heading row and at least one product row.'] };
  const headings = rows[0].map(clean);
  const col: Partial<Record<Field, number>> = {};
  (Object.keys(HEADINGS) as Field[]).forEach((field) => {
    const i = headings.findIndex((h) => HEADINGS[field].includes(h));
    if (i >= 0) col[field] = i;
  });
  if (col.name === undefined) return { products: [], problems: ['There’s no Name column. The first row needs headings, e.g. Name, Size, Colour, Stock.'] };

  const byKey = new Map<string, ImportedProduct>();
  const seenOptions = new Set<string>();
  rows.slice(1).forEach((row, i) => {
    const at = (f: Field) => (col[f] === undefined ? '' : (row[col[f]!] ?? '').trim());
    const line = i + 2;
    const name = at('name');
    if (!name) return problems.push(`Row ${line}: no product name, so it was skipped.`);
    const cost = money(at('cost'));
    const sell = money(at('sell'));
    if (Number.isNaN(cost) || Number.isNaN(sell)) return problems.push(`Row ${line} (${name}): a price isn’t a number, so it was skipped.`);
    const stockText = at('stock');
    const stock = stockText === '' ? 0 : Number(stockText);
    if (!Number.isInteger(stock) || stock < 0) return problems.push(`Row ${line} (${name}): stock must be a whole number, so it was skipped.`);
    const lowText = at('low');
    const low = lowText === '' ? 5 : Number(lowText);
    const barcode = at('barcode');
    if (barcode && !/^[ -~]{1,64}$/.test(barcode)) return problems.push(`Row ${line} (${name}): the barcode has characters a barcode can’t use.`);

    const brand = at('brand');
    const key = `${name.toLowerCase()}|${brand.toLowerCase()}`;
    const size = at('size');
    const colour = at('colour');
    const optionKey = `${key}|${size.toLowerCase()}|${colour.toLowerCase()}`;
    if (seenOptions.has(optionKey)) return problems.push(`Row ${line} (${name}): the same size and colour is already in the file, so it was skipped.`);
    seenOptions.add(optionKey);

    let product = byKey.get(key);
    if (!product) {
      product = {
        name: name.slice(0, 120),
        category: at('category'),
        brand,
        description: at('description'),
        supplier: at('supplier'),
        costPrice: cost,
        sellPrice: sell,
        gstIncluded: at('gst') === '' ? true : yes(at('gst')),
        lowStockLevel: Number.isInteger(low) && low >= 0 ? low : 5,
        variants: [],
      };
      byKey.set(key, product);
    }
    product.variants.push({ size, colour, sku: at('sku'), barcode, stock });
  });

  // The same barcode twice in the file: keep the first, make the others blank (NexGain makes new ones).
  const codes = new Set<string>();
  for (const p of byKey.values()) {
    for (const v of p.variants) {
      if (!v.barcode) continue;
      if (codes.has(v.barcode)) {
        problems.push(`${p.name}: barcode ${v.barcode} is used twice in the file, so NexGain will make a new one for the second.`);
        v.barcode = '';
      } else codes.add(v.barcode);
    }
  }
  return { products: [...byKey.values()], problems };
}
