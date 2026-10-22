import { describe, it, expect } from "vitest";
import {
  OPPORTUNITY_ANCHORS,
  OPPORTUNITY_BANDS,
  OPPORTUNITY_LABELS,
  OPPORTUNITY_ORDER,
  courseOpportunity,
  opportunityBand,
  opportunityScore,
} from "./opportunity";
import { computeImpact } from "./impact";
import { courseCost, costMultiplier } from "./courseCost";
import { calculateHeatAdjustment } from "@/lib/weather/heat";
import { allCourseSlugsOnDisk, loadGeometry } from "@/data/courses.fixture";

// Guards the SHAPE of the scale rather than any particular number: monotone,
// clamped, finite on every committed course, and anchored where the header says
// it is. The anchors themselves are a presentation choice and are allowed to be
// retuned; what must not change silently is that a worse day never scores
// better, and that the flat majors do not fall out of "Favorable" on a cool
// morning.

const neutral = (totalPercent: number) =>
  computeImpact({
    // A synthetic elevation-only breakdown: the wind multiplier carries the
    // whole figure so the test can name a total directly. `courseOpportunity`
    // reads `totalPercent` and nothing else, which is the point.
    cost: { km: 42.195, miles: 26.2187 },
    heatMultiplier: 1,
    humidityMultiplier: 1,
    windMultiplier: 1 + totalPercent / 100,
    weatherApplied: true,
  });

describe("opportunityScore", () => {
  it("returns each anchor's score exactly", () => {
    for (const [percent, score] of OPPORTUNITY_ANCHORS) {
      expect(opportunityScore(percent)).toBeCloseTo(score, 10);
    }
  });

  it("never rewards a worse day with a better score", () => {
    let previous = Infinity;
    for (let p = -40; p <= 80; p += 0.05) {
      const score = opportunityScore(p);
      expect(score).toBeLessThanOrEqual(previous + 1e-9);
      previous = score;
    }
  });

  it("stays inside 0 to 100 on any input, including absurd ones", () => {
    for (const p of [-1000, -50, -10.0001, 0, 17.5, 35, 200, 1e6]) {
      const score = opportunityScore(p);
      expect(Number.isFinite(score)).toBe(true);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
    expect(opportunityScore(-50)).toBe(100);
    expect(opportunityScore(200)).toBe(0);
  });

  it("returns the neutral-course score rather than NaN on a broken input", () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(opportunityScore(bad)).toBe(72);
    }
  });

  it("interpolates linearly between two anchors", () => {
    // Halfway from [0, 72] to [2, 58].
    expect(opportunityScore(1)).toBeCloseTo(65, 10);
  });
});

describe("opportunityBand", () => {
  it("puts the boundaries exactly on the heat model's own anchors", () => {
    // The floors are derived, so assert the DERIVATION rather than the numbers:
    // favorable ends at the 1% anchor, moderate at the 6% anchor.
    expect(opportunityBand(opportunityScore(1))).toBe("favorable");
    expect(opportunityBand(opportunityScore(1.001))).toBe("moderate");
    expect(opportunityBand(opportunityScore(6))).toBe("moderate");
    expect(opportunityBand(opportunityScore(6.001))).toBe("challenging");
  });

  it("puts the boundaries exactly on the published floors", () => {
    expect(opportunityBand(65)).toBe("favorable");
    expect(opportunityBand(64.999)).toBe("moderate");
    expect(opportunityBand(38.6)).toBe("moderate");
    expect(opportunityBand(38.599)).toBe("challenging");
    expect(opportunityBand(0)).toBe("challenging");
  });

  it("names every band it can return, in bar order", () => {
    expect(OPPORTUNITY_ORDER).toEqual(["challenging", "moderate", "favorable"]);
    for (const [band] of OPPORTUNITY_BANDS) {
      expect(OPPORTUNITY_LABELS[band]).toBeTruthy();
      expect(OPPORTUNITY_ORDER).toContain(band);
    }
  });
});

