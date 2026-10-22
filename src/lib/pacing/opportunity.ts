// Pace opportunity — the Impact breakdown's total, said in a word (ROADMAP #25).
//
// `ImpactPanel` ends on a bare figure: "Total Impact +6.2%". The four tiles above
// it explain WHERE that number came from and nothing on the page says WHAT IT
// MEANS. A runner who has never met a grade-adjusted figure cannot tell +6.2%
// from an ordinary race day. This module turns that one number into a position on
// a fixed scale and a single word.
//
// IT READS THE TOTAL AND NOTHING ELSE. `courseOpportunity` takes an
// `ImpactBreakdown` and uses `totalPercent` verbatim. It does not recompute cost,
// does not re-weight the factors, and deliberately has no access to anything the
// panel is not already showing, so the word underneath can never contradict the
// number above it. That also means it inherits the panel's altitude omission
// (impact.ts, "ALTITUDE IS NOT A FACTOR HERE"): on the 32 seeded courses above
// 1,000 m this reads a little kinder than the all-in figure `/courses` prints.
// Folding altitude back in here was considered and rejected for exactly the
// reason above: La Paz would show a "Challenging" verdict under a +14.9% total,
// and a panel that argues with itself is worse than one that is incomplete in a
// documented way.
//
// WHY THE SCALE IS NOT LINEAR. Across the 326 seeded courses the terrain half of
// this number is savagely lopsided: median +0.74%, 63.8% of the catalog at or
// below +1%, 92% at or below +3%, and then a tail that runs to Pikes Peak at
// +47%. Stretch a bar linearly over that range and every road marathon in the
// world lands on the same pixel. Weather is the wider lever and the one that
// actually moves during a session: about +5% at 25 C, about +35% at 35 C and 90%
// humidity. So the anchors below spend most of their resolution between -3% and
// +10%, which is where real races on real days actually sit, and compress the
// ends that only the mountain courses reach.
//
// THE ANCHORS ARE A PRESENTATION CHOICE, NOT A MODEL, and that is the honest
// description. Nothing downstream computes with the score: it positions a marker
// and picks one of three words. The pacing math is untouched and this module is
// not on its path.
import type { ImpactBreakdown } from "./impact";

/**
 * Impact percent to a 0..100 position, as `[percent, score]` pairs in ascending
 * percent. Read as a piecewise-linear curve, clamped flat outside the ends.
 *
 * Reading the interesting rows: 0% (a flat course in cool air, the default state
 * of the page) scores 72, comfortably favorable, because a flat course on a cool
 * day IS a fast day and the scale would be lying to call it average. +2%, about
 * what 18 C costs a flat course, scores 58 and still reads favorable. +5%, about
 * 25 C, drops to 42 and reads moderate. Blue Ridge sits at 24 in any weather.
 */
export const OPPORTUNITY_ANCHORS: readonly (readonly [number, number])[] = [
  [-10, 100],
  [-3, 88],
  [0, 72],
  [2, 58],
  [5, 42],
  [10, 25],
  [20, 10],
  [35, 0],
];

export type OpportunityBand = "challenging" | "moderate" | "favorable";

/**
 * Where each band ends, IN IMPACT PERCENT, and the whole calibration argument.
 *
 * THESE ARE NOT CHOSEN HERE. They are the heat model's own empirical anchors,
 * read off src/lib/weather/heat.ts: that module documents 13 C as the "ideal
 * conditions" threshold and is fitted to marathon data at heat index
 * 16 / 21 / 27 / 32 C, costing roughly 1 / 3 / 6 / 10 percent. `favorable` ends
 * at its 1% anchor, the first point above ideal where the engine charges a
 * runner anything at all, and `moderate` ends at its 6% anchor.
 *
 * THE FIRST CUT PICKED THESE BY TASTE AND WAS TOO KIND, which is the useful
 * part to record. Floors of 55 and 30 on the score meant a flat course held
 * "Favorable" to 19.6 C and did not read "Challenging" until 28.2 C at 60%
 * humidity. 28 C is a day on which the model beneath this one is already
 * charging 8% and on which race organizers fly red flags; calling it Moderate
 * was simply wrong. It also made the word useless as information: 291 of the
 * 326 seeded courses read Favorable on a cool morning. Tying the edges to the
 * anchors instead means this module has no opinion of its own to drift from the
 * engine's, and if those anchors are ever re-fitted the bands follow for free.
 */
