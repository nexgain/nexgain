// Where Supabase keeps the signed-in session on the phone, so people stay
// logged in after closing the app. Uses Expo's built-in key-value store.
import Storage from 'expo-sqlite/kv-store';

export const sessionStorage = {
  getItem: (key: string) => Storage.getItem(key),
  setItem: (key: string, value: string) => Storage.setItem(key, value),
  removeItem: (key: string) => Storage.removeItem(key),
};
