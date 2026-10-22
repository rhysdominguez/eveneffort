// External-reference calibration pin for the course COST model.
//
// The sibling of fmm.boston.regression.test.ts, and deliberately a different
// reference: that file pins the pacing engine against one published pace BAND,
// this one pins `courseCost` x `courseAltitude` against 44 published Course
// SCORES. Two models, two external references, two tests, because the two
// models answer different questions. See src/lib/pacing/courseCost.ts.
//
// Reference: FindMyMarathon.com's Course Score, read from their public
// compare.php pages in September 2026. Their scale runs high-is-faster around
// an arbitrary centre, so a score maps to a time multiplier as 100/score and
// only RATIOS between courses are meaningful. Their algorithm is independent of
// ours: they describe it as "derived from research on how grade and elevation
// affect marathon running performance", and it is regression over real results
// rather than a metabolic model.
//
// Every slug below is a seeded course whose GEOMETRY WAS CHECKED against FMM's
// own published gain/loss before it was admitted: all 44 agree on net elevation
// change, so these are 44 genuine pairings and not 44 name collisions.
//
// WHAT THIS TEST IS FOR. The coefficients in courseCost.ts were fitted to this
// set, so a good R^2 here is not a discovery. What the test protects is that
// nobody can quietly undo the two structural choices that made the fit possible
// — the uphill/downhill asymmetry, and folding altitude in — without CI
// noticing. Both are asserted separately below against the alternatives they
// beat, which is the part that is not circular.
import { describe, it, expect } from "vitest";
import { courseCost, costMultiplier } from "./courseCost";
import { courseEffort, effortMultiplier } from "./effort";
import { courseAltitude } from "./altitude";
import { totalEffortMultiplier } from "@/lib/units/effort";
import { loadGeometry } from "@/data/courses.fixture";

/** [seeded course slug, FindMyMarathon Course Score]. */
const FMM_COURSE_SCORE: ReadonlyArray<readonly [string, number]> = [
  ["boston", 99.21],
  ["newyork", 97.73],
  ["chicago", 99.76],
  ["big-sur-marathon", 97.43],
  ["california-international-marathon", 100.38],
  ["marine-corps-marathon", 98.47],
  ["philadelphia-marathon", 98.46],
  ["deseret-news-marathon", 96.58],
  ["ogden-marathon", 99.03],
  ["houston-marathon", 99.53],
  ["foot-traffic-flat-marathon", 99.53],
  ["galveston-marathon", 99.82],
  ["carlsbad-marathon", 98.24],
  ["jacksonville-marathon", 99.54],
  ["mesa-marathon", 101.52],
  ["richmond-marathon", 98.69],
  ["twin-cities-marathon", 98.85],
  ["cleveland-marathon", 98.57],
  ["detroit-free-press-marathon", 99.12],
  ["san-francisco-marathon", 96.58],
  ["pittsburgh-marathon", 98.15],
  ["colorado-marathon", 98.77],
  ["kauai-marathon", 94.51],
  ["blue-ridge-marathon", 90.01],
  ["seattle-marathon", 98.22],
  ["asheville-marathon", 98.12],
  ["missoula-marathon", 97.26],
  ["sugarloaf-marathon", 100.1],
  ["casper-marathon", 93.77],
  ["little-rock-marathon", 98.04],
  ["myrtle-beach-marathon", 99.42],
  ["miami-marathon", 99.48],
  ["honolulu-marathon", 98.93],
  ["austin-marathon", 97.48],
  ["cowtown-marathon", 98.43],
  ["long-beach-marathon", 98.89],
  ["oakland-marathon", 98.14],
  ["aspen-valley-marathon", 96.67],
  ["bayshore-marathon", 99.24],
  ["cincinnati-flying-pig-marathon", 97.85],
  ["lincoln-marathon", 98.86],
  ["los-angeles-marathon", 98.22],
  ["oklahoma-city-memorial-marathon", 98.4],
  ["kentucky-derby-festival-marathon", 98.87],
];

/**
 * R^2 of our log-multiplier against theirs, after centring.
 *
 * Log space and a free additive constant, because the two scales share no
 * origin: FMM's 100 is not "flat", it is wherever their regression put it. What
 * is comparable is the SPREAD, which is what a conversion between two courses
 * actually consumes.
 */
function rSquared(predicted: number[], target: number[]): number {
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const mp = mean(predicted);
  const mt = mean(target);
  const residual = target.reduce(
    (t, v, i) => t + (v - mt - (predicted[i] - mp)) ** 2,
    0,
  );
  const total = target.reduce((t, v) => t + (v - mt) ** 2, 0);
  return 1 - residual / total;
}

const geometry = FMM_COURSE_SCORE.map(([slug, score]) => {
  const { elevations } = loadGeometry(slug);
  return { slug, score, elevations };
});

const target = geometry.map((c) => Math.log(100 / c.score));

