// The course's SHAPE — the Strava-style silhouette — as a simplified polyline
// and as an SVG path. ROADMAP #21.
//
// WHY THIS EXISTS AT ALL. Nothing already stored can draw a course outline.
// `coords` is 44 [lat, lon] pairs, one per kilometre, which exists to give each
// segment a wind bearing; drawn at thumbnail size a city marathon becomes a
// 44-gon with every turn between samples gone. `profile` is dense but carries
// no coordinates. The full track lives only in data/gpx_sources/*.gpx, 24 MB
// that never reaches the app. So the outline is precomputed here and stored.
//
// THE TOLERANCE IS RELATIVE, AND THEN CAPPED IN METRES. Ramer-Douglas-Peucker
// at a fixed metre epsilon over-simplifies a compact city loop and
// under-simplifies a point-to-point that spans 40 km of bounding box, so the
// bounding box is normalised to a unit square first and epsilon is a fraction
// of the RENDERED thumbnail. That alone was the whole rule until ROADMAP #22
// put the same polyline on a real basemap, where 0.2% of Boston's 35 km box
// turned out to be 70 m on the ground and the route ran through the houses
// beside Route 135 rather than along it. OUTLINE_MAX_DEVIATION_M is the second
// limit that fixes it; see its comment for why both are needed.
//
// Measured over all 326 seeded courses at the tuned pair:
//
//   points   median 231   max 834   (from median 812 raw trackpoints)
//   bytes    median ~4.7 KB          max ~18 KB at 5dp
//   error    max ~6 m from the source track, by construction
//
// and at 200x140 the simplified path is visually indistinguishable from the
// full track on both the twistiest seeded course (bilbao-night-marathon,
// tortuosity 9.4) and the simplest (alexander-the-great-marathon, 0.8). That
// check is the one ROADMAP #21 asked for before any of this was built; it
// passed, so the tolerance is a pair of constants rather than a per-course one.
//
// NOT A PYTHON JOB, deliberately, and this is the one piece of the GPX pipeline
// that is not. Rule 7 makes scripts/gpx_parser/ the only Python because app
// code is TypeScript; the resampler had to be mirrored into TS anyway for the
// upload route, and pays for it with conformance.test.ts. The outline skips
// that cost entirely: parseRouteFile already reads GPX in TypeScript, so
// scripts/build-outlines.ts and the upload route run THIS function, one
// implementation, nothing to hold in step.

/** RDP tolerance, as a fraction of the outline's longer side. */
export const OUTLINE_EPSILON = 0.002;

/**
 * The most an outline is allowed to wander from the real track, in metres,
 * whatever the relative tolerance works out to. The effective epsilon is the
 * tighter of the two.
 *
 * WHY A SECOND, ABSOLUTE LIMIT. A purely relative tolerance is the right thing
 * for a thumbnail and the wrong thing for a map: 0.2% of Boston's 35 km
 * bounding box is 70 m on the ground, so the silhouette that reads perfectly
 * at 200x140 sits a street and a half off Route 135 when the same polyline is
 * drawn over real tiles on /results (ROADMAP #22). Compact courses never hit
 * this cap, because 0.2% of a 6 km box is already 12 m; it binds on the long
 * point-to-points, which are exactly the ones that looked wrong.
 *
 * 6 m rather than 1 m because the source tracks themselves sample every 20-30
 * m: below this the simplification is no longer the thing limiting accuracy,
 * and the bytes buy nothing. Measured over all 326 seeded courses it costs
 * about 10% on the total outline payload.
 */
export const OUTLINE_MAX_DEVIATION_M = 6;

/**
 * Metres per degree of latitude, for converting the cap into projected units.
 * The projection scales longitude by cos(lat) precisely so one constant serves
 * both axes.
 */
const METRES_PER_DEGREE = 110_540;

/**
 * Stored decimal places for lat/lon. 5dp is ~1 m, far finer than a tolerance
 * that discards anything under 0.2% of the bounding box, and it is what keeps
 * the stored row in single-digit KB.
 */
export const OUTLINE_PRECISION = 5;

/** Below this many trackpoints there is no shape worth storing. */
export const OUTLINE_MIN_POINTS = 8;

/** A stored outline: [lat, lon] pairs, start first, finish last. */
export type Outline = [number, number][];

