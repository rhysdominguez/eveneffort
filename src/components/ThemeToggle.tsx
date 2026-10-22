"use client";
import { useTheme } from "@/hooks/useTheme";

// Light / dark switch for the nav. Manual and two-state on purpose: the page is
// white by design, so the site never picks dark for anyone; this is a control
// for the reader who wants it. See DESIGN.md § Theme.
//
// It is a pressed-state button under a fixed label, not a button whose label
// flips between "Switch to dark" and "Switch to light". A changing name makes
// a screen reader announce a different control after every press, while
// `aria-pressed` is the pattern that says "this is a switch and it is now on".
//
// Both glyphs are always in the DOM and globals.css decides which one shows off
// the `data-theme` attribute. The alternative, choosing the glyph in React from
// the theme, would render the wrong one on the server for every dark-mode
// reader and swap it after hydration, a visible flicker in the one control
// whose job is to look right about the theme. `.theme-toggle-*` lives there for
// that reason and holds no colours, only which glyph is shown.
//
// 32px square, the same box as the nav's menu button: nothing in that row may
// be taller than the wordmark's 32px (see SiteNav).
export function ThemeToggle() {
  const [theme, setTheme] = useTheme();
  const dark = theme === "dark";

  return (
    <button
      type="button"
      aria-label="Dark mode"
      aria-pressed={dark}
      onClick={() => setTheme(dark ? "light" : "dark")}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-elevated)]"
    >
      <svg
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
        aria-hidden="true"
      >
        {/* Shown in light mode: pressing it goes dark. */}
        <path
          className="theme-toggle-moon"
          d="M17.5 10.66A7.5 7.5 0 1 1 9.34 2.5a5.83 5.83 0 0 0 8.16 8.16Z"
        />
        {/* Shown in dark mode: pressing it goes light. */}
        <g className="theme-toggle-sun">
          <circle cx="10" cy="10" r="3.25" />
          <path d="M10 2.5v1.5M10 16v1.5M2.5 10H4M16 10h1.5M4.7 4.7l1.06 1.06M14.24 14.24l1.06 1.06M4.7 15.3l1.06-1.06M14.24 5.76l1.06-1.06" />
        </g>
      </svg>
    </button>
  );
}