describe("course cost vs FindMyMarathon Course Scores", () => {
  it("has a pairing for all 44 reference courses", () => {
    // Guards the set itself: a slug retired from the seed would otherwise make
    // loadGeometry throw somewhere less obvious.
    expect(geometry).toHaveLength(44);
    expect(geometry.every((c) => c.elevations.length === 44)).toBe(true);
  });

  it("explains at least 90% of the variance across the set", () => {
    const predicted = geometry.map((c) =>
      Math.log(
        totalEffortMultiplier({
          cost: courseCost(c.elevations),
          altitude: courseAltitude(c.elevations),
        }),
      ),
    );
    expect(rSquared(predicted, target)).toBeGreaterThan(0.9);
  });

  it("beats the pacing engine's curve by a wide margin", () => {
    // The engine's damped, SYMMETRIC curve is the model that shipped before
    // ROADMAP #12, and against this set it is very nearly worthless: 1.7% of
    // the variance. That gap is the entire justification for two curves, so it
    // is asserted rather than left in a comment.
    const viaEngine = geometry.map((c) =>
      Math.log(effortMultiplier(courseEffort(c.elevations))),
    );
    expect(rSquared(viaEngine, target)).toBeLessThan(0.1);
  });

  it("needs the asymmetry: grades alone, symmetric, cannot be rescued", () => {
    // Not "the coefficient was too small" — no single coefficient applied to
    // both directions reaches even 0.05 here, because the defect is the shape.
    // Rescaling a symmetric curve is a monotone transform of the same
    // predictor, so its R^2 in this centred log space is scale-invariant and
    // retuning k genuinely cannot help.
    const symmetric = geometry.map((c) =>
      Math.log(effortMultiplier(courseEffort(c.elevations))),
    );
    for (const k of [0.2, 0.5, 1, 2]) {
      const scaled = symmetric.map((v) => v * k);
      expect(rSquared(scaled, target)).toBeLessThan(0.1);
    }
  });

  it("needs the altitude term: grades alone stop well short", () => {
    const gradesOnly = geometry.map((c) =>
      Math.log(costMultiplier(courseCost(c.elevations))),
    );
    const allIn = geometry.map((c) =>
      Math.log(
        totalEffortMultiplier({
          cost: courseCost(c.elevations),
          altitude: courseAltitude(c.elevations),
        }),
      ),
    );
    expect(rSquared(gradesOnly, target)).toBeLessThan(0.8);
    expect(rSquared(allIn, target)).toBeGreaterThan(
      rSquared(gradesOnly, target) + 0.15,
    );
  });
});

// Face validity. These are the claims a runner would call obviously wrong, and
// every one of them WAS wrong before ROADMAP #12 — the pre-change figure is
// quoted on each so the regression is legible without git blame.
describe("course cost sanity, on courses runners have opinions about", () => {
  const mult = (slug: string) => {
    const { elevations } = loadGeometry(slug);
    return totalEffortMultiplier({
      cost: courseCost(elevations),
      altitude: courseAltitude(elevations),
    });
  };

  it("calls Blue Ridge genuinely hard, not 0.6% hard", () => {
    // 3,371 ft of climbing, marketed and measured as America's toughest road
    // marathon. The engine curve read 1.0060.
    expect(mult("blue-ridge-marathon")).toBeGreaterThan(1.08);
  });

  it("stops calling Big Sur faster than flat", () => {
    // 1,654 ft of climbing over the coastal hills, and it used to read 0.9968:
    // not merely easy, but 0.3% FASTER than a flat marathon.
    expect(mult("big-sur-marathon")).toBeGreaterThan(1.01);
  });

  it("keeps the genuinely fast courses fast", () => {
    // The asymmetry must not simply make everything harder. REVEL Mt
    // Charleston drops ~1,500 m and has to stay well under flat.
    expect(mult("revel-mt-charleston-marathon")).toBeLessThan(0.9);
    expect(mult("mesa-marathon")).toBeLessThan(1);
  });

  it("ranks a hilly course above a flat one at the same net elevation", () => {
    // Both finish within a few metres of where they start, so net change tells
    // them apart not at all and only the asymmetry can.
    expect(mult("san-francisco-marathon")).toBeGreaterThan(mult("chicago"));
    expect(mult("kauai-marathon")).toBeGreaterThan(mult("miami-marathon"));
  });

  it("spreads the catalog instead of collapsing it onto flat", () => {
    // The headline defect: 292 of 326 seeded courses used to sit inside the
    // +/-0.5% band `formatVsFlat` refuses to quote, which made the ranking
    // table a list of ties.
    const inDeadBand = FMM_COURSE_SCORE.filter(
      ([slug]) => Math.abs(mult(slug) - 1) * 100 < 0.5,
    ).length;
    expect(inDeadBand).toBeLessThan(FMM_COURSE_SCORE.length / 3);
  });
});
