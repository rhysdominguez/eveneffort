// Unit tests for the TypeScript resampler.
//
// These port scripts/gpx_parser/test_parse_gpx.py case for case, so the two
// implementations are checked against the same synthetic inputs as well as
// against real courses (conformance.test.ts). The rounding block has no Python
// counterpart because Python gets that behaviour from its own round(); here it
// is hand-built and therefore the part most able to be wrong.
import { describe, expect, it } from "vitest";

import {
  DISTANCE_MAX_KM,
  MIN_POINTS,
  CourseParseError,
  buildProfile,
  cumulativeProfile,
  haversine,
  resampleCourse,
  roundHalfEven,
  sampleAtDistances,
  sampleLatLon,
  smoothElevations,
} from "./resample.ts";
import type { RoutePoint } from "./routeFile.ts";

describe("roundHalfEven", () => {
  // Every expectation below is the literal output of Python's round(), captured
  // from the interpreter. These are the values the committed course JSON holds.
  it("rounds an exact binary tie to even, where toFixed rounds away", () => {
    // 66.25 is exactly representable, so this is a true tie.
    expect(roundHalfEven(66.25, 1)).toBe(66.2);
    expect((66.25).toFixed(1)).toBe("66.3"); // the divergence this exists for
    expect(roundHalfEven(-66.25, 1)).toBe(-66.2);
  });

  it("agrees with toFixed when the value is not actually halfway", () => {
    // Both of these only LOOK like ties in decimal; in binary they are not.
    expect(roundHalfEven(66.35, 1)).toBe(66.3); // stored as 66.34999…
    expect(roundHalfEven(66.15, 1)).toBe(66.2); // stored as 66.15000…06
    expect(roundHalfEven(52.05, 1)).toBe(52.0); // stored as 52.04999…
    expect(roundHalfEven(2.675, 2)).toBe(2.67);
  });

  it("keeps the last kept digit even at integer ties", () => {
    expect(roundHalfEven(0.5, 0)).toBe(0);
    expect(roundHalfEven(1.5, 0)).toBe(2);
    expect(roundHalfEven(2.5, 0)).toBe(2);
    expect(roundHalfEven(3.5, 0)).toBe(4);
  });

  it("handles the 4 dp and 6 dp cases the profile and coords use", () => {
    expect(roundHalfEven(1.23456789, 4)).toBe(1.2346);
    expect(roundHalfEven(51.6901334, 6)).toBe(51.690133);
    expect(roundHalfEven(-1.2856051, 6)).toBe(-1.285605);
  });

  it("never produces negative zero", () => {
    expect(Object.is(roundHalfEven(-0.04, 1), 0)).toBe(true);
  });
});

describe("haversine", () => {
  it("measures about 1 km for 0.0089932 degrees of latitude", () => {
    const d = haversine(0, 0, 0.0089932, 0);
    expect(Math.abs(d - 1000) / 1000).toBeLessThan(0.05);
  });

  it("is zero for a point against itself", () => {
    expect(haversine(51.5, -0.1, 51.5, -0.1)).toBe(0);
  });
});

describe("smoothElevations", () => {
  it("damps a single-point spike", () => {
    // [0,0,0,100,0,0,0] at 50 m spacing — a 200 m window must pull it down.
    const dists = [0, 1, 2, 3, 4, 5, 6].map((i) => i * 50);
    const elevs = [0, 0, 0, 100, 0, 0, 0];
    expect(smoothElevations(dists, elevs, 200)[3]).toBeLessThan(50);
  });

  it("leaves a constant elevation untouched", () => {
    const dists = Array.from({ length: 20 }, (_, i) => i * 50);
    const elevs = new Array(20).fill(42);
    expect(smoothElevations(dists, elevs, 200).every((v) => v === 42)).toBe(true);
  });
});

describe("sampleAtDistances", () => {
  const dists = Array.from({ length: 423 }, (_, i) => i * 100);
  const elevs = Array.from({ length: 423 }, (_, i) => i);

  it("interpolates the midpoint of a linear ramp", () => {
    expect(Math.abs(sampleAtDistances(dists, elevs, [21000])[0] - 210)).toBeLessThan(1);
  });

  it("returns the first value at distance zero", () => {
    expect(sampleAtDistances(dists, elevs, [0])[0]).toBe(0);
  });

  it("clamps past the end and says so", () => {
    const warnings: string[] = [];
    expect(sampleAtDistances(dists, elevs, [99_999], warnings)[0]).toBe(422);
    expect(warnings[0]).toContain("clamping");
  });
});

