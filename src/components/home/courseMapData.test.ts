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
  pinRaces,
  popupMarkup,
  POPUP_COURSE_ATTR,
  type CoursePinProperties,
} from "./courseMapData";

/**
 * `at` sets the START line — the coordinate the map plots. `cityLat/cityLon`
 * are left at the same point unless a test deliberately pulls them apart, so
 * a course reads as "the only race in its city", the 292-of-300 case.
 */
const at = (lat: number, lon: number): Partial<CourseSummary> => ({
  start: { lat, lon },
  cityLat: lat,
  cityLon: lon,
});

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
  effort: { km: 42.195, miles: 26.2188 },
  terrain: { gainM: 0, lossM: 0, netM: 0 },
  nextRaceDateISO: null,
  editions: [],
  ...over,
});

/** A one-race pin, the common case. `races` is the JSON-encoded property. */
const props = (
  race: { id?: string; displayName?: string; nextRaceDateISO?: string | null } = {},
  over: Partial<CoursePinProperties> = {},
): CoursePinProperties => ({
  startKey: "-71.06,42.36",
  city: "Boston",
  countryName: "United States",
  races: JSON.stringify([
    {
      id: "boston",
      displayName: "Boston Marathon",
      nextRaceDateISO: null,
      ...race,
    },
  ]),
  ...over,
});

