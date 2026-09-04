// The 44-point resampler: an arbitrary route file's track points in, the three
// geometry arrays the pacing engine and the chart need out.
//
// THIS IS A PORT OF scripts/gpx_parser/parse_gpx.py, AND IT MUST STAY ONE.
// That script is still the build-time tool for the seeded catalog (CLAUDE.md
// Rule 7); this module is the runtime path for an uploaded course, which cannot
// shell out to Python on Vercel. Two implementations of one algorithm is a
// standing drift risk, so conformance.test.ts re-derives real committed courses
// through this module and asserts byte-equality with the JSON the Python wrote.
// If that test fails, this file is wrong — never the constants, and never the
// committed course data.
//
// Every constant below is quoted from the Python with its line reference, and
// the reasoning for the distance window in particular lives there (a 100-line
// comment recording two deliberate widenings and the loss clusters that
// justified each). Do not move a number here without moving it there.

import type { RoutePoint } from "./routeFile.ts";

/** 0, 1, 2 … 42 km, then the finish. Exactly 44 marks. (parse_gpx.py:35) */
export const TARGETS_M: readonly number[] = [
  ...Array.from({ length: 43 }, (_, km) => km * 1000),
  42195,
];

/** Mean-Earth radius, matching the Python. Deliberately not WGS84. (:37) */
const EARTH_RADIUS_M = 6_371_000;

/** Largest legitimate gap between consecutive track points. (:52) */
const MAX_STEP_M = 5000;

/** Centred moving-average width for elevation smoothing. (:234) */
const SMOOTH_WINDOW_M = 200;

/** Below this a file is not a course line, it is a sketch. (:150) */
export const MIN_POINTS = 100;

/** Hard reject outside this window. (:214) */
export const DISTANCE_MIN_KM = 41.5;
export const DISTANCE_MAX_KM = 43.6;

/** Warn but continue outside this one. (:218) */
export const WARN_MIN_KM = 42.0;
export const WARN_MAX_KM = 42.4;

/**
 * Every rejection the Python raises as ValueError arrives here as this, so the
 * upload route can turn a parser verdict into a 400 with the runner's actual
 * problem in it rather than a generic failure.
 */
export class CourseParseError extends Error {}

export interface CourseGeometry {
  /** 44 smoothed elevations in metres, 1 dp — the pacing engine's only input. */
  elevations: number[];
  /** 44 [lat, lon] pairs at the same marks, 6 dp — drives wind bearings. */
  coords: [number, number][];
  /** Dense [distanceKm, elevationM], unsmoothed. Presentational only. */
  profile: [number, number][];
  /** Measured route length in metres, unrounded. */
  distanceM: number;
  /** Non-fatal notes — an off-band length, a clamped target. */
  warnings: string[];
}

/**
 * Round half to EVEN, the way Python's round() does, on the exact binary value.
 *
 * This is the one place the port could silently diverge and it is worth the
 * care. JavaScript's toFixed rounds half AWAY FROM ZERO; Python rounds half to
 * even. They agree on almost every value, because an exact decimal tie needs
 * the double to be exactly representable at a half in the last kept place — but
 * those are reachable here, not theoretical: a smoothed elevation is a mean of
 * a handful of one-decimal readings, so 66.25 turns up, and Python writes 66.2
 * where toFixed writes 66.3. One such point in a committed course file is
 * enough to fail conformance.
 *
 * toFixed(25) gives the exact decimal expansion of the double (a double's
 * expansion is finite, and 25 places is past anything these magnitudes reach),
 * so the digits after the cut can be inspected directly: exactly "5" followed
 * by nothing but zeros is the tie, and only then does parity decide.
 */
export function roundHalfEven(value: number, dp: number): number {
  if (!Number.isFinite(value)) return value;

  const neg = value < 0;
  const s = Math.abs(value).toFixed(25);
  const dot = s.indexOf(".");
  const digits = s.slice(0, dot) + s.slice(dot + 1);
  const cut = dot + dp; // number of digits kept

  const kept = digits.slice(0, cut);
  const rest = digits.slice(cut);

  let roundUp: boolean;
  if (rest === "" || rest[0] < "5") {
    roundUp = false;
  } else if (rest[0] > "5") {
    roundUp = true;
  } else if (/[1-9]/.test(rest.slice(1))) {
    roundUp = true; // past the halfway point, not on it
  } else {
    // Exactly halfway: keep the last kept digit even.
    roundUp = (Number(kept[kept.length - 1] ?? "0") & 1) === 1;
  }

  const magnitude = (Number(kept) + (roundUp ? 1 : 0)) / 10 ** dp;
  // -0 is not a value any of these arrays should carry.
  return neg && magnitude !== 0 ? -magnitude : magnitude;
}

