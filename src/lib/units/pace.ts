// Pace formatting helpers.
import type { Unit } from "@/types";

/**
 * Format a pace (seconds per unit) as "M:SS /km" or "M:SS /mi".
 * Rounds to the nearest second before splitting into minutes/seconds.
 */
export function formatPace(secondsPerUnit: number, unit: Unit): string {
  const total = Math.round(secondsPerUnit);
  const m = Math.floor(total / 60);
  const s = total % 60;
  const suffix = unit === "km" ? "/km" : "/mi";
  return `${m}:${String(s).padStart(2, "0")} ${suffix}`;
}
