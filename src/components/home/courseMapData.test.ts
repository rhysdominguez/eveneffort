import { describe, it, expect } from "vitest";
import { FIXTURE_CATALOG } from "@/data/courses.fixture";
import type { CourseSummary } from "@/types";
import {
  boundsOf,
  coursesToGeoJSON,
  escapeHtml,
  haversineKm,
  nearestCourse,
  pinDateLabel,
  pinLocationLabel,
  popupMarkup,
  POPUP_COURSE_ATTR,
  type CoursePinProperties,
} from "./courseMapData";

const course = (over: Partial<CourseSummary>): CourseSummary => ({
  id: "test",
  seriesSlug: "test-marathon",
  displayName: "Test Marathon",
  city: "Testville",
  countryCode: "US",
  countryName: "United States",
  regionCode: null,
  regionName: null,
  cityLat: 0,
  cityLon: 0,
  start: { lat: 0, lon: 0 },
  timezone: "UTC",
  nextRaceDateISO: null,
  ...over,
});

const props = (over: Partial<CoursePinProperties> = {}): CoursePinProperties => ({
  id: "boston",
  displayName: "Boston Marathon",
  city: "Boston",
  countryName: "United States",
  nextRaceDateISO: null,
  ...over,
});

describe("coursesToGeoJSON", () => {
  it("emits one feature per seeded course", () => {
    const fc = coursesToGeoJSON(FIXTURE_CATALOG);
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features).toHaveLength(FIXTURE_CATALOG.length);
    expect(fc.features.map((f) => f.properties.id).sort()).toEqual(
      FIXTURE_CATALOG.map((c) => c.id).sort(),
    );
  });

  it("orders coordinates longitude-first", () => {
    // The inversion bug: Boston is at 42N, -71E. Swapped, it lands in the
    // Southern Ocean off Antarctica, which renders as a pin in empty water
    // rather than an error — so assert the order explicitly.
    const boston = FIXTURE_CATALOG.find((c) => c.id === "boston")!;
    const feature = coursesToGeoJSON([boston]).features[0];
    expect(feature.geometry.coordinates).toEqual([
      boston.cityLon,
      boston.cityLat,
    ]);
    expect(feature.geometry.coordinates[0]).toBeLessThan(0); // west of Greenwich
    expect(feature.geometry.coordinates[1]).toBeGreaterThan(40); // northern
  });

  it("carries the properties the popup needs", () => {
    const feature = coursesToGeoJSON([
      course({ id: "x", displayName: "X Marathon", nextRaceDateISO: "2027-03-01" }),
    ]).features[0];
    expect(feature.properties).toEqual({
      id: "x",
      displayName: "X Marathon",
      city: "Testville",
      countryName: "United States",
      nextRaceDateISO: "2027-03-01",
    });
  });

  it("drops courses with missing or out-of-range coordinates", () => {
    const fc = coursesToGeoJSON([
      course({ id: "nan", cityLat: Number.NaN, cityLon: 10 }),
      course({ id: "over", cityLat: 91, cityLon: 10 }),
      course({ id: "wrapped", cityLat: 10, cityLon: 181 }),
      course({ id: "good", cityLat: 10, cityLon: 10 }),
    ]);
    expect(fc.features.map((f) => f.properties.id)).toEqual(["good"]);
  });

  it("returns an empty collection for an empty catalog", () => {
    expect(coursesToGeoJSON([]).features).toEqual([]);
  });
});

describe("boundsOf", () => {
  it("returns null when nothing is plottable", () => {
    expect(boundsOf([])).toBeNull();
    expect(boundsOf([course({ cityLat: Number.NaN })])).toBeNull();
  });

  it("boxes every seeded course", () => {
    const bounds = boundsOf(FIXTURE_CATALOG)!;
    const [[west, south], [east, north]] = bounds;
    for (const c of FIXTURE_CATALOG) {
      expect(c.cityLon).toBeGreaterThanOrEqual(west);
      expect(c.cityLon).toBeLessThanOrEqual(east);
      expect(c.cityLat).toBeGreaterThanOrEqual(south);
      expect(c.cityLat).toBeLessThanOrEqual(north);
    }
    // Sydney is the southern and eastern extreme of the seeded seven.
    expect(south).toBeLessThan(-30);
    expect(east).toBeGreaterThan(150);
  });

  it("degenerates to a point for a single course", () => {
    expect(boundsOf([course({ cityLat: 5, cityLon: 6 })])).toEqual([
      [6, 5],
      [6, 5],
    ]);
  });
});

describe("haversineKm", () => {
  it("is zero for identical points", () => {
    expect(haversineKm(51.5, -0.1, 51.5, -0.1)).toBe(0);
  });

  it("matches the known London–Paris great-circle distance", () => {
    // ~344 km centre to centre.
    expect(haversineKm(51.5074, -0.1278, 48.8566, 2.3522)).toBeCloseTo(343.5, 0);
  });

  it("is symmetric", () => {
    const there = haversineKm(35.68, 139.76, -33.87, 151.21);
    const back = haversineKm(-33.87, 151.21, 35.68, 139.76);
    expect(there).toBeCloseTo(back, 6);
  });
});

describe("nearestCourse", () => {
  it("picks Boston for a runner in New England", () => {
    const found = nearestCourse(FIXTURE_CATALOG, 42.36, -71.06)!;
    expect(found.course.id).toBe("boston");
    expect(found.distanceKm).toBeLessThan(50);
  });

  it("picks Tokyo for a runner in Japan", () => {
    expect(nearestCourse(FIXTURE_CATALOG, 35.68, 139.76)!.course.id).toBe(
      "tokyo",
    );
  });

  it("returns null when nothing is plottable", () => {
    expect(nearestCourse([], 0, 0)).toBeNull();
    expect(nearestCourse([course({ cityLon: Number.NaN })], 0, 0)).toBeNull();
  });
});

describe("pin labels", () => {
  it("joins city and country", () => {
    expect(pinLocationLabel(props())).toBe("Boston, United States");
  });

  it("formats a scheduled date without Intl", () => {
    expect(pinDateLabel(props({ nextRaceDateISO: "2027-04-19" }))).toBe(
      "April 19th, 2027",
    );
  });

  it("falls back honestly when no edition is booked", () => {
    expect(pinDateLabel(props())).toBe("Next date to be confirmed");
    expect(pinDateLabel(props({ nextRaceDateISO: "not-a-date" }))).toBe(
      "Next date to be confirmed",
    );
  });
});

describe("popupMarkup", () => {
  it("includes the race, place, date and a CTA carrying the course id", () => {
    const html = popupMarkup(props({ nextRaceDateISO: "2027-04-19" }));
    expect(html).toContain("Boston Marathon");
    expect(html).toContain("Boston, United States");
    expect(html).toContain("April 19th, 2027");
    expect(html).toContain(`${POPUP_COURSE_ATTR}="boston"`);
  });

  it("escapes values so a quote in a race name cannot break the CTA", () => {
    const html = popupMarkup(
      props({ id: "rock-n-roll", displayName: `Rock 'n' Roll <b>Marathon</b>` }),
    );
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;b&gt;");
    expect(html).toContain("&#39;n&#39;");
  });
});

describe("escapeHtml", () => {
  it("escapes the five markup-significant characters", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });

  it("escapes the ampersand first so entities are not double-encoded oddly", () => {
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });
});
