import { describe, it, expect } from "vitest";
import {
  avgPaceFromGoalTime,
  courseEffort,
  effortMultiplier,
  equivalentGoalTime,
  gapPaceFromGoalTime,
  goalTimeFromAvgPace,
  goalTimeFromGapPace,
  raceDistance,
} from "./effort";
import { adjustmentFactor } from "./adjustment";
import { buildSegments, MARATHON_KM, MARATHON_MILES } from "./segments";
import { computeElevationDurations } from "./index";
import { fixtureCourse, loadGeometry } from "@/data/courses.fixture";
import type { PacingInput, Unit } from "@/types";

// A course is 44 absolute elevations at 0,1,…,42,42.195 km (Rule 4).
const flat = (m = 10): number[] => Array(44).fill(m);

/** Rolling: ±`amplitude` metres every other kilometre. Gain == loss. */
const rolling = (amplitude: number): number[] =>
  Array.from({ length: 44 }, (_, i) => 100 + (i % 2 === 0 ? 0 : amplitude));

/** A steady net drop of `dropM` metres across the whole race. */
const descending = (dropM: number): number[] =>
  Array.from({ length: 44 }, (_, i) => 500 - (dropM * i) / 43);

describe("courseEffort", () => {
  it("returns the race distance itself for a flat course", () => {
    const e = courseEffort(flat());
    // adjustmentFactor(0) === 1, so the sum collapses to Σ lengthKm.
    expect(e.km).toBeCloseTo(MARATHON_KM, 9);
    expect(e.miles).toBeCloseTo(MARATHON_MILES, 9);
  });

  it("is shorter than the race distance on a net-downhill course", () => {
    const e = courseEffort(descending(400));
    expect(e.km).toBeLessThan(MARATHON_KM);
    expect(e.miles).toBeLessThan(MARATHON_MILES);
  });

  it("is LONGER on a rolling course whose gain equals its loss", () => {
    // The physically meaningful asymmetry: a climb costs more than the
    // matching descent gives back, so an out-and-back that ends where it
    // started still costs more than flat.
    const e = courseEffort(rolling(30));
    expect(e.km).toBeGreaterThan(MARATHON_KM);
    expect(e.miles).toBeGreaterThan(MARATHON_MILES);
  });

  it("agrees with a hand-rolled sum over the engine's own segments", () => {
    const { elevations } = fixtureCourse("boston");
    const expected = buildSegments(elevations, "km").reduce(
      (t, seg) => t + seg.lengthKm * adjustmentFactor(seg.gradient),
      0,
    );
    expect(courseEffort(elevations).km).toBeCloseTo(expected, 12);
  });

  it("rejects an elevation array that isn't 44 points", () => {
    expect(() => courseEffort(flat().slice(0, 43))).toThrow();
  });
});

describe("effortMultiplier", () => {
  it("is exactly 1 on the flat and above 1 on rolling terrain", () => {
    expect(effortMultiplier(courseEffort(flat()))).toBeCloseTo(1, 9);
    expect(effortMultiplier(courseEffort(rolling(30)))).toBeGreaterThan(1);
  });

  it("puts Boston below 1 — a net drop of ~140 m makes it cheaper than flat", () => {
    const m = effortMultiplier(courseEffort(fixtureCourse("boston").elevations));
    expect(m).toBeLessThan(1);
    expect(m).toBeGreaterThan(0.98);
  });
});

describe("goal ↔ pace conversions", () => {
  const units: Unit[] = ["km", "miles"];

  it.each(units)("average pace round-trips exactly (%s)", (unit) => {
    const pace = 300; // 5:00 per unit
    expect(avgPaceFromGoalTime(goalTimeFromAvgPace(pace, unit), unit)).toBeCloseTo(
      pace,
      12,
    );
  });

  it.each(units)("GAP round-trips exactly (%s)", (unit) => {
    const effort = courseEffort(fixtureCourse("boston").elevations);
    const pace = 285;
    expect(
      gapPaceFromGoalTime(goalTimeFromGapPace(pace, effort, unit), effort, unit),
    ).toBeCloseTo(pace, 12);
  });

  it("collapses to the average pace on a flat course", () => {
    // With no grade anywhere, "grade-adjusted" and "average" are the same
    // number — the sanity check that the two inversions share an origin.
    const effort = courseEffort(flat());
    expect(goalTimeFromGapPace(300, effort, "km")).toBeCloseTo(
      goalTimeFromAvgPace(300, "km"),
      9,
    );
  });

  it("asks for a faster average pace than GAP on an uphill-costly course", () => {
    // Rolling costs more than flat, so holding a given GAP means a slower
    // finish — i.e. the average pace is slower than the GAP.
    const effort = courseEffort(rolling(30));
    const goal = goalTimeFromGapPace(300, effort, "km");
    expect(avgPaceFromGoalTime(goal, "km")).toBeGreaterThan(300);
  });

  it("uses the right distance per unit", () => {
    expect(raceDistance("km")).toBe(MARATHON_KM);
    expect(raceDistance("miles")).toBe(MARATHON_MILES);
  });
});

