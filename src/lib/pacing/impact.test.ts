import { describe, it, expect } from "vitest";
import {
  computeImpact,
  weightedGeometricMean,
  IMPACT_FACTORS,
  type ImpactFactor,
  type ImpactInput,
} from "./impact";
import { courseCost, costMultiplier } from "./courseCost";
import { allCourseSlugsOnDisk, loadGeometry } from "@/data/courses.fixture";
import type { CourseCost } from "@/types";

// Guards the invariant the panel's honesty rests on: the three shares add up to
// the total it prints. Plus the narrower reconciliation that survived dropping
// the altitude tile, which is that the Elevation line is the terrain half of
// the cost figure /courses ranks on.

const MARATHON_KM = 42.195;

/** A `CourseCost` whose grades cost exactly `multiplier` against flat. */
const costOf = (multiplier: number): CourseCost => ({
  km: multiplier * MARATHON_KM,
  miles: (multiplier * MARATHON_KM) / 1.609344,
});

const inputOf = (
  elevation: number,
  heat: number,
  wind: number,
  humidity = 1,
): ImpactInput => ({
  cost: costOf(elevation),
  heatMultiplier: heat,
  humidityMultiplier: humidity,
  windMultiplier: wind,
  weatherApplied: heat !== 1 || wind !== 1 || humidity !== 1,
});

const lineFor = (
  breakdown: ReturnType<typeof computeImpact>,
  factor: ImpactFactor,
) => breakdown.lines.find((l) => l.factor === factor)!;

describe("weightedGeometricMean", () => {
  it("equals the plain geometric mean when the weights are equal", () => {
    const values = [1.01, 1.04, 0.98, 1.1];
    const plain = Math.exp(
      values.reduce((s, v) => s + Math.log(v), 0) / values.length,
    );
    expect(weightedGeometricMean(values, [3, 3, 3, 3])).toBeCloseTo(plain, 12);
  });

  it("returns the one element that carries all the weight", () => {
    expect(weightedGeometricMean([1.01, 1.5, 2], [0, 1, 0])).toBeCloseTo(1.5, 12);
  });

  it("returns exactly 1 for an empty series or zero total weight", () => {
    expect(weightedGeometricMean([], [])).toBe(1);
    expect(weightedGeometricMean([1.2, 1.3], [0, 0])).toBe(1);
  });

  it("weights by duration, so slow hot segments count for more", () => {
    // Two segments, one twice as slow as the other and twice as bad.
    const byDuration = weightedGeometricMean([1.02, 1.08], [100, 200]);
    const byCount = weightedGeometricMean([1.02, 1.08], [1, 1]);
    expect(byDuration).toBeGreaterThan(byCount);
  });

  it("refuses mismatched lengths rather than silently truncating", () => {
    expect(() => weightedGeometricMean([1, 1], [1])).toThrow();
  });
});

