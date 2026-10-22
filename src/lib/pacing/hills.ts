// Course hills — which few climbs on a course are worth planning around.
//
// The panel this feeds names a course the way a runner talks about one: Boston
// has the Newton hills, Big Sur has Hurricane Point, Chicago has nothing. It is
// deliberately NOT an exhaustive list of every rise. A detector that prints
// fifty segments has told the runner nothing, and one that manufactures three
// on a pancake-flat course has lied to them, so this returns an empty array far
// more often than not: 144 of the 326 seeded courses have no climb that clears
// the floors.
//
// RULE 1, THE ADDITIVE CASE. This module reads the elevation array and the two
// pure functions `buildSegments` and `courseCostFactor`. It modifies nothing
// the Minetti curve owns and changes no pacing output — exactly the footing
// `terrain.ts`, `altitude.ts` and `courseCost.ts` were added on. Delete this
// file and every split, paceband and shared link is byte-identical.
//
// RESOLUTION: THE 44-POINT ARRAY, AND WHAT THAT COSTS. Detection runs on the
// stored per-kilometre array, not the dense `profile`. Two reasons, one
// positive and one measured. The positive one: this is the same input the
// profile badge, the "vs flat" figure and the splits table are built from, so
// the panel cannot disagree with the numbers printed beside it, and an uploaded
// `u-` course gets the feature for free. The measured one: ROADMAP #5 found
// gain re-derived from the dense profile is a WORSE predictor than the 44-point
// figure (r = 0.819 against 0.902) because raw trace noise scales with the
// recording device rather than the terrain, and `profile` is not in the catalog
// query anyway.
//
// The cost is real and the UI says so out loud: Heartbreak Hill is about 600 m
// long and cannot be its own object at kilometre resolution. It lands inside
// the longer Newton run that contains it. Sub-kilometre walls are the deferred
// dense-profile project, not this one.
//
// SCORED IN COST, NOT METRES. Significance is `Σ lengthKm × (courseCostFactor −
// 1)`: the excess flat-equivalent distance a climb adds, which converts to
// seconds by multiplying by the runner's own flat pace. Metres of gain alone
// would rank a 200 m drift spread over 8 km above the Newton hills, because
// gain is blind to how steeply it was earned. Cost integrates the grade curve
// over the run, so a long shallow drag and a short wall are comparable at all.
// Dips inside a run count as the negatives they are.
//
// The score is returned PACE-INDEPENDENT (`excessKm`) and converted by
// `hillCostSeconds` at the edge. Two runners with different goals see the same
// climbs on the same course, and only the seconds beside them differ.
//
// WHY A COST-DENSITY FLOOR AND NOT AN AVERAGE-GRADE FLOOR. A grade floor is
// strictly more aggressive than it looks: averaging grade across an internal
// dip cancels real climbing, while integrating cost does not. That discards
// rolling drags that genuinely cost a runner time — Atlanta km 13-26 averages
// 0.32% and costs 11 s/km. The rise floor is what rejects London's shallow
// drift; the density floor is what rejects Tokyo km 24-42 (19 m of rise at
// 0.11%, 4.4 s/km), which is a kilometre-resolution artefact rather than a
// hill.
//
// KNOWN SOURCE-DATA LIMITATION, RECORDED NOT COMPENSATED FOR. Several GPX files
// badly under-record climbing (ROADMAP #12: New York retains 293 ft of gain
// against findmymarathon's surveyed 966 ft, because the bridge climbs are
// smoothed away before the parser ever sees them). This panel is the first
// surface where a runner can SEE that: New York shows fewer and smaller climbs
// than the race has. The fix is re-sourcing the geometry (ROADMAP #23), never
// tuning the detector to paper over it.
//
// THE 0.195 KM STUB IS KEPT IN. The final segment spans 42 km to 42.195 and so
// amplifies gradient roughly 5x for a given elevation delta. It is not
// special-cased: it is a real part of the course, its cost is weighted by its
// real length, and excluding it would silently drop a finish-line ramp. Its
// behaviour is pinned by a test rather than trusted.
//
// PACE LABELS AND COST SECONDS ARE DIFFERENT CURVES, ON PURPOSE. The pace the
// panel prints per climb is read verbatim off the existing `PaceChartRow`s,
// which come from the damped `adjustment.ts` curve; the cost figure here comes
// from the asymmetric `courseCost.ts` curve. They answer different questions
// ("how should I run this" versus "what does this cost me"), and the header of
// courseCost.ts explains why one function could not do both.
import type { HillSegment, Segment, Unit } from "@/types";
import { buildSegments } from "./segments";
import { courseCostFactor } from "./courseCost";

/** Deepest dip, in metres, that can sit inside one climb without splitting it. */
export const HILL_MAX_DIP_M = 10;

