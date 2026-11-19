// NexGain Hospitality: the menu (categories and items) and the sales.
//
// Loaded when a hospitality owner opens their screens (useHospitalitySync in
// the owner layout) and kept in memory stores, like the rest of the app.
// Saved online in menu_categories, menu_items, menu_sales and
// menu_sale_items (see supabase/migrations/20261127000000_hospitality.sql).
// Only the business owner can read or change them.
import { useEffect } from 'react';

import { businessStore, useBusiness } from '@/data/business';
import { createStore } from '@/data/store';
import { systemOf } from '@/data/systems';
import { newId } from '@/lib/ids';
import { supabase } from '@/lib/supabase';
import { cleanCategories } from '@/systems/hospitality/constants/hospitality-types';

export type MenuCategory = { id: string; name: string; sort: number };

export type MenuItem = {
  id: string;
  categoryId: string | null;
  name: string;
  description: string;
  price: number;
  /** What one costs to make (optional, typed by the owner). Not stock. */
  cost: number | null;
  photoPath: string | null;
  /** Off = hidden (86'd or seasonal). */
  active: boolean;
  isSpecial: boolean;
  /** "YYYY-MM-DD" */
  specialStart: string | null;
  specialEnd: string | null;
  sort: number;
};

export type SaleSource = 'sale' | 'day' | 'import';

export type SaleLine = {
  menuItemId: string | null;
  name: string;
  category: string;
  quantity: number;
  /** Price and cost at the time of the sale. */
  unitPrice: number;
  unitCost: number | null;
};

export type Sale = {
  id: string;
  /** ISO time it was sold. */
  soldAt: string;
  source: SaleSource;
  note: string;
  total: number;
  lines: SaleLine[];
};

export const menuCategoriesStore = createStore<MenuCategory[]>([]);
export const menuItemsStore = createStore<MenuItem[]>([]);
export const salesStore = createStore<Sale[]>([]);
/** False until the first load finishes (screens show a spinner instead of "nothing yet"). */
export const hospitalityLoadedStore = createStore(false);

export const useMenuCategories = () => menuCategoriesStore.use();
export const useMenuItems = () => menuItemsStore.use();
export const useSales = () => salesStore.use();
export const useHospitalityLoaded = () => hospitalityLoadedStore.use();

const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));

type ItemRow = {
  id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price: number | string;
  cost: number | string | null;
  photo_path: string | null;
  active: boolean;
  is_special: boolean;
  special_start: string | null;
  special_end: string | null;
  sort: number;
};

const itemFromRow = (r: ItemRow): MenuItem => ({
  id: r.id,
  categoryId: r.category_id,
  name: r.name,
  description: r.description ?? '',
  price: Number(r.price),
  cost: num(r.cost),
  photoPath: r.photo_path,
  active: r.active,
  isSpecial: r.is_special,
  specialStart: r.special_start,
  specialEnd: r.special_end,
  sort: r.sort,
});

type SaleRow = {
  id: string;
  sold_at: string;
  source: SaleSource;
  note: string | null;
  total: number | string;
  menu_sale_items: {
    menu_item_id: string | null;
    item_name: string;
    category_name: string | null;
    quantity: number | string;
    unit_price: number | string;
    unit_cost: number | string | null;
  }[];
};

const saleFromRow = (r: SaleRow): Sale => ({
  id: r.id,
  soldAt: r.sold_at,
  source: r.source,
  note: r.note ?? '',
  total: Number(r.total),
  lines: (r.menu_sale_items ?? []).map((i) => ({
    menuItemId: i.menu_item_id,
    name: i.item_name,
    category: i.category_name ?? '',
    quantity: Number(i.quantity),
    unitPrice: Number(i.unit_price),
    unitCost: num(i.unit_cost),
  })),
});

/** Sales this far back are loaded (enough for this and last financial year). */
const SALES_DAYS = 800;

