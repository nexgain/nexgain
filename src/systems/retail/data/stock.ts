// NexGain Retail (System 3): products, their variants (size / colour
// combinations, each with its own barcode and stock), stock levels, suppliers
// and the stock history. Stored in Supabase (see
// supabase/migrations/20261127000200_retail_stock.sql) and kept up to date by
// useStockSync() in the NexGain Retail owner layout: when stock changes
// anywhere (e.g. a staff member scans a sale), it shows straight away.
//
// Stock only ever changes through the database's stock functions, so every
// change is in the history with who did it, when and how many.
import { useEffect } from 'react';

import { businessStore, useBusiness } from '@/data/business';
import { createStore } from '@/data/store';
import { systemOf } from '@/data/systems';
import { newId } from '@/lib/ids';
import { supabase } from '@/lib/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Variant = {
  id: string;
  productId: string;
  size: string;
  colour: string;
  sku: string;
  barcode: string;
  /** NexGain made the barcode (the product didn't come with one). */
  barcodeGenerated: boolean;
  sort: number;
};

export type Product = {
  id: string;
  name: string;
  /** The product's own SKU, e.g. HOOD-001 (each size / colour can also have one). */
  sku: string;
  categoryId: string | null;
  brand: string;
  description: string;
  supplierId: string | null;
  costPrice: number | null;
  sellPrice: number | null;
  gstIncluded: boolean;
  lowStockLevel: number;
  /** The store it's sold at (several stores only; null = every store). */
  storeId: string | null;
  /** Photo paths in the private business-files bucket. */
  photos: string[];
  archived: boolean;
  createdAt: string;
  variants: Variant[];
};

export type Supplier = {
  id: string;
  name: string;
  contactName: string;
  phone: string;
  email: string;
  website: string;
  notes: string;
  /** How many days their deliveries take (for "time to reorder"). */
  leadTimeDays: number;
};

/** Connected = NexGain can send them orders (they have an email address). */
export const isConnected = (s: Pick<Supplier, 'email'>) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email.trim());

export type MovementKind = 'starting' | 'received' | 'sold' | 'returned' | 'damaged' | 'stocktake' | 'transfer_in' | 'transfer_out' | 'adjusted';

export type Movement = {
  id: string;
  variantId: string;
  storeId: string | null;
  kind: MovementKind;
  /** + added, - taken away. */
  change: number;
  /** How many were left at that store afterwards. */
  quantityAfter: number;
  unitPrice: number | null;
  unitCost: number | null;
  note: string;
  actorName: string;
  createdAt: string;
};

/** variant id -> store key ('' = no particular store) -> quantity. */
export type StockLevels = Map<string, Map<string, number>>;

export const MOVEMENT_LABELS: Record<MovementKind, string> = {
  starting: 'Starting stock',
  received: 'Received',
  sold: 'Sold',
  returned: 'Returned',
  damaged: 'Damaged / lost',
  stocktake: 'Stocktake adjustment',
  transfer_in: 'Transferred in',
  transfer_out: 'Transferred out',
  adjusted: 'Adjusted',
};

// ---------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------

export const productsStore = createStore<Product[]>([]);
export const stockLevelsStore = createStore<StockLevels>(new Map());
export const suppliersStore = createStore<Supplier[]>([]);
/** The latest stock changes (newest first). */
export const movementsStore = createStore<Movement[]>([]);
export const stockLoadStore = createStore<'idle' | 'loading' | 'ready' | 'error'>('idle');

export const useProducts = () => productsStore.use();
export const useStockLevels = () => stockLevelsStore.use();
export const useSuppliers = () => suppliersStore.use();
export const useMovements = () => movementsStore.use();
export const useStockLoad = () => stockLoadStore.use();

const businessId = () => businessStore.get()?.id ?? null;
const storeKey = (storeId: string | null | undefined) => storeId ?? '';

// ---------------------------------------------------------------------------
// Reading rows
// ---------------------------------------------------------------------------

