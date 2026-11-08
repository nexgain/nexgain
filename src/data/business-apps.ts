// Apps the business says it uses, or has asked us to support (More > Integrations
// and owner sign-up). Nothing is connected yet; this is a wish list. Shown straight
// away and saved online ("business_apps" table, business owner only).
import { businessStore } from '@/data/business';
import type { AppCategory } from '@/data/integration-apps';
import { createStore } from '@/data/store';
import { newId, warnSaveFailed } from '@/lib/ids';
import { supabase } from '@/lib/supabase';

/**
 * - "added": one of the apps listed on the screen, ticked as used ("Added - coming soon")
 * - "requested": picked from the search, or typed in when it wasn't listed
 */
export type AppStatus = 'added' | 'requested';

export type ChosenApp = {
  name: string;
  category: AppCategory;
  status: AppStatus;
};

type BusinessApp = ChosenApp & { id: string; createdAt: string };

type BusinessAppRow = {
  id: string;
  business_id: string;
  name: string;
  category: AppCategory;
  status: AppStatus;
  created_at: string;
};

export const businessAppsStore = createStore<BusinessApp[]>([]);

export function useBusinessApps() {
  return businessAppsStore.use();
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function findChosen<T extends ChosenApp>(apps: T[], name: string) {
  return apps.find((a) => sameName(a.name, name));
}

/** Adds the app if it isn't in the list, otherwise removes it. Returns the new list. */
export function toggleChosen<T extends ChosenApp>(apps: T[], app: ChosenApp, make: (app: ChosenApp) => T): T[] {
  return findChosen(apps, app.name) ? apps.filter((a) => !sameName(a.name, app.name)) : [...apps, make(app)];
}

const toRow = (app: BusinessApp, businessId: string): BusinessAppRow => ({
  id: app.id,
  business_id: businessId,
  name: app.name,
  category: app.category,
  status: app.status,
  created_at: app.createdAt,
});

const fromRow = (row: BusinessAppRow): BusinessApp => ({
  id: row.id,
  name: row.name,
  category: row.category,
  status: row.status,
  createdAt: row.created_at,
});

const newApp = (app: ChosenApp): BusinessApp => ({
  ...app,
  name: app.name.trim(),
  id: newId(),
  createdAt: new Date().toISOString(),
});

export async function loadBusinessApps() {
  const { data, error } = await supabase.from('business_apps').select('*').order('created_at');
  if (error) throw error;
  businessAppsStore.set((data as BusinessAppRow[]).map(fromRow));
}

export function clearBusinessApps() {
  businessAppsStore.set([]);
}

/** Integrations page: adds or removes an app for the signed-in owner's business. */
export function toggleBusinessApp(app: ChosenApp) {
  const businessId = businessStore.get()?.id;
  const existing = findChosen(businessAppsStore.get(), app.name);
  businessAppsStore.set((all) => toggleChosen(all, app, newApp));
  if (!businessId) return;
  if (existing) {
    supabase
      .from('business_apps')
      .delete()
      .eq('id', existing.id)
      .then(({ error }) => warnSaveFailed('app removal', error));
  } else {
    const added = findChosen(businessAppsStore.get(), app.name);
    if (!added) return;
    supabase
      .from('business_apps')
      .insert(toRow(added, businessId))
      .then(({ error }) => warnSaveFailed('app', error));
  }
}

/**
 * Sign-up: makes the business's saved apps match what was chosen during sign-up
 * (adding new ones, removing ones taken off). Safe to call more than once.
 */
export async function saveSignupApps(businessId: string, chosen: ChosenApp[]) {
  const saved = businessAppsStore.get();
  const toAdd = chosen.filter((a) => !findChosen(saved, a.name)).map(newApp);
  const toRemove = saved.filter((a) => !findChosen(chosen, a.name));
  businessAppsStore.set([...saved.filter((a) => !toRemove.includes(a)), ...toAdd]);

  if (toAdd.length > 0) {
    const { error } = await supabase
      .from('business_apps')
      .upsert(
        toAdd.map((a) => toRow(a, businessId)),
        { onConflict: 'business_id,name', ignoreDuplicates: true },
      );
    warnSaveFailed('apps', error);
  }
  if (toRemove.length > 0) {
    const { error } = await supabase
      .from('business_apps')
      .delete()
      .in(
        'id',
        toRemove.map((a) => a.id),
      );
    warnSaveFailed('app removal', error);
  }
}
