// Saves small bits of data on the phone so they survive closing the app.
// Uses Expo's built-in key-value store (included in Expo Go).
import Storage from 'expo-sqlite/kv-store';

export function loadJSON<T>(key: string): T | null {
  try {
    const raw = Storage.getItemSync(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveJSON(key: string, value: unknown) {
  try {
    Storage.setItemSync(key, JSON.stringify(value));
  } catch {
    // Saving failed (e.g. storage full); the app keeps working with in-memory data.
  }
}
