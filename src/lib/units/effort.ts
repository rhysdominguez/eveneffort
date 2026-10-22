// How a course's effort multiplier is worded for a reader.
//
// Lifted out of CourseRankingTable when /compare (ROADMAP #8) became its second
// consumer — the same move #5 made for `metresToFeet`. Importing it from that
// component would have pulled the whole ranking table into /compare's bundle
// for one string function, and duplicating the dead band is exactly how two
// pages start disagreeing about whether Prosecco is flat.
//
// SummaryHeader had a third wording of the same number until 2026-09-20,
// `effortSummary` ("Costs 0.6% less than a flat course"), with its own private
// copy of the band below. It was deleted rather than kept in sync by hand, so
// `formatVsFlat` is once again the only place this number becomes words.

import {
  totalCostKm,
  type CourseCostBasis,
} from "@/lib/pacing/effort";
import { MARATHON_KM } from "@/lib/pacing/segments";

/**
 * How far from flat a multiplier has to be before it is worth a claim, in
 * percentage points.
 *
 * Kept at half a percent, which is roughly the noise floor of how a course was
 * digitized: below it the claim is smaller than the confidence behind it.
 *
 * It used to be doing far more work than that. Under the engine's symmetric
 * curve 292 of the 326 seeded courses fell inside this band, because climbing
 * and descending very nearly cancel under Minetti, so the band was quietly
 * hiding a model that could not tell courses apart rather than suppressing
 * noise. On the cost curve 92 of 326 fall inside it, which is a believable
 * number of genuinely flat marathons.
 */
export const FLAT_EQUIVALENT_BAND = 0.5;

/** "2.1% harder" / "6.2% faster" / "flat-equivalent". */
export function formatVsFlat(multiplier: number): string {
  const percent = (multiplier - 1) * 100;
  if (Math.abs(percent) < FLAT_EQUIVALENT_BAND) return "flat-equivalent";
  return percent > 0
    ? `${percent.toFixed(1)}% harder`
    : `${Math.abs(percent).toFixed(1)}% faster`;
}

/**
 * What a course costs ALL IN: its grades and its altitude, as one multiplier.
 *
 * THIS IS THE NUMBER "vs flat" MEANS, and since ROADMAP #12 it is also the
 * number /compare converts with: `equivalentGoalTime` is the ratio of exactly
 * this quantity between two courses. That is the point of routing both through
 * `totalCostKm` — the figure a runner reads on the ranking table and the figure
 * the conversion is computed from are now provably the same one, so a course
 * the table calls 3% harder converts 3% slower.
 *
 * READS `cost`, NOT `effort`. The pacing engine still reads `effort` alone, so
 * no chart, no split and no shared link moves because of this: the geometry a
 * paceband is drawn from is untouched. See src/lib/pacing/courseCost.ts for why
 * the two curves exist.
 */
export function totalEffortMultiplier(course: CourseCostBasis): number {
  return totalCostKm(course) / MARATHON_KM;
}

// `formatAltitudePenalty` lived here until 2026-09-17, wording the thin-air
// multiplier as "4.1% slower" for the results badge and the ranking table.
// Both now print the course's height and nothing else: the cost is already in
// the "vs flat" figure beside them, and quoting it twice asked the reader to
// work out whether the two numbers were the same claim. `hasAltitudePenalty`
// in `altitude.ts` is still the dead band if a surface ever needs it again.
