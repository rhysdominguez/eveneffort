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