async function fetchSales(): Promise<Sale[]> {
  const since = new Date(Date.now() - SALES_DAYS * 86_400_000).toISOString();
  const all: Sale[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('menu_sales')
      .select('id, sold_at, source, note, total, menu_sale_items (menu_item_id, item_name, category_name, quantity, unit_price, unit_cost)')
      .gte('sold_at', since)
      .order('sold_at', { ascending: false })
      .range(from, from + 999);
    if (error) throw error;
    all.push(...(data as unknown as SaleRow[]).map(saleFromRow));
    if (!data || data.length < 1000) return all;
  }
}

export async function loadHospitalityData() {
  const [categories, items, sales] = await Promise.all([
    supabase.from('menu_categories').select('id, name, sort').order('sort').order('created_at'),
    supabase
      .from('menu_items')
      .select('id, category_id, name, description, price, cost, photo_path, active, is_special, special_start, special_end, sort')
      .order('sort')
      .order('name'),
    fetchSales().catch((e) => {
      console.warn('Could not load sales:', e instanceof Error ? e.message : e);
      return null;
    }),
  ]);
  if (categories.error) console.warn('Could not load menu categories:', categories.error.message);
  else menuCategoriesStore.set(categories.data as MenuCategory[]);
  if (items.error) console.warn('Could not load menu items:', items.error.message);
  else menuItemsStore.set((items.data as ItemRow[]).map(itemFromRow));
  if (sales) salesStore.set(sales);
  hospitalityLoadedStore.set(true);
}

export function clearHospitalityData() {
  menuCategoriesStore.set([]);
  menuItemsStore.set([]);
  salesStore.set([]);
  hospitalityLoadedStore.set(false);
  photoUrls.clear();
}

/** Hospitality owner screens: loads the menu and sales (only for hospitality businesses). */
export function useHospitalitySync() {
  const business = useBusiness();
  const businessId = business?.id ?? null;
  const hospitality = systemOf(business) === 'hospitality';
  useEffect(() => {
    if (!businessId || !hospitality) return;
    loadHospitalityData().catch(() => hospitalityLoadedStore.set(true));
    return clearHospitalityData;
  }, [businessId, hospitality]);
}

function businessId() {
  const id = businessStore.get()?.id;
  if (!id) throw new Error('Your business hasn’t loaded yet. Please try again.');
  return id;
}

// ---------------------------------------------------------------------------
// Sign-up: the starter menu
// ---------------------------------------------------------------------------

