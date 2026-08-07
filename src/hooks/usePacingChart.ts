import { useState, useCallback } from "react";
import type {
  Course,
  PacingInput,
  PaceChartRow,
  WeatherConditions,
} from "@/types";
import { DEFAULT_BODY } from "@/types";
import { computeElevationDurations, computePaceChart } from "@/lib/pacing";
import { calculateHeatAdjustment } from "@/lib/weather/heat";
import { buildWindMultipliers } from "@/lib/weather/wind";
import { applyFuelingToRows, buildFuelingPlan } from "@/lib/weather/fueling";
import {
  conditionsAtElapsed,
  synthesizeHourly,
} from "@/lib/weather/progression";

// Synthetic-progression window when only start-line conditions are known:
// covers even a very slow marathon (start + 7 hours).
const SYNTHETIC_WINDOW_HOURS = 7;

export interface PacingResult {
  rows: PaceChartRow[];
  input: PacingInput;
  /** Weather-adjusted finish (== goal when no weather is applied). */
  adjustedFinishSeconds: number;
  /** True when heat/wind multipliers were applied to the splits. */
  weatherApplied: boolean;
}

export function usePacingChart() {
  const [result, setResult] = useState<PacingResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Build the pace chart. `course` carries the geometry, resolved server-side
   * and passed in — the client no longer holds a registry of every course.
   * `hourly`, when provided (live forecast), is the conditions series at
   * 1-hour steps from the race start; otherwise a synthetic fall-morning
   * progression is derived from `input.weather`.
   */
  const calculate = useCallback(
    (
      input: PacingInput,
      course: Course,
      hourly?: WeatherConditions[] | null,
    ) => {
      try {
        let rows: PaceChartRow[];
        const weatherApplied = input.weather !== undefined;

        if (input.weather) {
          // Hourly series: live forecast when available, else synthesized
          // from the (manually entered) start-line conditions.
          const series =
            hourly && hourly.length > 0
              ? hourly
              : synthesizeHourly(input.weather, SYNTHETIC_WINDOW_HOURS);

          // Derive each segment's elevation-adjusted ground speed and the
          // conditions at the time the runner passes its midpoint.
          const body = input.body ?? DEFAULT_BODY;
          const { segments, durations } = computeElevationDurations(
            input,
            course,
          );
          let elapsed = 0;
          const segmentConditions = durations.map((d) => {
            const mid = elapsed + d / 2;
            elapsed += d;
            return conditionsAtElapsed(series, mid);
          });
          const speedsMS = segments.map(
            (seg, i) => (seg.lengthKm * 1000) / durations[i],
          );
          const heatMultipliers = segmentConditions.map((c) =>
            calculateHeatAdjustment(c.tempC, c.humidity),
          );
          const windMultipliers = buildWindMultipliers(
            segments,
            course.coords,
            body,
            speedsMS,
            segmentConditions,
          );
          rows = computePaceChart(input, course, {
            heatMultipliers,
            windMultipliers,
          });
        } else {
          rows = computePaceChart(input, course);
        }

        const adjustedFinishSeconds =
          rows.length > 0 ? rows[rows.length - 1].cumulativeSplitSeconds : 0;

        // Fueling timeline is keyed off the (weather-adjusted) finish time and
        // the runner's intake target. No `fueling` on the input means they
        // turned the cues off, so the chart gets none.
        const cues = input.fueling
          ? buildFuelingPlan(
              adjustedFinishSeconds,
              rows,
              input.fueling.carbsPerHour,
            )
          : [];
        rows = applyFuelingToRows(rows, cues);

        setResult({ rows, input, adjustedFinishSeconds, weatherApplied });
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error");
        setResult(null);
      }
    },
    [],
  );

  return { result, error, calculate };
}