describe("courseOpportunity", () => {
  it("reads the breakdown's total and nothing else", () => {
    const impact = neutral(5);
    const result = courseOpportunity(impact);
    expect(result.percent).toBeCloseTo(impact.totalPercent, 10);
    expect(result.score).toBeCloseTo(opportunityScore(impact.totalPercent), 10);
    expect(result.band).toBe(opportunityBand(result.score));
  });

  it("reads a flat course with weather off as favorable, not as average", () => {
    // The default state of the page. A zero breakdown must not land in the
    // middle of the bar: a flat course in cool air IS a fast day.
    const zero = computeImpact({
      cost: { km: 42.195, miles: 26.2187 },
      heatMultiplier: 1,
      humidityMultiplier: 1,
      windMultiplier: 1,
      weatherApplied: false,
    });
    const result = courseOpportunity(zero);
    expect(result.score).toBe(72);
    expect(result.band).toBe("favorable");
  });
});

describe("against the committed courses", () => {
  const slugs = allCourseSlugsOnDisk();

  it("scores every course on disk finitely and in range", () => {
    expect(slugs.length).toBeGreaterThan(300);
    for (const slug of slugs) {
      const impact = computeImpact({
        cost: courseCost(loadGeometry(slug).elevations),
        heatMultiplier: 1,
        humidityMultiplier: 1,
        windMultiplier: 1,
        weatherApplied: false,
      });
      const { score } = courseOpportunity(impact);
      expect(Number.isFinite(score), slug).toBe(true);
      expect(score, slug).toBeGreaterThanOrEqual(0);
      expect(score, slug).toBeLessThanOrEqual(100);
    }
  });

  /** The course plus a forecast, the way ImpactPanel assembles it. */
  const verdict = (slug: string, tempC: number, rh: number) => {
    const terrain = costMultiplier(courseCost(loadGeometry(slug).elevations));
    const total = (terrain * calculateHeatAdjustment(tempC, rh) - 1) * 100;
    return opportunityBand(opportunityScore(total));
  };

  it("holds the flat majors at favorable below the ideal-conditions threshold", () => {
    // heat.ts documents 13 C as ideal, and charges nothing at or below it.
    for (const slug of ["berlin", "london", "chicago", "boston", "tokyo"]) {
      expect(verdict(slug, 8, 60), slug).toBe("favorable");
      expect(verdict(slug, 12, 60), slug).toBe("favorable");
    }
  });

  it("stops calling a flat course favorable once the engine starts charging", () => {
    // The defect this calibration was written to fix: 18 C read "Favorable"
    // while the heat model was already taking 1.6% off the runner.
    for (const slug of ["berlin", "london", "chicago", "tokyo"]) {
      expect(verdict(slug, 18, 60), slug).not.toBe("favorable");
    }
  });

  it("turns the flat majors over as the day warms", () => {
    expect(verdict("berlin", 25, 70)).toBe("moderate");
    expect(verdict("berlin", 32, 80)).toBe("challenging");
  });

  it("calls red-flag heat challenging rather than moderate", () => {
    // 28 C / 60% is an 8% slowdown in the model underneath and a day races get
    // flagged or cancelled on. The first cut of these bands called it Moderate.
    for (const slug of ["berlin", "london", "chicago", "tokyo"]) {
      expect(verdict(slug, 28, 60), slug).toBe("challenging");
    }
  });

  it("calls the mountain courses challenging in any weather", () => {
    for (const slug of ["blue-ridge-marathon", "pikes-peak-marathon"]) {
      for (const [t, rh] of [
        [8, 60],
        [18, 60],
        [25, 70],
        [32, 80],
      ]) {
        expect(verdict(slug, t, rh), `${slug} ${t}C`).toBe("challenging");
      }
    }
  });

  it("calls a steep net-downhill course favorable even in warm air", () => {
    expect(verdict("revel-mt-charleston-marathon", 25, 70)).toBe("favorable");
  });
});
