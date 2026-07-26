// Dynamic fueling timeline (Phase 2).
//
// Target ~60 g carbs/hour using 25 g gels ⇒ ~2.4 gels/hour ⇒ one gel every
// 25 minutes. We place gels at 25-minute marks across the (weather-adjusted)
// finish time and map each to the kilometre row the runner reaches at that time.
import type { FuelingCue, PaceChartRow } from "@/types";

export const GEL_INTERVAL_SECONDS = 25 * 60; // 1500 s
export const GEL_CARBS_GRAMS = 25;

/**
 * Build the gel-intake schedule for a race of `totalSeconds`, mapping each
 * 25-minute mark onto the first pace-chart row whose cumulative split reaches
 * that time. Returns one cue per gel, in order.
 */
export function buildFuelingPlan(
  totalSeconds: number,
  rows: Pick<PaceChartRow, "cumulativeSplitSeconds">[],
): FuelingCue[] {
  const cues: FuelingCue[] = [];
  if (rows.length === 0) return cues;

  let cursor = 0;
  for (
    let t = GEL_INTERVAL_SECONDS;
    t <= totalSeconds;
    t += GEL_INTERVAL_SECONDS
  ) {
    while (
      cursor < rows.length - 1 &&
      rows[cursor].cumulativeSplitSeconds < t
    ) {
      cursor++;
    }
    cues.push({
      segmentIndex: cursor,
      atSeconds: t,
      label: `Take Gel (${GEL_CARBS_GRAMS}g)`,
    });
  }
  return cues;
}

/**
 * Attach fueling cues to their rows (returns new row objects; input untouched).
 * When several gels land on one row the last one wins — fine at marathon
 * granularity where rows are minutes apart.
 */
export function applyFuelingToRows(
  rows: PaceChartRow[],
  cues: FuelingCue[],
): PaceChartRow[] {
  const byIndex = new Map<number, FuelingCue>();
  for (const cue of cues) byIndex.set(cue.segmentIndex, cue);
  return rows.map((row, i) => ({ ...row, fueling: byIndex.get(i) ?? null }));
}