/**
 * The same tolerance as a fraction of the rise so far, whichever is smaller. A
 * 10 m dip inside a 12 m climb is not a dip, it is two climbs.
 */
export const HILL_DIP_FRACTION = 0.5;

/**
 * How many consecutive kilometres a tolerated dip may last.
 *
 * Without this cap the depth test alone lets a long shallow sag swallow a real
 * climb: `koenig-ludwig-marathon` lost a genuine 26 m climb to a multi-kilometre
 * drift near the finish that never fell 10 m below the peak. Boston, Big Sur and
 * New York are unchanged by the cap.
 */
export const HILL_MAX_DIP_SEGMENTS = 2;

/**
 * A leading or trailing segment costing less than this (at the reference pace)
 * is trimmed off the run rather than padding its length and flattening its
 * average grade.
 */
export const HILL_TRIM_SECONDS = 3;

/**
 * Minimum net rise, foot to top, in metres.
 *
 * Deliberately NET rise and not total gain: this is the number the card prints,
 * so the floor and the display agree, and a runner cannot be shown an 18 m
 * threshold applied to a figure they never see.
 */
export const HILL_MIN_RISE_M = 18;

/**
 * Minimum total cost, in seconds at the reference pace.
 *
 * Non-binding on today's catalog: nothing clearing the rise and density floors
 * fails this one. Kept as a guard, so a future course of many tiny steep steps
 * cannot pass on density alone.
 */
export const HILL_MIN_COST_SECONDS = 50;

/**
 * Minimum cost per kilometre of climb, in seconds at the reference pace. This
 * is what rejects a long, shallow, kilometre-resolution drift.
 */
export const HILL_MIN_COST_DENSITY_S_PER_KM = 8;

/**
 * Drop any survivor costing less than this fraction of the costliest climb on
 * the same course. Relative, because "worth planning around" is a judgement
 * against the rest of the race: a 60 s rise matters on Berlin and is noise on
 * Pikes Peak. There is deliberately NO hard cap on the number of climbs — a cap
 * truncates a genuinely lumpy course and pads nothing on a flat one.
 */
export const HILL_RELATIVE_FLOOR = 0.2;

/**
 * The pace the thresholds above are denominated in, in seconds per kilometre.
 *
 * A unit of account for the floors ONLY. No runner's goal reaches the detector,
 * which is the point: the panel shows the same climbs to a 2:30 marathoner and
 * a 5:30 one. `hillCostSeconds` is where a real pace enters.
 */
export const HILL_REFERENCE_PACE_SEC_PER_KM = 300;

/** Excess flat-equivalent distance of one segment, in km. Negative on a dip. */
function segmentExcessKm(seg: Segment): number {
  return seg.lengthKm * (courseCostFactor(seg.gradient) - 1);
}

/** The same, in seconds at the reference pace. */
function segmentCostSeconds(seg: Segment): number {
  return segmentExcessKm(seg) * HILL_REFERENCE_PACE_SEC_PER_KM;
}

/**
 * Candidate rising runs, as [startIndex, endIndex] pairs into `segments`.
 *
 * Runs are closed at their highest point and scanning resumes after it, so they
 * can never overlap and always come back in course order.
 */
function risingRuns(segments: Segment[]): [number, number][] {
  const runs: [number, number][] = [];
  let i = 0;

  while (i < segments.length) {
    if (segments[i].elevationDeltaM <= 0) {
      i += 1;
      continue;
    }

    const start = i;
    const footM = segments[i].startElevationM;
    let peakIndex = i;
    let peakM = segments[i].endElevationM;
    let j = i + 1;

    while (j < segments.length) {
      if (segments[j].endElevationM > peakM) {
        peakM = segments[j].endElevationM;
        peakIndex = j;
        j += 1;
        continue;
      }

      // A dip: every following segment that stays at or below the peak. Measured
      // from the peak to the lowest point it reaches, not segment by segment, so
      // two shallow steps down cannot sneak past a depth test one deep step fails.
      let k = j;
      let lowestM = peakM;
      while (k < segments.length && segments[k].endElevationM <= peakM) {
        lowestM = Math.min(lowestM, segments[k].endElevationM);
        k += 1;
      }

      // A dip that runs to the finish has no climb on the far side to merge with.
      if (k >= segments.length) break;

      const tolerance = Math.min(
        HILL_MAX_DIP_M,
        HILL_DIP_FRACTION * (peakM - footM),
      );
      if (peakM - lowestM > tolerance || k - j > HILL_MAX_DIP_SEGMENTS) break;

      j = k;
    }

    runs.push([start, peakIndex]);
    i = peakIndex + 1;
  }

  return runs;
}

