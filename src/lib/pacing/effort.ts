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
import type { CourseAltitude, CourseCost, CourseEffort, Unit } from "@/types";
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
 * Everything that makes one course cost more finish time than another: what
 * its grades cost, and what its air costs. `CourseSummary` satisfies it, which
 * is why every caller can pass a catalog row straight in.
 */
export interface CourseCostBasis {
  cost: CourseCost;
  altitude: CourseAltitude;
}

/**
 * A course's ALL-IN cost in flat-equivalent, sea-level kilometres.
 *
 * The two factors are independent and multiply cleanly: `cost` asks how much
 * more flat ground the profile makes you cover, `altitude` asks how much less
 * oxygen you have while covering it. The Minetti curve reads gradient alone and
 * is blind to height above sea level, so a course 2% harder on grade and 4%
 * harder on air is 1.02 × 1.04.
 *
 * THE ONE PLACE the two are combined. `totalEffortMultiplier` in
 * src/lib/units/effort.ts is this number over the marathon distance, so the
 * figure /compare converts with and the figure the ranking table prints cannot
 * drift apart.
 */
export function totalCostKm(course: CourseCostBasis): number {
  return course.cost.km * course.altitude.multiplier;
}

/**
 * The finish time on course `to` that costs the same as `seconds` on course
 * `from`: exactly T × C_to / C_from.
 *
 * READS `cost`, NOT `effort`, and that distinction is the whole point. `effort`
 * is the pacing engine's damped, behavioural curve, right for spreading a goal
 * time over one race and wrong for comparing two: applied equally to climbs and
 * descents it makes almost every road course reduce to its flat distance, and
 * against 44 published FindMyMarathon Course Scores it explains 1.7% of the
 * variance. `cost` (asymmetric) plus `altitude` explains 92.5%. The argument
 * and the numbers are in the header of src/lib/pacing/courseCost.ts.
 *
 * What it still does NOT model: weather, surface, altitude ACCLIMATISATION as
 * opposed to raw altitude, and the extra damage a long descent does to a
 * runner's legs beyond the time it saves them.
 *
 * ALWAYS the km segmentation. One figure has to be canonical, km is the finer
 * of the two, and a display-unit toggle must not silently move the answer by
 * the ~0.4% the two segmentations can disagree by — a runner flipping km/mi is
 * asking to re-read the number, not to re-compute it.
 */
export function equivalentGoalTime(
  seconds: number,
  from: CourseCostBasis,
  to: CourseCostBasis,
): number {
  return (seconds * totalCostKm(to)) / totalCostKm(from);
}

/**
 * The equal-effort pace both sides of a conversion are run at: seconds per
 * flat-equivalent, sea-level unit.
 *
 * This is the invariant `equivalentGoalTime` preserves, so it is the honest
 * thing for /compare to print beside two times it calls equal. Derived from the
 * km figure and then unit-converted rather than recomputed against the mile
 * segmentation: it is one physical quantity and rendering it per mile is a unit
 * conversion, whereas re-segmenting would make the two finishes print different
 * paces while the page claims they are the same.
 *
 * NOT the same quantity as `gapPaceFromGoalTime` above, which inverts the
 * PACING ENGINE and is what a GAP goal round-trips against. On the 321 of 326
 * seeded courses that top out below 1,000 m the altitude term is exactly 1, but
 * the grade curves still differ, so the two numbers are close without being
 * equal and neither substitutes for the other.
 */
export function equalEffortPace(
  goalTimeSeconds: number,
  course: CourseCostBasis,
  unit: Unit,
): number {
  const perKm = goalTimeSeconds / totalCostKm(course);
  return unit === "km" ? perKm : perKm * MILE_IN_KM;
}
