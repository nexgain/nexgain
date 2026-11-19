// NexGain Retail: the products staff can look up in the Scanner tab. Comes
// from the database's retail_staff_catalogue(), which never includes cost
// prices, margins or suppliers (only the owner sees those).
import { createStore } from '@/data/store';
import { supabase } from '@/lib/supabase';

export type StaffVariant = {
  id: string;
  size: string;
  colour: string;
  sku: string;
  barcode: string;
  /** Store id ('' = no particular store) -> how many. */
  stock: Record<string, number>;
};

export type StaffProduct = {
  id: string;
  name: string;
  sku: string;
  brand: string;
  category: string;
  sellPrice: number | null;
  gstIncluded: boolean;
  lowStockLevel: number;
  /** The first photo's path (shown with a short-lived link). */
  photo: string | null;
  variants: StaffVariant[];
};

export const staffCatalogueStore = createStore<StaffProduct[]>([]);
export const staffCatalogueLoadStore = createStore<'idle' | 'loading' | 'ready' | 'error'>('idle');
export const useStaffCatalogue = () => staffCatalogueStore.use();
export const useStaffCatalogueLoad = () => staffCatalogueLoadStore.use();

/** Loads (or reloads) the products. */
export async function loadStaffCatalogue() {
  staffCatalogueLoadStore.set('loading');
  const { data, error } = await supabase.rpc('retail_staff_catalogue');
  if (error) {
    staffCatalogueLoadStore.set('error');
    return;
  }
  staffCatalogueStore.set(
    ((data ?? []) as StaffProduct[]).map((p) => ({ ...p, sellPrice: p.sellPrice === null ? null : Number(p.sellPrice), variants: p.variants ?? [] })),
  );
  staffCatalogueLoadStore.set('ready');
}

/** How many of a variant are in stock (every store together, or one store). */
export const staffStock = (v: StaffVariant, storeId?: string | null) =>
  storeId === undefined ? Object.values(v.stock).reduce((a, b) => a + b, 0) : (v.stock[storeId ?? ''] ?? 0);

/** The product and variant for a barcode (or SKU). */
export function findStaffBarcode(products: StaffProduct[], code: string) {
  const c = code.trim();
  if (!c) return null;
  for (const product of products) {
    const variant = product.variants.find((v) => v.barcode === c || (v.sku && v.sku.toLowerCase() === c.toLowerCase()));
    if (variant) return { product, variant };
    if (product.sku && product.sku.toLowerCase() === c.toLowerCase() && product.variants[0]) return { product, variant: product.variants[0] };
  }
  return null;
}

/** Products matching every word of the search (name, brand, SKU, barcode, size, colour). */
export function searchStaffProducts(products: StaffProduct[], query: string) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return products;
  return products.filter((p) => {
    const text = [p.name, p.sku, p.brand, p.category, ...p.variants.flatMap((v) => [v.sku, v.barcode, v.size, v.colour])].join(' ').toLowerCase();
    return words.every((w) => text.includes(w));
  });
}

/** Tells the owner a scanned barcode isn't in NexGain. Returns an error message, or null. */
export async function reportMissingBarcode(barcode: string, note = ''): Promise<string | null> {
  const { error } = await supabase.rpc('retail_report_missing_barcode', { p_barcode: barcode, p_note: note });
  return error ? 'Couldn’t send that. Check your internet connection and try again.' : null;
}
