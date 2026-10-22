import { IMPACT_FACTORS, type ImpactFactor } from "./impact";
import { MARATHON_KM } from "./segments";

// Per-SPLIT impact breakdown (ROADMAP #17): what each kilometre or mile of the
// race costs against even pace, split four ways, in seconds.
//
// This is the per-segment sibling of impact.ts. That module answers "what did
// the day cost?" for the whole race, as four percentages adding to a total;
// this one answers "where did it cost it?", as four bar series adding to a
// total series. Same decomposition, different resolution.
//
// THE BASELINE IS EVEN PACE, NOT FLAT GROUND. `goalTimeSeconds * lengthKm /
// 42.195` is what this segment would have taken if the runner held one pace
// from gun to tape. Zero on the chart therefore means "on schedule here", and
// the bars sum to `adjustedFinishSeconds - goalTimeSeconds`. The older "vs
// flat" framing the splits chart used is a different and equally valid
// question, but it is not decomposable: heat and wind have no flat-ground
// reading, so the four parts could never be made to sum to the whole.
//
// NOTHING IS RECOMPUTED. Every input is an array `usePacingChart` already
// carries, in the same order and the same units the engine multiplied them in:
//
//   final[i] = segmentDurations[i] * heatMultipliers[i] * windMultipliers[i]
//
// (src/lib/pacing/index.ts). Factoring the even-pace baseline out of that gives
// the four multipliers this module decomposes:
//
//   final[i] = even[i] * g[i] * dry[i] * hum[i] * wind[i]
//     g[i]   = segmentDurations[i] / even[i]     elevation, and strategy
//     dry[i] = dryHeatMultipliers[i]             air temperature alone
//     hum[i] = heatMultipliers[i] / dry[i]       what the moisture adds
//
// ELEVATION CARRIES THE SPLIT STRATEGY TOO, and cannot be made not to.
// `computeElevationDurations` multiplies the grade factor, the split bias and
// the start surcharge together and normalizes the product, so by the time these
// durations exist the three are one number. At the default even split the
// biases are 1 and `g` is pure terrain; with a negative split selected the
// Elevation series also carries the shaping. The chart's info text says so.
//
// THE DECOMPOSITION IS IN LOG SPACE, for the reason set out at length above
// `computeImpact` in impact.ts: multipliers compose multiplicatively, so their
// percentages do not add, and factor i taking `ln(m_i) / sum ln(m_j)` of the
// total is the split that sums exactly, is order independent, and collapses to
// plain addition as the factors get small. That argument is not repeated here.
// It is duplicated rather than shared because `computeImpact` is shaped around
// a course-level `ImpactInput` with its own elevation curve, and bending it to
// serve both would make the locked module harder to read for one caller's sake.
//
// THE TAIL STUB IS FOLDED IN SECONDS SPACE, after the decomposition, never
// before. The last segment is 0.195 km (or 0.2 of a mile) and drawn on its own
// it is a sliver a fifth the width of its neighbours reading a fifth of their
// value, which looks like the runner slowing down at the line. So the final two
// bars are ADDED. Addition preserves every sum exactly, for the total and for
// each factor alike; folding the multipliers instead would need a mean of two
// segments and would break the arithmetic the whole chart rests on. The splits
// TABLE deliberately keeps its 43rd row: a runner crossing the line wants the
// real last split, and a table has room to be precise where a bar does not.

export interface SplitImpactInput {
  goalTimeSeconds: number;
  /** Per segment, in course order. All five arrays are the same length. */
  segmentLengthsKm: number[];
  /** Elevation-and-strategy durations, normalized, before weather. */
  segmentDurations: number[];
  /** Heat AND humidity together: what the engine actually applied. */
  heatMultipliers: number[];
  /** The same with humidity held at the dry reference. */
  dryHeatMultipliers: number[];
  windMultipliers: number[];
}

