// NexGain Retail (System 3): the shop's settings (its business type) and its
// product categories. Stored in Supabase (see
// supabase/migrations/20261127000000_retail.sql) and loaded by useRetailSync()
// in the NexGain Retail layouts. Each business only ever sees its own rows
// (Row Level Security in the database).
import { useEffect } from 'react';

import { businessStore, useBusiness } from '@/data/business';
import { createStore } from '@/data/store';
import { systemOf } from '@/data/systems';
import { supabase } from '@/lib/supabase';
import { findRetailType } from '@/systems/retail/constants/retail-business-types';

export type RetailSettings = {
  /** The business type picked at sign-up (an id from retail-business-types.ts). */
  businessType: string;
  /** Transactions: "Link expenses to products / stock orders" (off by default). */
  linkExpensesToStock: boolean;
};

export type ProductCategory = { id: string; name: string; sort: number };

/** One of the shop's stores. With more than one, the roster (and later stock) asks which store. */
export type StoreLocation = { id: string; name: string; address: string; sort: number };

export const retailSettingsStore = createStore<RetailSettings | null>(null);
export const categoriesStore = createStore<ProductCategory[]>([]);
export const storesStore = createStore<StoreLocation[]>([]);
export const retailLoadStore = createStore<'idle' | 'loading' | 'ready' | 'error'>('idle');

export const useRetailSettings = () => retailSettingsStore.use();
export const useCategories = () => categoriesStore.use();
export const useStores = () => storesStore.use();
export const useRetailLoad = () => retailLoadStore.use();
/** The business type picked at sign-up (null until loaded, or for an unknown type). */
export const useRetailType = () => findRetailType(retailSettingsStore.use()?.businessType);

const businessId = () => businessStore.get()?.id ?? null;
const friendly = (message: string) =>
  /network|fetch/i.test(message) ? 'Couldn’t save. Check your internet connection and try again.' : 'Couldn’t save that. Please try again.';
const sortCategories = <T extends { name: string; sort: number }>(list: T[]) => [...list].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));

type CategoryRow = { id: string; name: string; sort: number };
const categoryFromRow = (r: CategoryRow): ProductCategory => ({ id: r.id, name: r.name, sort: r.sort });
type StoreRow = { id: string; name: string; address: string; sort: number };
const storeFromRow = (r: StoreRow): StoreLocation => ({ id: r.id, name: r.name, address: r.address, sort: r.sort });
type SettingsRow = { business_type: string; link_expenses_to_stock?: boolean | null };

/** Loads the shop's settings and categories. */
export async function loadRetailData() {
  const id = businessId();
  if (!id) return;
  retailLoadStore.set('loading');
  const [settings, categories, stores] = await Promise.all([
    supabase.from('retail_settings').select('*').eq('business_id', id).maybeSingle<SettingsRow>(),
    supabase.from('product_categories').select('id, name, sort').eq('business_id', id),
    supabase.from('store_locations').select('id, name, address, sort').eq('business_id', id),
  ]);
  if (settings.error || categories.error) {
    retailLoadStore.set('error');
    return;
  }
  retailSettingsStore.set(
    settings.data ? { businessType: settings.data.business_type, linkExpensesToStock: settings.data.link_expenses_to_stock ?? false } : null,
  );
  categoriesStore.set(sortCategories((categories.data as CategoryRow[]).map(categoryFromRow)));
  // Stores: before the step 2 database update is run, there are none (one store).
  storesStore.set(stores.error ? [] : sortCategories((stores.data as StoreRow[]).map(storeFromRow)));
  retailLoadStore.set('ready');
}

export function clearRetailData() {
  retailSettingsStore.set(null);
  categoriesStore.set([]);
  storesStore.set([]);
  retailLoadStore.set('idle');
}

/** Loads the retail data for a NexGain Retail business. Used by the NexGain Retail layouts. */
export function useRetailSync() {
  const business = useBusiness();
  const id = business?.id ?? null;
  const retail = systemOf(business) === 'retail';
  useEffect(() => {
    if (!id || !retail) return;
    loadRetailData();
    return () => clearRetailData();
  }, [id, retail]);
}

/**
 * Saves the retail choices from owner sign-up, once the business exists: the
 * business type and the product categories. Returns an error message, or null.
 */
export async function saveRetailSignup(forBusinessId: string, choices: { typeId: string; categories: string[] }): Promise<string | null> {
  const { error: settingsError } = await supabase
    .from('retail_settings')
    .upsert({ business_id: forBusinessId, business_type: choices.typeId, updated_at: new Date().toISOString() });
  if (settingsError) return friendly(settingsError.message);
  if (choices.categories.length === 0) return null;
  const { error } = await supabase
    .from('product_categories')
    .insert(choices.categories.map((name, sort) => ({ business_id: forBusinessId, name, sort })));
  return error ? friendly(error.message) : null;
}

// ---------------------------------------------------------------------------
// Owner: product categories (add, rename, delete, reorder)
// ---------------------------------------------------------------------------

const DUPLICATE = '23505';

