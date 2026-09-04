// Course effort — the flat-equivalent distance a course costs — plus the
// conversions between a goal finish time and the two paces that can express it.
//
// DERIVED, not new math. `computeElevationDurations` builds each segment's raw
// duration as lengthKm · flatPace · adjustmentFactor(gradient), and
// `normalizePaces` then applies a single scalar so the total lands on the goal:
//
//   durations[i] = goalTimeSeconds · (lengthKm_i · adj_i) / Σ(lengthKm · adj)
//
// So every segment's flat-equivalent pace — duration_i / (lengthKm_i · adj_i) —
// is the SAME constant, goalTimeSeconds / Σ(lengthKm · adj). That constant IS
// the grade-adjusted pace, which makes this inversion exact rather than an
// approximation: a GAP goal maps to one finish time and back again with no
// drift. `effort.test.ts` pins that against the real engine.
//
// A SPLIT OR START STRATEGY does not disturb this. Those biases re-weight the
// same durations before the same normalization, so they change WHEN the effort
// is spent, not how much of it there is: Σ(lengthKm · adj) is a property of the
// course geometry alone. The per-segment reading above is therefore exact only
// under the default even-effort strategy, but the race-average one — the number
// the goal field means — holds under all of them, `even-pace` included.
//
// Σ(lengthKm · adj) is the course's flat-equivalent distance: a course at 41.7
// costs what 41.7 km of flat road costs. It is UNIT-DEPENDENT because
// buildSegments segments differently in each mode (43 km segments vs 27 mile
// ones) and the gradients therefore differ, so both are computed and both are
// shipped on CourseSummary.
//
// Rule 1: this module only READS the locked pacing algorithm. adjustment.ts,
// minetti.ts, normalize.ts and index.ts are not modified by it.
import type { CourseEffort, Unit } from "@/types";
import { adjustmentFactor } from "./adjustment";
import { buildSegments, MARATHON_KM, MARATHON_MILES, MILE_IN_KM } from "./segments";

/** The race distance itself, in the given display unit. */
export function raceDistance(unit: Unit): number {
  return unit === "km" ? MARATHON_KM : MARATHON_MILES;
}

function effortFor(elevations: number[], unit: Unit): number {
  const sumKm = buildSegments(elevations, unit).reduce(
    (total, seg) => total + seg.lengthKm * adjustmentFactor(seg.gradient),
    0,
  );
  return unit === "km" ? sumKm : sumKm / MILE_IN_KM;
}

/**
 * The flat-equivalent distance of a course, from its 44-point elevation array.
 * Throws (via buildSegments) on anything that isn't 44 points — the same
 * contract `courses.integrity.test.ts` enforces on the repo files.
 */
export function courseEffort(elevations: number[]): CourseEffort {
  return {
    km: effortFor(elevations, "km"),
    miles: effortFor(elevations, "miles"),
  };
}

/**
 * How much more (or less) this course costs than a flat marathon. 1.02 means
 * 2% more. Across the 326 seeded courses this runs 0.936 (REVEL Mt Charleston,
 * a net drop of ~1,500 m) to 1.071 (Pikes Peak) — so it separates real courses,
 * not just their rounding.
 *
 * Reported from the km figure. The mile segmentation gives a slightly
 * different answer (up to 0.43% apart on Pikes Peak, far less on a road
 * course); one has to be picked for a single headline number, and km is the
 * finer segmentation.
 */
export function effortMultiplier(effort: CourseEffort): number {
  return effort.km / MARATHON_KM;
}

/** Average pace (sec per displayed unit) → the finish time it implies. */
export function goalTimeFromAvgPace(
  paceSecPerUnit: number,
  unit: Unit,
): number {
  return paceSecPerUnit * raceDistance(unit);
}

/** Finish time → the average pace (sec per displayed unit) it works out to. */
export function avgPaceFromGoalTime(
  goalTimeSeconds: number,
  unit: Unit,
): number {
  return goalTimeSeconds / raceDistance(unit);
}

/**
 * Grade-adjusted pace (sec per displayed unit) → the finish time it implies on
 * THIS course. The multiply that the module header derives.
 */
export function goalTimeFromGapPace(
  gapPaceSecPerUnit: number,
  effort: CourseEffort,
  unit: Unit,
): number {
  return gapPaceSecPerUnit * (unit === "km" ? effort.km : effort.miles);
}

/** Finish time on this course → the grade-adjusted pace it is run at. */
export function gapPaceFromGoalTime(
  goalTimeSeconds: number,
  effort: CourseEffort,
  unit: Unit,
): number {
  return goalTimeSeconds / (unit === "km" ? effort.km : effort.miles);
}

/**
 * The finish time on course `to` that costs the same effort as `seconds` on
 * course `from`: the two conversions above run back to back, which is exactly
 * T × E_to / E_from.
 *
 * "Same effort" is the claim, and it is the one the module header derives —
 * both finishes are run at the identical grade-adjusted pace, so both spend
 * the same metabolic cost per flat-equivalent kilometre. What it does NOT
 * model is everything outside the geometry: weather, altitude, and the extra
 * damage a long descent does to a runner's legs.
 *
 * ALWAYS the km segmentation, matching `effortMultiplier` above. One figure
 * has to be canonical, km is the finer of the two, and a display-unit toggle
 * must not silently move the answer by the ~0.4% the two segmentations can
 * disagree by — a runner flipping km/mi is asking to re-read the number, not
 * to re-compute it.
 */
export function equivalentGoalTime(
  seconds: number,
  from: CourseEffort,
  to: CourseEffort,
): number {
  return goalTimeFromGapPace(gapPaceFromGoalTime(seconds, from, "km"), to, "km");
}
