// How much a course costs a runner's FINISH TIME, as a function of gradient.
//
// This is not `adjustment.ts` and must never be merged back into it. The two
// answer different questions and are calibrated against different evidence:
//
//   adjustmentFactor  "how should a runner redistribute pace WITHIN this race?"
//                     Damped Minetti, k = 0.35. Calibrated against published
//                     pace bands (FindMyMarathon, paceband.org) because that
//                     is a question about observed RUNNER BEHAVIOUR: real
//                     marathoners adjust only a fraction of what metabolic
//                     cost predicts. Pinned by fmm.boston.regression.test.ts.
//
//   courseCostFactor  "what finish time does this course cost, against another
//                     course?" Asymmetric Minetti. Calibrated against 44 of
//                     FindMyMarathon's published Course Scores because that is
//                     a question about PERFORMANCE, not pacing.
//
// WHY THEY CANNOT BE THE SAME FUNCTION. Fitting `adjustment.ts`'s shape to the
// Course Score set explains essentially nothing: with one damping coefficient
// applied equally to climbs and descents, the best achievable R^2 against 44
// FMM scores is 0.027, and the shipped k = 0.35 scores 0.017. No value of k
// helps, because the defect is not the scale, it is the SYMMETRY. Minetti's
// cost curve is close enough to symmetric at road grades that climbing and
// descending very nearly cancel, so a rolling course reduces to almost exactly
// its flat distance. That is true of metabolic cost and false of race results:
// a runner does not get back on the descent what the climb took. Before this
// module, 292 of 326 seeded courses landed inside the +/-0.5% "flat-equivalent"
// dead band, Big Sur read 0.3% FASTER than flat, and Blue Ridge (marketed, and
// measured, as America's toughest road marathon) read 0.6% harder. With the
// cost curve 92 of 326 are in that band, the catalog spans 0.875 (Eker I Run)
// to 1.682 (Pikes Peak), and Blue Ridge reads 10.9% harder.
//
// Letting the two directions carry their own coefficients fixes it:
//
//   symmetric k, no altitude    R^2 = 0.027
//   symmetric k + altitude      R^2 = 0.381
//   asymmetric, no altitude     R^2 = 0.667
//   asymmetric + altitude       R^2 = 0.925     <- shipped
//
// Both halves are needed and neither alone is enough. The altitude half is not
// in this file: it is `altitude.ts`, unchanged, and the fit independently chose
// an exponent of exactly 1.0 on it, which is a pleasant external check on
// Wehrlin & Hallen rather than a number anyone tuned here.
//
// THE COEFFICIENTS ARE FITTED, NOT DERIVED, and that is the honest description.
// k_up = 1.95 exceeding 1.0 does not mean runners lose MORE than Minetti's
// metabolic prediction on a climb in the moment; it means that by the finish a
// climb has cost more than its metabolic bill, once pacing error, accumulated
// fatigue and the eccentric damage of the matching descent are counted. The
// 44-point profile also floors the true gain (it retains 7-53% of FMM's
// surveyed figure, varying by course), so part of k_up is standing in for
// climbing the source data never recorded. See ROADMAP #12.
import type { CourseCost, Unit } from "@/types";
import { minettiCost, FLAT_COST } from "./minetti";
import { buildSegments, MARATHON_KM, MILE_IN_KM } from "./segments";

/**
 * Cost weight on climbs, as a multiple of Minetti's predicted deviation.
 * Fitted against 44 FindMyMarathon Course Scores; see the header.
 */
export const COST_UPHILL_K = 1.95;

/**
 * Cost weight on descents. Roughly 0.41x the uphill weight: a descent returns
 * well under half of what the matching climb costs, which is the asymmetry
 * this whole module exists to express.
 */
export const COST_DOWNHILL_K = 0.8;

/** Floor on the per-segment factor. A backstop, not a model. */
export const COST_DOWNHILL_FLOOR = 0.6;
/** Ceiling on the per-segment factor. A backstop, not a model. */
export const COST_UPHILL_CEIL = 2.5;

/**
 * The finish-time cost of one segment's gradient, relative to flat ground.
 *
 * `clamp(1 + k(g) * (C_r(g)/C_r(0) - 1), 0.6, 2.5)` where k is the uphill or
 * downhill coefficient according to the sign of g. Minetti's polynomial is
 * read, never modified (Rule 1).
 *
 * The clamps are guardrails for terrain the regression was never fitted on.
 * Across every km and mile segment of all 326 seeded courses they bind on
 * 0.098% (ceiling, Leadville) and 0.004% (floor) of segments, so they shape
 * nothing a road marathon does.
 */
export function courseCostFactor(g: number): number {
  const k = g > 0 ? COST_UPHILL_K : COST_DOWNHILL_K;
  const scaled = 1 + k * (minettiCost(g) / FLAT_COST - 1);
  return Math.min(COST_UPHILL_CEIL, Math.max(COST_DOWNHILL_FLOOR, scaled));
}

/**
 * The cost-equivalent distance of a course, from its 44-point elevation array.
 *
 * Mirrors `courseEffort` exactly, including the deliberate per-unit
 * segmentation: km and mile segments average the same hills over different
 * distances, so they produce different gradients and both are carried.
 *
 * Throws (via buildSegments) on anything that isn't 44 points, the same
 * contract `courses.integrity.test.ts` enforces on the repo files.
 */
export function courseCost(elevations: number[]): CourseCost {
  return {
    km: costFor(elevations, "km"),
    miles: costFor(elevations, "miles"),
  };
}

function costFor(elevations: number[], unit: Unit): number {
  const sumKm = buildSegments(elevations, unit).reduce(
    (total, seg) => total + seg.lengthKm * courseCostFactor(seg.gradient),
    0,
  );
  return unit === "km" ? sumKm : sumKm / MILE_IN_KM;
}

/**
 * How much more (or less) this course's GRADES cost than a flat marathon, with
 * altitude excluded. 1.02 means 2% more.
 *
 * Reported from the km figure for the same reason `effortMultiplier` is: one
 * figure has to be canonical for a single headline number, and km is the finer
 * segmentation. Callers wanting the all-in number want `totalEffortMultiplier`
 * in src/lib/units/effort.ts, which folds altitude in on top of this.
 */
export function costMultiplier(cost: CourseCost): number {
  return cost.km / MARATHON_KM;
}
