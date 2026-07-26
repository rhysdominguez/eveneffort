import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePacingChart } from "./usePacingChart";
import type { PacingInput } from "@/types";

describe("usePacingChart", () => {
  it("populates result on valid input", () => {
    const { result } = renderHook(() => usePacingChart());
    const input: PacingInput = {
      goalTimeSeconds: 14400,
      courseId: "berlin",
      unit: "km",
    };
    act(() => result.current.calculate(input));
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
    };
    act(() => result.current.calculate(input));
    expect(result.current.result?.weatherApplied).toBe(false);
    expect(result.current.result?.adjustedFinishSeconds).toBeCloseTo(14400, 3);
    // 14400 / 1500 = 9 gels expected across the field.
    const fueled = result.current.result?.rows.filter((r) => r.fueling) ?? [];
    expect(fueled.length).toBe(9);
  });

  it("hot weather extends the finish beyond the goal", () => {
    const { result } = renderHook(() => usePacingChart());
    const base: PacingInput = {
      goalTimeSeconds: 14400,
      courseId: "berlin",
      unit: "km",
    };
    act(() => result.current.calculate(base));
    const baseFinish = result.current.result!.adjustedFinishSeconds;

    act(() =>
      result.current.calculate({
        ...base,
        weather: { tempC: 30, humidity: 80, windSpeed: 0, windDirection: 0 },
      }),
    );
    expect(result.current.result?.weatherApplied).toBe(true);
    expect(result.current.result!.adjustedFinishSeconds).toBeGreaterThan(
      baseFinish,
    );
  });

  it("populates error and nulls result on invalid courseId", () => {
    const { result } = renderHook(() => usePacingChart());
    act(() =>
      result.current.calculate({
        goalTimeSeconds: 14400,
        // deliberately invalid
        courseId: "atlantis" as PacingInput["courseId"],
        unit: "km",
      }),
    );
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBe("Unknown courseId: atlantis");
  });
});
