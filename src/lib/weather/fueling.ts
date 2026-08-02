// Dynamic fueling timeline (Phase 2).
//
// The runner picks a carb-intake target (g/hour); gel size is fixed at 25 g,
// so the target sets the cadence — 60 g/hr ⇒ 2.4 gels/hour ⇒ one every 25
// minutes. We place gels at those marks across the (weather-adjusted) finish
// time and map each to the kilometre row the runner reaches at that time.
import type { FuelingCue, PaceChartRow } from "@/types";
import { DEFAULT_FUELING } from "@/types";

export const GEL_CARBS_GRAMS = 25;

/** Cadence at the default 60 g/hr target. */
export const GEL_INTERVAL_SECONDS = 25 * 60; // 1500 s

// Slider bounds for the intake target. The low end is a conservative
// fuelling plan; the high end is what a gut-trained runner on a modern
// high-carb protocol takes.
export const CARBS_PER_HOUR_MIN = 30;
export const CARBS_PER_HOUR_MAX = 100;
export const CARBS_PER_HOUR_STEP = 5;

/**
 * Seconds between gels for a given intake target. Gel size is fixed, so the
 * cadence is just how long one gel's worth of carbs lasts at that rate.
 * Rarely a whole number (35 g/hr ⇒ 2571.43 s) — callers must not assume one.
 */
export function gelIntervalSeconds(carbsPerHour: number): number {
  return (3600 * GEL_CARBS_GRAMS) / carbsPerHour;
}

/**
 * Build the gel-intake schedule for a race of `totalSeconds`, mapping each
 * intake mark onto the first pace-chart row whose cumulative split reaches
 * that time. Returns one cue per gel, in order.
 */
export function buildFuelingPlan(
  totalSeconds: number,
  rows: Pick<PaceChartRow, "cumulativeSplitSeconds">[],
  carbsPerHour: number = DEFAULT_FUELING.carbsPerHour,
): FuelingCue[] {
  const cues: FuelingCue[] = [];
  if (rows.length === 0 || carbsPerHour <= 0) return cues;

  const interval = gelIntervalSeconds(carbsPerHour);
  // Count first, then multiply. Repeatedly adding a fractional interval
  // would let float error accumulate across the race.
  const count = Math.floor(totalSeconds / interval);

  let cursor = 0;
  for (let i = 1; i <= count; i++) {
    const t = i * interval;
    while (cursor < rows.length - 1 && rows[cursor].cumulativeSplitSeconds < t) {
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
