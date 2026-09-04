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

/**
 * A GAP between two times, as "M:SS" — or "H:MM:SS" once it passes an hour.
 *
 * Distinct from `formatHMS` because these are differences, not finish times: a
 * two-minute buffer under a Boston standard reads as "2:14", where the leading
 * "0:" of a full H:MM:SS invites reading it as hours. Always a magnitude — the
 * caller supplies the sign or the word, since "under"/"over" carries the
 * direction better than a minus does.
 */
export function formatGap(seconds: number): string {
  const total = Math.round(Math.abs(seconds));
  if (total >= 3600) return formatHMS(total);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * A signed difference between two times: "+5:22", "−1:04:09", "—" at zero.
 *
 * Unlike `formatHMS` this DROPS a zero hour. A course conversion is usually
 * minutes apart, and "0:05:22" reads as a duration someone ran rather than a
 * gap between two of them — which matters most in /compare's 326-row table,
 * where the leading "0:" would repeat on nearly every line.
 *
 * True minus sign (−, U+2212), matching `formatSignedFeet` in
 * src/lib/chart/geometry.ts. SummaryHeader has an older inline version of this
 * idea that keeps the hour; it is a single headline figure rather than a
 * column, so it was left as it was rather than churn a shipped panel.
 */
export function formatSignedHMS(seconds: number): string {
  const total = Math.round(seconds);
  if (total === 0) return "—";
  const abs = Math.abs(total);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  const sign = total > 0 ? "+" : "−";
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return h > 0
    ? `${sign}${h}:${mm}:${String(s).padStart(2, "0")}`
    : `${sign}${mm}:${String(s).padStart(2, "0")}`;
}
