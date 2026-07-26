// Converts a segment gradient into a pace adjustment factor relative to flat-ground cost.
//
// Core: Minetti et al. (2002) energy-cost ratio C_r(g)/C_r(0) — the standard
// grade-adjusted-pace (GAP) model (Strava, Garmin, RunGap, etc.).
//
// Damping: raw Minetti is metabolically "pure" and over-prescribes pace change
// at the gentle grades that dominate road marathons (e.g. a -2.4% mile → 12%
// faster). Real runners adjust only a fraction of that: Townshend et al. (2010)
// observed ~13.8% faster downhill / ~23% slower uphill — roughly 0.35-0.5x of
// Minetti's prediction. We apply a uniform damping coefficient k that
// compresses the cost ratio toward flat while preserving Minetti's shape;
// k = 0.35 (cross-checked against reference marathon pace bands).
//
// Caps: kept as guardrails only. After damping, road grades never approach
// them; they bound absurd extremes (steep trail) where Minetti/GAP is
// unreliable. Downhill benefit ≤ 12% (Strava-aligned); uphill cost ≤ 2x flat.
import { minettiCost, FLAT_COST } from "./minetti";

/** Empirical grade-response damping: runners adjust ~0.35x of Minetti's
 *  predicted metabolic-cost deviation (Townshend et al. observed vs predicted;
 *  cross-checked against reference marathon pace bands). */
export const MINETTI_DAMPING = 0.35;

/** Max 12% pace benefit on descents → factor floor 0.88 (Strava-aligned). */
export const ADJ_DOWNHILL_FLOOR = 0.88;
/** Cap uphill cost at ~2× flat (≈ double time beyond +15% climbs). */
export const ADJ_UPHILL_CEIL = 2.0;

/**
 * adjustmentFactor(g) = clamp( 1 + k·(C_r(g)/C_r(0) − 1), 0.88, 2.0 ).
 * 1.0 on the flat; damped toward flat by k=MINETTI_DAMPING; clamped at the
 * empirical extreme-grade guardrails.
 */
export function adjustmentFactor(g: number): number {
  const raw = minettiCost(g) / FLAT_COST;
  const damped = 1 + MINETTI_DAMPING * (raw - 1);
  return Math.min(ADJ_UPHILL_CEIL, Math.max(ADJ_DOWNHILL_FLOOR, damped));
}
