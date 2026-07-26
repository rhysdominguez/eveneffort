// Minetti et al. (2002), "Energy cost of walking and running at extreme uphill
// and downhill slopes," J. Appl. Physiol. 93(3):1039–1046.
// Running metabolic energy cost as a polynomial in gradient:
//   C_r(g) = 155.4·g⁵ − 30.4·g⁴ − 43.3·g³ + 46.3·g² + 19.5·g + 3.6
// where g is the gradient as a fraction (decimal) and C_r is in J·kg⁻¹·m⁻¹.
// The published regression is only validated for −0.45 ≤ g ≤ +0.45; gradients
// outside that range are clamped to the limit before evaluation (a quintic
// extrapolated past its fitted domain diverges rapidly).

/** Energy cost of running on flat ground (g = 0), J·kg⁻¹·m⁻¹. */
export const FLAT_COST = 3.6;

/** Validated gradient domain of the Minetti (2002) regression: ±0.45. */
export const MINETTI_GRADIENT_LIMIT = 0.45;

/** Minetti (2002) energy cost C_r(g), evaluated via Horner's method for numerical stability. */
export function minettiCost(g: number): number {
  const c = Math.min(
    MINETTI_GRADIENT_LIMIT,
    Math.max(-MINETTI_GRADIENT_LIMIT, g),
  );
  return ((((155.4 * c - 30.4) * c - 43.3) * c + 46.3) * c + 19.5) * c + 3.6;
}