describe("sampleLatLon", () => {
  const dists = Array.from({ length: 423 }, (_, i) => i * 100);
  const latlon = Array.from({ length: 423 }, (_, i) => [0, i * 0.001] as [number, number]);

  it("is exact at the start", () => {
    expect(sampleLatLon(dists, latlon, [0])[0]).toEqual([0, 0]);
  });

  it("interpolates the midpoint", () => {
    expect(Math.abs(sampleLatLon(dists, latlon, [21000])[0][1] - 0.21)).toBeLessThan(1e-6);
  });

  it("clamps past the end to the last point, silently", () => {
    expect(sampleLatLon(dists, latlon, [99_999])[0]).toEqual([0, roundHalfEven(0.422, 6)]);
  });
});

describe("buildProfile", () => {
  it("drops points that would collide at 4 dp rather than breaking ascent", () => {
    // Two points 0.04 m apart both round to 0.1000 km — the Gothenburg case.
    // The second must be dropped, not emitted. (Verified against Python:
    // round(100.04/1000, 4) == round(100.0/1000, 4) == 0.1.)
    const profile = buildProfile([0, 100, 100.04, 200], [1, 2, 3, 4]);
    expect(profile.map((p) => p[0])).toEqual([0, 0.1, 0.2]);
    for (let i = 1; i < profile.length; i += 1) {
      expect(profile[i][0]).toBeGreaterThan(profile[i - 1][0]);
    }
  });
});

// A synthetic marathon: a straight eastbound line at the equator, long enough
// to sit inside the distance window, dense enough to clear MIN_POINTS.
function syntheticCourse(totalKm = 42.2, n = 500): RoutePoint[] {
  const degPerPoint = totalKm / 111.19492664455873 / (n - 1);
  return Array.from({ length: n }, (_, i) => ({
    lat: 0,
    lon: i * degPerPoint,
    ele: 100 + i * 0.1,
  }));
}

describe("resampleCourse", () => {
  it("returns 44 elevations and 44 coords", () => {
    const g = resampleCourse(syntheticCourse());
    expect(g.elevations).toHaveLength(44);
    expect(g.coords).toHaveLength(44);
    expect(g.elevations.every(Number.isFinite)).toBe(true);
  });

  it("measures the route length", () => {
    expect(resampleCourse(syntheticCourse(42.2)).distanceM / 1000).toBeCloseTo(42.2, 1);
  });

  it("rejects a route that is not marathon length, naming the window", () => {
    // A 48 km trail ultra — the single most likely wrong upload.
    expect(() => resampleCourse(syntheticCourse(48))).toThrow(CourseParseError);
    expect(() => resampleCourse(syntheticCourse(48))).toThrow(/48\.0.* km is outside/);
    expect(() => resampleCourse(syntheticCourse(48))).toThrow(
      new RegExp(String(DISTANCE_MAX_KM)),
    );
  });

  it("rejects a route with too few points", () => {
    expect(() => resampleCourse(syntheticCourse(42.2, 40))).toThrow(
      new RegExp(`need at least ${MIN_POINTS}`),
    );
  });

  it("rejects a point with no elevation", () => {
    const pts = syntheticCourse();
    pts[7].ele = null;
    expect(() => resampleCourse(pts)).toThrow(/track point 7 is missing elevation/);
  });

  it("rejects a stitched track with an implausible jump", () => {
    // Two half-courses on opposite sides of the planet, concatenated.
    const pts = syntheticCourse(21, 250).concat(
      syntheticCourse(21, 250).map((p) => ({ ...p, lat: 40 })),
    );
    expect(() => resampleCourse(pts)).toThrow(/stitched or discontinuous/);
  });

  it("warns but continues on an off-band length inside the hard window", () => {
    // 42.76 km is Berlin's measured length — legal, but outside [42.0, 42.4].
    const g = resampleCourse(syntheticCourse(42.76));
    expect(g.warnings.some((w) => w.includes("outside the expected"))).toBe(true);
    expect(g.elevations).toHaveLength(44);
  });

  it("keeps cumulative distance non-decreasing", () => {
    const { dists } = cumulativeProfile(syntheticCourse());
    for (let i = 1; i < dists.length; i += 1) {
      expect(dists[i]).toBeGreaterThanOrEqual(dists[i - 1]);
    }
  });
});
