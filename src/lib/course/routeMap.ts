import type { HillSegment, PaceChartRow, Unit } from "@/types";
import type { Outline } from "@/lib/course/outline";
import { haversineKm } from "@/lib/geo/haversine";
import { buildSegments, MARATHON_KM } from "@/lib/pacing/segments";

// The interactive course map's data layer (ROADMAP #22): the stored outline,
// cut into one line per split and shaded by what the wind costs that split.
//
// DOM-FREE AND WEBGL-FREE ON PURPOSE, the same split `courseMapData.ts` made
// for the homepage map and for the same reason: jsdom has no WebGL context, so
// a component that constructs a MapLibre map cannot be unit tested at all.
// Every decision worth asserting — where a kilometre boundary lands, which
// multiplier a slice reads, when a segment is too weakly affected to colour —
// lives here, and CourseMapCanvas stays a thin imperative wrapper.
//
// WHY THE OUTLINE AND NOT `coords`. `coords` is 44 [lat, lon] pairs, one per
// kilometre, and drawing it directly gives a 44-gon with every turn between
// samples cut off — the exact failure that made src/lib/course/outline.ts exist
// (read its header). The outline is the simplified GPX track, median 231 points
// and up to 834, already in the browser on /results because SummaryHeader draws
// the silhouette from it. So it is the only street-following geometry available
// client-side without shipping a new file for all 326 courses. It is held to
// OUTLINE_MAX_DEVIATION_M of the source track BECAUSE of this map: the
// thumbnail tolerance alone was fine at 200x140 and put the line a street off
// its road over real tiles.
//
// THE OUTLINE DOES NOT MEASURE 42.195 km, AND THAT IS HANDLED HERE. Two errors
// pull in opposite directions. Ramer-Douglas-Peucker cuts corners, which makes
// the walked polyline short; the source GPX is a digitized or GPS-recorded line
// rather than the certified shortest possible route, which makes it long, often
// by several hundred metres (see CLAUDE.md on the 42.6-43.5 km band). Which one
// wins is per course: Boston's tightened outline walks 42.39 km, a twisty
// course at the old tolerance walked short. Either way, marking kilometres
// against the raw walked distance drifts steadily, putting the 40 km marker
// most of a kilometre from where the runner actually reaches 40 km. Normalising
// cumulative distance so the last vertex is exactly MARATHON_KM spreads that
// error evenly in whichever direction it runs, which is the best that can be
// done without the full track.
//
// SLICED BY SEGMENT, NOT BY KILOMETRE. `windMultipliers` and `rows` are 1:1
// with `buildSegments(elevations, unit)`, which is unit-dependent: 43 km
// segments or 27 mile ones. Slicing by segment keeps all three aligned by
// construction, so a runner in miles gets mile markers and mile splits in the
// hover readout rather than kilometre data relabelled.

/** Coordinates as GeoJSON orders them: longitude first. */
export type LngLat = [number, number];

/** `[[west, south], [east, north]]` — MapLibre's `LngLatBoundsLike` tuple form. */
export type Bounds = [LngLat, LngLat];

/**
 * What the wind does to one split, once it is decided whether it does anything
 * at all. `neutral` is not "no wind": it is "not enough wind to change the plan".
 */
export type WindTone = "head" | "tail" | "neutral";

/**
 * The lower end of the opacity ramp. A coloured-but-faint line has to stay
 * visible on both basemaps, so this is well above zero: the ramp's job is to
 * rank the affected splits against each other, not to fade the weak ones out.
 */
export const MIN_INTENSITY = 0.3;

/**
 * Floor on the ramp's denominator, in percentage points.
 *
 * Without it, a course whose worst split costs 0.4% would normalise that 0.4%
 * to full-strength red, and a calm day would read exactly like a gale. The
 * floor means the ramp only saturates when something is genuinely happening,
 * so a near-calm forecast renders as a mostly-faint line, which is the truth.
 */
