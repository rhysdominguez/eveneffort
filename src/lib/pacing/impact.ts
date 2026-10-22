import type { CourseCost } from "@/types";
import { costMultiplier } from "@/lib/pacing/courseCost";

// Per-factor impact breakdown (ROADMAP #16): what the hills, the heat, the
// humidity and the wind each cost this runner on this course, as four
// percentages that add up to a stated total.
//
// Until this module existed the app gave a runner one number and no account of
// where it came from. `/courses` said "2.1% harder", `SummaryHeader` printed an
// adjusted finish, and nothing on either page said how much of it was the
// ground and how much was the forecast.
//
// ELEVATION COMES FROM THE COST CURVE, NOT THE ENGINE CURVE. This is the
// decision most likely to be got wrong here, so it is the first thing in the
// header. Two Minetti-derived curves live in this directory and both are right
// for their own job: `adjustmentFactor` (damped, symmetric, k = 0.35) is the
// pacing engine, which spreads one goal time over one race, and
// `courseCostFactor` (asymmetric, k_up 1.95 / k_down 0.80) is the comparison
// curve, fitted against 44 published Course Scores. The header of
// src/lib/pacing/courseCost.ts has the argument and the R^2.
//
// So the Elevation line reads `costMultiplier`, which is exactly the terrain
// half of the "vs flat" figure the ranking table prints for the same course.
// Build it out of `adjustmentFactor` instead and this panel would quote a
// different elevation percentage from the one /courses shows, with nothing on
// either page to reconcile them. `impact.test.ts` re-derives that identity
// across every committed course file, which is what stops the two drifting.
//
// ALTITUDE IS NOT A FACTOR HERE, and that is a product decision rather than a
// modelling one. It had a line in the first cut and was removed: it reads
// exactly 0.0% on 294 of the 326 seeded courses, so for almost every runner it
// was a permanently blank tile explaining something that was not happening.
//
// THE COST OF THAT, WRITTEN DOWN so it is not rediscovered as a bug: on the 32
// courses that do sit above 1,000 m this panel now UNDERSTATES what the course
// costs, and its total no longer reconciles with "vs flat" on /courses. La Paz
// totals +14.9% here against "36.5% harder" there, because thin air is the
// larger half of that course and nothing on screen accounts for it. If a
// high-altitude race ever becomes a real part of the catalogue, this is the
// first thing to revisit. `totalEffortMultiplier` in src/lib/units/effort.ts is
// still the all-in figure and still folds altitude in.
//
// HEAT AND HUMIDITY ARE ONE MULTIPLIER READ AS TWO LINES, and the reference
// that makes that possible is named on screen rather than hidden here.
// `heatIndexC` folds relative humidity into a single apparent temperature
// before `calculateHeatAdjustment` ever sees it, so "what humidity costs" is
// not a quantity the model contains until a baseline is chosen. The baseline is
// `DRY_REFERENCE_RH` (bone-dry air) in src/lib/weather/heat.ts, where the
// argument for that particular value lives:
//
//   heat     = calculateHeatAdjustment(t, DRY_REFERENCE_RH)   air temperature alone
//   humidity = calculateHeatAdjustment(t, rh) / heat          what moisture adds
//
// so `heat * humidity` is the combined multiplier the engine actually applied,
// exactly. The split is a way of READING one model, never a second model that
// could drift from it, which is why neither line is computed from its own
// curve. `impact.test.ts` pins the identity.
//
// The panel shipped with a single Heat line for exactly one release and it was
// wrong in use: moving the humidity slider changed the Heat tile, so the tile
// appeared to be lying about what it measured. A named reference and two lines
// is more honest than one line that silently absorbs a second input.

/** The four factors, in the order they are displayed. */
export type ImpactFactor = "elevation" | "heat" | "humidity" | "wind";

export const IMPACT_FACTORS: readonly ImpactFactor[] = [
  "elevation",
  "heat",
  "humidity",
  "wind",
] as const;

export interface ImpactLine {
  factor: ImpactFactor;
  /** This factor's own multiplier. Exactly 1 when it does nothing. */
  multiplier: number;
  /** This factor in isolation, `(multiplier - 1) * 100`. */
  percent: number;
  /** Its slice of the total, `ln(m_i) / sum ln(m_j)`. Zero when the total is. */
  share: number;
  /**
   * Its slice OF THE TOTAL PERCENTAGE, `share * totalPercent`. This is what the
   * tiles print, because these four sum to `totalPercent` exactly and the
   * standalone `percent` values do not.
   */
  sharePercent: number;
}

