import { describe, it, expect } from "vitest";
import { minettiCost, FLAT_COST, MINETTI_GRADIENT_LIMIT } from "./minetti";

// Reference implementation written straight from the published Minetti (2002)
// running-cost coefficients. If minetti.ts ever drifts from the paper, the
// "coefficient pin" test below fails.
const PUBLISHED = (g: number) =>
  155.4 * g ** 5 -
  30.4 * g ** 4 -
  43.3 * g ** 3 +
  46.3 * g ** 2 +
  19.5 * g +
  3.6;

describe("minettiCost", () => {
  it("returns exactly 3.6 on the flat (g = 0)", () => {
    expect(minettiCost(0)).toBe(3.6);
    expect(FLAT_COST).toBe(3.6);
  });

  // Hand computation of C_r(0.05):
  //   155.4·(0.05)^5 =  155.4 · 3.125e-7 =  0.0000485625
  //  −30.4·(0.05)^4  = −30.4  · 6.25e-6  = −0.000190000
  //  −43.3·(0.05)^3  = −43.3  · 1.25e-4  = −0.005412500
  //  +46.3·(0.05)^2  =  46.3  · 2.5e-3   =  0.115750000
  //  +19.5·(0.05)    =  19.5  · 0.05     =  0.975000000
  //  +3.6
  //   sum = 0.0000485625 − 0.000190000 − 0.005412500
  //         + 0.115750000 + 0.975000000 + 3.6
  //       = 4.6851960625
  it("matches the hand-computed value at g = 0.05 (uphill)", () => {
    expect(minettiCost(0.05)).toBeCloseTo(4.6851960625, 6);
  });

  // Hand computation of C_r(-0.05):
  //   155.4·(-0.05)^5 = 155.4 · (-3.125e-7) = -0.0000485625
  //  −30.4·(-0.05)^4  = -30.4 · 6.25e-6     = -0.000190000
  //  −43.3·(-0.05)^3  = -43.3 · (-1.25e-4)  = +0.005412500
  //  +46.3·(-0.05)^2  =  46.3 · 2.5e-3      = +0.115750000
  //  +19.5·(-0.05)    =  19.5 · (-0.05)     = -0.975000000
  //  +3.6
  //   sum = -0.0000485625 - 0.000190000 + 0.005412500
  //         + 0.115750000 - 0.975000000 + 3.6
  //       = 2.7459239375
  it("matches the hand-computed value at g = -0.05 (downhill) and stays positive", () => {
    const c = minettiCost(-0.05);
    expect(c).toBeCloseTo(2.7459239375, 6);
    expect(c).toBeGreaterThan(0);
  });

  it("is monotonic-ish: C_r(0.10) > C_r(0.05) > C_r(0)", () => {
    expect(minettiCost(0.1)).toBeGreaterThan(minettiCost(0.05));
    expect(minettiCost(0.05)).toBeGreaterThan(minettiCost(0));
  });

  // Coefficient pin: locks the implementation to the exact published
  // polynomial across the validated domain. Guards against silent drift of
  // any of the six coefficients or the term order.
  it("equals the published Minetti (2002) polynomial across the valid domain", () => {
    for (const g of [-0.45, -0.3, -0.2, -0.1, -0.05, 0, 0.05, 0.1, 0.2, 0.45]) {
      expect(minettiCost(g)).toBeCloseTo(PUBLISHED(g), 12);
    }
  });

  // Independent physiological reference point from the paper: running on the
  // flat costs ~3.6 J·kg⁻¹·m⁻¹.
  it("reproduces the paper's flat-ground reference cost", () => {
    expect(minettiCost(0)).toBe(3.6);
  });

  // Independent physiological reference point: Minetti (2002) reports the
  // lowest Cr at i = −0.20 (1.73 ± 0.36 J·kg⁻¹·m⁻¹), not on the flat and not
  // at the steepest descent.
  it("has its cost minimum on a moderate downhill, not at flat or steepest", () => {
    const atMin = minettiCost(-0.2);
    expect(atMin).toBeLessThan(minettiCost(0));
    expect(atMin).toBeLessThan(minettiCost(-MINETTI_GRADIENT_LIMIT));
    // Minimum is interior to (−0.45, 0): shallower on both sides.
    expect(atMin).toBeLessThan(minettiCost(-0.1));
    expect(atMin).toBeLessThan(minettiCost(-0.3));
    // Paper's reported value at the −0.20 minimum: 1.73 ± 0.36.
    expect(atMin).toBeGreaterThan(1.73 - 0.36);
    expect(atMin).toBeLessThan(1.73 + 0.36);
  });

  // Primary-source empirical pin: Minetti et al. (2002) Table 2 gives the
  // measured mean ± SD Cr at 13 slopes. The polynomial must land within one
  // SD of the experimental mean at every tabulated slope — validating against
  // the paper's raw data, not just its fitted regression.
  it("stays within 1 SD of the paper's Table 2 measured Cr at every slope", () => {
    const TABLE_2: Array<[number, number, number]> = [
      [-0.45, 3.92, 0.81],
      [-0.4, 3.49, 0.47],
      [-0.35, 2.81, 0.54],
      [-0.3, 2.43, 0.5],
      [-0.2, 1.73, 0.36],
      [-0.1, 1.93, 0.45],
      [0, 3.4, 0.24],
      [0.1, 5.77, 0.6],
      [0.2, 8.92, 0.84],
      [0.3, 12.52, 0.62],
      [0.35, 14.43, 1.08],
      [0.4, 16.83, 0.88],
      [0.45, 18.93, 1.74],
    ];
    for (const [i, mean, sd] of TABLE_2) {
      expect(Math.abs(minettiCost(i) - mean)).toBeLessThanOrEqual(sd);
    }
  });

  it("clamps gradients beyond the validated ±0.45 domain", () => {
    expect(minettiCost(0.9)).toBe(minettiCost(MINETTI_GRADIENT_LIMIT));
    expect(minettiCost(-0.9)).toBe(minettiCost(-MINETTI_GRADIENT_LIMIT));
    expect(minettiCost(5)).toBeGreaterThan(0);
    expect(Number.isFinite(minettiCost(-100))).toBe(true);
    expect(minettiCost(-100)).toBeGreaterThan(0);
  });
});
