import { useState, useCallback } from "react";
import type {
  Course,
  PacingInput,
  PaceChartRow,
  WeatherConditions,
} from "@/types";
import { DEFAULT_BODY } from "@/types";
import { computeElevationDurations, computePaceChart } from "@/lib/pacing";
import {
  calculateHeatAdjustment,
  dryHeatAdjustment,
} from "@/lib/weather/heat";
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
  /**
   * Each segment's elevation-and-strategy duration in seconds, AFTER
   * normalization and BEFORE weather. These are the exact numbers
   * `computePaceChart` multiplies the weather multipliers into, so they are
   * also the correct weights for collapsing those multipliers back to one
   * course-level figure (see `weightedGeometricMean` in
   * src/lib/pacing/impact.ts).
   *
   * Carried on the result rather than recomputed by whoever needs them: a
   * panel that re-derived its own durations would eventually disagree with the
   * splits table beside it, and a runner has no way to tell which to believe.
   */
  segmentDurations: number[];
  /**
   * Each segment's length in km, in course order: 43 entries in km mode (42
   * full kilometres then the 0.195 stub), 27 in miles mode.
   *
   * Carried for the same reason as `segmentDurations`. The per-factor splits
   * chart needs the even-pace baseline for each segment
   * (`goalTimeSeconds * lengthKm / 42.195`), and a component that rebuilt the
   * segments itself to get at the lengths would be one `buildSegments` change
   * away from drawing a different race from the table beside it.
   */
  segmentLengthsKm: number[];
  /**
   * Per-segment heat multipliers, temperature AND humidity together. All
   * exactly 1 when weather is off. This is the array `computePaceChart`
   * actually multiplies into the splits.
   */
  heatMultipliers: number[];
  /**
   * The same thing with humidity held at `DRY_REFERENCE_RH`: what the air
   * temperature alone would have cost.
   *
   * Carried so the impact panel can show Heat and Humidity as two lines whose
   * product is `heatMultipliers` exactly. PRESENTATION ONLY: nothing in the
   * pacing engine reads it, and adding it moved no split by a millisecond.
   */
  dryHeatMultipliers: number[];
  /** Per-segment wind multipliers. All exactly 1 when weather is off. */
  windMultipliers: number[];
  /**
   * The exact hourly series the multipliers above were sampled from: the live
   * window when one arrived, otherwise `synthesizeHourly`'s fall-morning
   * progression. Index i is i hours after the gun.
   *
   * EMPTY when weather is off, for the same reason `heatMultipliers` is
   * all-ones rather than absent: one shape, so no consumer has to handle two
   * kinds of nothing.
   *
   * Carried so that anything DISPLAYING the weather shows the array the splits
   * were actually built from. A panel that re-fetched or re-derived its own
   * series would eventually disagree with the table beside it, and a runner has
   * no way to tell which to believe.
   */
  hourlySeries: WeatherConditions[];
}

// A per-segment `segmentConditions` array was carried here briefly, on ROADMAP
// #14's instruction that #17 would need it. #17 had already shipped by then,
// reading the multipliers rather than the conditions, so nothing read it. It is
// still computed inside `calculate` below, where the multipliers need it; it is
// just not published, because an array on a public result type that no consumer
// reads is one refactor away from being wrong without anything failing.
//
// Note it would be the wrong input for a clock-hour timeline anyway: those
// samples are already an interpolation taken at segment midpoints, so
// resampling them onto clock hours interpolates an interpolation and drifts
// from both `hourlySeries` and the splits table.

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

        // Computed once for both branches. Weather-off still needs the
        // durations (they are the weights the impact panel reads), and the
        // weather branch needs the segments as well.
        const { segments, durations } = computeElevationDurations(
          input,
          course,
        );
        let heatMultipliers = durations.map(() => 1);
        let dryHeatMultipliers = durations.map(() => 1);
        let windMultipliers = durations.map(() => 1);
        let series: WeatherConditions[] = [];

        if (input.weather) {
          // Hourly series: live forecast when available, else synthesized
          // from the (manually entered) start-line conditions.
          series =
            hourly && hourly.length > 0
              ? hourly
              : synthesizeHourly(input.weather, SYNTHETIC_WINDOW_HOURS);

          // Derive each segment's elevation-adjusted ground speed and the
          // conditions at the time the runner passes its midpoint.
          const body = input.body ?? DEFAULT_BODY;
          let elapsed = 0;
          const segmentConditions = durations.map((d) => {
            const mid = elapsed + d / 2;
            elapsed += d;
            return conditionsAtElapsed(series, mid);
          });
          const speedsMS = segments.map(
            (seg, i) => (seg.lengthKm * 1000) / durations[i],
          );
          heatMultipliers = segmentConditions.map((c) =>
            calculateHeatAdjustment(c.tempC, c.humidity),
          );
          dryHeatMultipliers = segmentConditions.map((c) =>
            dryHeatAdjustment(c.tempC),
          );
          windMultipliers = buildWindMultipliers(
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

        setResult({
          rows,
          input,
          adjustedFinishSeconds,
          weatherApplied,
          segmentDurations: durations,
          segmentLengthsKm: segments.map((seg) => seg.lengthKm),
          heatMultipliers,
          dryHeatMultipliers,
          windMultipliers,
          hourlySeries: series,
        });
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
