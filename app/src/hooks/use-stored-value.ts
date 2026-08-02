import { useCallback, useSyncExternalStore } from "react";

// `storage` only fires for other tabs, so same-tab writes go through
// `writeStoredValue` to notify local subscribers.
const listeners = new Set<() => void>();

const subscribe = (onChange: () => void) => {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
};

export const writeStoredValue = (key: string, value: string | null) => {
  try {
    if (value === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  } catch {
    // Storage can be unavailable (private mode, quota); the read falls back.
  }
  listeners.forEach((listener) => listener());
};

/**
 * A localStorage entry read through `useSyncExternalStore`, so it resolves in
 * the hydration render instead of committing a second one. Null on the server.
 */
export const useStoredValue = (key: string): string | null => {
  const getSnapshot = useCallback(() => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }, [key]);

  return useSyncExternalStore(subscribe, getSnapshot, () => null);
};
