import { useSyncExternalStore } from 'react';

/**
 * Minimal in-memory store shared across screens. Values reset when the app
 * restarts; swap the internals for a database client once one is connected.
 */
export function createStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();

  function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return {
    get: () => value,
    set(next: T | ((prev: T) => T)) {
      value = typeof next === 'function' ? (next as (prev: T) => T)(value) : next;
      listeners.forEach((listener) => listener());
    },
    use: () => useSyncExternalStore(subscribe, () => value, () => value),
  };
}
