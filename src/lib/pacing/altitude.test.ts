import { describe, it, expect } from "vitest";
import {
  ALTITUDE_THRESHOLD_M,
  VO2MAX_DECREMENT_PER_1000M,
  altitudeMultiplier,
  courseAltitude,
  hasAltitudePenalty,
} from "./altitude";
import { allCourseSlugsOnDisk, loadGeometry } from "@/data/courses.fixture";

const flat = (metres: number) => Array(44).fill(metres);

describe("altitudeMultiplier", () => {
  it("is exactly 1 at and below the threshold", () => {
    expect(altitudeMultiplier(0)).toBe(1);
    expect(altitudeMultiplier(-5)).toBe(1);
    expect(altitudeMultiplier(500)).toBe(1);
    expect(altitudeMultiplier(ALTITUDE_THRESHOLD_M)).toBe(1);
  });

  it("is continuous across the threshold", () => {
    expect(altitudeMultiplier(ALTITUDE_THRESHOLD_M + 0.001)).toBeCloseTo(1, 6);
  });

  it("inverts the Wehrlin & Hallen decrement", () => {
    // 1,000 m above the threshold: one full decrement of VO2max remains
    // unavailable, and the time multiplier is its reciprocal.
    const expected = 1 / (1 - VO2MAX_DECREMENT_PER_1000M);
    expect(altitudeMultiplier(ALTITUDE_THRESHOLD_M + 1000)).toBeCloseTo(
      expected,
      10,
    );
  });

  it("puts a mile-high course a few percent down", () => {
    // Denver, 1,609 m. Practitioner rules of thumb put a mile-high marathon
    // 2-4% slower; this must land in that neighbourhood or the constant is
    // wrong in a way no unit test of the algebra would catch.
    const denver = altitudeMultiplier(1609);
    expect(denver).toBeGreaterThan(1.03);
    expect(denver).toBeLessThan(1.05);
  });

  it("grows monotonically with height", () => {
    let previous = 0;
    for (let m = 0; m <= 5000; m += 100) {
      const current = altitudeMultiplier(m);
      expect(current).toBeGreaterThanOrEqual(previous);
      previous = current;
    }
  });

  it("stays finite at absurd heights", () => {
    expect(Number.isFinite(altitudeMultiplier(30000))).toBe(true);
    expect(altitudeMultiplier(30000)).toBeLessThanOrEqual(2);
  });

  it("treats a non-finite height as sea level rather than throwing", () => {
    expect(altitudeMultiplier(NaN)).toBe(1);
  });
});

describe("courseAltitude", () => {
  it("rejects anything that is not 44 finite points", () => {
    expect(() => courseAltitude(Array(43).fill(0))).toThrow();
    expect(() => courseAltitude([...Array(43).fill(0), NaN])).toThrow();
  });

  it("reports mean and max over the array", () => {
    const elevations = flat(100);
    elevations[10] = 500;
    const altitude = courseAltitude(elevations);
    expect(altitude.maxM).toBe(500);
    expect(altitude.meanM).toBeCloseTo((43 * 100 + 500) / 44, 10);
  });

  it("averages the multiplier, not the elevation", () => {
    // Half the course at sea level, half at 3,000 m. The mean elevation is
    // 1,500 m, but the multiplier is convex and the threshold is piecewise, so
    // averaging the penalty gives a strictly larger (and more honest) answer
    // than evaluating the penalty at the mean.
    const elevations = [...Array(22).fill(0), ...Array(22).fill(3000)];
    const altitude = courseAltitude(elevations);
    expect(altitude.meanM).toBe(1500);
    expect(altitude.multiplier).toBeGreaterThan(altitudeMultiplier(1500));
    expect(altitude.multiplier).toBeCloseTo(
      (22 * 1 + 22 * altitudeMultiplier(3000)) / 44,
      10,
    );
  });

  it("leaves a sea-level course at exactly 1", () => {
    expect(courseAltitude(flat(0)).multiplier).toBe(1);
  });
});

describe("hasAltitudePenalty", () => {
  it("is false below the half-percent dead band", () => {
    expect(hasAltitudePenalty(courseAltitude(flat(0)))).toBe(false);
    expect(hasAltitudePenalty(courseAltitude(flat(1000)))).toBe(false);
    // ~1,080 m is the first height whose penalty clears 0.5%.
    expect(hasAltitudePenalty(courseAltitude(flat(1050)))).toBe(false);
  });

  it("is true for a genuinely high course", () => {
    expect(hasAltitudePenalty(courseAltitude(flat(2000)))).toBe(true);
  });
});

// Over every course file on disk rather than the seven-course fixture, which is
// the majors and is entirely at sea level — it could not tell this model from
// one that returned 1.0 unconditionally. `courses.integrity.test.ts` reads the
// corpus the same way, and offline, so Rule 9 still holds.
describe("the seeded catalog", () => {
  const all = allCourseSlugsOnDisk().map((slug) => ({
    id: slug,
    altitude: courseAltitude(loadGeometry(slug).elevations),
  }));

  // THE GUARD RULE 7 ASKED FOR: adding altitude must not have moved a single
  // sea-level course. The overwhelming majority of the catalog is road racing
  // near the coast, and every one of those must still read exactly 1.0.
  it("leaves every low course untouched, at exactly 1", () => {
    const low = all.filter((c) => c.altitude.maxM <= ALTITUDE_THRESHOLD_M);
    expect(low.length).toBeGreaterThan(0);
    for (const course of low) {
      expect(course.altitude.multiplier).toBe(1);
    }
  });

  it("never reports a penalty below 1", () => {
    for (const course of all) {
      expect(course.altitude.multiplier).toBeGreaterThanOrEqual(1);
    }
  });

  it("separates the high courses from the rest", () => {
    // Not a fixed list of slugs, which would break the moment a batch is
    // imported. The claim is structural: some courses in this catalog run high
    // enough to matter, and they are a small minority of it.
    const penalised = all.filter((c) => hasAltitudePenalty(c.altitude));
    expect(penalised.length).toBeGreaterThan(0);
    expect(penalised.length).toBeLessThan(all.length / 2);
  });

  it("ranks the known high-altitude races at the top", () => {
    // The sanity anchors, in the spirit of terrain.ts's. These are the races
    // whose altitude is the single most famous thing about them, and if the
    // model ever stops putting them first it has broken in a way the algebra
    // tests above cannot see. Order only, so a reseed or a widened import
    // cannot make this brittle.
    const ranked = [...all]
      .sort((a, b) => b.altitude.multiplier - a.altitude.multiplier)
      .map((c) => c.id);
    const top = ranked.slice(0, 5);
    for (const slug of ["la-paz-marathon", "leadville-trail-marathon", "pikes-peak-marathon"]) {
      if (!ranked.includes(slug)) continue; // not seeded in this tree
      expect(top).toContain(slug);
    }
  });

  it("puts the mile-high cluster in the 3-5% band", () => {
    // Denver and Boulder sit a little over 1,600 m. A model that put them at
    // 15% or at 0.2% would be useless in opposite directions, and this is the
    // band the practitioner rules of thumb agree on.
    for (const slug of ["denver-colfax-marathon", "boulderthon"]) {
      const course = all.find((c) => c.id === slug);
      if (!course) continue; // not seeded in this tree
      const percent = (course.altitude.multiplier - 1) * 100;
      expect(percent, `${slug} at ${percent.toFixed(2)}%`).toBeGreaterThan(3);
      expect(percent, `${slug} at ${percent.toFixed(2)}%`).toBeLessThan(5);
    }
  });
});