// The load-bearing tests. Everything above is arithmetic about a number; these
// assert the number means what the UI will claim it means — that a goal time
// derived from a GAP produces a chart the engine actually paces at that GAP.
describe("a GAP goal is the pace the engine actually runs", () => {
  const units: Unit[] = ["km", "miles"];

  it.each(units)(
    "every segment's flat-equivalent pace equals the entered GAP (%s)",
    (unit) => {
      // Default strategy: no split or start bias. Segment-by-segment equality
      // is a property of even effort specifically — see the strategy test
      // below for what survives when the race is deliberately shaped.
      const course = fixtureCourse("boston");
      const effort = courseEffort(course.elevations);
      const gap = 300; // 5:00 per unit, grade-adjusted

      const input: PacingInput = {
        goalTimeSeconds: goalTimeFromGapPace(gap, effort, unit),
        courseId: course.id,
        unit,
      };
      const { segments, durations } = computeElevationDurations(input, course);

      // duration_i / (lengthKm_i · adj_i) is the segment's cost expressed as
      // flat-ground pace per km. Convert to the display unit and it must be
      // the GAP that was asked for — on EVERY segment, uphill and down.
      const perKmToUnit = unit === "km" ? 1 : MARATHON_MILES / MARATHON_KM;
      for (const [i, seg] of segments.entries()) {
        const flatEquivalentPerKm =
          durations[i] / (seg.lengthKm * adjustmentFactor(seg.gradient));
        expect(flatEquivalentPerKm / perKmToUnit).toBeCloseTo(gap, 6);
      }
    },
  );

  it("still finishes exactly on the derived goal time", () => {
    const course = fixtureCourse("boston");
    const effort = courseEffort(course.elevations);
    const goalTimeSeconds = goalTimeFromGapPace(300, effort, "km");
    const { durations } = computeElevationDurations(
      { goalTimeSeconds, courseId: course.id, unit: "km" },
      course,
    );
    const total = durations.reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(goalTimeSeconds, 6);
  });
});

// Cross-feature guard. The split/start biases (strategy.ts) re-weight the same
// durations before the same normalization, so they move effort around the race
// without changing how much of it the course demands. The per-segment identity
// above therefore stops holding, but the race-average one — which is what the
// goal field actually means — must not.
describe("a GAP goal survives a shaped race", () => {
  const shapes: PacingInput["split"][] = [
    "negative-aggressive",
    "positive",
    "even-pace",
  ];

  it.each(shapes)("still finishes on the derived goal time (%s)", (split) => {
    const course = fixtureCourse("boston");
    const effort = courseEffort(course.elevations);
    const gap = 300;
    const goalTimeSeconds = goalTimeFromGapPace(gap, effort, "km");

    const { durations } = computeElevationDurations(
      { goalTimeSeconds, courseId: course.id, unit: "km", split },
      course,
    );

    // Total time unchanged, so the race-average grade-adjusted pace is still
    // exactly the GAP that was asked for.
    const total = durations.reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(goalTimeSeconds, 6);
    expect(gapPaceFromGoalTime(total, effort, "km")).toBeCloseTo(gap, 9);
  });

});

