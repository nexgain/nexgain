// Web version: the browser's own storage (the phone version uses expo-sqlite).
const hasStorage = () => typeof localStorage !== 'undefined';

export const sessionStorage = {
  getItem: async (key: string) => (hasStorage() ? localStorage.getItem(key) : null),
  setItem: async (key: string, value: string) => {
    if (hasStorage()) localStorage.setItem(key, value);
  },
  removeItem: async (key: string) => {
    if (hasStorage()) localStorage.removeItem(key);
  },
};