describe("computeImpact", () => {
  it("always returns all four factors in display order", () => {
    const breakdown = computeImpact(inputOf(1.02, 1, 1));
    expect(breakdown.lines.map((l) => l.factor)).toEqual([...IMPACT_FACTORS]);
    expect(IMPACT_FACTORS).toEqual(["elevation", "heat", "humidity", "wind"]);
  });

  it("has no altitude factor", () => {
    // Cut deliberately: 0.0% on 294 of 326 courses. The cost of that, on the
    // other 32, is recorded in the module header.
    expect(IMPACT_FACTORS).not.toContain("altitude" as ImpactFactor);
    expect(IMPACT_FACTORS).toHaveLength(4);
  });

  it("splits the total so the four shares sum to it exactly", () => {
    const cases: Array<[number, number, number]> = [
      [1.02, 1.06, 1.01],
      [0.994, 1.1, 0.98],
      [1.25, 1.3, 1.12],
      [0.97, 1, 0.95],
    ];
    for (const [e, h, w] of cases) {
      const breakdown = computeImpact(inputOf(e, h, w));
      const shares = breakdown.lines.reduce((s, l) => s + l.share, 0);
      const percents = breakdown.lines.reduce((s, l) => s + l.sharePercent, 0);
      expect(shares).toBeCloseTo(1, 12);
      expect(percents).toBeCloseTo(breakdown.totalPercent, 10);
    }
  });

  it("composes multiplicatively, not additively", () => {
    // The trap this module exists to avoid: 3% and 2% is 5.06%, not 5%.
    const breakdown = computeImpact(inputOf(1.03, 1.02, 1));
    expect(breakdown.totalMultiplier).toBeCloseTo(1.0506, 10);
    expect(breakdown.totalPercent).toBeCloseTo(5.06, 8);
    const naive = breakdown.lines.reduce((s, l) => s + l.percent, 0);
    expect(naive).toBeLessThan(breakdown.totalPercent);
  });

  it("gives a single active factor the whole total", () => {
    const breakdown = computeImpact(inputOf(1, 1.07, 1));
    expect(lineFor(breakdown, "heat").share).toBeCloseTo(1, 12);
    expect(lineFor(breakdown, "heat").sharePercent).toBeCloseTo(
      breakdown.totalPercent,
      10,
    );
    for (const factor of ["elevation", "humidity", "wind"] as ImpactFactor[]) {
      expect(lineFor(breakdown, factor).share).toBe(0);
      expect(lineFor(breakdown, factor).sharePercent).toBe(0);
    }
  });

  it("returns clean zeros, never NaN, when nothing is happening", () => {
    // The DEFAULT state of the page: flat course, weather off.
    const breakdown = computeImpact(inputOf(1, 1, 1));
    expect(breakdown.totalMultiplier).toBe(1);
    expect(breakdown.totalPercent).toBe(0);
    for (const line of breakdown.lines) {
      expect(line.share).toBe(0);
      expect(line.sharePercent).toBe(0);
      expect(line.percent).toBe(0);
      expect(Number.isNaN(line.share)).toBe(false);
      expect(Number.isNaN(line.sharePercent)).toBe(false);
    }
  });

  it("returns zeros rather than NaN when the factors exactly cancel", () => {
    // ln sum is 0 while the individual logs are not: 1.25 x 0.8 == 1.
    const breakdown = computeImpact(inputOf(1.25, 0.8, 1));
    expect(breakdown.totalPercent).toBeCloseTo(0, 12);
    for (const line of breakdown.lines) {
      expect(Number.isFinite(line.share)).toBe(true);
      expect(Number.isFinite(line.sharePercent)).toBe(true);
    }
  });

  it("is order independent: each share depends only on its own factor", () => {
    // Same three multipliers, dealt to different factors. Each factor's share
    // must follow its multiplier, not its position.
    const a = computeImpact(inputOf(1.03, 1.05, 1.01));
    const b = computeImpact(inputOf(1.01, 1.03, 1.05));
    expect(lineFor(a, "elevation").share).toBeCloseTo(lineFor(b, "heat").share, 12);
    expect(lineFor(a, "wind").share).toBeCloseTo(lineFor(b, "elevation").share, 12);
  });

  it("carries a saving as a negative share on a net-downhill course", () => {
    const breakdown = computeImpact(inputOf(0.97, 1.04, 1));
    expect(lineFor(breakdown, "elevation").sharePercent).toBeLessThan(0);
    expect(lineFor(breakdown, "heat").sharePercent).toBeGreaterThan(0);
    const summed = breakdown.lines.reduce((s, l) => s + l.sharePercent, 0);
    expect(summed).toBeCloseTo(breakdown.totalPercent, 10);
  });

  it("leaves heat and wind at exactly 1 when weather is off", () => {
    const breakdown = computeImpact(inputOf(1.021, 1, 1));
    expect(lineFor(breakdown, "heat").multiplier).toBe(1);
    expect(lineFor(breakdown, "wind").multiplier).toBe(1);
    expect(breakdown.weatherApplied).toBe(false);
    // Weather off means the total IS the elevation line.
    expect(breakdown.totalMultiplier).toBeCloseTo(1.021, 12);
  });
});

