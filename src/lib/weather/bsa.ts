// Body-surface-area and frontal-area helpers for the wind drag model (Phase 2).

/**
 * Du Bois & Du Bois (1916) body surface area, in m².
 *   BSA = 0.007184 · mass(kg)^0.425 · height(cm)^0.725
 */
export function duBoisBSA(massKg: number, heightCm: number): number {
  return 0.007184 * massKg ** 0.425 * heightCm ** 0.725;
}

/**
 * Projected frontal area (m²) of a runner, used as A_p in the drag equation.
 * Phase 2 plan: A_p ≈ 0.266 · BSA.
 */
export function frontalArea(massKg: number, heightCm: number): number {
  return 0.266 * duBoisBSA(massKg, heightCm);
}
