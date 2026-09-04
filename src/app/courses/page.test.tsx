import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { FIXTURE_CATALOG } from "@/data/courses.fixture";

// The catalog is the only thing this page fetches, and Rule 9 says the build
// and the test suite must both survive with no database reachable — where
// `getCourseCatalog` degrades to an empty array rather than throwing. That
// branch is three lines of the page and is exactly the one no browser check
// will ever exercise on a machine that has a connection string.
const getCourseCatalog = vi.hoisted(() => vi.fn());
vi.mock("@/db/queries", () => ({ getCourseCatalog }));

import CoursesPage from "./page";

const renderPage = async () => render(await CoursesPage());

describe("/courses", () => {
  it("renders the ranking when the catalog has races", async () => {
    getCourseCatalog.mockResolvedValue(FIXTURE_CATALOG);
    const { container } = await renderPage();
    expect(container.querySelectorAll("tbody tr")).toHaveLength(
      FIXTURE_CATALOG.length,
    );
    expect(container.textContent).toContain("Which marathon courses actually run fast");
  });

  it("says so plainly, and renders no table, with no database", async () => {
    getCourseCatalog.mockResolvedValue([]);
    const { container } = await renderPage();
    expect(container.querySelector("table")).toBeNull();
    expect(container.textContent).toContain("loading their races");
  });
});