export interface SplitImpactSeries {
  /**
   * Seconds against even pace, one per DISPLAYED bar: 42 in km mode, 26 in
   * miles. Positive is time lost. The tail stub is already folded in.
   */
  total: number[];
  /** The four factor series, each the same length as `total`. */
  byFactor: Record<ImpactFactor, number[]>;
  /**
   * The factors that do something somewhere on this course, in
   * `IMPACT_FACTORS` order. With weather off this is `["elevation"]` alone,
   * because the other three multipliers are exactly 1 in every segment. It is
   * what decides which tabs the chart offers: a tab drawing a flat line of
   * zeros is a blank chart, not information.
   */
  active: ImpactFactor[];
}

/**
 * A multiplier is treated as doing nothing when it is 1 to within this.
 *
 * Weather-off multipliers are exactly 1, so the tolerance is not needed for the
 * main case. It is here for the near-misses: dry air makes humidity exactly 1
 * only because `dryHeatAdjustment` is `calculateHeatAdjustment` at RH 0 and the
 * ratio is bitwise identical, and a pancake-flat course leaves elevation within
 * float dust of 1. A tab whose every bar rounds to zero should not appear.
 */
const NEUTRAL_EPSILON = 1e-12;

function zeros(n: number): number[] {
  return new Array<number>(n).fill(0);
}

/**
 * Decompose each split's deviation from even pace into elevation, heat,
 * humidity and wind.
 *
 * Throws if the five per-segment arrays disagree in length, which would mean
 * the caller had assembled them from two different computations.
 */
export function splitImpact(input: SplitImpactInput): SplitImpactSeries {
  const {
    goalTimeSeconds,
    segmentLengthsKm,
    segmentDurations,
    heatMultipliers,
    dryHeatMultipliers,
    windMultipliers,
  } = input;

  const n = segmentLengthsKm.length;
  const lengths = [
    segmentDurations.length,
    heatMultipliers.length,
    dryHeatMultipliers.length,
    windMultipliers.length,
  ];
  if (lengths.some((l) => l !== n)) {
    throw new Error("splitImpact: per-segment arrays differ in length");
  }

  const total = zeros(n);
  const byFactor: Record<ImpactFactor, number[]> = {
    elevation: zeros(n),
    heat: zeros(n),
    humidity: zeros(n),
    wind: zeros(n),
  };
  const moves: Record<ImpactFactor, boolean> = {
    elevation: false,
    heat: false,
    humidity: false,
    wind: false,
  };

  for (let i = 0; i < n; i++) {
    const even = (goalTimeSeconds * segmentLengthsKm[i]) / MARATHON_KM;
    const dry = dryHeatMultipliers[i];
    const multipliers: Record<ImpactFactor, number> = {
      elevation: even > 0 ? segmentDurations[i] / even : 1,
      heat: dry,
      humidity: dry > 0 ? heatMultipliers[i] / dry : 1,
      wind: windMultipliers[i],
    };

    // `even * product` is `duration * heat * wind` with the baseline cancelled
    // back out, so this is exactly the segment's finished duration less what
    // even pace would have taken.
    const product = IMPACT_FACTORS.reduce(
      (p, factor) => p * multipliers[factor],
      1,
    );
    total[i] = even * (product - 1);

    const logs = IMPACT_FACTORS.map((factor) => Math.log(multipliers[factor]));
    const logSum = logs.reduce((sum, l) => sum + l, 0);

    IMPACT_FACTORS.forEach((factor, k) => {
      // logSum is 0 whenever nothing is happening at all, which is the default
      // state of the page rather than an edge case. Zeros, not NaN.
      byFactor[factor][i] = logSum === 0 ? 0 : (logs[k] / logSum) * total[i];
      if (Math.abs(multipliers[factor] - 1) > NEUTRAL_EPSILON) {
        moves[factor] = true;
      }
    });
  }

  return {
    total: foldTail(total),
    byFactor: {
      elevation: foldTail(byFactor.elevation),
      heat: foldTail(byFactor.heat),
      humidity: foldTail(byFactor.humidity),
      wind: foldTail(byFactor.wind),
    },
    active: IMPACT_FACTORS.filter((factor) => moves[factor]),
  };
}

/**
 * Add the final stub segment into the one before it, shortening the series by
 * one. A series of fewer than two entries is returned untouched.
 */
function foldTail(series: number[]): number[] {
  if (series.length < 2) return series.slice();
  const folded = series.slice(0, -1);
  folded[folded.length - 1] += series[series.length - 1];
  return folded;
}
