import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { FIXTURE_CATALOG } from "@/data/courses.fixture";

// The catalog query is the route's only dependency on the outside world, so it
// is stubbed at the module boundary — the same shape SummaryHeader's tests use
// for analytics and checkout. Nothing here opens a connection (Rule 9).
const db = vi.hoisted(() => ({ catalog: [] as unknown[] }));
vi.mock("@/db/queries", () => ({
  getCourseCatalog: async () => db.catalog,
}));

const { default: ComparePage } = await import("./page");

const page = async (params: Record<string, string> = {}) =>
  render(await ComparePage({ searchParams: Promise.resolve(params) }));

beforeEach(() => {
  db.catalog = FIXTURE_CATALOG;
});

describe("ComparePage", () => {
  it("renders the comparison when the catalog is there", async () => {
    const { container } = await page({ from: "boston", to: "berlin", t: "12000" });
    expect(container.querySelectorAll('[role="combobox"]')).toHaveLength(2);
    expect(container.textContent).toContain("3:21:10");
  });

  // Rule 9: the build and the test suite both run with no database reachable,
  // so an empty catalog is a normal state for this route, not an edge case.
  it("degrades to a placeholder rather than breaking with no database", async () => {
    db.catalog = [];
    const { container } = await page({ from: "boston", to: "berlin", t: "12000" });
    expect(container.querySelector(".border-dashed")).not.toBeNull();
    expect(container.textContent).toContain(
      "The race comparison is loading its courses",
    );
    // The client island must not render at all — it would have nothing to
    // search and no effort figures to convert with.
    expect(container.querySelectorAll('[role="combobox"]')).toHaveLength(0);
  });

  it("renders the bare page with nothing selected", async () => {
    const { container } = await page();
    expect(container.querySelectorAll('[role="combobox"]')).toHaveLength(2);
    expect(
      container.querySelector('[aria-label="Comparison result"]'),
    ).toBeNull();
  });

  it("survives junk in the query string", async () => {
    // parseCompareParams has no failure case on purpose; a malformed slug
    // drops to an empty picker instead of replacing a usable page with an
    // error. Asserted here because it is the route's contract, not just the
    // parser's.
    const { container } = await page({
      from: "Boston",
      to: "berlin",
      t: "-5",
    });
    expect(container.querySelector('[aria-label="Comparison result"]')).toBeNull();
    expect(container.querySelectorAll('[role="combobox"]')).toHaveLength(2);
  });
});
