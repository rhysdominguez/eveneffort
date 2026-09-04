"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { usePopover } from "@/hooks/usePopover";

// Shared top nav, rendered for every page via the root layout.
//
// Sticky to the top of the viewport on every page EXCEPT home (see isHome
// below) — those pages are ordinary document scrolls, so this stays visible
// everywhere as you scroll. z-30 keeps it above the date/time popovers
// (z-20), which should slide under it rather than over.
//
// On those same pages it also COMPRESSES once scrolled: only the vertical
// padding changes, so the wordmark stays exactly the same size and stays
// vertically centred — the bar just gets shorter.

// The link group is DATA, not markup — a new tool appends one object here
// rather than editing markup twice (the desktop row and the mobile panel both
// render from this). Labels are duplicated in SiteFooter's Product column and
// must keep saying the same words as these.
//
// THE DESKTOP ROW BREAKS AT `lg`, NOT `sm`, AND THAT IS A FIT CONSTRAINT.
// Five text-sm labels are ~600px of text; with `gap-6` and the wordmark's
// ~160px the bar wants ~930px, so at the original `sm` seam it overflowed
// everywhere between 640px and 1024px. Below `lg` the links now live behind the
// menu button, which already existed and needed no change.
//
// Widening the breakpoint is the lever to pull when a sixth tool arrives too;
// a narrower gap buys ~25px an entry and runs out immediately. What must NOT be
// touched to make room is the padding/margin pair further down — that is
// load-bearing for scroll anchoring, not for fit.
const NAV_LINKS = [
  { label: "Pacing calculator", href: "/" },
  { label: "Race comparison", href: "/compare" },
  { label: "Course rankings", href: "/courses" },
  { label: "Boston qualifier", href: "/boston-qualifier" },
  { label: "Upload a course", href: "/upload" },
  { label: "Methodology", href: "/methodology" },
] as const;

// Hysteresis, not a single threshold. A trackpad delivers sub-pixel scroll
// deltas, so one boundary would let the state flip back and forth between
// consecutive frames and restart the transition each time — visible as a
// shaking bar. Compressing and expanding at different offsets gives a dead
// band that micro-movements can't cross.
const COMPRESS_ABOVE = 24;
const EXPAND_BELOW = 8;

// /results is the pacing calculator's own output rather than a fourth
// destination, so it marks that entry current instead of leaving the bar with
// nothing highlighted.
function isCurrent(href: string, pathname: string) {
  if (href === "/") return pathname === "/" || pathname.startsWith("/results");
  return pathname === href || pathname.startsWith(`${href}/`);
}

function linkClass(current: boolean) {
  return `text-sm transition-colors hover:text-[var(--color-text-primary)] ${
    current
      ? "text-[var(--color-text-primary)]"
      : "text-[var(--color-text-secondary)]"
  }`;
}

export function SiteNav() {
  // The home page has its own hero layout (headline + calculator side by
  // side, logo cloud below); sticky + compress was designed for the longer,
  // scroll-heavy result/methodology pages. On home the bar just scrolls
  // away with the rest of the hero, expanded, like ordinary page content.
  const pathname = usePathname();
  const isHome = pathname === "/";

  const [compressed, setCompressed] = useState(false);

  // Below `sm` the links live behind this. usePopover gives the two things a
  // menu needs for free — Escape (returning focus to the trigger) and an
  // outside pointer-down — with listeners attached only while open.
  const { open, setOpen, containerRef, triggerRef } = usePopover();

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

  // usePopover knows about pointers and keys but nothing about routing, and a
  // client-side navigation unmounts nothing here — so a tapped menu link would
  // otherwise leave the panel hanging open over the page it just opened.
  useEffect(() => {
    setOpen(false);
  }, [pathname, setOpen]);

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
    //
    // `relative` is for the mobile panel below: it hangs off THIS element so
    // it never enters the bar's own flow. An in-flow panel would change the
    // bar's height and hand the scroll-anchor loop straight back.
    <nav
      className={`${isHome ? "" : "sticky top-0 z-30"} relative shrink-0 border-b border-[var(--color-border)] bg-[var(--color-bg-surface)] transition-[margin] duration-200 ease-out print:hidden ${
        compressed ? "mb-8" : "mb-0"
      }`}
    >
      {/* Nothing in this row may exceed the wordmark's 32px
          (text-[2rem] leading-none), or the bar stops being the height it was
          in both states: the links are 20px of line box, the menu button is
          h-8 on the nose. If something doesn't fit, shrink the control — do
          not re-derive the padding/margin pair above to make room. */}
      <div
        className={`mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 transition-[padding] duration-200 ease-out ${
          compressed ? "py-2" : "py-6"
        }`}
      >
        <Link
          href="/"
          className="font-wordmark text-[2rem] leading-none tracking-tight text-[var(--color-text-primary)]"
        >
          eveneffort
        </Link>

        <div className="hidden items-center gap-6 lg:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isCurrent(link.href, pathname) ? "page" : undefined}
              className={linkClass(isCurrent(link.href, pathname))}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* The wrapper is usePopover's outside-click boundary, not the panel's
            positioning context — the panel resolves against the <nav>. */}
        <div ref={containerRef} className="lg:hidden">
          <button
            ref={triggerRef}
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="site-nav-menu"
            onClick={() => setOpen((was) => !was)}
            className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-control)] text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-elevated)]"
          >
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              className="h-4 w-4"
              aria-hidden="true"
            >
              {open ? (
                <>
                  <path d="M5 5 15 15" />
                  <path d="M15 5 5 15" />
                </>
              ) : (
                <>
                  <path d="M3 6h14" />
                  <path d="M3 10h14" />
                  <path d="M3 14h14" />
                </>
              )}
            </svg>
          </button>

          {open && (
            <div
              id="site-nav-menu"
              className="absolute inset-x-0 top-full z-30 border-b border-[var(--color-border)] bg-[var(--color-bg-surface)]"
            >
              <ul className="divide-y divide-[var(--color-border)]">
                {NAV_LINKS.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      aria-current={
                        isCurrent(link.href, pathname) ? "page" : undefined
                      }
                      className={`block px-6 py-3 ${linkClass(
                        isCurrent(link.href, pathname),
                      )}`}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
