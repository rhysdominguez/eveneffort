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
});
