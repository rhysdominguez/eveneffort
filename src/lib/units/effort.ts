// How a course's effort multiplier is worded for a reader.
//
// Lifted out of CourseRankingTable when /compare (ROADMAP #8) became its second
// consumer — the same move #5 made for `metresToFeet`. Importing it from that
// component would have pulled the whole ranking table into /compare's bundle
// for one string function, and duplicating the dead band is exactly how two
// pages start disagreeing about whether Prosecco is flat.
//
// `effortSummary` in SummaryHeader is the third wording of the same number and
// deliberately stays there: it is a full sentence for one specific panel, not a
// shared label. It carries its own copy of the band below — if that ever needs
// to change, change both.

import type { CourseAltitude, CourseEffort } from "@/types";
import { effortMultiplier } from "@/lib/pacing/effort";
import { hasAltitudePenalty } from "@/lib/pacing/altitude";

/**
 * How far from flat a multiplier has to be before it is worth a claim, in
 * percentage points.
 *
 * 308 of the 326 seeded courses sit between 0.985 and 1.005, because climbing
 * and descending very nearly cancel under Minetti. Without this band the UI
 * would confidently report "0.1% harder" on a course that is, for any purpose
 * a runner has, identical to flat.
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
 * The two are independent and multiply cleanly. `effort` asks how much more
 * flat-equivalent ground the profile makes you cover; `altitude` asks how much
 * less oxygen you have while covering it. Neither knows about the other — the
 * Minetti curve reads gradient alone and is blind to height above sea level —
 * so a course that is 2% harder on grade and 4% harder on air is 1.02 × 1.04.
 *
 * THIS IS THE NUMBER "vs flat" MEANS. Every surface that answers "how hard is
 * this course" goes through here, so the ranking table, /compare and the
 * results header cannot drift apart on it. What stays geometry-only is the
 * MATH: `equivalentGoalTime` and the pacing engine still read `effort` alone,
 * so no chart, no split and no shared link moves because of this. Altitude is
 * a thing said about a course here, not yet a thing done to a paceband —
 * see ROADMAP #7 for that open question.
 */
export function totalEffortMultiplier(course: {
  effort: CourseEffort;
  altitude: CourseAltitude;
}): number {
  return effortMultiplier(course.effort) * course.altitude.multiplier;
}

/**
 * The altitude penalty alone, worded for a reader: "4.1% slower", or null when
 * the course is low enough that there is nothing to say.
 *
 * Null rather than "0.0% slower" on purpose. Most courses are below the
 * threshold and return exactly 1, and a pill reading "no altitude penalty" on
 * three hundred sea-level races is noise standing where information should be.
 */
export function formatAltitudePenalty(altitude: CourseAltitude): string | null {
  if (!hasAltitudePenalty(altitude)) return null;
  return `${((altitude.multiplier - 1) * 100).toFixed(1)}% slower`;
}
