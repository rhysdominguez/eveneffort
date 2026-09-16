import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { SiteNav } from "./SiteNav";
import { FIXTURE_CATALOG } from "@/data/courses.fixture";

// First next/navigation mock in the repo. vi.hoisted so the factory can read a
// pathname the tests reassign — vi.mock is hoisted above ordinary consts.
const route = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));

// The nav always sends "Pacing Calculator" to /results now, defaulting to the
// catalog's first course when nothing is stored yet — so every render needs a
// catalog, the same one the real layout fetches server-side.
const catalog = FIXTURE_CATALOG;

function scrollTo(y: number) {
  Object.defineProperty(window, "scrollY", {
    value: y,
    writable: true,
    configurable: true,
  });
  act(() => {
    window.dispatchEvent(new Event("scroll"));
  });
}

beforeEach(() => {
  route.pathname = "/";
  scrollTo(0);
});

describe("SiteNav", () => {
  it("carries the tool links", () => {
    const { container } = render(<SiteNav catalog={catalog} />);
    // Two of each — the desktop row and the mobile panel share NAV_LINKS, but
    // the panel is closed here, so one apiece.
    expect(container.querySelectorAll('a[href="/methodology"]')).toHaveLength(1);
    // Only the wordmark points at "/" — "Pacing Calculator" always points at
    // /results now, defaulting to the catalog's first course.
    expect(container.querySelectorAll('a[href="/"]')).toHaveLength(1);
    expect(
      container.querySelector(`a[href^="/results?courseId=${catalog[0].id}"]`),
    ).not.toBeNull();
  });

  // Inverted when ROADMAP #8 shipped the page. It previously asserted the
  // opposite — that /compare was NOT linked — for as long as the route was a
  // 404.
  it("links the race comparison (ROADMAP #8)", () => {
    const { container } = render(<SiteNav catalog={catalog} />);
    expect(container.querySelector('a[href="/compare"]')).not.toBeNull();
  });

  it("marks /compare current when it is the page", () => {
    route.pathname = "/compare";
    const { container } = render(<SiteNav catalog={catalog} />);
    const current = container.querySelectorAll('a[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0].getAttribute("href")).toBe("/compare");
  });

  it("marks the current page, and counts /results as the calculator", () => {
    route.pathname = "/methodology";
    const { container } = render(<SiteNav catalog={catalog} />);
    expect(
      container.querySelector('a[href="/methodology"]')?.getAttribute("aria-current"),
    ).toBe("page");

    route.pathname = "/results";
    const results = render(<SiteNav catalog={catalog} />);
    const current = results.container.querySelectorAll('a[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0].getAttribute("href")).toMatch(/^\/results\?/);
  });

  it("is sticky everywhere, home included", () => {
    const home = render(<SiteNav catalog={catalog} />);
    expect(home.container.querySelector("nav")?.className).toContain("sticky top-0");

    route.pathname = "/methodology";
    const other = render(<SiteNav catalog={catalog} />);
    expect(other.container.querySelector("nav")?.className).toContain("sticky top-0");
  });

  it("holds its flow height constant while compressing", () => {
    const { container } = render(<SiteNav catalog={catalog} />);
    const nav = container.querySelector("nav")!;
    const row = nav.firstElementChild!;

    // Expanded: full padding, no compensating margin.
    expect(nav.className).toContain("mb-0");
    expect(row.className).toContain("py-6");

    // Compressed: the 32px of padding given up is handed back as mb-8. These
    // two must always move together or the scroll-anchor shake comes back.
    scrollTo(100);
    expect(nav.className).toContain("mb-8");
    expect(row.className).toContain("py-2");
  });

  it("opens and closes the mobile menu", () => {
    const { container } = render(<SiteNav catalog={catalog} />);
    const button = container.querySelector("button")!;
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector("#site-nav-menu")).toBeNull();

    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    const panel = container.querySelector("#site-nav-menu")!;
    // Both rows render the same NAV_LINKS, so the panel must never drift from
    // the desktop group as entries are added (ROADMAP #8 adds one).
    const desktop = container.querySelector('div[class*="lg:flex"]')!;
    expect(panel.querySelectorAll("a")).toHaveLength(
      desktop.querySelectorAll("a").length,
    );
    // Absolutely positioned off the <nav>, so it never enters the bar's flow.
    expect(panel.className).toContain("absolute");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(container.querySelector("#site-nav-menu")).toBeNull();
  });

  it("closes the mobile menu on navigation", () => {
    const { container, rerender } = render(<SiteNav catalog={catalog} />);
    fireEvent.click(container.querySelector("button")!);
    expect(container.querySelector("#site-nav-menu")).not.toBeNull();

    route.pathname = "/methodology";
    rerender(<SiteNav catalog={catalog} />);
    expect(container.querySelector("#site-nav-menu")).toBeNull();
  });

  it("sends Pacing Calculator to /results, never back to the home page", () => {
    const { container } = render(<SiteNav catalog={catalog} />);
    const calculator = container.querySelector(
      'a[href^="/results"]',
    ) as HTMLAnchorElement;
    expect(calculator).not.toBeNull();
    expect(calculator.getAttribute("href")).toContain(`courseId=${catalog[0].id}`);
    expect(calculator.getAttribute("href")).toContain("goalTimeSeconds=14400");
  });

  it("stays off the printed page", () => {
    const { container } = render(<SiteNav catalog={catalog} />);
    expect(container.querySelector("nav")?.className).toContain("print:hidden");
  });
});
