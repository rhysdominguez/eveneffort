// Builds per-kilometre (km mode) or per-mile (miles mode) segments from a course's
// absolute elevation array. All Segment fields are km-denominated regardless of unit.
import type { Segment, Unit } from "@/types";

export const MARATHON_KM = 42.195;
export const MILE_IN_KM = 1.609344;

/**
 * Linearly interpolate an absolute elevation (m) at an arbitrary distance (km)
 * from the 44-point integer-km elevation array. Index i maps to km i for
 * i = 0..42; index 43 maps to the finish at 42.195 km.
 */
export function interpolateElevation(
  elevations: number[],
  distanceKm: number,
): number {
  if (distanceKm <= 0) return elevations[0];
  if (distanceKm >= MARATHON_KM) return elevations[43];
  if (distanceKm <= 42) {
    const lower = Math.floor(distanceKm);
    if (lower === distanceKm) return elevations[lower];
    const frac = distanceKm - lower;
    return elevations[lower] + frac * (elevations[lower + 1] - elevations[lower]);
  }
  // Final stretch: between km 42 (index 42) and 42.195 km (index 43), span 0.195 km.
  const frac = (distanceKm - 42) / (MARATHON_KM - 42);
  return elevations[42] + frac * (elevations[43] - elevations[42]);
}

/**
 * Light 3-tap moving average (weights 0.25, 0.5, 0.25) over the 44-point
 * elevation array, with both endpoints preserved exactly. Removes the
 * high-frequency digitization noise in the per-km source data (which otherwise
 * aliases into jittery adjacent-segment grades) while keeping real hills and
 * the net drop intact. Operates on a copy — the stored course JSON is never
 * mutated, so the "exactly 44 finite numbers" integrity rule still holds.
 */
export function smoothElevations(elevations: number[]): number[] {
  const n = elevations.length;
  if (n < 3) return elevations.slice();
  const out = elevations.slice();
  for (let i = 1; i < n - 1; i++) {
    out[i] =
      0.25 * elevations[i - 1] +
      0.5 * elevations[i] +
      0.25 * elevations[i + 1];
  }
  return out;
}

function makeSegment(
  index: number,
  startKm: number,
  endKm: number,
  startElevationM: number,
  endElevationM: number,
): Segment {
  const lengthKm = endKm - startKm;
  const elevationDeltaM = endElevationM - startElevationM;
  return {
    index,
    startDistanceKm: startKm,
    endDistanceKm: endKm,
    lengthKm,
    startElevationM,
    endElevationM,
    elevationDeltaM,
    gradient: elevationDeltaM / (lengthKm * 1000),
  };
}

/**
 * Build the segment list for a course.
 * - km mode: 43 segments — [0,1]…[41,42] then [42, 42.195].
 * - miles mode: 27 segments — 26 full miles then a [41.842944, 42.195] km tail.
 */
export function buildSegments(elevations: number[], unit: Unit): Segment[] {
  if (elevations.length !== 44) {
    throw new Error("Elevations array must have exactly 44 entries");
  }

  // Smooth the noisy per-km source before deriving grades (endpoints + net
  // drop preserved). The raw JSON on disk is untouched.
  elevations = smoothElevations(elevations);

  const segments: Segment[] = [];

  if (unit === "km") {
    for (let i = 0; i < 42; i++) {
      segments.push(makeSegment(i, i, i + 1, elevations[i], elevations[i + 1]));
    }
    segments.push(
      makeSegment(42, 42, MARATHON_KM, elevations[42], elevations[43]),
    );
    return segments;
  }

  // miles mode
  for (let i = 0; i < 26; i++) {
    const startKm = i * MILE_IN_KM;
    const endKm = (i + 1) * MILE_IN_KM;
    segments.push(
      makeSegment(
        i,
        startKm,
        endKm,
        interpolateElevation(elevations, startKm),
        interpolateElevation(elevations, endKm),
      ),
    );
  }
  const tailStartKm = 26 * MILE_IN_KM; // 41.842944
  segments.push(
    makeSegment(
      26,
      tailStartKm,
      MARATHON_KM,
      interpolateElevation(elevations, tailStartKm),
      elevations[43],
    ),
  );
  return segments;
}
