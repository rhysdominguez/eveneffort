import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  applyTheme,
  readAppliedTheme,
  subscribeTheme,
  themeInitScript,
  THEME_ATTRIBUTE,
} from "@/lib/theme";
import { THEME } from "@/lib/stateKeys";
import { writeState } from "@/lib/clientState";
import { clearStoredState } from "@/test/storage";

const html = () => document.documentElement;

beforeEach(() => {
  html().removeAttribute(THEME_ATTRIBUTE);
  clearStoredState();
});

describe("applied theme", () => {
  it("is light until something says otherwise", () => {
    expect(readAppliedTheme()).toBe("light");
  });

  it("follows the attribute on <html>, which is its source of truth", () => {
    applyTheme("dark");
    expect(html().getAttribute(THEME_ATTRIBUTE)).toBe("dark");
    expect(readAppliedTheme()).toBe("dark");

    applyTheme("light");
    expect(readAppliedTheme()).toBe("light");
  });

  it("tells subscribers about a change, and only about a change", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeTheme(listener);

    applyTheme("dark");
    expect(listener).toHaveBeenCalledTimes(1);

    // Same theme again: nothing changed, so nothing should re-render.
    applyTheme("dark");
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    applyTheme("light");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not persist by itself", () => {
    // Persisting is the setter's job (useTheme). Applying from another tab's
    // storage event must not write straight back into storage.
    applyTheme("dark");
    expect(window.localStorage.getItem(THEME.key)).toBeNull();
  });
});

describe("the blocking init script", () => {
  // The script runs before the app does, so it cannot import anything and reads
  // browser globals. `new Function` with those as parameters is how a test hands
  // it jsdom's storage: the bare `localStorage` global in this environment is
  // Node's inert one (see src/test/setup.ts).
  function run(storage: Pick<Storage, "getItem"> = window.localStorage) {
    new Function("localStorage", "document", themeInitScript())(
      storage,
      document,
    );
  }

  it("reads the very key the app writes, in the format the app writes it", () => {
    // Round-trips through `writeState` rather than a hand-typed string, so a
    // change to the key or to how values are serialised fails here instead of
    // shipping a flash of the wrong theme.
    writeState(THEME, "dark");
    run();
    expect(html().getAttribute(THEME_ATTRIBUTE)).toBe("dark");
  });

  it("is built from the key, not a copy of it", () => {
    expect(themeInitScript()).toContain(JSON.stringify(THEME.key));
  });

  it("leaves the page light when nothing is stored", () => {
    run();
    expect(html().hasAttribute(THEME_ATTRIBUTE)).toBe(false);
  });

  it("leaves the page light for a stored light", () => {
    writeState(THEME, "light");
    run();
    expect(html().hasAttribute(THEME_ATTRIBUTE)).toBe(false);
  });

  it("does not believe a stored value it does not recognise", () => {
    window.localStorage.setItem(THEME.key, JSON.stringify("purple"));
    run();
    expect(html().hasAttribute(THEME_ATTRIBUTE)).toBe(false);
  });

  it("survives corrupt JSON", () => {
    window.localStorage.setItem(THEME.key, "{not json");
    expect(run).not.toThrow();
    expect(html().hasAttribute(THEME_ATTRIBUTE)).toBe(false);
  });

  it("survives storage that throws on read", () => {
    // Sandboxed iframes, and some privacy modes, throw from getItem itself.
    const hostile = {
      getItem: () => {
        throw new Error("SecurityError");
      },
    };
    expect(() => run(hostile)).not.toThrow();
    expect(html().hasAttribute(THEME_ATTRIBUTE)).toBe(false);
  });

  it("never looks at the system colour-scheme preference", () => {
    // The site is white by design. The script is the one place that could
    // quietly start choosing for people who never asked.
    expect(themeInitScript()).not.toContain("matchMedia");
    expect(themeInitScript()).not.toContain("prefers-color-scheme");
  });
});
