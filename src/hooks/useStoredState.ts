"use client";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  getStateSnapshot,
  setStoredState,
  subscribeState,
  type StateKey,
} from "@/lib/clientState";

/**
 * Read one persisted value, and write it back.
 *
 * Returns `null` when nothing valid is stored — including on the server and
 * during the hydrating render — so callers fall back to their own defaults
 * with `stored ?? fallback`. That null is load-bearing rather than an
 * inconvenience: this app's home page is statically prerendered, and
 * `getServerSnapshot` returning null is what guarantees the first client render
 * matches the HTML the server sent. React re-renders with the real value
 * immediately afterwards, before paint.
 *
 * Deliberately NOT a `useState` wrapper that restores in an effect. That shape
 * has to run a layout effect on mount, which races any other effect touching
 * the same state, and it makes every consumer briefly render defaults it is
 * about to throw away.
 */
export function useStoredState<T>(
  key: StateKey<T>,
): [T | null, (value: T) => void] {
  const subscribe = useCallback(
    (onChange: () => void) => subscribeState(key, onChange),
    [key],
  );
  const getSnapshot = useCallback(() => getStateSnapshot(key), [key]);

  const stored = useSyncExternalStore(
    subscribe,
    getSnapshot,
    // Server snapshot: there is no browser storage during prerender, and
    // saying so is what keeps hydration honest.
    () => null,
  );

  const set = useCallback((value: T) => setStoredState(key, value), [key]);

  return useMemo(() => [stored, set], [stored, set]);
}
