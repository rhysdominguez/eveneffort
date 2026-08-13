/**
 * Reset both browser stores between tests.
 *
 * jsdom hands every test in a file the same `sessionStorage` and
 * `localStorage`, so anything a component persists leaks forward and silently
 * sets up the next test. Any suite rendering a component that persists state
 * needs this in a `beforeEach`.
 *
 * `window.`-qualified deliberately: Node exposes its own `localStorage` global
 * which shadows jsdom's and is unavailable unless the process was started with
 * `--localstorage-file`. The bare identifier therefore reads as `undefined`
 * here while `window.localStorage` is the real jsdom store the app writes to.
 */
export function clearStoredState(): void {
  window.sessionStorage.clear();
  window.localStorage.clear();
}
