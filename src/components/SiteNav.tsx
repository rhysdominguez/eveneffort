"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// Shared top nav, rendered for every page via the root layout. Links are
// intentionally inert (href="#") — slots for future routes, not built yet.
//
// Sticky to the top of the viewport on every page EXCEPT home (see isHome
// below) — those pages are ordinary document scrolls, so this stays visible
// everywhere as you scroll. z-30 keeps it above the date/time popovers
// (z-20), which should slide under it rather than over.
//
// On those same pages it also COMPRESSES once scrolled: only the vertical
// padding changes, so the wordmark and link text stay exactly the same size
// and stay vertically centred — the bar just gets shorter.
const NAV_LINKS = [{ label: "Our Methodology", href: "/methodology" }] as const;

// Hysteresis, not a single threshold. A trackpad delivers sub-pixel scroll
// deltas, so one boundary would let the state flip back and forth between
// consecutive frames and restart the transition each time — visible as a
// shaking bar. Compressing and expanding at different offsets gives a dead
// band that micro-movements can't cross.
const COMPRESS_ABOVE = 24;
const EXPAND_BELOW = 8;

export function SiteNav() {
  // The home page has its own hero layout (headline + calculator side by
  // side, logo cloud below); sticky + compress was designed for the longer,
  // scroll-heavy result/methodology pages. On home the bar just scrolls
  // away with the rest of the hero, expanded, like ordinary page content.
  const pathname = usePathname();
  const isHome = pathname === "/";

  const [compressed, setCompressed] = useState(false);

  useEffect(() => {
    if (isHome) {
      setCompressed(false);
      return;
    }
    // Read once on mount too: a restored scroll position (back navigation, or
    // a reload partway down) must render compressed without waiting for a
    // scroll event that may never come.
    const sync = () =>
      setCompressed((was) =>
        was ? window.scrollY > EXPAND_BELOW : window.scrollY > COMPRESS_ABOVE,
      );
    sync();
    window.addEventListener("scroll", sync, { passive: true });
    return () => window.removeEventListener("scroll", sync);
  }, [isHome]);

  return (
    // The bar is sticky, which means it stays IN DOCUMENT FLOW — so shrinking
    // it would shorten the document and pull everything below it upwards. The
    // browser's scroll anchoring then nudges scrollY to compensate, which
    // re-evaluates the threshold and can flip the state straight back: a
    // feedback loop that showed up as the bar shaking during slow scrolling.
    //
    // Fix: hold the FLOW height constant. Whatever vertical padding the bar
    // gives up when compressing (py-6 → py-2, i.e. 16px × 2 = 32px) is handed
    // back as bottom margin (mb-8 = 32px), so the document height never
    // changes and nothing below ever moves. The two must stay in step, and
    // both transitions must share a duration and easing so the sum stays
    // constant mid-animation, not just at the endpoints.
    <nav
      className={`${isHome ? "" : "sticky top-0 z-30"} shrink-0 border-b border-[var(--color-border)] bg-[var(--color-bg-surface)] transition-[margin] duration-200 ease-out print:hidden ${
        compressed ? "mb-8" : "mb-0"
      }`}
    >
      <div
        className={`mx-auto flex max-w-7xl items-center justify-between px-6 transition-[padding] duration-200 ease-out ${
          compressed ? "py-2" : "py-6"
        }`}
      >
        <Link
          href="/"
          className="font-wordmark text-[2rem] leading-none tracking-tight text-[var(--color-text-primary)]"
        >
          eveneffort
        </Link>
        <ul className="flex items-center gap-10">
          {NAV_LINKS.map(({ label, href }) => (
            <li key={label}>
              <Link
                href={href}
                className="text-lg font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