type ProductRow = {
  id: string;
  name: string;
  sku?: string | null;
  category_id: string | null;
  brand: string;
  description: string;
  supplier_id: string | null;
  cost_price: number | string | null;
  sell_price: number | string | null;
  gst_included: boolean;
  low_stock_level: number;
  store_id: string | null;
  photos: string[] | null;
  archived: boolean;
  created_at: string;
};
type VariantRow = {
  id: string;
  product_id: string;
  size: string;
  colour: string;
  sku: string;
  barcode: string;
  barcode_generated: boolean;
  sort: number;
};
type LevelRow = { variant_id: string; store_id: string | null; quantity: number };
type SupplierRow = {
  id: string;
  name: string;
  contact_name: string;
  phone: string;
  email: string;
  website: string;
  notes: string;
  lead_time_days?: number | null;
};
type MovementRow = {
  id: string;
  variant_id: string;
  store_id: string | null;
  kind: MovementKind;
  change: number;
  quantity_after: number;
  unit_price: number | string | null;
  unit_cost: number | string | null;
  note: string;
  actor_name: string;
  created_at: string;
};

const num = (v: number | string | null) => (v === null || v === undefined ? null : Number(v));

const variantFromRow = (r: VariantRow): Variant => ({
  id: r.id,
  productId: r.product_id,
  size: r.size,
  colour: r.colour,
  sku: r.sku,
  barcode: r.barcode,
  barcodeGenerated: r.barcode_generated,
  sort: r.sort,
});

const productFromRow = (r: ProductRow, variants: Variant[]): Product => ({
  id: r.id,
  name: r.name,
  sku: r.sku ?? '',
  categoryId: r.category_id,
  brand: r.brand,
  description: r.description,
  supplierId: r.supplier_id,
  costPrice: num(r.cost_price),
  sellPrice: num(r.sell_price),
  gstIncluded: r.gst_included,
  lowStockLevel: r.low_stock_level,
  storeId: r.store_id,
  photos: r.photos ?? [],
  archived: r.archived,
  createdAt: r.created_at,
  variants: variants.filter((v) => v.productId === r.id).sort((a, b) => a.sort - b.sort),
});

const supplierFromRow = (r: SupplierRow): Supplier => ({
  id: r.id,
  name: r.name,
  contactName: r.contact_name,
  phone: r.phone,
  email: r.email,
  website: r.website,
  notes: r.notes,
  leadTimeDays: r.lead_time_days ?? 7,
});

const movementFromRow = (r: MovementRow): Movement => ({
  id: r.id,
  variantId: r.variant_id,
  storeId: r.store_id,
  kind: r.kind,
  change: r.change,
  quantityAfter: r.quantity_after,
  unitPrice: num(r.unit_price),
  unitCost: num(r.unit_cost),
  note: r.note,
  actorName: r.actor_name,
  createdAt: r.created_at,
});

function levelsFromRows(rows: LevelRow[]): StockLevels {
  const map: StockLevels = new Map();
  for (const r of rows) {
    const byStore = map.get(r.variant_id) ?? new Map<string, number>();
    byStore.set(storeKey(r.store_id), r.quantity);
    map.set(r.variant_id, byStore);
  }
  return map;
}

const PRODUCT_COLUMNS =
  'id, name, sku, category_id, brand, description, supplier_id, cost_price, sell_price, gst_included, low_stock_level, store_id, photos, archived, created_at';
const VARIANT_COLUMNS = 'id, product_id, size, colour, sku, barcode, barcode_generated, sort';
const MOVEMENT_COLUMNS = 'id, variant_id, store_id, kind, change, quantity_after, unit_price, unit_cost, note, actor_name, created_at';
/** How many recent stock changes are kept in the app (older ones load on the History page). */
const RECENT_MOVEMENTS = 1000;

