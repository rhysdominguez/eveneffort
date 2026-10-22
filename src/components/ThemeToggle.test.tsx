import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { ThemeToggle } from "./ThemeToggle";
import { THEME_ATTRIBUTE } from "@/lib/theme";
import { THEME } from "@/lib/stateKeys";
import { readState, writeState } from "@/lib/clientState";
import { clearStoredState } from "@/test/storage";

const html = () => document.documentElement;
const button = (container: HTMLElement) =>
  container.querySelector<HTMLButtonElement>("button")!;

beforeEach(() => {
  html().removeAttribute(THEME_ATTRIBUTE);
  clearStoredState();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ThemeToggle", () => {
  it("is a pressed-state button under one fixed name", () => {
    const { container } = render(<ThemeToggle />);
    const toggle = button(container);
    // A label that flipped between "Switch to dark" and "Switch to light" would
    // have a screen reader announcing a different control after every press.
    expect(toggle.getAttribute("aria-label")).toBe("Dark mode");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
  });

  it("goes dark, remembers it, and goes back", () => {
    const { container } = render(<ThemeToggle />);
    const toggle = button(container);

    fireEvent.click(toggle);
    expect(html().getAttribute(THEME_ATTRIBUTE)).toBe("dark");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(readState(THEME)).toBe("dark");

    fireEvent.click(toggle);
    expect(html().getAttribute(THEME_ATTRIBUTE)).toBe("light");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(readState(THEME)).toBe("light");
  });

  it("reads as pressed when the page arrived already dark", () => {
    // What the blocking script leaves behind before React exists.
    html().setAttribute(THEME_ATTRIBUTE, "dark");
    const { container } = render(<ThemeToggle />);
    expect(button(container).getAttribute("aria-pressed")).toBe("true");
  });

  it("does not repaint a dark page light while it hydrates", () => {
    // The hydrating render sees "nothing stored" before storage is read. If
    // that were treated as "the reader wants light", every dark-mode page load
    // would flash white right after the script had painted it dark. Nothing is
    // stored here on purpose: only the attribute says dark.
    html().setAttribute(THEME_ATTRIBUTE, "dark");
    render(<ThemeToggle />);
    expect(html().getAttribute(THEME_ATTRIBUTE)).toBe("dark");
  });

  it("follows the preference when another tab changes it", () => {
    const { container } = render(<ThemeToggle />);
    expect(button(container).getAttribute("aria-pressed")).toBe("false");

    act(() => {
      writeState(THEME, "dark");
      window.dispatchEvent(new StorageEvent("storage", { key: THEME.key }));
    });

    expect(html().getAttribute(THEME_ATTRIBUTE)).toBe("dark");
    expect(button(container).getAttribute("aria-pressed")).toBe("true");
  });

  it("still switches for the visit when storage refuses to save", () => {
    // Safari private mode throws from setItem. The DOM is the source of truth,
    // so the toggle keeps working; it just will not survive a reload.
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    const { container } = render(<ThemeToggle />);
    const toggle = button(container);

    fireEvent.click(toggle);
    expect(html().getAttribute(THEME_ATTRIBUTE)).toBe("dark");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
  });

  it("ships both glyphs, and leaves choosing one to CSS", () => {
    // Choosing the icon in React would put the wrong one on screen for every
    // dark-mode reader until hydration. See the header of ThemeToggle.tsx.
    const { container } = render(<ThemeToggle />);
    expect(container.querySelector(".theme-toggle-moon")).not.toBeNull();
    expect(container.querySelector(".theme-toggle-sun")).not.toBeNull();
  });
});