export interface ImpactBreakdown {
  /** Always all four factors, always in `IMPACT_FACTORS` order. */
  lines: ImpactLine[];
  /** The product of all four. */
  totalMultiplier: number;
  /** `(totalMultiplier - 1) * 100`. The number the total row prints. */
  totalPercent: number;
  /** True when heat/wind were actually computed rather than defaulted to 1. */
  weatherApplied: boolean;
}

export interface ImpactInput {
  cost: CourseCost;
  /**
   * Course-level multiplier for the air temperature alone, humidity held at
   * the dry reference. Exactly 1 when weather is off.
   */
  heatMultiplier: number;
  /**
   * What the moisture adds on top: the combined heat multiplier over the dry
   * one. Exactly 1 in dry air and when weather is off.
   */
  humidityMultiplier: number;
  /** Course-level wind multiplier. Exactly 1 when weather is off. */
  windMultiplier: number;
  weatherApplied: boolean;
}

/**
 * The weighted geometric mean of `values`, weights `weights`:
 * `exp(sum(w_i * ln v_i) / sum(w_i))`.
 *
 * This is how a per-segment multiplier series collapses to one course-level
 * figure. The weights are SEGMENT DURATIONS, not lengths, and that is the whole
 * point: `computePaceChart` multiplies each segment's duration by its own heat
 * and wind multipliers, so the factor that actually produced the adjusted
 * finish time is the duration-weighted one. Weighting by distance would quietly
 * under-count the slow, hot, late kilometres a runner spends the most time in.
 *
 * Returns exactly 1 for an empty series or zero total weight, so a caller never
 * has to guard against NaN.
 */
export function weightedGeometricMean(
  values: number[],
  weights: number[],
): number {
  if (values.length !== weights.length) {
    throw new Error("weightedGeometricMean: values and weights differ in length");
  }
  let weightSum = 0;
  let logSum = 0;
  for (let i = 0; i < values.length; i++) {
    const w = weights[i];
    const v = values[i];
    if (!Number.isFinite(w) || !Number.isFinite(v) || v <= 0) continue;
    weightSum += w;
    logSum += w * Math.log(v);
  }
  if (weightSum === 0) return 1;
  return Math.exp(logSum / weightSum);
}

/**
 * Split the combined slowdown into one share per factor.
 *
 * MULTIPLIERS COMPOSE MULTIPLICATIVELY, SO PERCENTAGES DO NOT ADD: 1.03 x 1.02
 * is 1.0506, not 1.05. Printing "3%" and "2%" above a total of "5.1%" invites
 * the reader to check the arithmetic and find it wrong. So the decomposition is
 * done in LOG SPACE: factor i takes `ln(m_i) / sum ln(m_j)` of the total. That
 * sums to the total exactly by construction, is order-independent, splits a
 * shared nonlinearity in proportion to each factor's own contribution, and
 * collapses to plain addition as the factors get small, which they usually are.
 *
 * A factor that SAVES time (a net-downhill course, a tailwind) has a multiplier
 * below 1 and therefore a negative log, and the identity still holds: its share
 * is negative and the four still sum to the total.
 *
 * When every multiplier is exactly 1 the denominator is 0. That is the common
 * case, not an edge case: a flat course with weather switched off is the
 * default state of the page. It returns zeros throughout rather than NaN, and
 * the panel reads as a clean row of 0.0%.
 */
export function computeImpact(input: ImpactInput): ImpactBreakdown {
  const multipliers: Record<ImpactFactor, number> = {
    elevation: costMultiplier(input.cost),
    heat: input.heatMultiplier,
    humidity: input.humidityMultiplier,
    wind: input.windMultiplier,
  };

  const totalMultiplier = IMPACT_FACTORS.reduce(
    (product, factor) => product * multipliers[factor],
    1,
  );
  const totalPercent = (totalMultiplier - 1) * 100;

  const logs = IMPACT_FACTORS.map((factor) => Math.log(multipliers[factor]));
  const logSum = logs.reduce((sum, l) => sum + l, 0);

  const lines: ImpactLine[] = IMPACT_FACTORS.map((factor, i) => {
    const multiplier = multipliers[factor];
    const share = logSum === 0 ? 0 : logs[i] / logSum;
    return {
      factor,
      multiplier,
      percent: (multiplier - 1) * 100,
      share,
      sharePercent: share * totalPercent,
    };
  });

  return {
    lines,
    totalMultiplier,
    totalPercent,
    weatherApplied: input.weatherApplied,
  };
}