/** Saves the starter menu categories chosen in sign-up. Returns an error message, or null. */
export async function saveStarterMenu(forBusiness: string, names: string[]) {
  const rows = cleanCategories(names).map((name, i) => ({ business_id: forBusiness, name, sort: i }));
  if (rows.length === 0) return null;
  const { error } = await supabase.from('menu_categories').insert(rows);
  return error ? error.message : null;
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function addCategory(name: string) {
  const clean = name.trim().slice(0, 60);
  if (!clean) throw new Error('Type a name for the category.');
  const existing = menuCategoriesStore.get();
  if (existing.some((c) => c.name.toLowerCase() === clean.toLowerCase())) throw new Error('There’s already a category with that name.');
  const sort = existing.reduce((max, c) => Math.max(max, c.sort), -1) + 1;
  const { data, error } = await supabase
    .from('menu_categories')
    .insert({ business_id: businessId(), name: clean, sort })
    .select('id, name, sort')
    .single();
  if (error) throw error;
  menuCategoriesStore.set((all) => [...all, data as MenuCategory]);
  return data as MenuCategory;
}

export async function renameCategory(id: string, name: string) {
  const clean = name.trim().slice(0, 60);
  if (!clean) throw new Error('Type a name for the category.');
  if (menuCategoriesStore.get().some((c) => c.id !== id && c.name.toLowerCase() === clean.toLowerCase())) {
    throw new Error('There’s already a category with that name.');
  }
  const { error } = await supabase.from('menu_categories').update({ name: clean }).eq('id', id);
  if (error) throw error;
  menuCategoriesStore.set((all) => all.map((c) => (c.id === id ? { ...c, name: clean } : c)));
}

/** Deletes a category. Its items stay on the menu, under "No category". */
export async function deleteCategory(id: string) {
  const { error } = await supabase.from('menu_categories').delete().eq('id', id);
  if (error) throw error;
  menuCategoriesStore.set((all) => all.filter((c) => c.id !== id));
  menuItemsStore.set((all) => all.map((i) => (i.categoryId === id ? { ...i, categoryId: null } : i)));
}

/** Moves a category up (-1) or down (+1) the menu. */
export async function moveCategory(id: string, direction: -1 | 1) {
  const list = [...menuCategoriesStore.get()].sort((a, b) => a.sort - b.sort);
  const from = list.findIndex((c) => c.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= list.length) return;
  [list[from], list[to]] = [list[to], list[from]];
  const before = new Map(list.map((c) => [c.id, c.sort]));
  const renumbered = list.map((c, i) => ({ ...c, sort: i }));
  menuCategoriesStore.set(renumbered);
  // Only the categories whose place changed are saved.
  const changed = renumbered.filter((c) => before.get(c.id) !== c.sort);
  const results = await Promise.all(changed.map((c) => supabase.from('menu_categories').update({ sort: c.sort }).eq('id', c.id)));
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export type MenuItemDraft = Omit<MenuItem, 'id' | 'sort'> & { id?: string };

export function validateItem(d: MenuItemDraft): string | null {
  if (!d.name.trim()) return 'Type the item’s name.';
  if (!Number.isFinite(d.price) || d.price < 0) return 'Enter a sell price (0 or more).';
  if (d.cost !== null && (!Number.isFinite(d.cost) || d.cost < 0)) return 'The cost to make must be 0 or more (or leave it blank).';
  if (d.isSpecial && d.specialStart && d.specialEnd && d.specialEnd < d.specialStart) return 'The special’s end date is before its start date.';
  return null;
}

export async function saveItem(d: MenuItemDraft) {
  const problem = validateItem(d);
  if (problem) throw new Error(problem);
  const columns = {
    category_id: d.categoryId,
    name: d.name.trim().slice(0, 100),
    description: d.description.trim().slice(0, 500),
    price: Math.round(d.price * 100) / 100,
    cost: d.cost === null ? null : Math.round(d.cost * 100) / 100,
    photo_path: d.photoPath,
    active: d.active,
    is_special: d.isSpecial,
    special_start: d.isSpecial ? d.specialStart : null,
    special_end: d.isSpecial ? d.specialEnd : null,
  };
  const select = 'id, category_id, name, description, price, cost, photo_path, active, is_special, special_start, special_end, sort';
  if (d.id) {
    const { data, error } = await supabase.from('menu_items').update(columns).eq('id', d.id).select(select).single();
    if (error) throw error;
    const saved = itemFromRow(data as ItemRow);
    menuItemsStore.set((all) => all.map((i) => (i.id === saved.id ? saved : i)));
    return saved;
  }
  const sort = menuItemsStore.get().filter((i) => i.categoryId === d.categoryId).reduce((max, i) => Math.max(max, i.sort), -1) + 1;
  const { data, error } = await supabase
    .from('menu_items')
    .insert({ ...columns, business_id: businessId(), sort })
    .select(select)
    .single();
  if (error) throw error;
  const saved = itemFromRow(data as ItemRow);
  menuItemsStore.set((all) => [...all, saved]);
  return saved;
}

/** Hides (86's) or shows an item. */
export async function setItemActive(id: string, active: boolean) {
  menuItemsStore.set((all) => all.map((i) => (i.id === id ? { ...i, active } : i)));
  const { error } = await supabase.from('menu_items').update({ active }).eq('id', id);
  if (error) {
    menuItemsStore.set((all) => all.map((i) => (i.id === id ? { ...i, active: !active } : i)));
    throw error;
  }
}

export async function deleteItem(id: string) {
  const item = menuItemsStore.get().find((i) => i.id === id);
  const { error } = await supabase.from('menu_items').delete().eq('id', id);
  if (error) throw error;
  menuItemsStore.set((all) => all.filter((i) => i.id !== id));
  if (item?.photoPath) removeMenuPhoto(item.photoPath);
}

// ---------------------------------------------------------------------------
// Photos (private "business-files" bucket, <business id>/menu/...)
// ---------------------------------------------------------------------------

const photoUrls = new Map<string, { url: string; expires: number }>();

export async function uploadMenuPhoto(uri: string, mimeType = 'image/jpeg') {
  const body = await (await fetch(uri)).arrayBuffer();
  const path = `${businessId()}/menu/${Date.now()}-${newId().slice(0, 8)}.jpg`;
  const { error } = await supabase.storage.from('business-files').upload(path, body, { contentType: mimeType });
  if (error) throw error;
  return path;
}

export function removeMenuPhoto(path: string) {
  photoUrls.delete(path);
  supabase.storage.from('business-files').remove([path]).catch(() => {});
}

/** A private link to show a menu photo (cached for most of its hour). */
export async function menuPhotoUrl(path: string) {
  const cached = photoUrls.get(path);
  if (cached && cached.expires > Date.now()) return cached.url;
  const { data, error } = await supabase.storage.from('business-files').createSignedUrl(path, 3600);
  if (error) throw error;
  photoUrls.set(path, { url: data.signedUrl, expires: Date.now() + 50 * 60_000 });
  return data.signedUrl;
}

// ---------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------

/** One menu item and how many, as picked on Record sale or End of day. */
export type SaleEntry = { item: MenuItem; quantity: number };

/**
 * Saves a sale (or one day's totals). Each line keeps the item's price and
 * cost right now, so changing the menu later never changes old sales.
 */
export async function recordSale(entries: SaleEntry[], options: { soldAt?: Date; source?: SaleSource; note?: string } = {}) {
  const lines = entries.filter((e) => e.quantity > 0);
  if (lines.length === 0) throw new Error('Add at least one item.');
  const bad = lines.find((e) => !Number.isFinite(e.quantity) || e.quantity > 100_000);
  if (bad) throw new Error(`Check the quantity for ${bad.item.name}.`);
  const forBusiness = businessId();
  const categories = menuCategoriesStore.get();
  const { data: sale, error } = await supabase
    .from('menu_sales')
    .insert({
      business_id: forBusiness,
      sold_at: (options.soldAt ?? new Date()).toISOString(),
      source: options.source ?? 'sale',
      note: (options.note ?? '').trim().slice(0, 500),
    })
    .select('id')
    .single();
  if (error) throw error;
  const rows = lines.map((e) => ({
    sale_id: sale.id,
    business_id: forBusiness,
    menu_item_id: e.item.id,
    item_name: e.item.name,
    category_name: categories.find((c) => c.id === e.item.categoryId)?.name ?? '',
    quantity: e.quantity,
    unit_price: e.item.price,
    unit_cost: e.item.cost,
  }));
  const { error: itemsError } = await supabase.from('menu_sale_items').insert(rows);
  if (itemsError) {
    // Don't leave an empty sale behind.
    await supabase.from('menu_sales').delete().eq('id', sale.id);
    throw itemsError;
  }
  const { data: saved, error: readError } = await supabase
    .from('menu_sales')
    .select('id, sold_at, source, note, total, menu_sale_items (menu_item_id, item_name, category_name, quantity, unit_price, unit_cost)')
    .eq('id', sale.id)
    .single();
  if (readError) throw readError;
  const fresh = saleFromRow(saved as unknown as SaleRow);
  salesStore.set((all) => [fresh, ...all].sort((a, b) => b.soldAt.localeCompare(a.soldAt)));
  return fresh;
}

export async function deleteSale(id: string) {
  const { error } = await supabase.from('menu_sales').delete().eq('id', id);
  if (error) throw error;
  salesStore.set((all) => all.filter((s) => s.id !== id));
}
