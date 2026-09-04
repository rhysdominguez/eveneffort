// Fill missing elevation without spending 30 seconds on it.
//
// scripts/import/elevate.ts queries the DEM at every track point, which is
// right for a build-time import: a marathon is ~3,000 points, that is ~30
// sequential rate-limited requests, and nobody is waiting. The upload route
// cannot do that — a runner is holding an open request.
//
// So sample the model on a decimated track instead and interpolate back. The
// error this introduces is bounded by how much real terrain hides between two
// samples 100 m apart, which is small next to the error already inherent in
// reading a terrain model rather than the road surface (see elevate.ts's
// calibration note: bridges cost 17 s of split drift on newyork, and that is
// the dominant term by far). Sampling density is not what limits this number.
import { lookupElevations, OPENTOPODATA, type DemProvider } from "./dem.ts";
import { haversine } from "./resample.ts";
import type { RoutePoint } from "./routeFile.ts";

/** Target spacing between DEM samples, metres. */
export const DECIMATE_SPACING_M = 100;

/**
 * Hard ceiling on DEM samples for one upload. At 100 m spacing a marathon
 * needs ~423, so this is headroom rather than a constraint — it exists so a
 * pathological file cannot turn one request into hundreds of API calls.
 */
export const MAX_DEM_SAMPLES = 600;

/**
 * Indices to sample: always the first and last point, then every point that is
 * at least `spacing` further along than the last one taken.
 */
export function decimateIndices(
  points: readonly RoutePoint[],
  spacingM = DECIMATE_SPACING_M,
): number[] {
  const keep = [0];
  let sinceLast = 0;
  for (let i = 1; i < points.length; i += 1) {
    sinceLast += haversine(
      points[i - 1].lat,
      points[i - 1].lon,
      points[i].lat,
      points[i].lon,
    );
    if (sinceLast >= spacingM) {
      keep.push(i);
      sinceLast = 0;
    }
  }
  const last = points.length - 1;
  if (keep[keep.length - 1] !== last) keep.push(last);

  // Thin further if the route is dense enough to blow the sample ceiling.
  if (keep.length > MAX_DEM_SAMPLES) {
    const stride = Math.ceil(keep.length / MAX_DEM_SAMPLES);
    const thinned = keep.filter((_, i) => i % stride === 0);
    if (thinned[thinned.length - 1] !== last) thinned.push(last);
    return thinned;
  }
  return keep;
}

/**
 * Look up elevation on a decimated track and interpolate it across the rest.
 *
 * Interpolation is linear in POINT INDEX between two sampled indices, not in
 * distance. The two agree closely because decimation is itself distance-based,
 * and index is what the resampler consumes next.
 */
export async function fillElevationDecimated(
  points: readonly RoutePoint[],
  provider: DemProvider = OPENTOPODATA,
): Promise<RoutePoint[]> {
  const idx = decimateIndices(points);
  const sampled = await lookupElevations(
    idx.map((i) => [points[i].lat, points[i].lon] as [number, number]),
    provider,
  );

  const out: RoutePoint[] = points.map((p) => ({ ...p }));
  for (let k = 0; k < idx.length - 1; k += 1) {
    const [lo, hi] = [idx[k], idx[k + 1]];
    const [eLo, eHi] = [sampled[k], sampled[k + 1]];
    const span = hi - lo;
    for (let i = lo; i <= hi; i += 1) {
      out[i].ele = span === 0 ? eLo : eLo + ((i - lo) / span) * (eHi - eLo);
    }
  }
  out[0].ele = sampled[0];
  out[points.length - 1].ele = sampled[sampled.length - 1];
  return out;
}
