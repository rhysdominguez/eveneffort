// Decide whether a route needs DEM elevation, and fill it if so.
//
// dem.ts is the transport; this is the policy. Kept separate because the
// question "should this course get modelled elevation at all" has a real answer
// that is not "whenever the field is empty".
//
// The CLI wrapper for spot-checking one file lives in scripts/import/elevate.ts.
//
// Calibration (scripts/import/calibrate-dem.ts, run 2026-08-17 against six
// surveyed courses spanning dead-flat to 2350 m of gain) measured what this
// costs on a 4:00 paceband: ~0.9 s/km mean pace drift and under 6 s of
// cumulative split drift on five of six courses. The exception was newyork at
// 17.4 s — five bridges, and a terrain model reads the water under them, not the
// deck. Hence NEEDS_REVIEW_M below, and hence surveyed elevation always wins
// when the source file actually has it.

import { OPENTOPODATA, lookupElevations, type DemProvider } from "./dem.ts";
import { type RoutePoint } from "./routeFile.ts";

/** How a course's elevation was obtained. Recorded per course; never guessed. */
export type ElevationSource = "gpx" | `dem:${string}`;

/**
 * A single-point jump this large is the bridge signature: the model steps off
 * the deck and reads the river. It does not invalidate the course, but a human
 * should look before the slug ships.
 */
const NEEDS_REVIEW_M = 25;

export interface ElevationOutcome {
  points: RoutePoint[];
  source: ElevationSource;
  /** Non-fatal notes for the QA step to surface. */
  warnings: string[];
}

/**
 * True when the source file has no usable elevation.
 *
 * An all-zero track counts as missing: exporters that drop elevation commonly
 * write 0 rather than omitting the tag, and a marathon that is genuinely at
 * exactly sea level for every single point does not exist.
 */
export function lacksElevation(points: readonly RoutePoint[]): boolean {
  if (points.some((p) => p.ele === null)) return true;
  return points.every((p) => p.ele === 0);
}

export async function ensureElevation(
  points: RoutePoint[],
  options: {
    provider?: DemProvider;
    /** Refill even when the file already carries elevation. */
    force?: boolean;
    onProgress?: (done: number, total: number) => void;
  } = {},
): Promise<ElevationOutcome> {
  const provider = options.provider ?? OPENTOPODATA;
  const warnings: string[] = [];

  if (!options.force && !lacksElevation(points)) {
    return { points, source: "gpx", warnings };
  }

  const elevations = await lookupElevations(
    points.map((p) => [p.lat, p.lon] as [number, number]),
    provider,
    options.onProgress,
  );

  let biggestJump = 0;
  for (let i = 1; i < elevations.length; i += 1) {
    biggestJump = Math.max(biggestJump, Math.abs(elevations[i] - elevations[i - 1]));
  }
  if (biggestJump >= NEEDS_REVIEW_M) {
    warnings.push(
      `DEM elevation jumps ${biggestJump.toFixed(0)} m between adjacent points — ` +
        `likely a bridge, tunnel or urban canyon the terrain model reads through. ` +
        `Check the profile before promoting.`,
    );
  }

  return {
    points: points.map((p, i) => ({ ...p, ele: elevations[i] })),
    source: `dem:${provider.id}`,
    warnings,
  };
}