describe("the heat / humidity split", () => {
  // The split is a way of READING one engine multiplier, so the contract is
  // that reading it changes nothing: heat x humidity must be the combined
  // figure the splits were actually built from.
  it("multiplies back to the combined heat multiplier", () => {
    for (const [dry, combined] of [
      [1.0538, 1.1253], // 28 C, 95 % RH
      [1.0735, 1.2558], // 32 C, 95 % RH
      [1.0022, 1.0105], // 16 C, 95 % RH
      [1, 1], // below the threshold
    ]) {
      const breakdown = computeImpact(inputOf(1, dry, 1, combined / dry));
      expect(breakdown.totalMultiplier).toBeCloseTo(combined, 12);
    }
  });

  it("gives humidity nothing in dry air and heat nothing below the threshold", () => {
    const dryDay = computeImpact(inputOf(1, 1.05, 1, 1));
    expect(lineFor(dryDay, "humidity").percent).toBe(0);
    expect(lineFor(dryDay, "heat").percent).toBeCloseTo(5, 10);

    const coldDay = computeImpact(inputOf(1, 1, 1, 1));
    expect(lineFor(coldDay, "heat").percent).toBe(0);
    expect(lineFor(coldDay, "humidity").percent).toBe(0);
  });

  it("splits a muggy day across both lines, summing to the total", () => {
    // 32 C at 95 % RH: temperature +7.4 %, moisture +17.0 % on top.
    const breakdown = computeImpact(inputOf(1, 1.0735, 1, 1.2558 / 1.0735));
    expect(lineFor(breakdown, "heat").sharePercent).toBeGreaterThan(0);
    expect(lineFor(breakdown, "humidity").sharePercent).toBeGreaterThan(
      lineFor(breakdown, "heat").sharePercent,
    );
    const summed = breakdown.lines.reduce((s, l) => s + l.sharePercent, 0);
    expect(summed).toBeCloseTo(breakdown.totalPercent, 10);
  });
});

describe("the elevation line against the course rankings", () => {
  // WHAT SURVIVED DROPPING THE ALTITUDE TILE. The panel's total no longer
  // equals `totalEffortMultiplier` on the 32 high courses, because that figure
  // folds altitude in and this panel does not. What must still hold is that the
  // Elevation line is built from the SAME cost curve /courses ranks on, so the
  // terrain half of the two pages can never disagree. Offline (Rule 9).
  const slugs = allCourseSlugsOnDisk();

  it("covers every course file on disk", () => {
    expect(slugs.length).toBeGreaterThan(300);
  });

  it("reproduces costMultiplier exactly for all of them", () => {
    const mismatches: string[] = [];
    for (const slug of slugs) {
      const cost = courseCost(loadGeometry(slug).elevations);
      const breakdown = computeImpact({
        cost,
        heatMultiplier: 1,
        humidityMultiplier: 1,
        windMultiplier: 1,
        weatherApplied: false,
      });
      const elevation = breakdown.lines.find((l) => l.factor === "elevation")!;
      const expected = costMultiplier(cost);
      if (elevation.multiplier !== expected) {
        mismatches.push(`${slug}: ${elevation.multiplier} !== ${expected}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("finds real spread across the catalogue, not a flat 1 everywhere", () => {
    // Guards against a change that quietly collapses every course to 1, which
    // would make the test above pass for free.
    const multipliers = slugs.map((slug) =>
      costMultiplier(courseCost(loadGeometry(slug).elevations)),
    );
    expect(multipliers.some((m) => m > 1.01)).toBe(true);
    expect(multipliers.some((m) => m < 0.999)).toBe(true);
  });
});
