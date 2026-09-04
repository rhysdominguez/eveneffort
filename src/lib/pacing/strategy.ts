// Pacing strategy: the two shape controls a runner puts on top of the course.
//
// Both are pure multipliers on a segment's DURATION, applied before
// `normalizePaces`. That ordering is the whole design: normalization is a
// single scalar pass, so whatever shape is imposed here, the finish still lands
// exactly on the goal time. Nothing in this file touches `adjustmentFactor` or
// the Minetti math (Rule 1) — the course's own effort profile is computed the
// same way it always was and then re-weighted.
//
// Both curves are evaluated at the segment's MIDPOINT distance in km, so km
// mode (43 segments) and miles mode (27) get the identical curve rather than
// one quantized to whichever unit is on screen.
import type { SplitStrategy, StartStrategy } from "@/types";
import { MARATHON_KM } from "./segments";

/**
 * Half-to-half bias, as a fraction. Positive slows the runner down over the
 * race (a positive split); negative speeds them up (a negative split).
 *
 * The ramp is symmetric about the midpoint, so its mean over the race is 1 and
 * `b` is very nearly the half-to-half differential itself: ±1.5% is ≈1:35 on a
 * 3:30 marathon, ±3% ≈3:10. Standard sits where the coaching advice sits; the
 * aggressive variants are double, matching the spread FindMyMarathon offers.
 *
 * `even-pace` is 0 here — it differs from `even-effort` in ignoring grade, not
 * in its split shape (see `computeElevationDurations`).
 */
export const SPLIT_BIAS: Record<SplitStrategy, number> = {
  "even-effort": 0,
  "even-pace": 0,
  negative: -0.015,
  "negative-aggressive": -0.03,
  positive: 0.015,
  "positive-aggressive": 0.03,
};

/**
 * Duration multiplier for the split ramp: `1 + b·(2f − 1)`, where `f` is the
 * fraction of the race distance elapsed at the segment's midpoint. Runs from
 * `1 − b` at the start line to `1 + b` at the finish.
 */
export function splitBias(split: SplitStrategy, midpointKm: number): number {
  const b = SPLIT_BIAS[split];
  if (b === 0) return 1;
  const f = midpointKm / MARATHON_KM;
  return 1 + b * (2 * f - 1);
}

/**
 * Peak surcharge at the start line, as a fraction of pace. 4% is roughly the
 * "hold back 10 seconds a mile for the first couple of miles" that is the
 * most-given piece of real-world marathon advice; 8% is the version for a
 * runner who knows they go out too hard.
 */
export const START_SURCHARGE: Record<StartStrategy, number> = {
  even: 0,
  conservative: 0.04,
  "very-conservative": 0.08,
};

/**
 * Decay length of the start penalty, km. At τ = 2.5 km the surcharge is down
 * to 37% of its peak by 2.5 km, 14% by 5 km and under a twentieth by 7.5 km —
 * i.e. it is spent over roughly the first 5 km, and never hard-edges at a
 * segment boundary the way a "first 3 miles" step would.
 */
export const START_TAU_KM = 2.5;

/**
 * Duration multiplier for a conservative start: `1 + s·e^(−d/τ)`, always ≥ 1.
 *
 * Nothing here pays the time back — `normalizePaces` does, for free. Adding a
 * surcharge to the early segments raises the raw total, so the scalar that
 * pulls the total back onto the goal is slightly below 1, and every later
 * segment quickens. That is exactly the intended bargain: start slower, and the
 * rest of the race is faster for it.
 */
export function startBias(start: StartStrategy, midpointKm: number): number {
  const s = START_SURCHARGE[start];
  if (s === 0) return 1;
  return 1 + s * Math.exp(-midpointKm / START_TAU_KM);
}

/**
 * The split select's options, in the order they are shown — fastest-finishing
 * intent first. Labels live here, next to the numbers they describe, so a
 * change to one is made looking at the other.
 */
export const SPLIT_OPTIONS: readonly (readonly [SplitStrategy, string])[] = [
  ["even-effort", "Even effort (recommended)"],
  ["even-pace", "Even pace (ignore hills)"],
  ["negative", "Negative split"],
  ["negative-aggressive", "Negative split (aggressive)"],
  ["positive", "Positive split"],
  ["positive-aggressive", "Positive split (aggressive)"],
];

/** The start select's options, in increasing order of caution. */
export const START_OPTIONS: readonly (readonly [StartStrategy, string])[] = [
  ["even", "Even from the gun"],
  ["conservative", "Conservative first 5 km"],
  ["very-conservative", "Very conservative first 5 km"],
];