export const RAMP_MIN_SPAN_PCT = 1;

/** Label every fifth marker, plus the start and the finish. */
export const MARKER_INTERVAL = 5;

export interface RouteSegmentProperties {
  /** Index into `segments`, `rows` and `windMultipliers` alike. */
  index: number;
  startKm: number;
  endKm: number;
  /** "12" / "26.2" — the split's own label, from its PaceChartRow. */
  label: string;
  /** Distance with its unit, for the hover readout: "12 km", "13.1 mi". */
  distanceLabel: string;
  /** "4:32 /km", from the same row the splits table prints. */
  paceLabel: string;
  elevationDeltaM: number;
  tone: WindTone;
  /** Signed cost of the wind on this split, in percent. Positive is a headwind. */
  windPct: number;
  /** Ramp position, MIN_INTENSITY to 1. Exactly 0 when the tone is neutral. */
  intensity: number;
  /**
   * Which climb (ROADMAP #13) this split falls inside, numbered from 1 in course
   * order, or null when it is on no climb. It is the SAME number the Hill
   * segments cards carry, so "Climb 2" on the map and "Climb 2" in that section
   * are the one climb: that is the whole point of numbering it rather than
   * saying "inside a named climb", which named nothing.
   */
  hillIndex: number | null;
}

export interface RouteSegmentFeature {
  type: "Feature";
  id: number;
  geometry: { type: "LineString"; coordinates: LngLat[] };
  properties: RouteSegmentProperties;
}

export interface RouteCollection {
  type: "FeatureCollection";
  features: RouteSegmentFeature[];
}

export type MarkerKind = "start" | "finish" | "distance";

/** What the map hands back when the pointer is over the start or finish dot, not the route line. */
export interface EndpointHover {
  kind: "start" | "finish";
}

/** Everything the hover readout can be showing: a split, an endpoint, or nothing. */
export type RouteHover = RouteSegmentProperties | EndpointHover | null;

export interface RouteMarkerProperties {
  kind: MarkerKind;
  /** "" for start and finish, which carry a dot rather than a number. */
  label: string;
  distanceKm: number;
}

export interface RouteMarkerFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: LngLat };
  properties: RouteMarkerProperties;
}

export interface RouteMarkerCollection {
  type: "FeatureCollection";
  features: RouteMarkerFeature[];
}

export interface HillFeature {
  type: "Feature";
  geometry: { type: "LineString"; coordinates: LngLat[] };
  properties: { label: string; riseM: number };
}

export interface HillCollection {
  type: "FeatureCollection";
  features: HillFeature[];
}

export interface RouteMap {
  route: RouteCollection;
  markers: RouteMarkerCollection;
  hills: HillCollection;
  bounds: Bounds;
  /** Largest |windPct| on the course, for the legend's end labels. */
  maxWindPct: number;
  /** True when at least one split cleared its threshold. */
  hasWind: boolean;
}

export interface RouteMapInput {
  outline: Outline;
  elevations: number[];
  unit: Unit;
  /** 1:1 with `buildSegments(elevations, unit)`. All 1 when weather is off. */
  windMultipliers: number[];
  hills: HillSegment[];
  rows: PaceChartRow[];
  goalTimeSeconds: number;
}

/**
 * Cumulative distance to each outline vertex, scaled so the last one is exactly
 * MARATHON_KM. See the header for why the scaling is not optional.
 *
 * Returns null when the outline has no measurable length, which a degenerate
 * upload (every point identical) can produce and which would otherwise divide
 * by zero.
 */
export function cumulativeKm(outline: Outline): number[] | null {
  if (outline.length < 2) return null;
  const raw: number[] = [0];
  for (let i = 1; i < outline.length; i++) {
    const [aLat, aLon] = outline[i - 1];
    const [bLat, bLon] = outline[i];
    raw.push(raw[i - 1] + haversineKm(aLat, aLon, bLat, bLon));
  }
  const total = raw[raw.length - 1];
  if (!(total > 0)) return null;
  const scale = MARATHON_KM / total;
  return raw.map((d) => d * scale);
}

