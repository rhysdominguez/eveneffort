import { useState, useCallback } from "react";
import type { PacingInput, PaceChartRow } from "@/types";
import { DEFAULT_BODY } from "@/types";
import { computeElevationDurations, computePaceChart } from "@/lib/pacing";
import { getCourse } from "@/data/courses";
import { calculateHeatAdjustment } from "@/lib/weather/heat";
import { buildWindMultipliers } from "@/lib/weather/wind";
import { applyFuelingToRows, buildFuelingPlan } from "@/lib/weather/fueling";

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

  const calculate = useCallback((input: PacingInput) => {
    try {
      const course = getCourse(input.courseId);

      let rows: PaceChartRow[];
      const weatherApplied = input.weather !== undefined;

      if (input.weather) {
        // Derive each segment's elevation-adjusted ground speed, then build the
        // heat (global) + wind (per-segment) multipliers and apply them.
        const body = input.body ?? DEFAULT_BODY;
        const { segments, durations } = computeElevationDurations(
          input,
          course,
        );
        const speedsMS = segments.map(
          (seg, i) => (seg.lengthKm * 1000) / durations[i],
        );
        const heatMultiplier = calculateHeatAdjustment(
          input.weather.tempC,
          input.weather.humidity,
        );
        const windMultipliers = buildWindMultipliers(
          segments,
          course.coords,
          body,
          speedsMS,
          input.weather,
        );
        rows = computePaceChart(input, course, {
          heatMultiplier,
          windMultipliers,
        });
      } else {
        rows = computePaceChart(input, course);
      }

      const adjustedFinishSeconds =
        rows.length > 0 ? rows[rows.length - 1].cumulativeSplitSeconds : 0;

      // Fueling timeline is keyed off the (weather-adjusted) finish time.
      const cues = buildFuelingPlan(adjustedFinishSeconds, rows);
      rows = applyFuelingToRows(rows, cues);

      setResult({ rows, input, adjustedFinishSeconds, weatherApplied });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setResult(null);
    }
  }, []);

  return { result, error, calculate };
}
