// Pure pointer→data math for the interactive elevation chart. Kept out of the
// component because jsdom stubs out everything the DOM side needs
// (getBoundingClientRect returns zeros, getScreenCTM is unimplemented), so this
// is the only layer that can be unit tested directly.
import type { Unit } from "@/types";
import { MARATHON_KM, MILE_IN_KM } from "@/lib/pacing/segments";

/**
 * Clip a raw profile to the certified marathon distance.
 *
 * A digitized or GPS-built course line runs long against the officially
 * certified shortest-possible route — 249 of the repo's courses end past
 * 42.195 km, Palma by 1.33 km — so plotting the track verbatim made the chart
 * axis disagree with the "42.20 km" the rest of the page shows. The overshoot
 * is measurement slop at the finish, not extra course, so it is cut from the
 * end, with a linearly interpolated point placed exactly on the finish line so
 * the trace still reaches it.
 *
 * A track that ends SHORT is returned untouched: inventing a tail out to
 * 42.195 would be drawing elevation nobody recorded. Those charts stop just
 * inside the right edge.
 */
export function truncateProfileToMarathon(
  profile: [number, number][],
): [number, number][] {
  if (profile.length === 0) return profile;
  if (profile[profile.length - 1][0] <= MARATHON_KM) return profile;

  const cut = profile.findIndex(([distKm]) => distKm > MARATHON_KM);
  // A profile whose very first point is past the line has nothing to keep —
  // leave it alone rather than returning an empty chart.
  if (cut <= 0) return profile;

  const kept = profile.slice(0, cut);
  const [d0, e0] = profile[cut - 1];
  // Already lands on the finish line; `kept` includes it.
  if (d0 === MARATHON_KM) return kept;

  const [d1, e1] = profile[cut];
  const frac = (MARATHON_KM - d0) / (d1 - d0);
  kept.push([MARATHON_KM, e0 + (e1 - e0) * frac]);
  return kept;
}

/**
 * Inverse of the chart's `x()` projection: turn a viewBox x coordinate back
 * into a course distance in km, clamped to the course.
 */
export function distanceAtViewBoxX(
  svgX: number,
  maxDistKm: number,
  plotLeft: number,
  plotWidth: number,
): number {
  const frac = (svgX - plotLeft) / plotWidth;
  if (!Number.isFinite(frac) || frac <= 0) return 0;
  if (frac >= 1) return maxDistKm;
  return frac * maxDistKm;
}

/**
 * Index of the trackpoint nearest `distKm` in a monotonically increasing
 * distance column. Binary search, not a scan — this runs on every mousemove
 * and the densest course carries ~2900 points.
 */
export function nearestPointIndex(distances: number[], distKm: number): number {
  const n = distances.length;
  if (n === 0) return -1;
  if (distKm <= distances[0]) return 0;
  if (distKm >= distances[n - 1]) return n - 1;

  let lo = 0;
  let hi = n - 1;
  // Narrow to the bracketing pair [lo, lo + 1].
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (distances[mid] <= distKm) lo = mid;
    else hi = mid;
  }
  return distKm - distances[lo] <= distances[hi] - distKm ? lo : hi;
}

/**
 * Which pace-chart row covers a distance. `PaceChartRow` carries no distance
 * field, so the mapping has to be reconstructed: row i spans
 * [i * unitKm, (i + 1) * unitKm), with the final partial segment clamped.
 */
export function rowIndexForDistance(
  distKm: number,
  unit: Unit,
  rowCount: number,
): number {
  if (rowCount <= 0) return -1;
  const unitKm = unit === "km" ? 1 : MILE_IN_KM;
  const idx = Math.floor(Math.max(distKm, 0) / unitKm);
  return Math.min(idx, rowCount - 1);
}

/** Elevation readout, always feet — matches the chart's y axis. */
export function formatFeet(ft: number): string {
  return `${Math.round(ft)} ft`;
}

/**
 * Signed elevation delta for a selected range. Uses a true minus sign (−) to
 * match the delta formatting in SummaryHeader.
 */
export function formatSignedFeet(ft: number): string {
  const rounded = Math.round(ft);
  if (rounded > 0) return `+${rounded} ft`;
  if (rounded < 0) return `−${Math.abs(rounded)} ft`;
  return "0 ft";
}

/** Distance readout in the user's unit, e.g. "12.4 km" / "7.7 mi". */
export function formatChartDistance(distKm: number, unit: Unit): string {
  return unit === "km"
    ? `${distKm.toFixed(1)} km`
    : `${(distKm / MILE_IN_KM).toFixed(1)} mi`;
}
