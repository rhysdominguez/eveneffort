import { describe, it, expect, beforeAll, vi } from "vitest";
import { render } from "@testing-library/react";
import { FIXTURE_CATALOG } from "@/data/courses.fixture";
import { CourseLibrary } from "./CourseLibrary";

// jsdom has neither IntersectionObserver nor a WebGL context. The stub records
// that the map registered for visibility but never fires, so `maplibre-gl` is
// never imported and no map is constructed — which is precisely the production
// behaviour on a visit that never scrolls this far, and the reason every
// testable decision lives in courseMapData.ts instead of the component.
beforeAll(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
      root = null;
      rootMargin = "";
      thresholds: number[] = [];
    },
  );
});

describe("CourseLibrary", () => {
  it("renders the band heading", () => {
    const { container } = render(<CourseLibrary catalog={FIXTURE_CATALOG} />);
    const text = container.textContent ?? "";
    expect(text).toContain("Find your race on the map");
  });

  it("renders the map region with a Near me control", () => {
    const { container } = render(<CourseLibrary catalog={FIXTURE_CATALOG} />);
    expect(container.querySelector('[role="region"]')).not.toBeNull();
    expect(container.textContent).toContain("Near me");
  });

  it("lists every race as the map's text equivalent", () => {
    const { container } = render(<CourseLibrary catalog={FIXTURE_CATALOG} />);
    const items = container.querySelectorAll(".sr-only li");
    expect(items).toHaveLength(FIXTURE_CATALOG.length);
    const text = container.textContent ?? "";
    for (const course of FIXTURE_CATALOG) {
      expect(text).toContain(course.displayName);
      expect(text).toContain(`${course.city}, ${course.countryName}`);
    }
  });

  it("has no focusable controls inside the screen-reader list", () => {
    // Focusable elements inside `sr-only` are invisible tab stops.
    const { container } = render(<CourseLibrary catalog={FIXTURE_CATALOG} />);
    const list = container.querySelector(".sr-only")!;
    expect(list.querySelectorAll("a, button, input, select")).toHaveLength(0);
  });

  it("shows the empty state instead of a map when no courses are configured", () => {
    // The normal path with no DATABASE_URL — the build and test suite both run
    // without one, so this must not render an empty map or crash.
    const { container } = render(<CourseLibrary catalog={[]} />);
    const text = container.textContent ?? "";
    expect(text).toContain("Find your race on the map");
    expect(text).toContain("loading its races");
    expect(container.querySelector('[role="region"]')).toBeNull();
    expect(text).not.toContain("Near me");
  });

  it("renders without a HomeSelectionProvider above it", () => {
    // Every test here mounts the band bare. Selecting a course is a no-op
    // without the provider rather than a crash.
    expect(() =>
      render(<CourseLibrary catalog={FIXTURE_CATALOG} />),
    ).not.toThrow();
  });
});
