import { describe, it, expect } from "vitest";
import {
  adjustmentFactor,
  MINETTI_DAMPING,
  ADJ_DOWNHILL_FLOOR,
  ADJ_UPHILL_CEIL,
} from "./adjustment";
import { minettiCost } from "./minetti";

// Damped factor before guardrail clamping.
const damped = (g: number) =>
  1 + MINETTI_DAMPING * (minettiCost(g) / 3.6 - 1);

describe("adjustmentFactor", () => {
  it("is exactly 1.0 on the flat (damping leaves flat untouched)", () => {
    expect(adjustmentFactor(0)).toBe(1.0);
  });

  it("damps a gentle uphill: equals 1 + k·(C_r/C_r0 − 1), not raw Minetti", () => {
    const f = adjustmentFactor(0.05);
    const raw = minettiCost(0.05) / 3.6;
    expect(f).toBeCloseTo(damped(0.05), 9);
    expect(f).toBeGreaterThan(1);
    expect(f).toBeLessThan(raw); // damping pulls it toward flat
  });

  it("damps a gentle downhill toward flat (g = -0.03), still < 1, unclamped", () => {
    const f = adjustmentFactor(-0.03);
    const raw = minettiCost(-0.03) / 3.6;
    expect(f).toBeCloseTo(damped(-0.03), 9);
    expect(f).toBeLessThan(1);
    expect(f).toBeGreaterThan(raw); // closer to flat than raw Minetti
    expect(f).toBeGreaterThan(ADJ_DOWNHILL_FLOOR); // backstop inert here
  });

  it("leaves typical road grades clear of the guardrails", () => {
    for (const g of [-0.03, -0.01, 0.02, 0.03]) {
      expect(adjustmentFactor(g)).toBeCloseTo(damped(g), 9);
      expect(adjustmentFactor(g)).toBeGreaterThan(ADJ_DOWNHILL_FLOOR);
      expect(adjustmentFactor(g)).toBeLessThan(ADJ_UPHILL_CEIL);
    }
  });

  it("guardrail floor still binds on extreme descents (g ≤ ~ -8%)", () => {
    expect(adjustmentFactor(-0.1)).toBe(ADJ_DOWNHILL_FLOOR);
    expect(adjustmentFactor(-0.2)).toBe(ADJ_DOWNHILL_FLOOR);
    expect(ADJ_DOWNHILL_FLOOR).toBe(0.88);
  });

  it("guardrail ceiling still binds on extreme climbs", () => {
    expect(adjustmentFactor(0.45)).toBe(ADJ_UPHILL_CEIL);
    expect(ADJ_UPHILL_CEIL).toBe(2.0);
  });

  it("does NOT floor a very steep descent whose damped cost stays > flat", () => {
    // Minetti's downhill branch is U-shaped: at -45% cost > flat, so even
    // damped the factor exceeds 1 and is not floored.
    const f = adjustmentFactor(-0.45);
    expect(f).toBeCloseTo(damped(-0.45), 9);
    expect(f).toBeGreaterThan(1);
  });

  it("never returns a value outside [floor, ceiling]", () => {
    for (let g = -0.45; g <= 0.45 + 1e-9; g += 0.005) {
      const f = adjustmentFactor(g);
      expect(f).toBeGreaterThanOrEqual(ADJ_DOWNHILL_FLOOR - 1e-12);
      expect(f).toBeLessThanOrEqual(ADJ_UPHILL_CEIL + 1e-12);
    }
  });
});
