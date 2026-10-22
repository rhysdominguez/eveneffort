import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { splitImpact, type SplitImpactInput } from "./splitImpact";
import { IMPACT_FACTORS } from "./impact";
import { usePacingChart, type PacingResult } from "@/hooks/usePacingChart";
import { fixtureCourse } from "@/data/courses.fixture";
import type { PacingInput, Unit, WeatherConditions } from "@/types";

// What the per-factor splits chart (ROADMAP #17) rests on: the four factor
// series add up to the total series, and the total series adds up to the
// finish the splits table actually prints. Everything else on that chart is
// presentation; if these sums drift the chart is quietly telling a runner a
// different story from the table under it.
//
// Driven through `usePacingChart` rather than hand-fed multipliers wherever the
// claim is about real races, because the arrays this module reads are the
// engine's own and the point is that they reconcile. The hand-built cases below
// are only for the states a real forecast cannot produce exactly (bone-dry air,
// a course with nothing happening on it at all).

const BERLIN = fixtureCourse("berlin");
const BOSTON = fixtureCourse("boston");
const GOAL = 14400;

const HOT_AND_WINDY: WeatherConditions = {
  tempC: 28,
  humidity: 70,
  windSpeed: 6,
  windDirection: 180,
};

/** Run the real engine and hand the result straight to `splitImpact`. */
function planFor(
  course: typeof BERLIN,
  unit: Unit = "km",
  weather?: WeatherConditions,
): { result: PacingResult; series: ReturnType<typeof splitImpact> } {
  const { result } = renderHook(() => usePacingChart());
  const input: PacingInput = {
    goalTimeSeconds: GOAL,
    courseId: course.id,
    unit,
    ...(weather ? { weather } : {}),
  };
  act(() => result.current.calculate(input, course));
  const r = result.current.result!;
  return {
    result: r,
    series: splitImpact({
      goalTimeSeconds: r.input.goalTimeSeconds,
      segmentLengthsKm: r.segmentLengthsKm,
      segmentDurations: r.segmentDurations,
      heatMultipliers: r.heatMultipliers,
      dryHeatMultipliers: r.dryHeatMultipliers,
      windMultipliers: r.windMultipliers,
    }),
  };
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** A neutral input of `n` segments: even pace, nothing happening. */
function neutralInput(n: number): SplitImpactInput {
  const lengthKm = 42.195 / n;
  const ones = new Array<number>(n).fill(1);
  return {
    goalTimeSeconds: GOAL,
    segmentLengthsKm: new Array<number>(n).fill(lengthKm),
    segmentDurations: new Array<number>(n).fill(GOAL / n),
    heatMultipliers: ones,
    dryHeatMultipliers: ones,
    windMultipliers: ones,
  };
}

describe("splitImpact", () => {
  it("folds the tail stub, so km draws 42 bars and miles 26", () => {
    const km = planFor(BOSTON, "km");
    expect(km.result.rows).toHaveLength(43);
    expect(km.series.total).toHaveLength(42);
    for (const factor of IMPACT_FACTORS) {
      expect(km.series.byFactor[factor]).toHaveLength(42);
    }

    const miles = planFor(BOSTON, "miles");
    expect(miles.result.rows).toHaveLength(27);
    expect(miles.series.total).toHaveLength(26);
  });

  it("the four factors sum to the total in every column", () => {
    const { series } = planFor(BOSTON, "km", HOT_AND_WINDY);
    series.total.forEach((total, i) => {
      const parts = IMPACT_FACTORS.reduce(
        (s, factor) => s + series.byFactor[factor][i],
        0,
      );
      expect(parts).toBeCloseTo(total, 9);
    });
  });

  // The claim the y axis makes: a bar is seconds against even pace, so the
  // bars added up are the seconds the runner finishes off their goal by.
  it("the total bars sum to the finish delta, weather on and off", () => {
    const off = planFor(BOSTON, "km");
    expect(sum(off.series.total)).toBeCloseTo(
      off.result.adjustedFinishSeconds - GOAL,
      6,
    );
    expect(sum(off.series.total)).toBeCloseTo(0, 6);

    const on = planFor(BOSTON, "km", HOT_AND_WINDY);
    expect(on.result.adjustedFinishSeconds).toBeGreaterThan(GOAL);
    expect(sum(on.series.total)).toBeCloseTo(
      on.result.adjustedFinishSeconds - GOAL,
      6,
    );
  });

  it("holds the same sums in miles mode", () => {
    const { result, series } = planFor(BOSTON, "miles", HOT_AND_WINDY);
    expect(sum(series.total)).toBeCloseTo(
      result.adjustedFinishSeconds - GOAL,
      6,
    );
  });

  // Looks like a bug and is not: `normalizePaces` pays for the climbs with the
  // descents, so the Elevation tab balances by construction. The Heat tab will
  // not, and should not.
  it("elevation nets to zero across the race at the default strategy", () => {
    expect(sum(planFor(BOSTON, "km").series.byFactor.elevation)).toBeCloseTo(
      0,
      6,
    );
    // Approximately, not exactly, once weather is on: the log-space split
    // hands each factor a slice of a delta the factors jointly caused, so a
    // hot kilometre's elevation slice is scaled slightly differently from a
    // cool one's. Under a second across a four-hour race, and under half the
    // rounding the chart draws at.
    expect(
      Math.abs(sum(planFor(BOSTON, "km", HOT_AND_WINDY).series.byFactor.elevation)),
    ).toBeLessThan(2);
    // Not a flat series that happens to sum to zero: Boston has real hills.
    expect(
      Math.max(...planFor(BOSTON, "km").series.byFactor.elevation.map(Math.abs)),
    ).toBeGreaterThan(5);
  });

  it("weather off leaves elevation alone active, carrying the whole total", () => {
    const { series } = planFor(BERLIN, "km");
    expect(series.active).toEqual(["elevation"]);
    series.total.forEach((total, i) => {
      expect(series.byFactor.elevation[i]).toBeCloseTo(total, 12);
      expect(series.byFactor.heat[i]).toBe(0);
      expect(series.byFactor.humidity[i]).toBe(0);
      expect(series.byFactor.wind[i]).toBe(0);
    });
  });

  it("weather on brings all four factors up", () => {
    const { series } = planFor(BOSTON, "km", HOT_AND_WINDY);
    expect(series.active).toEqual(["elevation", "heat", "humidity", "wind"]);
  });

  // Below the heat threshold there is no temperature term at all, so the Heat
  // and Humidity tabs must be absent rather than drawn as flat zero.
  it("a cold windy day activates wind without heat or humidity", () => {
    const { series } = planFor(BOSTON, "km", {
      tempC: 4,
      humidity: 60,
      windSpeed: 8,
      windDirection: 90,
    });
    expect(series.active).toEqual(["elevation", "wind"]);
  });

  // Bone-dry air is not reachable through the forecast synthesizer (it holds a
  // dew point, and the dew point guard floors RH at 1%), so the rule is pinned
  // where it lives: humidity is the ratio of two heat multipliers, and when
  // they are the same array it does nothing.
  it("dry air leaves humidity inactive while heat stays active", () => {
    const n = 8;
    const heat = new Array<number>(n).fill(1.04);
    const series = splitImpact({
      ...neutralInput(n),
      heatMultipliers: heat,
      dryHeatMultipliers: heat.slice(),
    });
    expect(series.active).toEqual(["heat"]);
    expect(series.byFactor.humidity.every((v) => v === 0)).toBe(true);
    expect(series.byFactor.heat.every((v) => v > 0)).toBe(true);
  });

  it("returns zeros rather than NaN when nothing is happening", () => {
    const series = splitImpact(neutralInput(8));
    expect(series.active).toEqual([]);
    expect(series.total).toHaveLength(7);
    expect(series.total.every((v) => v === 0)).toBe(true);
    for (const factor of IMPACT_FACTORS) {
      expect(series.byFactor[factor].every((v) => v === 0)).toBe(true);
    }
  });

  it("throws when the per-segment arrays disagree in length", () => {
    const input = neutralInput(8);
    expect(() =>
      splitImpact({ ...input, windMultipliers: [1, 1, 1] }),
    ).toThrow(/differ in length/);
  });
});
