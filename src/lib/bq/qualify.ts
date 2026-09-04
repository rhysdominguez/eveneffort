// Does this finish time qualify — and, separately, would it have got you in.
//
// The two questions have different answers most years, and answering only the
// first is how a calculator ends up telling someone who clears their standard by
// thirty seconds that they are going to Boston. `clears` answers the B.A.A.'s
// published rule; `cutoffOutlook` answers what actually happened to applicants.
import type { CourseTerrain } from "@/types";
import { downhillIndex } from "@/lib/bq/downhill";
import {
  BQ_CUTOFFS,
  bqStandardSeconds,
  type BqCutoff,
  type BqDivision,
} from "@/lib/bq/standards";

export interface BqInput {
  finishSeconds: number;
  /** Age on Boston race day — see the header of standards.ts. */
  age: number;
  division: BqDivision;
  /** The qualifying course, when one is known. Omitted means no index applied. */
  terrain?: CourseTerrain;
}

export interface BqStatus {
  standardSeconds: number;
  /** Added to the finish time by the net-downhill rule; usually 0. */
  indexSeconds: number;
  /** The time the B.A.A. would actually compare against the standard. */
  adjustedSeconds: number;
  /** Standard minus adjusted: POSITIVE means under the standard by that much. */
  marginSeconds: number;
  clears: boolean;
  /** False on a course too steeply downhill to qualify on at all. */
  eligible: boolean;
  /** The course's drop is close enough to a band edge that the index is uncertain. */
  nearThreshold: boolean;
}

/**
 * The verdict, or null when there is no standard for this age (under 18).
 *
 * The comparison is `<=`, not `<`: the B.A.A. accepts a time equal to the
 * standard. A runner who finishes in exactly 3:05:00 against a 3:05:00 standard
 * has qualified, and an off-by-one here would tell them otherwise.
 */
export function bqStatus(input: BqInput): BqStatus | null {
  const standardSeconds = bqStandardSeconds(input.age, input.division);
  if (standardSeconds === null) return null;

  const index = input.terrain
    ? downhillIndex(input.terrain)
    : { indexSeconds: 0, eligible: true, nearThreshold: false };

  const adjustedSeconds = input.finishSeconds + index.indexSeconds;
  const marginSeconds = standardSeconds - adjustedSeconds;

  return {
    standardSeconds,
    indexSeconds: index.indexSeconds,
    adjustedSeconds,
    marginSeconds,
    clears: index.eligible && adjustedSeconds <= standardSeconds,
    eligible: index.eligible,
    nearThreshold: index.nearThreshold,
  };
}

/** How many recent years to weigh a buffer against. Five spans both extremes. */
export const RECENT_CUTOFF_COUNT = 5;

export interface CutoffOutlook {
  /** The years weighed, newest first. */
  considered: readonly BqCutoff[];
  /** How many of them this buffer would have been enough for. */
  clearedCount: number;
  /** The year that demanded most of those considered. */
  toughest: BqCutoff;
  clearsToughest: boolean;
}

/**
 * What a buffer under the standard would have been worth in recent years.
 *
 * Deliberately a count and a range rather than a prediction. The cut-off is set
 * by field size against application volume, neither of which is knowable before
 * registration closes, so "enough in 3 of the last 5 years" is the strongest
 * honest claim available — and it is a far more useful one than a yes.
 */
export function cutoffOutlook(
  marginSeconds: number,
  count: number = RECENT_CUTOFF_COUNT,
): CutoffOutlook {
  const considered = BQ_CUTOFFS.slice(0, count);
  const toughest = considered.reduce((worst, c) =>
    c.seconds > worst.seconds ? c : worst,
  );
  return {
    considered,
    clearedCount: considered.filter((c) => marginSeconds >= c.seconds).length,
    toughest,
    clearsToughest: marginSeconds >= toughest.seconds,
  };
}
