// Course altitude — how much thinner air costs a runner over a whole marathon.
// The third descriptor of a course's character, alongside `terrain.ts`
// (how hilly) and `effort.ts` (how fast the grades make it).
//
// WHY IT IS SEPARATE FROM effort.ts. The Minetti model in `adjustment.ts` reads
// GRADIENT and nothing else: it is a cost-of-transport curve measured on a
// treadmill at sea level, and it is blind to the absolute height that treadmill
// sits at. Two courses with identical profiles, one in Rotterdam and one in
// Leadville, reduce to the same flat-equivalent distance. That is not a bug in
// the curve, it is the curve's domain — so altitude is corrected for OUTSIDE
// it, as its own multiplier, rather than by bending a constant inside it.
// Rule 1 stays intact: this module imports from the locked algorithm and
// modifies none of it.
//
// THE MODEL. VO2max falls roughly linearly with altitude in endurance-trained
// athletes. Wehrlin & Hallen (2006), "Linear decrease in VO2max and performance
// with increasing altitude in endurance trained athletes" (Eur J Appl Physiol
// 96:404-412) measured 6.3% per 1,000 m of ascent. A marathon is run at a fixed
// FRACTION of VO2max, and on flat ground at marathon speeds metabolic cost is
// near-linear in speed, so available speed scales with available VO2 and the
// time multiplier is the reciprocal of the remaining fraction. That reciprocal
// is the whole of `altitudeMultiplier`.
//
// THE THRESHOLD IS A JUDGEMENT CALL, and worth stating plainly. Wehrlin & Hallen
// found the decline already underway at ~300 m in trained athletes, which is
// lower than the ~1,500 m that older work (and most coaching practice) treats as
// the point where altitude starts to matter. Taking the 300 m figure literally
// would put a penalty on Madrid, Munich and a long tail of ordinary European
// road races, which is a claim this product should not make quietly. So the
// decrement runs from 1,000 m: conservative, inside the band the literature
// disagrees over, and high enough that every sea-level course reads exactly 1.
// `altitude.test.ts` pins that last property, because it is the one that would
// otherwise rot silently.
//
// PER-SEGMENT, NOT MEAN ELEVATION. The multiplier is convex and the threshold
// makes it piecewise, so a course that starts at 500 m and tops out at 2,500 m
// is not well described by its mean of 1,500 m: half of it is well into the
// penalty and the mean understates that. Averaging the MULTIPLIER over the
// per-kilometre array instead costs one more reduce and gets Pikes Peak and
// Leadville right.
import type { CourseAltitude } from "@/types";

/**
 * Where the aerobic penalty starts, in metres above sea level. Below this a
 * course is reported as unaffected, exactly 1.0 and no rounding dust.
 */
export const ALTITUDE_THRESHOLD_M = 1000;

/**
 * Fractional VO2max lost per 1,000 m of ascent above the threshold.
 * Wehrlin & Hallen (2006), endurance-trained athletes.
 */
export const VO2MAX_DECREMENT_PER_1000M = 0.063;

/**
 * Floor on the remaining VO2max fraction. The linear fit is calibrated over the
 * altitudes runners actually race at and goes to zero around 16,000 m, which is
 * nonsense; this stops the reciprocal running away if it is ever handed one.
 * No real course comes close — the highest marathon on earth is ~5,400 m.
 */
const MIN_VO2MAX_FRACTION = 0.5;

/**
 * The aerobic cost multiplier at one elevation (m above sea level). 1.0 at or
 * below the threshold; 1.04 means 4% slower for the same effort.
 */
export function altitudeMultiplier(elevationM: number): number {
  if (!Number.isFinite(elevationM) || elevationM <= ALTITUDE_THRESHOLD_M) {
    return 1;
  }
  const excessKm = (elevationM - ALTITUDE_THRESHOLD_M) / 1000;
  const fraction = Math.max(
    MIN_VO2MAX_FRACTION,
    1 - VO2MAX_DECREMENT_PER_1000M * excessKm,
  );
  return 1 / fraction;
}

/**
 * Mean elevation, highest point, and the whole-course aerobic multiplier, from
 * a course's 44-point elevation array.
 *
 * Throws on anything that isn't 44 finite numbers — the same contract
 * `courses.integrity.test.ts` enforces on the repo files, and the same one
 * `courseTerrain` holds itself to.
 */
export function courseAltitude(elevations: number[]): CourseAltitude {
  if (elevations.length !== 44 || elevations.some((e) => !Number.isFinite(e))) {
    throw new Error("Elevations array must have exactly 44 finite entries");
  }
  let sum = 0;
  let multiplierSum = 0;
  let maxM = elevations[0];
  for (const e of elevations) {
    sum += e;
    multiplierSum += altitudeMultiplier(e);
    if (e > maxM) maxM = e;
  }
  return {
    meanM: sum / elevations.length,
    maxM,
    multiplier: multiplierSum / elevations.length,
  };
}

/**
 * Whether this course's altitude is worth saying anything about. Half a percent
 * is the same dead band `formatVsFlat` uses on the grade multiplier, for the
 * same reason: below it the claim is smaller than the confidence behind it.
 */
export function hasAltitudePenalty(altitude: CourseAltitude): boolean {
  return (altitude.multiplier - 1) * 100 >= 0.5;
}
