// Orchestrator: turns a PacingInput + Course into a fully-built, goal-normalized pace chart.
import type {
  Course,
  PacingInput,
  PaceChartRow,
  Segment,
  WeatherAdjustments,
} from "@/types";
import { DEFAULT_SPLIT, DEFAULT_START } from "@/types";
import { adjustmentFactor } from "./adjustment";
import { buildSegments, MARATHON_KM, MILE_IN_KM } from "./segments";
import { normalizePaces } from "./normalize";
import { splitBias, startBias } from "./strategy";
import { formatPace } from "@/lib/units/pace";
import { formatHMS } from "@/lib/units/time";

/**
 * Phase-1 elevation layer: build segments and the goal-normalized per-segment
 * durations (seconds). Exposed so callers (the weather layer) can derive each
 * segment's elevation-adjusted ground speed before computing wind multipliers.
 * Pure Minetti math — unchanged.
 *
 * The strategy biases (Phase 3) re-weight those durations BEFORE normalization,
 * which is what keeps the finish exactly on the goal however the race is
 * shaped. `adjustmentFactor` itself is untouched; `even-pace` simply declines
 * to consult it. With the defaults, byte-identical to Phase 1.
 */
export function computeElevationDurations(
  input: PacingInput,
  course: Course,
): { segments: Segment[]; durations: number[] } {
  const segments = buildSegments(course.elevations, input.unit);
  const flatPacePerKm = input.goalTimeSeconds / MARATHON_KM;
  const split = input.split ?? DEFAULT_SPLIT;
  const start = input.start ?? DEFAULT_START;
  const rawDurations = segments.map((seg) => {
    // Midpoint, so both curves are read at the same place in the race
    // regardless of whether segments are kilometres or miles.
    const midpointKm = (seg.startDistanceKm + seg.endDistanceKm) / 2;
    const grade =
      split === "even-pace" ? 1 : adjustmentFactor(seg.gradient);
    return (
      seg.lengthKm *
      flatPacePerKm *
      grade *
      splitBias(split, midpointKm) *
      startBias(start, midpointKm)
    );
  });
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
    // ideal goal. Both arrays are per-segment (conditions at the time the
    // runner passes through). With no weather, byte-identical to Phase 1.
    const duration = weather
      ? durations[i] * weather.heatMultipliers[i] * weather.windMultipliers[i]
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