/**
 * Drop leading and trailing segments that cost almost nothing.
 *
 * A LOOP, not a single pass: trimming one negligible segment can expose
 * another behind it, and leaving those on inflates the run's length while
 * diluting its average grade. Returns null when nothing survives, which is not
 * an edge case to shrug at — 63% of courses contain at least one run that trims
 * away entirely, and dividing by a zero length would put NaN in every field.
 */
function trim(segments: Segment[], run: [number, number]): [number, number] | null {
  let [start, end] = run;
  for (;;) {
    if (start > end) return null;
    if (start < end && segmentCostSeconds(segments[start]) < HILL_TRIM_SECONDS) {
      start += 1;
      continue;
    }
    if (end > start && segmentCostSeconds(segments[end]) < HILL_TRIM_SECONDS) {
      end -= 1;
      continue;
    }
    break;
  }
  return segmentCostSeconds(segments[start]) < HILL_TRIM_SECONDS
    ? null
    : [start, end];
}

function describe(segments: Segment[], [start, end]: [number, number]): HillSegment {
  let lengthKm = 0;
  let excessKm = 0;
  for (let i = start; i <= end; i += 1) {
    lengthKm += segments[i].lengthKm;
    excessKm += segmentExcessKm(segments[i]);
  }
  const riseM = segments[end].endElevationM - segments[start].startElevationM;
  return {
    startSegmentIndex: start,
    endSegmentIndex: end,
    startDistanceKm: segments[start].startDistanceKm,
    endDistanceKm: segments[end].endDistanceKm,
    lengthKm,
    riseM,
    gradient: riseM / (lengthKm * 1000),
    excessKm,
  };
}

/**
 * The climbs on a course worth planning around, in course order, from its
 * 44-point elevation array.
 *
 * Always kilometre segments, whatever unit the page is displaying: `courseHills`
 * takes no unit argument on purpose, so the panel cannot change shape when a
 * runner flips km/mi. Display converts the ranges.
 *
 * Throws on anything that isn't 44 finite numbers, the same contract
 * `courseTerrain` holds and `courses.integrity.test.ts` enforces offline.
 */
export function courseHills(elevations: number[]): HillSegment[] {
  if (elevations.length !== 44 || elevations.some((e) => !Number.isFinite(e))) {
    throw new Error("Elevations array must have exactly 44 finite entries");
  }

  const segments = buildSegments(elevations, "km");
  const hills: HillSegment[] = [];

  for (const run of risingRuns(segments)) {
    const trimmed = trim(segments, run);
    if (!trimmed) continue;

    const hill = describe(segments, trimmed);
    const costSeconds = hill.excessKm * HILL_REFERENCE_PACE_SEC_PER_KM;
    if (
      hill.riseM >= HILL_MIN_RISE_M &&
      costSeconds >= HILL_MIN_COST_SECONDS &&
      costSeconds / hill.lengthKm >= HILL_MIN_COST_DENSITY_S_PER_KM
    ) {
      hills.push(hill);
    }
  }

  if (hills.length === 0) return hills;

  const biggest = Math.max(...hills.map((h) => h.excessKm));
  return hills.filter((h) => h.excessKm >= HILL_RELATIVE_FLOOR * biggest);
}

/**
 * Every segment's excess flat-equivalent distance, in km, in course order: the
 * course's cost profile, one number per split row.
 *
 * The Race splits chart is this array times the runner's flat pace, and the
 * shaded bands on it mark where each numbered climb card sits, so the bars under
 * a band are that climb's cost at kilometre resolution. In km mode the segments of a `HillSegment`
 * sum exactly to its `excessKm`, which `hills.test.ts` pins.
 *
 * Takes a unit, unlike `courseHills`, because this one IS per split row and the
 * splits table it sits above is drawn in the runner's own unit. Detection stays
 * kilometre-only; only the picture changes.
 */
export function costProfile(elevations: number[], unit: Unit): number[] {
  if (elevations.length !== 44 || elevations.some((e) => !Number.isFinite(e))) {
    throw new Error("Elevations array must have exactly 44 finite entries");
  }
  return buildSegments(elevations, unit).map(segmentExcessKm);
}

/**
 * What a climb costs this runner, in seconds, against flat ground.
 *
 * Linear in pace by construction: the geometry is already reduced to excess
 * flat-equivalent kilometres, and a slower runner simply spends longer covering
 * them. `flatPaceSecPerKm` is the runner's own average flat pace (goal time over
 * the marathon distance), so the figure moves with their goal while the climbs
 * themselves do not.
 *
 * It is a DIFFICULTY figure, not a loss. The plan is normalised to hit the goal,
 * so nothing here is time the runner gives up; it is what this stretch would
 * have taken had the road been flat.
 */
export function hillCostSeconds(
  hill: HillSegment,
  flatPaceSecPerKm: number,
): number {
  return hill.excessKm * flatPaceSecPerKm;
}