/** Linear interpolation between two outline vertices, in lng-first order. */
function interpolate(
  outline: Outline,
  i: number,
  fraction: number,
): LngLat {
  const [aLat, aLon] = outline[i];
  const [bLat, bLon] = outline[i + 1];
  return [aLon + (bLon - aLon) * fraction, aLat + (bLat - aLat) * fraction];
}

/** The point at a given distance along the normalised outline. */
export function pointAtKm(
  outline: Outline,
  cumulative: number[],
  km: number,
): LngLat {
  if (km <= 0) return [outline[0][1], outline[0][0]];
  const last = outline.length - 1;
  if (km >= cumulative[last]) return [outline[last][1], outline[last][0]];
  // The first vertex at or past `km`; the point sits on the span before it.
  let hi = 1;
  while (hi < last && cumulative[hi] < km) hi++;
  const span = cumulative[hi] - cumulative[hi - 1];
  const fraction = span > 0 ? (km - cumulative[hi - 1]) / span : 0;
  return interpolate(outline, hi - 1, fraction);
}

/**
 * The stretch of outline between two distances, with interpolated endpoints.
 *
 * Both ends are interpolated rather than snapped to the nearest vertex so that
 * adjacent slices share an endpoint exactly. Snapping would leave visible gaps
 * wherever a split boundary fell mid-span, which on a simplified outline is
 * almost every boundary.
 */
export function sliceBetween(
  outline: Outline,
  cumulative: number[],
  startKm: number,
  endKm: number,
): LngLat[] {
  const points: LngLat[] = [pointAtKm(outline, cumulative, startKm)];
  for (let i = 0; i < outline.length; i++) {
    if (cumulative[i] > startKm && cumulative[i] < endKm) {
      points.push([outline[i][1], outline[i][0]]);
    }
  }
  points.push(pointAtKm(outline, cumulative, endKm));
  return points;
}

/** Bounding box of the whole outline, for the opening `fitBounds`. */
export function outlineBounds(outline: Outline): Bounds {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const [lat, lon] of outline) {
    west = Math.min(west, lon);
    east = Math.max(east, lon);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  return [
    [west, south],
    [east, north],
  ];
}

/**
 * The smallest wind cost worth colouring, in percent, for a split of this
 * duration.
 *
 * DERIVED, NOT CHOSEN. The paceband and the splits table both print whole
 * seconds, so a wind effect that cannot move this split's printed pace by one
 * second is not a difference the runner can act on — colouring it would claim
 * a headwind the plan does not actually contain. One second out of the split's
 * own duration is 100 / duration percent, which at 4:30/km is 0.37% per
 * kilometre and 0.23% per mile. The threshold therefore tightens for a slower
 * runner and for a longer split, both correctly: both have more seconds for the
 * wind to move.
 */
export function neutralThresholdPct(splitDurationSeconds: number): number {
  if (!(splitDurationSeconds > 0)) return Infinity;
  return 100 / splitDurationSeconds;
}

/**
 * Where on the ramp a given cost sits: MIN_INTENSITY at the threshold, 1 at the
 * worst split on the course, 0 when it does not clear the threshold at all.
 */
export function rampIntensity(
  windPct: number,
  thresholdPct: number,
  maxWindPct: number,
): number {
  const magnitude = Math.abs(windPct);
  if (magnitude < thresholdPct) return 0;
  const span = Math.max(maxWindPct - thresholdPct, RAMP_MIN_SPAN_PCT);
  const position = Math.min(1, (magnitude - thresholdPct) / span);
  return MIN_INTENSITY + (1 - MIN_INTENSITY) * position;
}

const unitSuffix = (unit: Unit): string => (unit === "km" ? "km" : "mi");