/** Great-circle distance in metres. (parse_gpx.py:64-74) */
export function haversine(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dphi = ((lat2 - lat1) * Math.PI) / 180;
  const dlambda = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dphi / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dlambda / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

interface Cumulative {
  /** Cumulative distance in metres, monotonically non-decreasing. */
  dists: number[];
  elevs: number[];
  latlon: [number, number][];
}

/**
 * Walk the track accumulating distance. Index-aligned with the input, and the
 * first point seeds distance 0 rather than being skipped. (parse_gpx.py:157-165)
 */
export function cumulativeProfile(points: readonly RoutePoint[]): Cumulative {
  const dists = [0];
  const elevs = [points[0].ele as number];
  const latlon: [number, number][] = [[points[0].lat, points[0].lon]];

  let cum = 0;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const cur = points[i];
    cum += haversine(prev.lat, prev.lon, cur.lat, cur.lon);
    dists.push(cum);
    elevs.push(cur.ele as number);
    latlon.push([cur.lat, cur.lon]);
  }
  return { dists, elevs, latlon };
}

/**
 * 200 m centred moving average of elevation, keyed on cumulative distance
 * rather than on index, so a densely sampled stretch is not smoothed harder
 * than a sparse one in distance terms. (parse_gpx.py:233-263)
 *
 * Note the asymmetric bounds — right inclusive, left exclusive — and that the
 * mean is over the POINT COUNT in the window, not distance-weighted. Both are
 * quirks of the original and both are load-bearing for conformance.
 */
export function smoothElevations(
  dists: readonly number[],
  elevs: readonly number[],
  windowM: number = SMOOTH_WINDOW_M,
): number[] {
  const n = dists.length;
  const half = windowM / 2;
  const smoothed: number[] = [];
  let left = 0;
  let right = 0;
  let windowSum = 0;

  for (let i = 0; i < n; i += 1) {
    const center = dists[i];
    const lo = center - half;
    const hi = center + half;
    while (right < n && dists[right] <= hi) {
      windowSum += elevs[right];
      right += 1;
    }
    while (left < n && dists[left] < lo) {
      windowSum -= elevs[left];
      left += 1;
    }
    smoothed.push(windowSum / (right - left));
  }
  return smoothed;
}

/**
 * Linearly interpolate a per-point value at each target distance.
 *
 * The cursor advances across ALL targets and is never reset, which is only
 * correct because the targets ascend — the same contract the Python states.
 * (parse_gpx.py:266-341, whose two samplers differ solely in what they carry.)
 */
function sampleAt<T>(
  dists: readonly number[],
  targets: readonly number[],
  atIndex: (i: number) => T,
  lerp: (a: T, b: T, frac: number) => T,
  onClamp: (target: number, total: number) => void,
): T[] {
  const n = dists.length;
  const total = dists[n - 1];
  const out: T[] = [];
  let cursor = 0;

  for (const d of targets) {
    if (d <= 0) {
      out.push(atIndex(0));
      continue;
    }
    if (d > total) {
      onClamp(d, total);
      out.push(atIndex(n - 1));
      continue;
    }
    while (cursor < n - 1 && dists[cursor + 1] < d) cursor += 1;
    const span = dists[cursor + 1] - dists[cursor];
    if (span <= 0) {
      // Duplicate distances: nothing to interpolate across.
      out.push(atIndex(cursor));
    } else {
      const frac = (d - dists[cursor]) / span;
      out.push(lerp(atIndex(cursor), atIndex(cursor + 1), frac));
    }
  }
  return out;
}

/** Smoothed elevation at each target, 1 dp. (parse_gpx.py:266-304) */
export function sampleAtDistances(
  dists: readonly number[],
  smoothed: readonly number[],
  targets: readonly number[],
  warnings: string[] = [],
): number[] {
  return sampleAt<number>(
    dists,
    targets,
    (i) => smoothed[i],
    (a, b, frac) => a + frac * (b - a),
    (target, total) =>
      warnings.push(
        `target ${target.toFixed(0)} m exceeds route length ${total.toFixed(1)} m ` +
          `— clamping to the last point (the route is short)`,
      ),
  ).map((v) => roundHalfEven(v, 1));
}

