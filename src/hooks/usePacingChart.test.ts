import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePacingChart } from "./usePacingChart";
import type { PacingInput } from "@/types";
import { fixtureCourse } from "@/data/courses.fixture";

// Geometry is passed in explicitly now (the client no longer holds a registry),
// so tests supply the same course the seed puts in the database.
const BERLIN = fixtureCourse("berlin");
const BOSTON = fixtureCourse("boston");

describe("usePacingChart", () => {
  it("populates result on valid input", () => {
    const { result } = renderHook(() => usePacingChart());
    const input: PacingInput = {
      goalTimeSeconds: 14400,
      courseId: "berlin",
      unit: "km",
    };
    act(() => result.current.calculate(input, BERLIN));
    expect(result.current.error).toBeNull();
    expect(result.current.result).not.toBeNull();
    expect(result.current.result?.rows).toHaveLength(43);
    expect(result.current.result?.input).toEqual(input);
  });

  it("no weather ⇒ finish equals goal and fueling cues are attached", () => {
    const { result } = renderHook(() => usePacingChart());
    const input: PacingInput = {
      goalTimeSeconds: 14400,
      courseId: "berlin",
      unit: "km",
      fueling: { carbsPerHour: 60 },
    };
    act(() => result.current.calculate(input, BERLIN));
    expect(result.current.result?.weatherApplied).toBe(false);
    expect(result.current.result?.adjustedFinishSeconds).toBeCloseTo(14400, 3);
    // 60 g/hr ⇒ a gel every 1500 s ⇒ 14400 / 1500 = 9 across the field.
    const fueled = result.current.result?.rows.filter((r) => r.fueling) ?? [];
    expect(fueled.length).toBe(9);
  });

  it("a higher intake target packs in more gels", () => {
    const { result } = renderHook(() => usePacingChart());
    const base: PacingInput = {
      goalTimeSeconds: 14400,
      courseId: "berlin",
      unit: "km",
    };
    // 100 g/hr ⇒ a gel every 900 s ⇒ 16 across a 4-hour race.
    act(() =>
      result.current.calculate(
        { ...base, fueling: { carbsPerHour: 100 } },
        BERLIN,
      ),
    );
    expect(result.current.result?.rows.filter((r) => r.fueling)).toHaveLength(
      16,
    );
    // 30 g/hr ⇒ a gel every 3000 s ⇒ 4.
    act(() =>
      result.current.calculate(
        { ...base, fueling: { carbsPerHour: 30 } },
        BERLIN,
      ),
    );
    expect(result.current.result?.rows.filter((r) => r.fueling)).toHaveLength(
      4,
    );
  });

  it("omitting fueling turns the cues off entirely", () => {
    const { result } = renderHook(() => usePacingChart());
    act(() =>
      result.current.calculate(
        {
          goalTimeSeconds: 14400,
          courseId: "berlin",
          unit: "km",
        },
        BERLIN,
      ),
    );
    expect(result.current.result?.rows.some((r) => r.fueling)).toBe(false);
  });

  it("hot weather extends the finish beyond the goal", () => {
    const { result } = renderHook(() => usePacingChart());
    const base: PacingInput = {
      goalTimeSeconds: 14400,
      courseId: "berlin",
      unit: "km",
    };
    act(() => result.current.calculate(base, BERLIN));
    const baseFinish = result.current.result!.adjustedFinishSeconds;

    act(() =>
      result.current.calculate(
        {
          ...base,
          weather: { tempC: 30, humidity: 80, windSpeed: 0, windDirection: 0 },
        },
        BERLIN,
      ),
    );
    expect(result.current.result?.weatherApplied).toBe(true);
    expect(result.current.result!.adjustedFinishSeconds).toBeGreaterThan(
      baseFinish,
    );
  });

  it("charts whatever geometry it is handed, not whatever the id says", () => {
    // The hook no longer resolves ids — an unknown slug can never reach it,
    // because /results turns a bad slug into an error page before rendering.
    // What it must do instead is honour the course it is GIVEN, so a stale
    // id on the input can't quietly select different elevations.
    const { result } = renderHook(() => usePacingChart());
    const input: PacingInput = {
      goalTimeSeconds: 14400,
      courseId: "berlin",
      unit: "km",
    };
    act(() => result.current.calculate(input, BOSTON));
    expect(result.current.error).toBeNull();

    const viaBerlin = renderHook(() => usePacingChart());
    act(() => viaBerlin.result.current.calculate(input, BERLIN));

    // Boston and Berlin have genuinely different profiles, so the splits must
    // differ — proving the geometry argument is what drives the math.
    expect(
      result.current.result!.rows.map((r) => r.adjustedPaceLabel),
    ).not.toEqual(
      viaBerlin.result.current.result!.rows.map((r) => r.adjustedPaceLabel),
    );
  });
  // The per-segment carry ROADMAP #16's impact panel reads, and #17's chart
  // will. These are the numbers the engine actually applied, so nothing
  // downstream has to recompute them and drift from the splits.
  it("carries per-segment durations and multipliers on the result", () => {
    const { result } = renderHook(() => usePacingChart());
    const input: PacingInput = {
      goalTimeSeconds: 14400,
      courseId: "berlin",
      unit: "km",
    };
    act(() => result.current.calculate(input, BERLIN));
    const r = result.current.result!;
    expect(r.segmentDurations).toHaveLength(r.rows.length);
    expect(r.segmentLengthsKm).toHaveLength(r.rows.length);
    expect(r.heatMultipliers).toHaveLength(r.rows.length);
    expect(r.dryHeatMultipliers).toHaveLength(r.rows.length);
    expect(r.windMultipliers).toHaveLength(r.rows.length);
    // Durations are pre-weather, so with weather off they sum to the goal.
    const summed = r.segmentDurations.reduce((a, b) => a + b, 0);
    expect(summed).toBeCloseTo(14400, 6);
    expect(r.segmentDurations.every((d) => Number.isFinite(d) && d > 0)).toBe(
      true,
    );
    // The lengths are the marathon, in the runner's own segmentation: they are
    // what the per-factor splits chart measures its even-pace baseline against,
    // so a series that did not cover the whole race would shift every bar.
    expect(r.segmentLengthsKm.reduce((a, b) => a + b, 0)).toBeCloseTo(
      42.195,
      9,
    );
    expect(r.segmentLengthsKm[r.segmentLengthsKm.length - 1]).toBeCloseTo(
      0.195,
      9,
    );
  });

  it("weather off leaves every heat and wind multiplier at exactly 1", () => {
    const { result } = renderHook(() => usePacingChart());
    act(() =>
      result.current.calculate(
        { goalTimeSeconds: 14400, courseId: "berlin", unit: "km" },
        BERLIN,
      ),
    );
    const r = result.current.result!;
    expect(r.heatMultipliers.every((m) => m === 1)).toBe(true);
    expect(r.dryHeatMultipliers.every((m) => m === 1)).toBe(true);
    expect(r.windMultipliers.every((m) => m === 1)).toBe(true);
  });

  it("weather on moves the multipliers off 1 and still matches the finish", () => {
    const { result } = renderHook(() => usePacingChart());
    act(() =>
      result.current.calculate(
        {
          goalTimeSeconds: 14400,
          courseId: "berlin",
          unit: "km",
          weather: {
            tempC: 28,
            humidity: 70,
            windSpeed: 6,
            windDirection: 180,
          },
        },
        BERLIN,
      ),
    );
    const r = result.current.result!;
    expect(r.weatherApplied).toBe(true);
    expect(r.heatMultipliers.some((m) => m > 1)).toBe(true);
    expect(r.windMultipliers.some((m) => m !== 1)).toBe(true);
    // The carried arrays must reproduce the finish the rows actually print:
    // duration x heat x wind, summed, IS the adjusted finish.
    const rebuilt = r.segmentDurations.reduce(
      (sum, d, i) => sum + d * r.heatMultipliers[i] * r.windMultipliers[i],
      0,
    );
    expect(rebuilt).toBeCloseTo(r.adjustedFinishSeconds, 6);
  });

  // The Heat / Humidity split on the impact panel is a reading of
  // `heatMultipliers`, not a second model, so the dry half must never exceed
  // the combined one and the splits must not notice it exists.
  it("carries a dry-air heat series that sits under the combined one", () => {
    const { result } = renderHook(() => usePacingChart());
    act(() =>
      result.current.calculate(
        {
          goalTimeSeconds: 14400,
          courseId: "berlin",
          unit: "km",
          weather: {
            tempC: 30,
            humidity: 85,
            windSpeed: 0,
            windDirection: 0,
          },
        },
        BERLIN,
      ),
    );
    const r = result.current.result!;
    expect(r.dryHeatMultipliers.some((m) => m > 1)).toBe(true);
    for (let i = 0; i < r.heatMultipliers.length; i++) {
      expect(r.dryHeatMultipliers[i]).toBeLessThanOrEqual(r.heatMultipliers[i]);
      expect(r.dryHeatMultipliers[i]).toBeGreaterThanOrEqual(1);
    }
    // Humid air must actually cost something here, or the split is vacuous.
    expect(r.heatMultipliers.some((m, i) => m > r.dryHeatMultipliers[i])).toBe(
      true,
    );
  });

  it("adding the dry series moved no split", () => {
    // The pace chart reads `heatMultipliers`, never the dry one. Pinning the
    // finish against the same input proves the carry is presentation only.
    const weather = {
      tempC: 30,
      humidity: 85,
      windSpeed: 0,
      windDirection: 0,
    };
    const { result } = renderHook(() => usePacingChart());
    act(() =>
      result.current.calculate(
        { goalTimeSeconds: 14400, courseId: "berlin", unit: "km", weather },
        BERLIN,
      ),
    );
    const r = result.current.result!;
    const rebuilt = r.segmentDurations.reduce(
      (sum, d, i) => sum + d * r.heatMultipliers[i] * r.windMultipliers[i],
      0,
    );
    expect(rebuilt).toBeCloseTo(r.adjustedFinishSeconds, 6);
  });
});
