"use client";
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import {
  applyTheme,
  DEFAULT_THEME,
  readAppliedTheme,
  subscribeTheme,
  type Theme,
} from "@/lib/theme";
import { setStoredState } from "@/lib/clientState";
import { THEME } from "@/lib/stateKeys";
import { useStoredState } from "@/hooks/useStoredState";

/**
 * The applied theme, and a setter that applies and persists it.
 *
 * The value comes from the <html> attribute, not from storage (see
 * src/lib/theme.ts), and the server snapshot is the default. So the
 * prerendered HTML and the hydrating render agree, and React re-renders with
 * the real theme straight afterwards, the same shape as `useStoredState`.
 *
 * Storage still gets one job here: another tab changing the preference. That
 * arrives as a stored-value change, and is applied to this tab's document. A
 * null stored value is ignored on purpose. It is what the hydrating render
 * sees before storage is read, and applying it would flash light over a dark
 * page the blocking script already set.
 */
export function useTheme(): [Theme, (theme: Theme) => void] {
  const theme = useSyncExternalStore(
    subscribeTheme,
    readAppliedTheme,
    () => DEFAULT_THEME,
  );

  const [stored] = useStoredState(THEME);
  useEffect(() => {
    if (stored) applyTheme(stored);
  }, [stored]);

  const set = useCallback((next: Theme) => {
    applyTheme(next);
    setStoredState(THEME, next);
  }, []);

  return useMemo(() => [theme, set], [theme, set]);
}
