import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { SiteNav } from "./SiteNav";

// First next/navigation mock in the repo. vi.hoisted so the factory can read a
// pathname the tests reassign — vi.mock is hoisted above ordinary consts.
const route = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));

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
    const { container } = render(<SiteNav />);
    // Two of each — the desktop row and the mobile panel share NAV_LINKS, but
    // the panel is closed here, so one apiece.
    expect(container.querySelectorAll('a[href="/methodology"]')).toHaveLength(1);
    // The wordmark plus the calculator entry, which share the href.
    expect(container.querySelectorAll('a[href="/"]')).toHaveLength(2);
  });

  // Inverted when ROADMAP #8 shipped the page. It previously asserted the
  // opposite — that /compare was NOT linked — for as long as the route was a
  // 404.
  it("links the race comparison (ROADMAP #8)", () => {
    const { container } = render(<SiteNav />);
    expect(container.querySelector('a[href="/compare"]')).not.toBeNull();
  });

  it("marks /compare current when it is the page", () => {
    route.pathname = "/compare";
    const { container } = render(<SiteNav />);
    const current = container.querySelectorAll('a[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0].getAttribute("href")).toBe("/compare");
  });

  it("marks the current page, and counts /results as the calculator", () => {
    route.pathname = "/methodology";
    const { container } = render(<SiteNav />);
    expect(
      container.querySelector('a[href="/methodology"]')?.getAttribute("aria-current"),
    ).toBe("page");

    route.pathname = "/results";
    const results = render(<SiteNav />);
    const current = results.container.querySelectorAll('a[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0].getAttribute("href")).toBe("/");
  });

  it("is sticky everywhere except home", () => {
    const home = render(<SiteNav />);
    expect(home.container.querySelector("nav")?.className).not.toContain("sticky");

    route.pathname = "/methodology";
    const other = render(<SiteNav />);
    expect(other.container.querySelector("nav")?.className).toContain("sticky top-0");
  });

  it("holds its flow height constant while compressing", () => {
    route.pathname = "/methodology";
    const { container } = render(<SiteNav />);
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
    const { container } = render(<SiteNav />);
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
    const { container, rerender } = render(<SiteNav />);
    fireEvent.click(container.querySelector("button")!);
    expect(container.querySelector("#site-nav-menu")).not.toBeNull();

    route.pathname = "/methodology";
    rerender(<SiteNav />);
    expect(container.querySelector("#site-nav-menu")).toBeNull();
  });

  it("stays off the printed page", () => {
    const { container } = render(<SiteNav />);
    expect(container.querySelector("nav")?.className).toContain("print:hidden");
  });
});