async function fetchLevels() {
  const { data, error } = await supabase.from('stock_levels').select('variant_id, store_id, quantity').eq('business_id', businessId());
  if (error) throw error;
  return levelsFromRows(data as LevelRow[]);
}

async function fetchMovements() {
  const { data, error } = await supabase
    .from('stock_movements')
    .select(MOVEMENT_COLUMNS)
    .eq('business_id', businessId())
    .order('created_at', { ascending: false })
    .limit(RECENT_MOVEMENTS);
  if (error) throw error;
  return (data as MovementRow[]).map(movementFromRow);
}

/** Loads all stock data. */
export async function loadStockData() {
  const id = businessId();
  if (!id) return;
  stockLoadStore.set('loading');
  try {
    const [products, variants, suppliers, levels, movements] = await Promise.all([
      supabase.from('products').select(PRODUCT_COLUMNS).eq('business_id', id).order('name'),
      supabase.from('product_variants').select(VARIANT_COLUMNS).eq('business_id', id),
      supabase.from('suppliers').select('*').eq('business_id', id).order('name'),
      fetchLevels(),
      fetchMovements(),
    ]);
    if (products.error || variants.error || suppliers.error) throw products.error ?? variants.error ?? suppliers.error;
    const vs = (variants.data as VariantRow[]).map(variantFromRow);
    productsStore.set((products.data as ProductRow[]).map((r) => productFromRow(r, vs)));
    suppliersStore.set((suppliers.data as SupplierRow[]).map(supplierFromRow));
    stockLevelsStore.set(levels);
    movementsStore.set(movements);
    stockLoadStore.set('ready');
  } catch {
    stockLoadStore.set('error');
  }
}

export function clearStockData() {
  productsStore.set([]);
  stockLevelsStore.set(new Map());
  suppliersStore.set([]);
  movementsStore.set([]);
  stockLoadStore.set('idle');
}

/** Reloads stock levels and history (after a change, here or on another phone). */
export async function refreshStock() {
  try {
    const [levels, movements] = await Promise.all([fetchLevels(), fetchMovements()]);
    stockLevelsStore.set(levels);
    movementsStore.set(movements);
  } catch {
    // Offline: keep what's shown; the next change or reload catches up.
  }
}

/**
 * Loads the stock data for a NexGain Retail business and keeps it live: a
 * stock change anywhere (another phone, the Scanner) shows straight away.
 */