export const OPPORTUNITY_EDGE_PERCENT: Record<"favorable" | "moderate", number> = {
  favorable: 1,
  moderate: 6,
};

/**
 * Score floors for the three bands, highest first so `opportunityBand` can
 * return on the first match. Derived from the edges above rather than written
 * down twice.
 */
export const OPPORTUNITY_BANDS: readonly (readonly [OpportunityBand, number])[] = [
  ["favorable", opportunityScore(OPPORTUNITY_EDGE_PERCENT.favorable)],
  ["moderate", opportunityScore(OPPORTUNITY_EDGE_PERCENT.moderate)],
  ["challenging", 0],
];

/**
 * The midpoint of each band on the 0..100 axis.
 *
 * The bar's three axis labels are positioned from this, NOT spread edge to edge.
 * Spreading them put "Moderate" at the 50% mark while the moderate band actually
 * runs from 38.6 to 65, so a marker at 60 sat under the word "Moderate" while
 * the verdict beside it read "Favorable". Deriving the positions means the
 * labels cannot drift from the thresholds again.
 */
export const OPPORTUNITY_BAND_CENTERS: Record<OpportunityBand, number> = {
  challenging: OPPORTUNITY_BANDS[1][1] / 2,
  moderate: (OPPORTUNITY_BANDS[1][1] + OPPORTUNITY_BANDS[0][1]) / 2,
  favorable: (OPPORTUNITY_BANDS[0][1] + 100) / 2,
};

/** Display strings, mirroring TERRAIN_LABELS in terrain.ts. */
export const OPPORTUNITY_LABELS: Record<OpportunityBand, string> = {
  challenging: "Challenging",
  moderate: "Moderate",
  favorable: "Favorable",
};

/**
 * The three bands in bar order, challenging to favorable. A presentation order
 * for the axis labels, not a scale.
 */
export const OPPORTUNITY_ORDER: readonly OpportunityBand[] = [
  "challenging",
  "moderate",
  "favorable",
];

export interface Opportunity {
  /** 0..100, always finite. Higher is a faster day. */
  score: number;
  band: OpportunityBand;
  /** The impact percent it was read from, carried so the label can quote it. */
  percent: number;
}

/**
 * Where `totalPercent` sits on the 0..100 scale.
 *
 * Monotonically decreasing: a bigger cost is never a better score. A non-finite
 * input returns the neutral-course score rather than NaN, so a caller never has
 * to guard a marker's `left` percentage.
 */
export function opportunityScore(totalPercent: number): number {
  if (!Number.isFinite(totalPercent)) return anchorScore(0);
  const first = OPPORTUNITY_ANCHORS[0];
  const last = OPPORTUNITY_ANCHORS[OPPORTUNITY_ANCHORS.length - 1];
  if (totalPercent <= first[0]) return first[1];
  if (totalPercent >= last[0]) return last[1];
  for (let i = 1; i < OPPORTUNITY_ANCHORS.length; i++) {
    const [x0, y0] = OPPORTUNITY_ANCHORS[i - 1];
    const [x1, y1] = OPPORTUNITY_ANCHORS[i];
    if (totalPercent <= x1) {
      return y0 + ((y1 - y0) * (totalPercent - x0)) / (x1 - x0);
    }
  }
  return last[1];
}

function anchorScore(percent: number): number {
  const hit = OPPORTUNITY_ANCHORS.find(([x]) => x === percent);
  return hit ? hit[1] : 0;
}

/** Which of the three words a score reads as. */
export function opportunityBand(score: number): OpportunityBand {
  for (const [band, floor] of OPPORTUNITY_BANDS) {
    if (score >= floor) return band;
  }
  return "challenging";
}

/** The panel's total, as a position and a word. */
export function courseOpportunity(impact: ImpactBreakdown): Opportunity {
  const score = opportunityScore(impact.totalPercent);
  return { score, band: opportunityBand(score), percent: impact.totalPercent };
}
