// The colour theme is an attribute on <html>, and the DOM is its source of
// truth. Everything else follows it: the tokens in globals.css swap under
// `[data-theme="dark"]`, the toggle reads it, the map re-skins on it.
//
// Storage is only how the choice survives a reload (`THEME` in stateKeys.ts).
// Keeping the DOM authoritative means a browser that refuses to persist
// (Safari private mode, a sandboxed iframe) still gets a working toggle for
// the visit, instead of one that flips the store and appears to do nothing.
import { THEME, type Theme } from "@/lib/stateKeys";

export type { Theme };

export const THEME_ATTRIBUTE = "data-theme";

/** What the page is, with no attribute to say otherwise. */
export const DEFAULT_THEME: Theme = "light";

const listeners = new Set<() => void>();

/** The theme currently applied to the document. Light on the server. */
export function readAppliedTheme(): Theme {
  if (typeof document === "undefined") return DEFAULT_THEME;
  return document.documentElement.getAttribute(THEME_ATTRIBUTE) === "dark"
    ? "dark"
    : DEFAULT_THEME;
}

/** Apply a theme to the document and tell subscribers. Does not persist. */
export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  if (readAppliedTheme() === theme) return;
  document.documentElement.setAttribute(THEME_ATTRIBUTE, theme);
  for (const listener of listeners) listener();
}

/** For `useSyncExternalStore`. */
export function subscribeTheme(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/**
 * The blocking script `layout.tsx` inlines in <head>.
 *
 * The home page is prerendered, so the server cannot know the stored choice,
 * and applying it from a React effect paints one white frame first: a flash
 * of the wrong theme, on a dark-mode reader's every page load. This runs
 * before first paint instead and sets the attribute the CSS keys off.
 *
 * Built from `THEME.key` so it reads exactly what `writeState` wrote (a JSON
 * string, so the stored value is `"dark"` with its quotes). Anything other
 * than a stored "dark" leaves the page light, and every failure (storage
 * blocked, corrupt JSON) is swallowed so it cannot surface as a console error
 * on every page load.
 */
export function themeInitScript(): string {
  return `try{if(JSON.parse(localStorage.getItem(${JSON.stringify(THEME.key)}))==="dark")document.documentElement.setAttribute(${JSON.stringify(THEME_ATTRIBUTE)},"dark")}catch(e){}`;
}
