// The B.A.A.'s net-downhill time index, computed per course.
//
// New for the 2027 race: a qualifying time run on a course that finishes far
// below where it started has time ADDED to it before it is compared against the
// standard. The adjustment lands on the runner's time, not on the standard —
// that is how the B.A.A. words it, and the two are not the same when a runner
// wants to know what to actually run.
//
//   1,500-2,999 ft of net drop  -> +5:00
//   3,000-5,999 ft              -> +10:00
//   6,000 ft or more            -> not eligible to qualify at all
//
// WHY THIS IS COMPUTABLE AND THE CERTIFICATION FLAG IS NOT. `CourseTerrain.netM`
// is finish minus start, and the header of src/lib/pacing/terrain.ts is explicit
// that this one figure is EXACT at any resolution — unlike `gainM`/`lossM`,
// which are per-kilometre floors. Net drop is precisely the quantity this rule
// uses, and it already ships to the client on `CourseSummary.terrain` for every
// seeded course. So the per-race half of this feature needs no schema column, no
// seed field and no human research, which is what the roadmap assumed it would.
//
// AN ESTIMATE, NEVER A DETERMINATION — and the UI must say so. Two reasons, both
// measured rather than theoretical:
//
//  1. Courses sit near the lines. Utah Valley reads -1,526 ft and Bhutan
//     -1,517 ft, both barely over the +5:00 threshold; Deseret News reads
//     -1,420 ft, barely under. A digitized route or a DEM-filled elevation is
//     not accurate to 30 ft over a marathon, so which side of the line those
//     three fall on is genuinely not something this module knows.
//  2. A source route can simply be wrong. Jack & Jill's Downhill reads -856 ft
//     here (777 m -> 516 m, and the dense 1,274-point profile agrees, so it is
//     the source geometry rather than the 44-point resample) against a published
//     drop closer to 2,000 ft. That is a race this rule plainly targets, and we
//     would currently index it at zero.
//
// `nearThreshold` exists to carry (1) into the UI. Nothing here carries (2) —
// only better geometry fixes that, and it is recorded in ROADMAP.md as a known
// gap.
import type { CourseTerrain } from "@/types";
import { metresToFeet } from "@/lib/units/elevation";

/**
 * Lower bound of each band in FEET of net drop, largest first for first-match
 * lookup. Feet because that is the unit the rule is published in — converting
 * the thresholds to metres instead would put rounding on the boundary the
 * runner is being judged against.
 *
 * A null index means the course is not eligible for qualifying at all.
 */
export const DOWNHILL_INDEX_BANDS: readonly (readonly [number, number | null])[] =
  [
    [6000, null],
    [3000, 600],
    [1500, 300],
  ];

/**
 * How close to a band edge counts as "we can't call this".
 *
 * At 150 ft this flags five of the 326 courses seeded today, all of them
 * clustered around the 1,500 ft line: N4 Elands (−1,631), Estes Park (−1,574),
 * Mendoza (−1,549), Utah Valley (−1,526) and Bhutan International (−1,517) sit
 * just over it, and Deseret News (−1,420) just under. That is five of the eight
 * courses the rule touches at all, which looks like a lot until you notice the
 * spread it covers is 211 ft over a 42 km course — well inside what a digitized
 * route or a DEM-filled elevation can be wrong by. Flagging them is the honest
 * reading, not an over-cautious one.
 *
 * Wider than any plausible rounding in the 44-point array, and far narrower
 * than the 1,500 ft gap between bands, so it can never make two bands ambiguous
 * at once.
 */
export const NEAR_THRESHOLD_FT = 150;

export interface DownhillIndex {
  /** Net drop in feet: positive downhill, negative on a course that finishes higher. */
  dropFt: number;
  /** Seconds added to the runner's finish time. Zero on an ordinary course. */
  indexSeconds: number;
  /** False only on a course too steeply downhill to qualify on at all. */
  eligible: boolean;
  /**
   * The drop is within `NEAR_THRESHOLD_FT` of a band edge, so which side of it
   * this course falls on is inside our margin of error. Show the caveat.
   */
  nearThreshold: boolean;
}

/**
 * The index this course would attract, from its terrain alone.
 *
 * Read the module header before presenting the result as fact — it is our
 * estimate from our elevation data, not the B.A.A.'s determination.
 */
export function downhillIndex(terrain: CourseTerrain): DownhillIndex {
  // netM is negative on a downhill course; the rule is stated as a positive drop.
  const dropFt = -metresToFeet(terrain.netM);

  let indexSeconds = 0;
  let eligible = true;
  for (const [minDropFt, seconds] of DOWNHILL_INDEX_BANDS) {
    if (dropFt >= minDropFt) {
      if (seconds === null) {
        eligible = false;
        indexSeconds = 0;
      } else {
        indexSeconds = seconds;
      }
      break;
    }
  }

  const nearThreshold = DOWNHILL_INDEX_BANDS.some(
    ([minDropFt]) => Math.abs(dropFt - minDropFt) <= NEAR_THRESHOLD_FT,
  );

  return { dropFt, indexSeconds, eligible, nearThreshold };
}

/** Whether this course's time is adjusted at all — the common "no" case. */
export function isIndexed(index: DownhillIndex): boolean {
  return index.indexSeconds > 0 || !index.eligible;
}
