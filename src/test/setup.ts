// Vitest setup. Environment repair only — nothing here changes app behaviour.

/**
 * Restore `window.localStorage`.
 *
 * jsdom builds a working store and parks it on `window._localStorage`, but the
 * public `localStorage` getter resolves to `undefined` under Vitest's jsdom
 * environment (Node's own experimental `localStorage` global, which is inert
 * without `--localstorage-file`, participates in the shadowing). Real browsers
 * are unaffected — this is purely a test-environment gap, and without the patch
 * every localStorage-backed path silently reads as "storage unavailable" and
 * can never be asserted on.
 *
 * `sessionStorage` is unaffected and left alone.
 */
// Guarded: setup files run for every suite, including the ones that opt into
// the `node` environment with a `@vitest-environment` docblock, where there is
// no window at all.
if (typeof window !== "undefined") {
  const backing = (window as unknown as Record<string, Storage | undefined>)
    ._localStorage;
  if (backing && !window.localStorage) {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: () => backing,
    });
  }
}
