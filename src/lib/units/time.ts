// Time formatting helpers for split times.
import type { GoalTimeInput } from "@/types";

/** Convert a GoalTimeInput (H/M/S) into total seconds. */
export function toSeconds(input: GoalTimeInput): number {
  return input.hours * 3600 + input.minutes * 60 + input.seconds;
}

/** Format a duration in seconds as "H:MM:SS" (e.g. 5430 → "1:30:30"). Rounds to the nearest second. */
export function formatHMS(seconds: number): string {
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