export function useStockSync() {
  const business = useBusiness();
  const id = business?.id ?? null;
  const retail = systemOf(business) === 'retail';
  useEffect(() => {
    if (!id || !retail) return;
    loadStockData();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const reload = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => refreshStock(), 400);
    };
    const channel = supabase
      .channel(`stock-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_movements', filter: `business_id=eq.${id}` }, reload)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
      clearStockData();
    };
  }, [id, retail]);
}

// ---------------------------------------------------------------------------
// Working things out (pure, tested)
// ---------------------------------------------------------------------------

/** The SKU shown on a product: its own, or its only size's. */
export const productSku = (p: Pick<Product, 'sku' | 'variants'>) => p.sku || (p.variants.length === 1 ? p.variants[0].sku : '') || '';

/** "M / Black", "Size 10", "Black" or "" (a product with no sizes or colours). */
export function variantLabel(v: Pick<Variant, 'size' | 'colour'>) {
  return [v.size.trim(), v.colour.trim()].filter(Boolean).join(' / ');
}

/** How many of a variant are in stock: at one store, or all stores together. */
export function variantStock(levels: StockLevels, variantId: string, storeId?: string | null) {
  const byStore = levels.get(variantId);
  if (!byStore) return 0;
  if (storeId !== undefined) return byStore.get(storeKey(storeId)) ?? 0;
  let total = 0;
  for (const q of byStore.values()) total += q;
  return total;
}

/** How many of a product are in stock (every variant). */
export function productStock(levels: StockLevels, product: Pick<Product, 'variants'>, storeId?: string | null) {
  return product.variants.reduce((sum, v) => sum + variantStock(levels, v.id, storeId), 0);
}

export type StockStatus = 'out' | 'low' | 'ok';

/** Out of stock (0), low (at or under the alert level), or fine. */
export function stockStatus(quantity: number, lowStockLevel: number): StockStatus {
  if (quantity <= 0) return 'out';
  if (quantity <= lowStockLevel) return 'low';
  return 'ok';
}

/** The worst status of a product's variants (one size sold out = the product shows it). */
export function productStatus(levels: StockLevels, product: Pick<Product, 'variants' | 'lowStockLevel'>, storeId?: string | null): StockStatus {
  if (product.variants.length === 0) return 'out';
  const statuses = product.variants.map((v) => stockStatus(variantStock(levels, v.id, storeId), product.lowStockLevel));
  if (statuses.every((s) => s === 'out')) return 'out';
  return statuses.some((s) => s !== 'ok') ? 'low' : 'ok';
}

/** The sell price without GST, when it includes GST and the business is registered for GST. */
export function sellExGst(sellPrice: number, gstIncluded: boolean, usesGst: boolean) {
  return usesGst && gstIncluded ? sellPrice / 1.1 : sellPrice;
}

/**
 * Profit margin: how much of the sell price is profit, as a whole percent.
 * Cost prices are entered without GST, so a GST-inclusive sell price is
 * compared without its GST. null when either price is missing (or the sell price is 0).
 */
export function marginPercent(costPrice: number | null, sellPrice: number | null, gstIncluded: boolean, usesGst: boolean) {
  if (costPrice === null || sellPrice === null || sellPrice <= 0) return null;
  const sell = sellExGst(sellPrice, gstIncluded, usesGst);
  return Math.round(((sell - costPrice) / sell) * 100);
}

/** The value of everything in stock, at cost price and at sell price. */
export function stockValue(products: Product[], levels: StockLevels, storeId?: string | null) {
  let cost = 0;
  let sell = 0;
  for (const p of products) {
    if (p.archived) continue;
    const qty = productStock(levels, p, storeId);
    if (qty <= 0) continue;
    cost += qty * (p.costPrice ?? 0);
    sell += qty * (p.sellPrice ?? 0);
  }
  return { cost: Math.round(cost * 100) / 100, sell: Math.round(sell * 100) / 100 };
}

/** Products matching the search: name, brand, SKU, barcode, size or colour (every word must match). */
export function searchProducts(products: Product[], query: string) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return products;
  return products.filter((p) => {
    const text = [p.name, p.sku, p.brand, ...p.variants.flatMap((v) => [v.sku, v.barcode, v.size, v.colour])].join(' ').toLowerCase();
    return words.every((w) => text.includes(w));
  });
}

export type StockSort = 'name' | 'low-first' | 'high-first';

export function sortProducts(products: Product[], sort: StockSort, levels: StockLevels, storeId?: string | null) {
  const qty = (p: Product) => productStock(levels, p, storeId);
  return [...products].sort((a, b) => {
    if (sort === 'low-first') return qty(a) - qty(b) || a.name.localeCompare(b.name);
    if (sort === 'high-first') return qty(b) - qty(a) || a.name.localeCompare(b.name);
    return a.name.localeCompare(b.name);
  });
}

/** The product and variant a barcode belongs to (barcodes are unique in a business). */
export function findBarcode(products: Product[], barcode: string) {
  const code = barcode.trim();
  if (!code) return null;
  for (const product of products) {
    const variant = product.variants.find((v) => v.barcode === code || (v.sku && v.sku.toLowerCase() === code.toLowerCase()));
    if (variant) return { product, variant };
    // The product's own SKU (one size: that variant).
    if (product.sku && product.sku.toLowerCase() === code.toLowerCase() && product.variants.length > 0) return { product, variant: product.variants[0] };
  }
  return null;
}

/** Every size / colour combination of the sizes and colours entered (one blank variant when there are none). */
export function combineOptions(sizes: string[], colours: string[]) {
  const s = [...new Set(sizes.map((x) => x.trim()).filter(Boolean))];
  const c = [...new Set(colours.map((x) => x.trim()).filter(Boolean))];
  const out: { size: string; colour: string }[] = [];
  for (const size of s.length ? s : ['']) for (const colour of c.length ? c : ['']) out.push({ size, colour });
  return out;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

const friendly = (message: string) =>
  /network|fetch/i.test(message) ? 'Couldn’t save. Check your internet connection and try again.' : 'Couldn’t save that. Please try again.';

/** A clear message for a database error. */
export function stockError(error: { code?: string; message: string; details?: string | null }) {
  if (error.code === '23505' && /barcode/i.test(`${error.message} ${error.details ?? ''}`)) {
    return 'That barcode is already on another product. Each barcode can only be used once.';
  }
  if (error.code === '23505' && /option/i.test(`${error.message} ${error.details ?? ''}`)) {
    return 'Two variants have the same size and colour. Make each one different.';
  }
  if (error.code === '23505') return 'That name is already used. Choose another.';
  if (error.code === 'NXS03') return error.message;
  if (error.code === 'NXS00' || error.code === 'NXS02') return error.message;
  if (error.code === 'P0001') return error.message;
  return friendly(error.message);
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export type VariantDraft = {
  /** null for a new variant. */
  id: string | null;
  size: string;
  colour: string;
  sku: string;
  /** Blank = NexGain makes one. */
  barcode: string;
  /** New variants only: how many are in stock to start with. */
  startingStock: number;
};

export type ProductDraft = Omit<Product, 'id' | 'variants' | 'archived' | 'createdAt'> & {
  id: string | null;
  variants: VariantDraft[];
};

/** What's stopping the product from being saved, or null. */
export function productProblem(d: ProductDraft) {
  if (!d.name.trim()) return 'Enter the product’s name.';
  if (d.variants.length === 0) return 'Add at least one size or colour (or leave both blank for one variant).';
  const keys = d.variants.map((v) => `${v.size.trim().toLowerCase()}|${v.colour.trim().toLowerCase()}`);
  if (new Set(keys).size !== keys.length) return 'Two variants have the same size and colour. Make each one different.';
  const codes = d.variants.map((v) => v.barcode.trim()).filter(Boolean);
  if (new Set(codes).size !== codes.length) return 'Two variants have the same barcode. Each needs its own.';
  if (codes.some((c) => !/^[ -~]{1,64}$/.test(c))) return 'Barcodes can only use letters, numbers and symbols (up to 64).';
  if (d.variants.some((v) => !Number.isInteger(v.startingStock) || v.startingStock < 0 || v.startingStock > 100000)) {
    return 'Enter starting stock as a whole number (0 or more).';
  }
  if (d.costPrice !== null && d.costPrice < 0) return 'The cost price can’t be negative.';
  if (d.sellPrice !== null && d.sellPrice < 0) return 'The sell price can’t be negative.';
  if (!Number.isInteger(d.lowStockLevel) || d.lowStockLevel < 0) return 'Enter the reorder point as a whole number.';
  return null;
}

function productColumns(d: ProductDraft) {
  return {
    name: d.name.trim().slice(0, 120),
    sku: d.sku.trim().slice(0, 60),
    category_id: d.categoryId,
    brand: d.brand.trim().slice(0, 100),
    description: d.description.trim().slice(0, 2000),
    supplier_id: d.supplierId,
    cost_price: d.costPrice,
    sell_price: d.sellPrice,
    gst_included: d.gstIncluded,
    low_stock_level: d.lowStockLevel,
    store_id: d.storeId,
    photos: d.photos.slice(0, 6),
    updated_at: new Date().toISOString(),
  };
}

/**
 * Adds or updates a product and its variants. New variants without a barcode
 * get one made automatically, and their starting stock is added (logged as
 * "Starting stock"). Returns the product's id, or an error message.
 */
export async function saveProduct(d: ProductDraft, startingStore: string | null): Promise<{ id: string } | { error: string }> {
  const biz = businessId();
  if (!biz) return { error: 'Your shop isn’t set up yet.' };
  const problem = productProblem(d);
  if (problem) return { error: problem };

  const cols = productColumns(d);
  const saved = d.id
    ? await supabase.from('products').update(cols).eq('id', d.id).select(PRODUCT_COLUMNS).single<ProductRow>()
    : await supabase.from('products').insert({ ...cols, business_id: biz }).select(PRODUCT_COLUMNS).single<ProductRow>();
  if (saved.error) return { error: stockError(saved.error) };
  const productId = saved.data.id;

  // Variants taken out of the product (only ones with no stock can be removed; the screen checks).
  const before = productsStore.get().find((p) => p.id === productId)?.variants ?? [];
  const keep = new Set(d.variants.map((v) => v.id).filter(Boolean));
  const removed = before.filter((v) => !keep.has(v.id));
  if (removed.length > 0) {
    const { error } = await supabase.from('product_variants').delete().in('id', removed.map((v) => v.id));
    if (error) return { error: stockError(error) };
  }

  const rows = d.variants.map((v, sort) => ({
    id: v.id ?? undefined,
    business_id: biz,
    product_id: productId,
    size: v.size.trim().slice(0, 40),
    colour: v.colour.trim().slice(0, 40),
    sku: v.sku.trim().slice(0, 60),
    // Blank: the database makes a unique one.
    barcode: v.barcode.trim(),
    sort,
  }));
  const existing = rows.filter((r) => r.id);
  const added = rows.filter((r) => !r.id).map(({ id: _id, ...r }) => r);
  for (const r of existing) {
    const original = before.find((v) => v.id === r.id);
    // A cleared barcode keeps the old one (barcodes are printed on tags).
    const changes = { size: r.size, colour: r.colour, sku: r.sku, sort: r.sort, ...(r.barcode && r.barcode !== original?.barcode ? { barcode: r.barcode, barcode_generated: false } : {}) };
    const { error } = await supabase.from('product_variants').update(changes).eq('id', r.id!);
    if (error) return { error: stockError(error) };
  }
  let newVariants: VariantRow[] = [];
  if (added.length > 0) {
    const { data, error } = await supabase.from('product_variants').insert(added).select(VARIANT_COLUMNS);
    if (error) return { error: stockError(error) };
    newVariants = data as VariantRow[];
  }

  // Starting stock for the new variants.
  const startErrors: string[] = [];
  for (const row of newVariants) {
    const draft = d.variants.find((v) => !v.id && v.size.trim() === row.size && v.colour.trim() === row.colour);
    if (!draft || draft.startingStock <= 0) continue;
    const { error } = await supabase.rpc('stock_change', {
      p_variant: row.id,
      p_store: startingStore,
      p_kind: 'starting',
      p_quantity: draft.startingStock,
      p_note: 'Starting stock',
    });
    if (error) startErrors.push(stockError(error));
  }

  // Fresh copy of the product's variants.
  const { data: variantRows } = await supabase.from('product_variants').select(VARIANT_COLUMNS).eq('product_id', productId);
  const product = productFromRow(saved.data, ((variantRows ?? []) as VariantRow[]).map(variantFromRow));
  productsStore.set((all) => [...all.filter((p) => p.id !== productId), product].sort((a, b) => a.name.localeCompare(b.name)));
  await refreshStock();
  if (startErrors.length > 0) return { error: `The product was saved, but some starting stock wasn’t: ${startErrors[0]}` };
  return { id: productId };
}

/** Hides a product from the stock list (its history is kept). Returns an error message, or null. */
export async function archiveProduct(productId: string, archived = true): Promise<string | null> {
  const { error } = await supabase.from('products').update({ archived, updated_at: new Date().toISOString() }).eq('id', productId);
  if (error) return stockError(error);
  productsStore.set((all) => all.map((p) => (p.id === productId ? { ...p, archived } : p)));
  return null;
}

/** Uploads a product photo (from the camera or photo library). Returns its path. */
export async function uploadProductPhoto(uri: string): Promise<string> {
  const biz = businessId();
  if (!biz) throw new Error('Your shop isn’t set up yet.');
  const body = await (await fetch(uri)).arrayBuffer();
  const path = `${biz}/products/${Date.now()}-${newId().slice(0, 8)}.jpg`;
  const { error } = await supabase.storage.from('business-files').upload(path, body, { contentType: 'image/jpeg' });
  if (error) throw error;
  return path;
}

const photoUrls = new Map<string, { url: string; expires: number }>();

/** A link to show a product photo (works for about an hour). */
export async function productPhotoUrl(path: string): Promise<string | null> {
  const cached = photoUrls.get(path);
  if (cached && cached.expires > Date.now()) return cached.url;
  const { data, error } = await supabase.storage.from('business-files').createSignedUrl(path, 3600);
  if (error || !data) return null;
  photoUrls.set(path, { url: data.signedUrl, expires: Date.now() + 3300_000 });
  return data.signedUrl;
}

// ---------------------------------------------------------------------------
// Changing stock
// ---------------------------------------------------------------------------

/** One stock change (received, sold, returned, damaged, or adjusted by a signed number). Returns an error message, or null. */
export async function changeStock(
  variantId: string,
  storeId: string | null,
  kind: 'received' | 'sold' | 'returned' | 'damaged' | 'adjusted',
  quantity: number,
  note = '',
  /** Sales and returns: the price each (for revenue). */
  unitPrice: number | null = null,
): Promise<string | null> {
  const { error } = await supabase.rpc('stock_change', {
    p_variant: variantId,
    p_store: storeId,
    p_kind: kind,
    p_quantity: quantity,
    p_note: note,
    p_unit_price: unitPrice,
  });
  if (error) return stockError(error);
  await refreshStock();
  return null;
}

/** Moves stock between two stores. Returns an error message, or null. */
export async function transferStock(variantId: string, fromStore: string | null, toStore: string | null, quantity: number, note = '') {
  const { error } = await supabase.rpc('stock_transfer', { p_variant: variantId, p_from: fromStore, p_to: toStore, p_quantity: quantity, p_note: note });
  if (error) return stockError(error);
  await refreshStock();
  return null;
}

export type DeliveryLine = { variantId: string; quantity: number; unitCost: number | null };

/** Receives a delivery: all lines are added together. Returns an error message, or null. */
export async function receiveDelivery(storeId: string | null, supplierId: string | null, note: string, lines: DeliveryLine[]) {
  const clean = lines.filter((l) => l.quantity > 0);
  if (clean.length === 0) return 'Add at least one product and how many arrived.';
  const { error } = await supabase.rpc('stock_receive', {
    p_store: storeId,
    p_supplier: supplierId,
    p_note: note,
    p_lines: clean.map((l) => ({ variant: l.variantId, quantity: l.quantity, unit_cost: l.unitCost })),
  });
  if (error) return stockError(error);
  await refreshStock();
  return null;
}

// ---------------------------------------------------------------------------
// Stocktakes
// ---------------------------------------------------------------------------

/** Starts (or reopens) the stocktake for a store. Returns its id and the counts so far. */
export async function openStocktake(storeId: string | null): Promise<{ id: string; counts: Map<string, number> } | { error: string }> {
  const { data, error } = await supabase.rpc('stocktake_start', { p_store: storeId });
  if (error) return { error: stockError(error) };
  const id = data as string;
  const { data: rows, error: countError } = await supabase.from('stocktake_counts').select('variant_id, counted').eq('stocktake_id', id);
  if (countError) return { error: stockError(countError) };
  return { id, counts: new Map((rows as { variant_id: string; counted: number }[]).map((r) => [r.variant_id, r.counted])) };
}

/** Saves one count (or removes it, with null). Returns an error message, or null. */
export async function saveCount(stocktakeId: string, variantId: string, counted: number | null): Promise<string | null> {
  const biz = businessId();
  const { error } =
    counted === null
      ? await supabase.from('stocktake_counts').delete().eq('stocktake_id', stocktakeId).eq('variant_id', variantId)
      : await supabase
          .from('stocktake_counts')
          .upsert({ stocktake_id: stocktakeId, variant_id: variantId, business_id: biz, counted, updated_at: new Date().toISOString() });
  return error ? stockError(error) : null;
}

/** Approves the stocktake: counted stock replaces the records. Returns how many changed, or an error message. */
export async function approveStocktake(stocktakeId: string): Promise<{ changed: number } | { error: string }> {
  const { data, error } = await supabase.rpc('stocktake_approve', { p_stocktake: stocktakeId });
  if (error) return { error: stockError(error) };
  await refreshStock();
  return { changed: data as number };
}

export async function cancelStocktake(stocktakeId: string): Promise<string | null> {
  const { error } = await supabase.rpc('stocktake_cancel', { p_stocktake: stocktakeId });
  return error ? stockError(error) : null;
}

export type CountDifference = { variantId: string; expected: number; counted: number; difference: number };

/** The differences a stocktake would make (only counted variants; nothing different = not listed). */
export function countDifferences(counts: Map<string, number>, levels: StockLevels, storeId: string | null): CountDifference[] {
  const out: CountDifference[] = [];
  for (const [variantId, counted] of counts) {
    const expected = variantStock(levels, variantId, storeId);
    if (counted !== expected) out.push({ variantId, expected, counted, difference: counted - expected });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------

export type SupplierDraft = Omit<Supplier, 'id'> & { id: string | null };

/** Adds or updates a supplier. Returns the saved supplier, or an error message. */
export async function saveSupplier(d: SupplierDraft): Promise<{ supplier: Supplier } | { error: string }> {
  const biz = businessId();
  if (!biz) return { error: 'Your shop isn’t set up yet.' };
  const name = d.name.trim().replace(/\s+/g, ' ').slice(0, 100);
  if (!name) return { error: 'Enter the supplier’s name.' };
  const cols = {
    name,
    contact_name: d.contactName.trim().slice(0, 100),
    phone: d.phone.trim().slice(0, 40),
    email: d.email.trim().toLowerCase().slice(0, 200),
    website: d.website.trim().slice(0, 200),
    notes: d.notes.trim().slice(0, 1000),
    lead_time_days: Math.max(0, Math.min(365, Math.round(d.leadTimeDays || 0))),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = d.id
    ? await supabase.from('suppliers').update(cols).eq('id', d.id).select().single<SupplierRow>()
    : await supabase.from('suppliers').insert({ ...cols, business_id: biz }).select().single<SupplierRow>();
  if (error) return { error: error.code === '23505' ? `You already have a supplier called ${name}.` : stockError(error) };
  const supplier = supplierFromRow(data);
  suppliersStore.set((all) => [...all.filter((s) => s.id !== supplier.id), supplier].sort((a, b) => a.name.localeCompare(b.name)));
  return { supplier };
}

/** Deletes a supplier. Their products stay, with no supplier. Returns an error message, or null. */
export async function deleteSupplier(supplierId: string): Promise<string | null> {
  const { error } = await supabase.from('suppliers').delete().eq('id', supplierId);
  if (error) return stockError(error);
  suppliersStore.set((all) => all.filter((s) => s.id !== supplierId));
  productsStore.set((all) => all.map((p) => (p.supplierId === supplierId ? { ...p, supplierId: null } : p)));
  return null;
}