/** [lat, lon] at each target, 6 dp (~0.1 m). (parse_gpx.py:307-341) */
export function sampleLatLon(
  dists: readonly number[],
  latlon: readonly [number, number][],
  targets: readonly number[],
): [number, number][] {
  return sampleAt<[number, number]>(
    dists,
    targets,
    (i) => latlon[i],
    (a, b, frac) => [a[0] + frac * (b[0] - a[0]), a[1] + frac * (b[1] - a[1])],
    // The Python clamps silently here; the elevation sampler already warned.
    () => {},
  ).map(([lat, lon]) => [roundHalfEven(lat, 6), roundHalfEven(lon, 6)]);
}

/**
 * Dense, unsmoothed [distanceKm, elevationM] for the chart. Every track point
 * is kept except those that would break strict ascent. (parse_gpx.py:344-375)
 *
 * The ascent test compares the ROUNDED distance, which is what actually gets
 * written: testing the unrounded value let two points 0.05 m apart both through
 * and they then collided at 4 dp. Gothenburg, at 4193 points, was the first
 * course dense enough to produce one.
 */
export function buildProfile(
  dists: readonly number[],
  elevs: readonly number[],
): [number, number][] {
  const profile: [number, number][] = [];
  let lastDist = -1;
  for (let i = 0; i < dists.length; i += 1) {
    const distKm = roundHalfEven(dists[i] / 1000, 4);
    if (distKm <= lastDist) continue;
    profile.push([distKm, roundHalfEven(elevs[i], 1)]);
    lastDist = distKm;
  }
  return profile;
}

/**
 * The whole pipeline: validated track points in, geometry out.
 *
 * Throws CourseParseError with the Python's own wording for every rejection, so
 * a runner who uploads a 48 km trail race is told the measured length and the
 * window, not "invalid file".
 */
export function resampleCourse(points: readonly RoutePoint[]): CourseGeometry {
  const warnings: string[] = [];

  if (points.length < MIN_POINTS) {
    throw new CourseParseError(
      `only ${points.length} track points (need at least ${MIN_POINTS})`,
    );
  }
  const missing = points.findIndex((p) => p.ele === null || !Number.isFinite(p.ele));
  if (missing >= 0) {
    throw new CourseParseError(`track point ${missing} is missing elevation`);
  }

  const { dists, elevs, latlon } = cumulativeProfile(points);

  let worstGap = 0;
  let worstIdx = -1;
  for (let i = 1; i < dists.length; i += 1) {
    const gap = dists[i] - dists[i - 1];
    if (gap > worstGap) {
      worstGap = gap;
      worstIdx = i;
    }
  }
  if (worstGap > MAX_STEP_M) {
    throw new CourseParseError(
      `${worstGap.toFixed(0)} m jump between track points ${worstIdx - 1} and ` +
        `${worstIdx} (max ${MAX_STEP_M}) — the track looks stitched or discontinuous`,
    );
  }

  const distanceM = dists[dists.length - 1];
  const totalKm = distanceM / 1000;
  if (totalKm < DISTANCE_MIN_KM || totalKm > DISTANCE_MAX_KM) {
    throw new CourseParseError(
      `total route length ${totalKm.toFixed(3)} km is outside ` +
        `[${DISTANCE_MIN_KM}, ${DISTANCE_MAX_KM}] km — this tool builds marathon ` +
        `pacing charts, so the route has to be a marathon`,
    );
  }
  if (totalKm < WARN_MIN_KM || totalKm > WARN_MAX_KM) {
    warnings.push(
      `route length ${totalKm.toFixed(3)} km is outside the expected ` +
        `[${WARN_MIN_KM}, ${WARN_MAX_KM}] km band`,
    );
  }

  const smoothed = smoothElevations(dists, elevs);
  const elevations = sampleAtDistances(dists, smoothed, TARGETS_M, warnings);
  const coords = sampleLatLon(dists, latlon, TARGETS_M);
  const profile = buildProfile(dists, elevs);

  if (profile.length < MIN_POINTS) {
    throw new CourseParseError(
      `profile has only ${profile.length} points (need at least ${MIN_POINTS})`,
    );
  }

  return { elevations, coords, profile, distanceM, warnings };
}