/** Adds a category. Returns an error message, or null. */
export async function addCategory(name: string): Promise<string | null> {
  const id = businessId();
  const clean = name.trim().replace(/\s+/g, ' ').slice(0, 60);
  if (!id) return 'Your shop isn’t set up yet.';
  if (!clean) return 'Enter a category name.';
  const list = categoriesStore.get();
  if (list.some((c) => c.name.toLowerCase() === clean.toLowerCase())) return `You already have a category called ${clean}.`;
  const { data, error } = await supabase
    .from('product_categories')
    .insert({ business_id: id, name: clean, sort: list.length ? Math.max(...list.map((c) => c.sort)) + 1 : 0 })
    .select('id, name, sort')
    .single<CategoryRow>();
  if (error) return error.code === DUPLICATE ? `You already have a category called ${clean}.` : friendly(error.message);
  categoriesStore.set(sortCategories([...categoriesStore.get(), categoryFromRow(data)]));
  return null;
}

/** Renames a category. Returns an error message, or null. */
export async function renameCategory(categoryId: string, name: string): Promise<string | null> {
  const clean = name.trim().replace(/\s+/g, ' ').slice(0, 60);
  if (!clean) return 'Enter a category name.';
  if (categoriesStore.get().some((c) => c.id !== categoryId && c.name.toLowerCase() === clean.toLowerCase())) {
    return `You already have a category called ${clean}.`;
  }
  const { error } = await supabase.from('product_categories').update({ name: clean, updated_at: new Date().toISOString() }).eq('id', categoryId);
  if (error) return error.code === DUPLICATE ? `You already have a category called ${clean}.` : friendly(error.message);
  categoriesStore.set(categoriesStore.get().map((c) => (c.id === categoryId ? { ...c, name: clean } : c)));
  return null;
}

/** Deletes a category. Its products stay, with no category. Returns an error message, or null. */
export async function deleteCategory(categoryId: string): Promise<string | null> {
  const { error } = await supabase.from('product_categories').delete().eq('id', categoryId);
  if (error) return friendly(error.message);
  categoriesStore.set(categoriesStore.get().filter((c) => c.id !== categoryId));
  return null;
}

/** Moves a category up (-1) or down (1) in the list. Returns an error message, or null. */
export async function moveCategory(categoryId: string, direction: -1 | 1): Promise<string | null> {
  const list = categoriesStore.get();
  const i = list.findIndex((c) => c.id === categoryId);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= list.length) return null;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  const renumbered = next.map((c, sort) => ({ ...c, sort }));
  categoriesStore.set(renumbered);
  const results = await Promise.all(
    [renumbered[i], renumbered[j]].map((c) => supabase.from('product_categories').update({ sort: c.sort }).eq('id', c.id)),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    categoriesStore.set(list);
    return friendly(failed.error.message);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Owner: settings
// ---------------------------------------------------------------------------

/** Transactions: "Link expenses to products / stock orders" on or off. */
export async function setLinkExpensesToStock(on: boolean): Promise<string | null> {
  const id = businessId();
  if (!id) return 'Your shop isn’t set up yet.';
  const before = retailSettingsStore.get();
  retailSettingsStore.set({ businessType: before?.businessType ?? 'other-retail', linkExpensesToStock: on });
  const { error } = await supabase
    .from('retail_settings')
    .upsert({ business_id: id, business_type: before?.businessType ?? 'other-retail', link_expenses_to_stock: on, updated_at: new Date().toISOString() });
  if (error) {
    retailSettingsStore.set(before);
    return friendly(error.message);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Owner: store locations
// ---------------------------------------------------------------------------

/** True when the shop has more than one store (then the roster asks which one). */
export const hasManyStores = (stores: StoreLocation[]) => stores.length > 1;

/** Adds or updates a store. Returns an error message, or null. */
export async function saveStore(store: { id: string | null; name: string; address: string }): Promise<string | null> {
  const id = businessId();
  const name = store.name.trim().replace(/s+/g, ' ').slice(0, 80);
  const address = store.address.trim().slice(0, 200);
  if (!id) return 'Your shop isn’t set up yet.';
  if (!name) return 'Enter the store’s name, e.g. Bondi or Main Street.';
  const list = storesStore.get();
  if (list.some((s) => s.id !== store.id && s.name.toLowerCase() === name.toLowerCase())) return `You already have a store called ${name}.`;
  const cols = { name, address, updated_at: new Date().toISOString() };
  const { data, error } = store.id
    ? await supabase.from('store_locations').update(cols).eq('id', store.id).select('id, name, address, sort').single<StoreRow>()
    : await supabase
        .from('store_locations')
        .insert({ ...cols, business_id: id, sort: list.length ? Math.max(...list.map((s) => s.sort)) + 1 : 0 })
        .select('id, name, address, sort')
        .single<StoreRow>();
  if (error) return error.code === DUPLICATE ? `You already have a store called ${name}.` : friendly(error.message);
  const saved = storeFromRow(data);
  storesStore.set(store.id ? list.map((s) => (s.id === saved.id ? saved : s)) : [...list, saved]);
  return null;
}

/** Deletes a store. Shifts already rostered there keep its name. Returns an error message, or null. */
export async function deleteStore(storeId: string): Promise<string | null> {
  const { error } = await supabase.from('store_locations').delete().eq('id', storeId);
  if (error) return friendly(error.message);
  storesStore.set(storesStore.get().filter((s) => s.id !== storeId));
  return null;
}
