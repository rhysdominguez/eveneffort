// Orchestrator: turns a PacingInput + Course into a fully-built, goal-normalized pace chart.
import type {
  Course,
  PacingInput,
  PaceChartRow,
  Segment,
  WeatherAdjustments,
} from "@/types";
import { adjustmentFactor } from "./adjustment";
import { buildSegments, MARATHON_KM, MILE_IN_KM } from "./segments";
import { normalizePaces } from "./normalize";
import { formatPace } from "@/lib/units/pace";
import { formatHMS } from "@/lib/units/time";

/**
 * Phase-1 elevation layer: build segments and the goal-normalized per-segment
 * durations (seconds). Exposed so callers (the weather layer) can derive each
 * segment's elevation-adjusted ground speed before computing wind multipliers.
 * Pure Minetti math — unchanged.
 */
export function computeElevationDurations(
  input: PacingInput,
  course: Course,
): { segments: Segment[]; durations: number[] } {
  const segments = buildSegments(course.elevations, input.unit);
  const flatPacePerKm = input.goalTimeSeconds / MARATHON_KM;
  const rawDurations = segments.map(
    (seg) => seg.lengthKm * flatPacePerKm * adjustmentFactor(seg.gradient),
  );
  const durations = normalizePaces(rawDurations, input.goalTimeSeconds);
  return { segments, durations };
}

export function computePaceChart(
  input: PacingInput,
  course: Course,
  weather?: WeatherAdjustments,
): PaceChartRow[] {
  const { segments, durations } = computeElevationDurations(input, course);

  const finalIndex = segments.length - 1;
  const partialTailLabelPrefix = input.unit === "km" ? 42 : 26;

  let cumulative = 0;
  return segments.map((seg, i) => {
    // Phase 2: weather multipliers are applied AFTER goal-normalization and are
    // deliberately NOT re-normalized, so heat/wind extend the finish beyond the
    // ideal goal. With no weather, this is byte-identical to the Phase 1 path.
    const duration = weather
      ? durations[i] * weather.heatMultiplier * weather.windMultipliers[i]
      : durations[i];
    cumulative += duration;

    // Pace expressed per full displayed unit (per km, or per mile), even for the partial tail.
    const adjustedPaceSecPerUnit =
      input.unit === "km"
        ? duration / seg.lengthKm
        : duration / (seg.lengthKm / MILE_IN_KM);

    const segmentLabel =
      i === finalIndex ? `${partialTailLabelPrefix}.2` : String(i + 1);

    return {
      segmentLabel,
      elevationDeltaM: seg.elevationDeltaM,
      adjustedPaceSecPerUnit,
      adjustedPaceLabel: formatPace(adjustedPaceSecPerUnit, input.unit),
      cumulativeSplitSeconds: cumulative,
      cumulativeSplitLabel: formatHMS(cumulative),
    };
  });
}