describe("coursesToGeoJSON", () => {
  it("emits one feature per seeded course when each is in its own city", () => {
    // The core seven are seven distinct cities, so pins and courses are 1:1.
    const fc = coursesToGeoJSON(FIXTURE_CATALOG);
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features).toHaveLength(FIXTURE_CATALOG.length);
    expect(
      fc.features.flatMap((f) => pinRaces(f.properties).map((r) => r.id)).sort(),
    ).toEqual(FIXTURE_CATALOG.map((c) => c.id).sort());
  });

  it("plots each race at its own start line, not its city's coordinate", () => {
    // The Toronto bug. A city's coordinate IS the first-seeded race's start
    // line, and a second race never repoints it — so pinning the city put
    // Toronto Waterfront 11.6 km from where it actually starts, exactly on top
    // of Toronto Marathon. Stacked pins cluster into a "2" that no amount of
    // zooming can separate, so the second race was unreachable.
    const fc = coursesToGeoJSON([
      course({
        id: "toronto-marathon",
        displayName: "Toronto Marathon",
        city: "Toronto",
        ...at(43.76349, -79.41132),
      }),
      course({
        id: "toronto-waterfront-marathon",
        displayName: "Toronto Waterfront Marathon",
        city: "Toronto",
        // Downtown — its real start, and the city row does NOT point here.
        start: { lat: 43.66097, lon: -79.38293 },
        cityLat: 43.76349,
        cityLon: -79.41132,
      }),
    ]);

    expect(fc.features).toHaveLength(2);
    expect(fc.features.map((f) => f.geometry.coordinates)).toEqual([
      [-79.41132, 43.76349],
      [-79.38293, 43.66097],
    ]);
    // Far enough apart to pull cleanly apart when zoomed in.
    expect(haversineKm(43.76349, -79.41132, 43.66097, -79.38293)).toBeGreaterThan(
      10,
    );
  });

  it("merges only races that genuinely share one start line", () => {
    // Rare, but possible — a marathon and a variant setting off together.
    // Coincident features are the one thing the map cannot render, so they
    // still collapse into a single pin listing both.
    const fc = coursesToGeoJSON([
      course({ id: "a", displayName: "A Marathon", ...at(43.65, -79.38) }),
      course({ id: "b", displayName: "B Marathon", ...at(43.65, -79.38) }),
    ]);
    expect(fc.features).toHaveLength(1);
    expect(pinRaces(fc.features[0].properties).map((r) => r.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("orders coordinates longitude-first", () => {
    // The inversion bug: Boston is at 42N, -71E. Swapped, it lands in the
    // Southern Ocean off Antarctica, which renders as a pin in empty water
    // rather than an error — so assert the order explicitly.
    const boston = FIXTURE_CATALOG.find((c) => c.id === "boston")!;
    const feature = coursesToGeoJSON([boston]).features[0];
    expect(feature.geometry.coordinates).toEqual([
      boston.start.lon,
      boston.start.lat,
    ]);
    expect(feature.geometry.coordinates[0]).toBeLessThan(0); // west of Greenwich
    expect(feature.geometry.coordinates[1]).toBeGreaterThan(40); // northern
  });

  it("carries the properties the popup needs", () => {
    const feature = coursesToGeoJSON([
      course({ id: "x", displayName: "X Marathon", nextRaceDateISO: "2027-03-01" }),
    ]).features[0];
    expect(feature.properties).toEqual({
      startKey: "0,0",
      city: "Testville",
      countryName: "United States",
      races: JSON.stringify([
        { id: "x", displayName: "X Marathon", nextRaceDateISO: "2027-03-01" },
      ]),
    });
  });

  it("encodes races as a string, since MapLibre stringifies nested values", () => {
    const feature = coursesToGeoJSON([course({ id: "x" })]).features[0];
    expect(typeof feature.properties.races).toBe("string");
    expect(pinRaces(feature.properties)).toHaveLength(1);
  });

  it("drops courses with missing or out-of-range coordinates", () => {
    const fc = coursesToGeoJSON([
      course({ id: "nan", ...at(Number.NaN, 10) }),
      course({ id: "over", ...at(91, 10) }),
      course({ id: "wrapped", ...at(10, 181) }),
      course({ id: "good", ...at(10, 10) }),
    ]);
    expect(fc.features.flatMap((f) => pinRaces(f.properties).map((r) => r.id))).toEqual([
      "good",
    ]);
  });

  it("returns an empty collection for an empty catalog", () => {
    expect(coursesToGeoJSON([]).features).toEqual([]);
  });
});

describe("boundsOf", () => {
  it("returns null when nothing is plottable", () => {
    expect(boundsOf([])).toBeNull();
    expect(boundsOf([course(at(Number.NaN, 10))])).toBeNull();
  });

  it("boxes every seeded course", () => {
    const bounds = boundsOf(FIXTURE_CATALOG)!;
    const [[west, south], [east, north]] = bounds;
    for (const c of FIXTURE_CATALOG) {
      expect(c.start.lon).toBeGreaterThanOrEqual(west);
      expect(c.start.lon).toBeLessThanOrEqual(east);
      expect(c.start.lat).toBeGreaterThanOrEqual(south);
      expect(c.start.lat).toBeLessThanOrEqual(north);
    }
    // Sydney is the southern and eastern extreme of the seeded seven.
    expect(south).toBeLessThan(-30);
    expect(east).toBeGreaterThan(150);
  });

  it("degenerates to a point for a single course", () => {
    expect(boundsOf([course(at(5, 6))])).toEqual([
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
    expect(nearestCourse([course(at(0, Number.NaN))], 0, 0)).toBeNull();
  });
});

describe("pin labels", () => {
  it("joins city and country", () => {
    expect(pinLocationLabel(props())).toBe("Boston, United States");
  });

  it("formats a scheduled date without Intl", () => {
    expect(pinDateLabel({ nextRaceDateISO: "2027-04-19" })).toBe(
      "April 19th, 2027",
    );
  });

  it("falls back honestly when no edition is booked", () => {
    expect(pinDateLabel({ nextRaceDateISO: null })).toBe(
      "Next date to be confirmed",
    );
    expect(pinDateLabel({ nextRaceDateISO: "not-a-date" })).toBe(
      "Next date to be confirmed",
    );
  });
});

describe("pinRaces", () => {
  it("round-trips what coursesToGeoJSON encoded", () => {
    expect(pinRaces(props({ nextRaceDateISO: "2027-04-19" }))).toEqual([
      {
        id: "boston",
        displayName: "Boston Marathon",
        nextRaceDateISO: "2027-04-19",
      },
    ]);
  });

  it("degrades to an empty list rather than throwing on bad JSON", () => {
    expect(pinRaces(props({}, { races: "not json" }))).toEqual([]);
    expect(pinRaces(props({}, { races: '{"not":"an array"}' }))).toEqual([]);
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

  it("lists every race on a shared pin, each with its own CTA", () => {
    // The whole point of the fix: both Toronto races have to be reachable
    // from the one pin they share.
    const html = popupMarkup(
      props({}, {
        city: "Toronto",
        countryName: "Canada",
        races: JSON.stringify([
          {
            id: "toronto-marathon",
            displayName: "Toronto Marathon",
            nextRaceDateISO: "2027-05-02",
          },
          {
            id: "toronto-waterfront-marathon",
            displayName: "Toronto Waterfront Marathon",
            nextRaceDateISO: null,
          },
        ]),
      }),
    );
    expect(html).toContain("Toronto Marathon");
    expect(html).toContain("Toronto Waterfront Marathon");
    expect(html).toContain("May 2nd, 2027");
    expect(html).toContain("Next date to be confirmed");
    expect(html).toContain(`${POPUP_COURSE_ATTR}="toronto-marathon"`);
    expect(html).toContain(`${POPUP_COURSE_ATTR}="toronto-waterfront-marathon"`);
    // The place is stated once, not repeated under each race.
    expect(html.match(/Toronto, Canada/g)).toHaveLength(1);
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
