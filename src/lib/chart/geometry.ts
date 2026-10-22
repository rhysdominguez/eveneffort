// Pure pointer→data math for the interactive elevation chart. Kept out of the
// component because jsdom stubs out everything the DOM side needs
// (getBoundingClientRect returns zeros, getScreenCTM is unimplemented), so this
// is the only layer that can be unit tested directly.
import type { PaceChartRow, Unit } from "@/types";
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
 * Which of `count` equal-width columns a pointer is over, clamped to the plot.
 *
 * The race-splits chart hovers by COLUMN rather than by bar: a bar that costs
 * a second is a hairline and a bar has gaps either side, and neither can be
 * aimed at. `left` and `width` are the plot's bounding box, read by the caller
 * because jsdom returns zeros for it, which is why the arithmetic lives here.
 * Null when there is nothing to hover.
 */
export function columnIndexAtX(
  x: number,
  left: number,
  width: number,
  count: number,
): number | null {
  if (count <= 0 || !(width > 0)) return null;
  const frac = (x - left) / width;
  if (!Number.isFinite(frac)) return null;
  return Math.min(count - 1, Math.max(0, Math.floor(frac * count)));
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

/**
 * The INCLUSIVE row range covering a distance range, e.g. a hill's [27, 34).
 *
 * `rowIndexForDistance` is half-open by design — row i spans [i·unit, (i+1)·unit)
 * — so feeding it a range's END returns the row that STARTS there, one past the
 * last row the range actually covers. Boston's Newton climb spans km 27 to 34
 * and occupies rows 27..33; the naive call returns 34, and the panel would print
 * a pace from a kilometre the runner has already finished climbing. Nearly every
 * course would be wrong by one row, which is exactly the kind of off-by-one that
 * reads as plausible and never gets caught by eye.
 *
 * In km mode this is the identity on whole-kilometre ranges: subtracting an
 * epsilon lands inside the last covered row. In miles mode the rows are wider
 * than the range's own units, so a range can CLIP a row at either end; a row the
 * range covers less than half of is dropped, provided that leaves at least one
 * row. A range shorter than a row always returns that one row, however little of
 * it is covered, because "no rows" is not an answer the caller can print.
 */
export function rowRangeForDistanceRange(
  startKm: number,
  endKm: number,
  unit: Unit,
  rowCount: number,
): [number, number] | null {
  if (rowCount <= 0) return null;
  const unitKm = unit === "km" ? 1 : MILE_IN_KM;
  const first = rowIndexForDistance(startKm, unit, rowCount);
  // The epsilon keeps a range ending exactly on a row boundary inside the row
  // below it. 1e-6 km is a millimetre: far under any real course's precision,
  // and far over the float dust in 26 x 1.609344.
  const last = rowIndexForDistance(
    Math.max(endKm - 1e-6, startKm),
    unit,
    rowCount,
  );
  if (last <= first) return [first, last];

  // A row's real span, which is NOT unitKm for the final partial row: km row 42
  // is the 0.195 stub and mile row 26 is 0.352 km. Measuring coverage against
  // the nominal width would drop the finish row from every climb that reaches
  // the line.
  const coverage = (row: number) => {
    const rowStartKm = row * unitKm;
    const rowEndKm = Math.min((row + 1) * unitKm, MARATHON_KM);
    const span = rowEndKm - rowStartKm;
    if (span <= 0) return 1;
    const overlap =
      Math.min(endKm, rowEndKm) - Math.max(startKm, rowStartKm);
    return overlap / span;
  };

  let lo = first;
  let hi = last;
  if (hi > lo && coverage(hi) < 0.5) hi -= 1;
  if (hi > lo && coverage(lo) < 0.5) lo += 1;
  return [lo, hi];
}

/**
 * The average pace over an inclusive row range, in seconds per displayed unit:
 * the time the plan spends on those rows over the distance they cover.
 *
 * Read off the rows' own `cumulativeSplitSeconds`, so it is the same running
 * total the splits table prints and cannot disagree with it, weather included.
 * Nothing is re-derived from the pacing model. The distance is each row's real
 * span, which matters for the last row: km row 42 is 0.195 km and mile row 26 is
 * about 0.22 mi, and counting either as a whole unit would drag the average of any
 * climb that reaches the finish.
 *
 * Null for an empty or out-of-range selection, so a caller prints nothing
 * rather than a NaN.
 */
export function averagePaceOverRows(
  rows: PaceChartRow[],
  range: [number, number],
  unit: Unit,
): number | null {
  const [first, last] = range;
  if (first < 0 || last >= rows.length || first > last) return null;

  const unitKm = unit === "km" ? 1 : MILE_IN_KM;
  const startKm = first * unitKm;
  const endKm = Math.min((last + 1) * unitKm, MARATHON_KM);
  const distanceInUnits = (endKm - startKm) / unitKm;
  if (!(distanceInUnits > 0)) return null;

  const elapsed =
    rows[last].cumulativeSplitSeconds -
    (first > 0 ? rows[first - 1].cumulativeSplitSeconds : 0);
  return elapsed / distanceInUnits;
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