/**
 * Everything the map draws, from geometry already in the browser.
 *
 * Null when there is nothing drawable: no outline (an older seeded row or an
 * upload too sparse to simplify), a degenerate outline, or an elevation array
 * that is not the 44 points `buildSegments` requires. The caller's cue to hide
 * the map entry point rather than open an empty one.
 */
export function buildRouteMap({
  outline,
  elevations,
  unit,
  windMultipliers,
  hills,
  rows,
  goalTimeSeconds,
}: RouteMapInput): RouteMap | null {
  const cumulative = cumulativeKm(outline);
  if (!cumulative) return null;

  let segments;
  try {
    segments = buildSegments(elevations, unit);
  } catch {
    // buildSegments throws on anything but 44 points. A course that cannot be
    // segmented cannot be charted either, so this is already impossible on the
    // results page; returning null keeps it a blank map rather than a crash.
    return null;
  }
  if (segments.length === 0) return null;

  // Flat pace, used only to size the neutral threshold. The real per-segment
  // durations live on the result, but the threshold is a display decision
  // rather than a physical one, and deriving it from the goal keeps this
  // module independent of the pacing engine's output.
  const flatPaceSecPerKm = goalTimeSeconds / MARATHON_KM;

  const windPcts = segments.map((_, i) => {
    const multiplier = windMultipliers[i];
    return Number.isFinite(multiplier) ? (multiplier - 1) * 100 : 0;
  });
  const thresholds = segments.map((seg) =>
    neutralThresholdPct(flatPaceSecPerKm * seg.lengthKm),
  );
  // The ramp normalises against the worst split that actually clears its own
  // threshold, so one sub-threshold outlier cannot set the scale for the rest.
  const maxWindPct = windPcts.reduce(
    (max, pct, i) =>
      Math.abs(pct) >= thresholds[i] ? Math.max(max, Math.abs(pct)) : max,
    0,
  );

  // MATCHED ON DISTANCE, NOT ON SEGMENT INDEX. `courseHills` always runs on
  // kilometre segments, while `segments` here is 43 kilometres or 27 miles
  // depending on the unit. Comparing a mile index against a kilometre index
  // would put a runner in miles inside the wrong climb, or inside none.
  const hillIndexFor = (startKm: number, endKm: number): number | null => {
    const found = hills.findIndex(
      (h) => startKm < h.endDistanceKm && endKm > h.startDistanceKm,
    );
    return found === -1 ? null : found + 1;
  };

  const features: RouteSegmentFeature[] = segments.map((seg, i) => {
    const windPct = windPcts[i];
    const intensity = rampIntensity(windPct, thresholds[i], maxWindPct);
    const tone: WindTone =
      intensity === 0 ? "neutral" : windPct > 0 ? "head" : "tail";
    const row = rows[i];
    return {
      type: "Feature",
      // A numeric feature id is what `setFeatureState` needs for the hover
      // highlight; MapLibre ignores hover state on features without one.
      id: i,
      geometry: {
        type: "LineString",
        coordinates: sliceBetween(
          outline,
          cumulative,
          seg.startDistanceKm,
          seg.endDistanceKm,
        ),
      },
      properties: {
        index: i,
        startKm: seg.startDistanceKm,
        endKm: seg.endDistanceKm,
        label: row?.segmentLabel ?? String(i + 1),
        distanceLabel: `${row?.segmentLabel ?? String(i + 1)} ${unitSuffix(unit)}`,
        paceLabel: row?.adjustedPaceLabel ?? "",
        elevationDeltaM: seg.elevationDeltaM,
        tone,
        windPct,
        intensity,
        hillIndex: hillIndexFor(seg.startDistanceKm, seg.endDistanceKm),
      },
    };
  });

  // Markers sit on the sliced line itself, not on `coords`. The two disagree by
  // however much the outline was simplified, and a marker floating a block off
  // the route reads as a bug rather than as a tolerance.
  const markers: RouteMarkerFeature[] = [];
  markers.push({
    type: "Feature",
    geometry: { type: "Point", coordinates: pointAtKm(outline, cumulative, 0) },
    properties: { kind: "start", label: "", distanceKm: 0 },
  });
  segments.forEach((seg, i) => {
    const ordinal = i + 1;
    const isLast = i === segments.length - 1;
    if (isLast || ordinal % MARKER_INTERVAL !== 0) return;
    markers.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: pointAtKm(outline, cumulative, seg.endDistanceKm),
      },
      properties: {
        kind: "distance",
        label: `${ordinal}`,
        distanceKm: seg.endDistanceKm,
      },
    });
  });
  markers.push({
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: pointAtKm(outline, cumulative, MARATHON_KM),
    },
    properties: { kind: "finish", label: "", distanceKm: MARATHON_KM },
  });

  const hillFeatures: HillFeature[] = hills.map((hill) => ({
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: sliceBetween(
        outline,
        cumulative,
        hill.startDistanceKm,
        hill.endDistanceKm,
      ),
    },
    properties: {
      label: `${Math.round(hill.riseM)} m over ${hill.lengthKm.toFixed(1)} km`,
      riseM: hill.riseM,
    },
  }));

  return {
    route: { type: "FeatureCollection", features },
    markers: { type: "FeatureCollection", features: markers },
    hills: { type: "FeatureCollection", features: hillFeatures },
    bounds: outlineBounds(outline),
    maxWindPct,
    hasWind: maxWindPct > 0,
  };
}

