import { describe, it, expect } from "vitest";
import {
  calculateHeatAdjustment,
  heatIndexC,
  slowdownFromHeatIndex,
} from "./heat";

describe("slowdownFromHeatIndex — empirical anchors", () => {
  it("is 0 at or below the 13°C threshold", () => {
    expect(slowdownFromHeatIndex(13)).toBe(0);
    expect(slowdownFromHeatIndex(5)).toBe(0);
  });

  it("hits the published anchors (16/21/27/32 → 1/3/6/10%)", () => {
    expect(slowdownFromHeatIndex(16)).toBeCloseTo(0.01, 6);
    expect(slowdownFromHeatIndex(21)).toBeCloseTo(0.03, 6);
    expect(slowdownFromHeatIndex(27)).toBeCloseTo(0.06, 6);
    expect(slowdownFromHeatIndex(32)).toBeCloseTo(0.1, 6);
  });

  it("interpolates between anchors and extrapolates past 32°C", () => {
    const mid = slowdownFromHeatIndex(18.5); // between 16 and 21
    expect(mid).toBeGreaterThan(0.01);
    expect(mid).toBeLessThan(0.03);
    // slope past 32°C is (0.10-0.06)/(32-27)=0.008 per °C → 37°C ≈ 0.14.
    expect(slowdownFromHeatIndex(37)).toBeCloseTo(0.14, 6);
  });

  it("is monotonically non-decreasing", () => {
    let prev = -1;
    for (let hi = 10; hi <= 40; hi += 0.5) {
      const s = slowdownFromHeatIndex(hi);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });
});

describe("heatIndexC", () => {
  it("raises apparent temperature as humidity climbs (warm conditions)", () => {
    const dry = heatIndexC(32, 20);
    const humid = heatIndexC(32, 90);
    expect(humid).toBeGreaterThan(dry);
    expect(humid).toBeGreaterThan(32);
  });

  it("stays finite and near air temp in mild, dry conditions", () => {
    const hi = heatIndexC(18, 40);
    expect(Number.isFinite(hi)).toBe(true);
    expect(Math.abs(hi - 18)).toBeLessThan(4);
  });
});

describe("calculateHeatAdjustment", () => {
  it("returns exactly 1.0 at or below the threshold", () => {
    expect(calculateHeatAdjustment(13, 50)).toBe(1);
    expect(calculateHeatAdjustment(10, 90)).toBe(1);
  });

  it("returns a slowdown multiplier above the threshold", () => {
    expect(calculateHeatAdjustment(25, 70)).toBeGreaterThan(1);
  });

  it("is hotter+more humid ⇒ larger multiplier", () => {
    expect(calculateHeatAdjustment(32, 80)).toBeGreaterThan(
      calculateHeatAdjustment(25, 80),
    );
    expect(calculateHeatAdjustment(30, 90)).toBeGreaterThan(
      calculateHeatAdjustment(30, 40),
    );
  });
});
