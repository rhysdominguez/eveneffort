import { describe, it, expect } from "vitest";
import {
  SPLIT_BIAS,
  SPLIT_OPTIONS,
  START_OPTIONS,
  START_SURCHARGE,
  splitBias,
  startBias,
} from "./strategy";
import { MARATHON_KM } from "./segments";
import type { SplitStrategy, StartStrategy } from "@/types";

// Sample points across the race, midpoint-style.
const POINTS = Array.from({ length: 43 }, (_, i) => i + 0.5);

describe("splitBias", () => {
  it("is exactly 1 everywhere for the two even strategies", () => {
    for (const km of POINTS) {
      expect(splitBias("even-effort", km)).toBe(1);
      expect(splitBias("even-pace", km)).toBe(1);
    }
  });

  it("ramps monotonically and is symmetric about the midpoint", () => {
    for (const split of ["negative", "positive"] as const) {
      const sign = Math.sign(SPLIT_BIAS[split]);
      for (let i = 1; i < POINTS.length; i++) {
        const step =
          splitBias(split, POINTS[i]) - splitBias(split, POINTS[i - 1]);
        expect(Math.sign(step)).toBe(sign);
      }
      // Equidistant either side of the midpoint deviate equally, opposite ways.
      const mid = MARATHON_KM / 2;
      const lo = splitBias(split, mid - 8) - 1;
      const hi = splitBias(split, mid + 8) - 1;
      expect(lo).toBeCloseTo(-hi, 12);
      expect(splitBias(split, mid)).toBeCloseTo(1, 12);
    }
  });

  it("runs from 1 − b at the line to 1 + b at the finish", () => {
    expect(splitBias("negative", 0)).toBeCloseTo(1.015, 12);
    expect(splitBias("negative", MARATHON_KM)).toBeCloseTo(0.985, 12);
    expect(splitBias("positive", 0)).toBeCloseTo(0.985, 12);
    expect(splitBias("positive", MARATHON_KM)).toBeCloseTo(1.015, 12);
  });

  it("aggressive is strictly more biased than standard at every point", () => {
    for (const km of POINTS) {
      const offMid = Math.abs(km - MARATHON_KM / 2);
      if (offMid < 1e-9) continue; // both are 1 at the midpoint
      expect(Math.abs(splitBias("negative-aggressive", km) - 1)).toBeGreaterThan(
        Math.abs(splitBias("negative", km) - 1),
      );
      expect(Math.abs(splitBias("positive-aggressive", km) - 1)).toBeGreaterThan(
        Math.abs(splitBias("positive", km) - 1),
      );
    }
  });
});

describe("startBias", () => {
  it("is exactly 1 everywhere for an even start", () => {
    for (const km of POINTS) expect(startBias("even", km)).toBe(1);
  });

  it("is a surcharge (≥ 1) that decays strictly with distance", () => {
    for (const start of ["conservative", "very-conservative"] as const) {
      for (let i = 1; i < POINTS.length; i++) {
        const prev = startBias(start, POINTS[i - 1]);
        const curr = startBias(start, POINTS[i]);
        expect(prev).toBeGreaterThan(1);
        expect(curr).toBeGreaterThan(1);
        expect(curr).toBeLessThan(prev);
      }
      // Spent over roughly the first 5 km: under half a percent by 15 km.
      expect(startBias(start, 15) - 1).toBeLessThan(0.005);
    }
  });

  it("very conservative holds back twice as hard as conservative", () => {
    for (const km of POINTS) {
      expect(startBias("very-conservative", km) - 1).toBeCloseTo(
        2 * (startBias("conservative", km) - 1),
        12,
      );
    }
  });
});

describe("option tables", () => {
  it("offer exactly the strategies the engine knows about", () => {
    expect(SPLIT_OPTIONS.map(([v]) => v).sort()).toEqual(
      (Object.keys(SPLIT_BIAS) as SplitStrategy[]).sort(),
    );
    expect(START_OPTIONS.map(([v]) => v).sort()).toEqual(
      (Object.keys(START_SURCHARGE) as StartStrategy[]).sort(),
    );
  });
});