// ROADMAP #8. The /compare page's whole claim in one function.
//
// Pikes Peak and REVEL Mt Charleston come through `loadGeometry` rather than
// `fixtureCourse`: FIXTURE_COURSES is pinned to seven for the reasons its
// header gives, and widening it would break the literal counts other suites
// assert. These two are the catalog's actual extremes (1.071 and 0.936), which
// is what makes the direction assertions below worth anything.
describe("equivalentGoalTime", () => {
  const BOSTON = courseEffort(fixtureCourse("boston").elevations);
  const PIKES = courseEffort(loadGeometry("pikes-peak-marathon").elevations);
  const REVEL = courseEffort(
    loadGeometry("revel-mt-charleston-marathon").elevations,
  );
  const T = 3 * 3600 + 20 * 60; // 3:20:00

  it("is the identity when both courses are the same", () => {
    expect(equivalentGoalTime(T, BOSTON, BOSTON)).toBeCloseTo(T, 9);
  });

  it("round-trips A → B → A", () => {
    const there = equivalentGoalTime(T, BOSTON, PIKES);
    expect(equivalentGoalTime(there, PIKES, BOSTON)).toBeCloseTo(T, 9);
  });

  it("is exactly the ratio of the two effort multipliers", () => {
    // Both multipliers divide by the same MARATHON_KM, so the constant
    // cancels — the page can quote either number without them disagreeing.
    expect(equivalentGoalTime(T, BOSTON, PIKES)).toBeCloseTo(
      (T * effortMultiplier(PIKES)) / effortMultiplier(BOSTON),
      9,
    );
  });

  it("is slower on the harder course and faster on the easier one", () => {
    expect(equivalentGoalTime(T, BOSTON, PIKES)).toBeGreaterThan(T);
    expect(equivalentGoalTime(T, BOSTON, REVEL)).toBeLessThan(T);
  });

  it("is symmetric between a flat course and itself, whatever the shape", () => {
    const FLAT = courseEffort(flat());
    const ROLLING = courseEffort(rolling(30));
    expect(equivalentGoalTime(T, FLAT, FLAT)).toBeCloseTo(T, 9);
    // A rolling course costs more, so the same effort finishes later on it.
    expect(equivalentGoalTime(T, FLAT, ROLLING)).toBeGreaterThan(T);
    expect(equivalentGoalTime(T, ROLLING, FLAT)).toBeLessThan(T);
  });

  it("ignores the display unit — the answer is the km figure either way", () => {
    // The property the km/mi toggle on /compare depends on: it re-renders the
    // pace line and nothing else. There is no unit parameter to pass, so this
    // asserts the miles segmentation genuinely is NOT consulted.
    const viaMiles = goalTimeFromGapPace(
      gapPaceFromGoalTime(T, BOSTON, "miles"),
      PIKES,
      "miles",
    );
    const shipped = equivalentGoalTime(T, BOSTON, PIKES);
    // They are close but must not be assumed equal — Pikes is the course where
    // the two segmentations disagree most (0.43%), which is minutes here.
    expect(Math.abs(shipped - viaMiles)).toBeGreaterThan(1);
    expect(shipped).toBeCloseTo(
      goalTimeFromGapPace(gapPaceFromGoalTime(T, BOSTON, "km"), PIKES, "km"),
      12,
    );
  });
});

// The load-bearing one. Everything above is arithmetic about a ratio; this
// asserts the ratio means what /compare will claim it means — that the two
// finish times are genuinely run at the same effort, as the ENGINE computes
// effort, not as this module asserts it.
describe("an equivalent time is the same effort in the engine", () => {
  const units: Unit[] = ["km", "miles"];

  it.each(units)(
    "both courses' charts share one flat-equivalent pace (%s)",
    (unit) => {
      // Both from the pinned seven, because this needs whole Course objects to
      // feed the engine. Sydney climbs 190 m against Boston's 96, so the two
      // genuinely disagree and the conversion has real work to do.
      const from = fixtureCourse("boston");
      const to = fixtureCourse("sydney");
      const goalTimeSeconds = 3 * 3600 + 20 * 60;
      const converted = equivalentGoalTime(
        goalTimeSeconds,
        courseEffort(from.elevations),
        courseEffort(to.elevations),
      );

      // The race-average grade-adjusted pace of each chart, read back off the
      // engine's own durations rather than off `effort`.
      const gapOf = (input: PacingInput, course: typeof from) => {
        const { segments, durations } = computeElevationDurations(input, course);
        const total = durations.reduce((a, b) => a + b, 0);
        const flatEquivalentKm = segments.reduce(
          (t, seg) => t + seg.lengthKm * adjustmentFactor(seg.gradient),
          0,
        );
        return total / flatEquivalentKm;
      };

      const before = gapOf(
        { goalTimeSeconds, courseId: from.id, unit },
        from,
      );
      const after = gapOf(
        { goalTimeSeconds: converted, courseId: to.id, unit },
        to,
      );

      // In km both charts are segmented the way `equivalentGoalTime` measures,
      // so they match to the engine's own precision. In miles the segmentation
      // differs from the km basis the conversion is defined on, so they agree
      // to within that known ~0.4% rather than exactly — which is precisely
      // why the page quotes ONE canonical answer instead of two.
      if (unit === "km") {
        expect(after).toBeCloseTo(before, 6);
      } else {
        expect(Math.abs(after / before - 1)).toBeLessThan(0.005);
      }
    },
  );
});
