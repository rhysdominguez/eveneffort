import { describe, it, expect } from "vitest";
import {
  calculateHeatAdjustment,
  dryHeatAdjustment,
  humidityAdjustment,
  heatIndexC,
  slowdownFromHeatIndex,
  DRY_REFERENCE_RH,
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

// The Heat / Humidity split the impact panel shows. It is a way of reading
// `calculateHeatAdjustment`, so every test here is really about that identity
// holding rather than about a second model being right.
describe("dry-reference heat / humidity split", () => {
  const TEMPS = [5, 12, 13, 14, 16, 20, 25, 28, 32, 36, 40];
  const HUMIDITIES = [0, 10, 30, 50, 70, 90, 100];

  it("multiplies back to the combined multiplier, everywhere", () => {
    for (const t of TEMPS) {
      for (const rh of HUMIDITIES) {
        expect(dryHeatAdjustment(t) * humidityAdjustment(t, rh)).toBeCloseTo(
          calculateHeatAdjustment(t, rh),
          12,
        );
      }
    }
  });

  it("never attributes a saving to humidity", () => {
    // A negative humidity line would read as "the humidity is helping", which
    // is the failure mode a badly chosen reference produces.
    for (const t of TEMPS) {
      for (const rh of HUMIDITIES) {
        expect(humidityAdjustment(t, rh)).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("is exactly 1 at the reference humidity", () => {
    for (const t of TEMPS) {
      expect(humidityAdjustment(t, DRY_REFERENCE_RH)).toBe(1);
      expect(dryHeatAdjustment(t)).toBe(
        calculateHeatAdjustment(t, DRY_REFERENCE_RH),
      );
    }
  });

  it("rises with humidity at a fixed temperature", () => {
    for (const t of [20, 25, 28, 32]) {
      for (let i = 1; i < HUMIDITIES.length; i++) {
        expect(humidityAdjustment(t, HUMIDITIES[i])).toBeGreaterThan(
          humidityAdjustment(t, HUMIDITIES[i - 1]),
        );
      }
    }
  });

  it("does nothing at all below the 13 C threshold", () => {
    for (const t of [5, 12, 13]) {
      for (const rh of HUMIDITIES) {
        expect(dryHeatAdjustment(t)).toBe(1);
        expect(humidityAdjustment(t, rh)).toBe(1);
      }
    }
  });

  it("stays small in cool air and grows large in a hot swamp", () => {
    // The two ends the reference was chosen against.
    expect((humidityAdjustment(20, 10) - 1) * 100).toBeLessThan(0.5);
    expect((humidityAdjustment(32, 95) - 1) * 100).toBeGreaterThan(10);
  });

  it("returns finite numbers across the whole grid", () => {
    for (const t of TEMPS) {
      for (const rh of HUMIDITIES) {
        expect(Number.isFinite(dryHeatAdjustment(t))).toBe(true);
        expect(Number.isFinite(humidityAdjustment(t, rh))).toBe(true);
      }
    }
  });
});