/**
 * How hard the wind is pushing on one split, in words.
 *
 * READ OFF THE SAME RAMP THE LINE IS PAINTED FROM, deliberately. `intensity` is
 * what sets the colour, so binding the word to it means the darkest red on the
 * course is the one that reads "Strong" and a barely-tinted split reads "Light":
 * the sentence can never disagree with the shade the runner is looking at.
 *
 * THREE WORDS, NOT A PERCENTAGE. The readout used to print the signed cost to
 * one decimal. A runner cannot do anything with "+1.2%" mid-race, and the figure
 * invited a precision the wind model does not have. Three bands say the one
 * thing that changes a decision: how much this stretch is going to hurt.
 */
export function windStrengthWord(intensity: number): "Light" | "Moderate" | "Strong" {
  const position = (intensity - MIN_INTENSITY) / (1 - MIN_INTENSITY);
  if (position < 1 / 3) return "Light";
  if (position < 2 / 3) return "Moderate";
  return "Strong";
}

/**
 * Where the hovered split sits on the legend's ramp, 0 (full tailwind, the left
 * end) to 1 (full headwind, the right end), with 0.5 the neutral middle.
 *
 * THE BAR IS THE RAMP, SO EACH HALF OF IT IS `intensity`. The legend's gradient
 * is the same scale the line is painted from, mirrored about its midpoint: the
 * tone picks the side and `intensity` is how far along that side the split sits.
 * A neutral split lands dead centre rather than being hidden, because "the wind
 * is not doing anything here" is an answer worth pointing at.
 */
export function legendPosition(props: RouteSegmentProperties): number {
  // A non-finite intensity survives Math.min/Math.max and would reach the DOM
  // as `left: NaN%`, which silently parks the needle at the left end.
  if (props.tone === "neutral" || !Number.isFinite(props.intensity)) return 0.5;
  const side = props.tone === "head" ? 1 : -1;
  const offset = (Math.min(1, Math.max(0, props.intensity)) / 2) * side;
  return 0.5 + offset;
}

/**
 * The hover readout's wind sentence. Separate from the feature so the wording
 * is asserted in a test rather than buried in a template literal in the canvas.
 */
export function windVerdict(props: RouteSegmentProperties): string {
  if (props.tone === "neutral") return "No meaningful wind";
  const direction = props.tone === "head" ? "headwind" : "tailwind";
  return `${windStrengthWord(props.intensity)} ${direction}`;
}