interface LatLon {
  lat: number;
  lon: number;
}

interface XY {
  x: number;
  y: number;
}

/**
 * Equirectangular projection, the same one the roadmap specifies: scale
 * longitude by cos(mean latitude) so a degree of longitude and a degree of
 * latitude cover comparable ground. Over 42 km the distortion against a proper
 * projection is far below one thumbnail pixel.
 *
 * y is NEGATED because SVG's y axis points down while latitude points up.
 */
function project(points: readonly LatLon[]): XY[] {
  const meanLat =
    points.reduce((sum, p) => sum + p.lat, 0) / points.length;
  const k = Math.cos((meanLat * Math.PI) / 180);
  return points.map((p) => ({ x: p.lon * k, y: -p.lat }));
}

/**
 * Scale so the longer side of the bounding box is exactly 1, and report the
 * divisor. The caller needs it to convert the metre cap below into the same
 * normalised units epsilon is measured in.
 */
function normalize(points: readonly XY[]): { points: XY[]; scale: number } {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const spanX = Math.max(...xs) - Math.min(...xs);
  const spanY = Math.max(...ys) - Math.min(...ys);
  const scale = Math.max(spanX, spanY) || 1;
  return {
    points: points.map((p) => ({ x: p.x / scale, y: p.y / scale })),
    scale,
  };
}

/**
 * Ramer-Douglas-Peucker, iterative rather than recursive: a 7,756-point track
 * that happens to be sorted adversarially would otherwise be a stack depth
 * this runs inside a request handler.
 *
 * Returns the INDICES to keep, so the caller can pull the original
 * unprojected coordinates rather than trying to invert the projection.
 */
function rdpIndices(points: readonly XY[], epsilon: number): number[] {
  const last = points.length - 1;
  if (points.length < 3) return points.map((_, i) => i);

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[last] = 1;

  const stack: [number, number][] = [[0, last]];
  while (stack.length > 0) {
    const [from, to] = stack.pop()!;
    if (to - from < 2) continue;

    const a = points[from];
    const b = points[to];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const chordSq = dx * dx + dy * dy;

    let farthest = -1;
    let farthestDistance = -1;
    for (let i = from + 1; i < to; i++) {
      const p = points[i];
      // Distance to the chord as a SEGMENT, not as an infinite line, and the
      // difference is not academic. Perpendicular-to-the-line is the textbook
      // formulation and it silently breaks RDP's one guarantee wherever a
      // course doubles back: at a turnaround the chord between the recursion's
      // endpoints is short while the points run far out past it and return, so
      // their perpendicular offset is near zero however far out they went, and
      // the whole spur is discarded as flat. new-hampshire-marathon lost a
      // 68 m out-and-back that way, at an epsilon of 6.
      //
      // Clamping the projection to the segment also subsumes the degenerate
      // chord that a loop course produces, where first and last point coincide
      // and the line through them does not exist; t is 0 there and this
      // measures from the shared endpoint, which is what the previous special
      // case did by hand.
      const t =
        chordSq === 0
          ? 0
          : Math.min(
              1,
              Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / chordSq),
            );
      const distance = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
      if (distance > farthestDistance) {
        farthestDistance = distance;
        farthest = i;
      }
    }

    if (farthestDistance > epsilon) {
      keep[farthest] = 1;
      stack.push([from, farthest], [farthest, to]);
    }
  }

  const indices: number[] = [];
  for (let i = 0; i < keep.length; i++) if (keep[i] === 1) indices.push(i);
  return indices;
}

function round(value: number): number {
  const factor = 10 ** OUTLINE_PRECISION;
  return Math.round(value * factor) / factor;
}

/**
 * Simplify a dense GPX track into a storable outline.
 *
 * Returns null when there is not enough shape to be worth storing, which is a
 * real case rather than a defensive one: an upload can be a handful of
 * waypoints. Every consumer treats a missing outline as "render nothing", so
 * null travels all the way to the UI rather than being faked here.
 */
