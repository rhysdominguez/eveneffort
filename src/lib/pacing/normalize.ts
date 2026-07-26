// Scales effort-adjusted segment durations so their sum exactly matches the goal finish time.

/**
 * Single-pass scalar normalization: every duration is multiplied by
 * goalTimeSeconds / sum(rawDurations), so the total lands exactly on the goal.
 */
export function normalizePaces(
  rawSegmentDurationsSeconds: number[],
  goalTimeSeconds: number,
): number[] {
  const total = rawSegmentDurationsSeconds.reduce((a, b) => a + b, 0);
  const scaleFactor = goalTimeSeconds / total;
  return rawSegmentDurationsSeconds.map((d) => d * scaleFactor);
}
