import { describe, it, expect } from "vitest";
import {
  courseCost,
  courseCostFactor,
  costMultiplier,
  COST_DOWNHILL_FLOOR,
  COST_DOWNHILL_K,
  COST_UPHILL_CEIL,
  COST_UPHILL_K,
} from "./courseCost";
import { adjustmentFactor } from "./adjustment";
import { minettiCost, FLAT_COST } from "./minetti";
import { MARATHON_KM } from "./segments";

// A course is 44 absolute elevations at 0,1,…,42,42.195 km (Rule 4).
const flat = (m = 10): number[] => Array(44).fill(m);

/** Rolling: ±`amplitude` metres every other kilometre. Gain == loss exactly. */
const rolling = (amplitude: number): number[] =>
  Array.from({ length: 44 }, (_, i) => 100 + (i % 2 === 0 ? 0 : amplitude));

/** A steady net drop of `dropM` metres across the whole race. */
const descending = (dropM: number): number[] =>
  Array.from({ length: 44 }, (_, i) => 500 - (dropM * i) / 43);

describe("courseCostFactor", () => {
  it("is exactly 1 on the flat", () => {
    expect(courseCostFactor(0)).toBe(1);
  });

  it("costs more uphill and less downhill", () => {
    expect(courseCostFactor(0.02)).toBeGreaterThan(1);
    expect(courseCostFactor(-0.02)).toBeLessThan(1);
  });

  it("applies the two coefficients to Minetti's own deviation", () => {
    // The formula, asserted directly rather than trusted: there is no second
    // curve here, only Minetti scaled by direction.
    const up = 0.03;
    const down = -0.03;
    expect(courseCostFactor(up)).toBeCloseTo(
      1 + COST_UPHILL_K * (minettiCost(up) / FLAT_COST - 1),
      12,
    );
    expect(courseCostFactor(down)).toBeCloseTo(
      1 + COST_DOWNHILL_K * (minettiCost(down) / FLAT_COST - 1),
      12,
    );
  });

  it("charges a climb more than the matching descent refunds", () => {
    // THE PROPERTY THE WHOLE MODULE EXISTS FOR. Under the engine's symmetric
    // curve these two very nearly cancel, which is what made rolling courses
    // read as flat. Here the climb has to win clearly.
    for (const g of [0.01, 0.02, 0.03, 0.05]) {
      const climbCost = courseCostFactor(g) - 1;
      const descentRefund = 1 - courseCostFactor(-g);
      expect(climbCost).toBeGreaterThan(descentRefund * 1.5);
    }
  });

  it("is not the engine's adjustmentFactor, in either direction", () => {
    // If these ever agree, one model has been pointed at the other.
    expect(courseCostFactor(0.03)).toBeGreaterThan(adjustmentFactor(0.03));
    expect(courseCostFactor(-0.03)).toBeLessThan(adjustmentFactor(-0.03));
  });

  it("clamps to the guardrails at absurd gradients", () => {
    expect(courseCostFactor(0.45)).toBe(COST_UPHILL_CEIL);
    // -0.18 is where Minetti's downhill branch bottoms out. The floor binds
    // only in a narrow window around it (roughly -0.16 to -0.19) because the
    // curve turns back UP below that as eccentric braking starts to cost
    // rather than save, so a steeper descent is not a cheaper one.
    expect(courseCostFactor(-0.18)).toBe(COST_DOWNHILL_FLOOR);
    expect(courseCostFactor(-0.35)).toBeGreaterThan(COST_DOWNHILL_FLOOR);
  });

  it("stays inside the guardrails everywhere, including past Minetti's domain", () => {
    for (let g = -1; g <= 1; g += 0.005) {
      const f = courseCostFactor(g);
      expect(f).toBeGreaterThanOrEqual(COST_DOWNHILL_FLOOR);
      expect(f).toBeLessThanOrEqual(COST_UPHILL_CEIL);
      expect(Number.isFinite(f)).toBe(true);
    }
  });

  it("rises monotonically across the gradients a road marathon has", () => {
    // Minetti's downhill branch turns back up below about -18%, so this holds
    // over road grades rather than everywhere, which is what the claim needs.
    for (let g = -0.1; g < 0.1; g += 0.005) {
      expect(courseCostFactor(g + 0.005)).toBeGreaterThan(courseCostFactor(g));
    }
  });
});

describe("courseCost", () => {
  it("returns the race distance itself for a flat course", () => {
    const cost = courseCost(flat());
    expect(cost.km).toBeCloseTo(MARATHON_KM, 9);
    expect(costMultiplier(cost)).toBeCloseTo(1, 12);
  });

  it("is unchanged by how high a flat course sits", () => {
    // Altitude is `altitude.ts`'s job and must not leak in here, or
    // totalCostKm would count it twice.
    expect(courseCost(flat(5)).km).toBeCloseTo(courseCost(flat(2500)).km, 9);
  });

  it("charges a rolling course more than flat, though gain equals loss", () => {
    expect(costMultiplier(courseCost(rolling(20)))).toBeGreaterThan(1.005);
  });

  it("charges more the rougher the course gets", () => {
    const shapes = [5, 10, 20, 40].map((a) =>
      costMultiplier(courseCost(rolling(a))),
    );
    for (let i = 1; i < shapes.length; i++) {
      expect(shapes[i]).toBeGreaterThan(shapes[i - 1]);
    }
  });

  it("credits a steady net drop", () => {
    expect(costMultiplier(courseCost(descending(400)))).toBeLessThan(1);
  });

  it("carries both segmentations, and they disagree slightly", () => {
    const cost = courseCost(rolling(30));
    expect(cost.km).toBeGreaterThan(0);
    expect(cost.miles).toBeGreaterThan(0);
    // Mile segments average the same hills over a longer span, so a rolling
    // course looks flatter in miles. Same reason `CourseEffort` carries two.
    expect(cost.miles * 1.609344).toBeLessThan(cost.km);
  });

  it("rejects anything that is not 44 points", () => {
    expect(() => courseCost(Array(43).fill(0))).toThrow();
    expect(() => courseCost([])).toThrow();
  });
});