export function simplifyOutline(
  points: readonly LatLon[],
  epsilon: number = OUTLINE_EPSILON,
  maxDeviationM: number = OUTLINE_MAX_DEVIATION_M,
): Outline | null {
  const finite = points.filter(
    (p) => Number.isFinite(p.lat) && Number.isFinite(p.lon),
  );
  if (finite.length < OUTLINE_MIN_POINTS) return null;

  const { points: unit, scale } = normalize(project(finite));
  // `scale` is the bounding box's longer side in projected degrees, so one
  // normalised unit is `scale * METRES_PER_DEGREE` metres on the ground.
  const spanM = scale * METRES_PER_DEGREE;
  const effective =
    spanM > 0 ? Math.min(epsilon, maxDeviationM / spanM) : epsilon;

  const indices = rdpIndices(unit, effective);
  if (indices.length < 2) return null;

  return indices.map((i) => [round(finite[i].lat), round(finite[i].lon)]);
}

/** How big to draw an outline, in SVG user units. */
export interface OutlineBox {
  /** The longer side of the viewBox. The shorter one follows the course. */
  size: number;
  /** Space reserved on every side, so the end dots are never clipped. */
  padding: number;
}

/** An outline projected and fitted, ready to render. */
export interface OutlineRender {
  /**
   * The viewBox to draw into. Its ASPECT RATIO IS THE COURSE'S OWN, which is
   * what lets a caller hand the svg `preserveAspectRatio="xMidYMid meet"` and
   * have the drawing fill its container. A fixed viewBox would fit twice: the
   * course into the box, then the box into the container, and a wide course in
   * a wide container would sit letterboxed inside a tall box for no reason.
   */
  width: number;
  height: number;
  /** The `d` attribute of the route path. */
  d: string;
  /** Where the runner starts, in the same user units. */
  start: { x: number; y: number };
  /** Where they finish. Equal to `start` on a loop course. */
  finish: { x: number; y: number };
  /** True when start and finish are close enough to overlap as drawn. */
  isLoop: boolean;
}

/**
 * How close start and finish have to be before they are drawn as one mark
 * instead of two, as a fraction of the longer side. Two dots at the same
 * coordinate render as a single dot of whichever colour paints last, which
 * silently loses the start.
 */
const LOOP_THRESHOLD = 0.03;

/**
 * The most elongated a viewBox is allowed to get, longer side over shorter.
 * An out-and-back on a straight road is nearly a line, and a viewBox 30 units
 * tall would scale the end dots up to fill the card. Past this the drawing
 * letterboxes, which is the lesser problem.
 */
const MAX_ASPECT = 2.5;

/**
 * Fit an outline into a box and emit an SVG path.
 *
 * PURE, and unit-tested as such: no DOM, no React, no measurement. That is
 * what lets the same function serve a client component, a server-rendered
 * table row and, later, a social image, and it is why the aspect ratio is
 * honoured here rather than by an SVG preserveAspectRatio the caller would
 * have to reason about.
 */
export function renderOutline(
  outline: Outline,
  box: OutlineBox,
): OutlineRender | null {
  if (outline.length < 2) return null;

  const projected = project(outline.map(([lat, lon]) => ({ lat, lon })));
  const xs = projected.map((p) => p.x);
  const ys = projected.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  // The viewBox takes the course's own proportions, clamped so a near-straight
  // route does not collapse to a sliver.
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const aspect = Math.min(
    Math.max(spanX / (spanY || spanX || 1), 1 / MAX_ASPECT),
    MAX_ASPECT,
  );
  const width = aspect >= 1 ? box.size : box.size * aspect;
  const height = aspect >= 1 ? box.size / aspect : box.size;

  const innerW = width - 2 * box.padding;
  const innerH = height - 2 * box.padding;
  // One scale for both axes: a course squashed to fill the box is a different
  // course. A straight-line route has zero span on one axis, hence the || 1.
  const scale = Math.min(innerW / (spanX || 1), innerH / (spanY || 1));

  // Centre whatever is left over, so a wide course sits mid-box rather than
  // pinned to the top edge.
  const offsetX = (width - spanX * scale) / 2 - minX * scale;
  const offsetY = (height - spanY * scale) / 2 - minY * scale;

  const fitted = projected.map((p) => ({
    x: p.x * scale + offsetX,
    y: p.y * scale + offsetY,
  }));

  const d = fitted
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join("");

  const start = fitted[0];
  const finish = fitted[fitted.length - 1];

  return {
    width,
    height,
    d,
    start,
    finish,
    isLoop:
      Math.hypot(finish.x - start.x, finish.y - start.y) <
      LOOP_THRESHOLD * box.size,
  };
}
