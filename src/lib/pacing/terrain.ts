// Course terrain — how much a course climbs, drops, and ends up below where it
// started. The ruggedness half of a course's character; `effort.ts` holds the
// speed half.
//
// WHY BOTH EXIST. The obvious single score is the effort multiplier in
// effort.ts, and it is the right number for "how fast is this course" — but it
// is close to useless as "how hilly is this course". Under Minetti, climbing
// and descending very nearly cancel: across the 326 seeded courses, 308 land
// between 0.985 and 1.005, and Prosecco (194 m of climbing) scores 1.0008,
// indistinguishable from pancake-flat Chicago. The multiplier separates only
// the net-downhill courses and the two mountain races. Total gain separates the
// rest, so the badge label comes from here and the speed figure from there.
//
// RESOLUTION, HONESTLY. This reads the stored 44-point per-kilometre array, so
// `gainM` and `lossM` are PER-KILOMETRE figures: a floor on the true gain, not
// a surveyed one. A course that climbs and drops twice inside one kilometre
// reports only the net of that kilometre. They are comparable across courses
// because every course is measured exactly the same way, and they check out
// against published figures (Boston 96 m gain / 229 m loss, Big Sur 270 m,
// Pikes Peak 2,350 m) — but do not present them as surveyed elevation gain.
//
// THE DENSE `profile` ARRAY IS NOT A BETTER INPUT, and that is now measured
// rather than assumed. Against 103 courses with findmymarathon ground truth,
// the 44-point `gainM` correlates at r = 0.902; gain re-derived from the dense
// profile manages r = 0.819 with 3 m hysteresis and r = 0.700 raw. Raw profile
// noise scales with the recording device, not the terrain — Tokyo's
// 2,922-point trace yields 2,179 ft of "gain" for a course everyone agrees is
// mostly flat. The coarse array's uniform sampling is the whole point. (It is
// also 7-48 KB per course, but size was never the real argument.)
//
// `netM` carries no such caveat — it is the finish minus the start, and that is
// exact at any resolution. It is also directly comparable to other sites'
// figures even when their gain is not: recording noise inflates gain and loss
// together and cancels in the difference. Boston nets -436 ft here against
// findmymarathon's -460, Marquette -806 against -810.
//
// Deliberately NOT smoothed. `smoothElevations` exists to stop digitization
// jitter aliasing into per-segment grades in the pacing engine; applied here it
// would quietly shave real gain off exactly the rugged courses this is meant to
// identify.
import type { CourseTerrain, TerrainLabel } from "@/types";

/**
 * Gain, loss and net change over a course's 44-point elevation array.
 * Throws on anything that isn't 44 finite numbers — the same contract
 * `courses.integrity.test.ts` enforces on the repo files, offline.
 */
export function courseTerrain(elevations: number[]): CourseTerrain {
  if (elevations.length !== 44 || elevations.some((e) => !Number.isFinite(e))) {
    throw new Error("Elevations array must have exactly 44 finite entries");
  }
  let gainM = 0;
  let lossM = 0;
  for (let i = 0; i < elevations.length - 1; i++) {
    const delta = elevations[i + 1] - elevations[i];
    if (delta > 0) gainM += delta;
    else lossM -= delta;
  }
  return { gainM, lossM, netM: elevations[43] - elevations[0] };
}

/**
 * Gain floors in metres for the five climbing bands — the lower bound of each,
 * largest first so `terrainLabel` can return on the first match.
 *
 * CALIBRATED, NOT CHOSEN. findmymarathon.com publishes no formula: their FAQ
 * says the profile is "subjective… based on the course profiles, course
 * elevations, runner opinions, and race organizer descriptions", i.e. a
 * hand-assigned field. So these were fitted instead. Their race feed carries a
 * profile label plus gain/loss per race; 103 of those races join to our seeded
 * courses by GPX start coordinate, and these cuts were grid-searched over that
 * set for maximum agreement: 77% exact (79/103), 98% within one band. The
 * previous 75/150/400 bands scored 59%.
 *
 * Every surviving disagreement is an adjacent call (Houston is "Mostly Flat"
 * here and "Very Flat" there), which is the irreducible part — you cannot
 * reproduce a subjective field exactly with a threshold, and 77% is close to
 * the practical ceiling.
 *
 * Sanity anchors that did not move: Chicago (24 m) very flat, Berlin (28 m) and
 * London (63 m) mostly flat, Sydney (190 m) rolling, Big Sur (270 m) hilly,
 * Blue Ridge (727 m) and Pikes Peak (2,350 m) very hilly. Catalog split is
 * 20 / 118 / 120 / 28 / 22 / 18 across the six labels.
 */
export const TERRAIN_BANDS: readonly (readonly [TerrainLabel, number])[] = [
  ["veryHilly", 355],
  ["hilly", 215],
  ["rolling", 85],
  ["mostlyFlat", 25],
  ["veryFlat", 0],
];

/**
 * A course that finishes materially below where it started, which is the other
 * thing a runner wants to know and is invisible in the gain band: REVEL Mt
 * Charleston climbs 8 m and drops 1,549, so on climbing alone it is the flattest
 * thing in the catalog and also the fastest.
 *
 * -75 m (≈ -246 ft) is where findmymarathon's own labelling turns over: of
 * their races below that with modest climbing, 91% are tagged Downhill. The
 * looser -100 m used until now missed CIM at -91 m, which is the canonical
 * net-downhill BQ course and the one nobody would forgive.
 */
export const NET_DOWNHILL_M = -75;

export function isNetDownhill(terrain: CourseTerrain): boolean {
  return terrain.netM <= NET_DOWNHILL_M;
}

/**
 * Which of the six profiles a course reads as.
 *
 * Downhill REPLACES the climbing band rather than sitting alongside it, which
 * is how findmymarathon does it — Boston is listed there as Downhill, not
 * Rolling Hills, despite its 96 m of climbing. But hills win over the drop when
 * a course has both: Big Sur drops 91 m and is still Hilly. That is not a
 * tie-breaker invented here — in their data, every big-net-drop race that keeps
 * a hill label instead (Big Sur, Loch Ness, Deadwood, Breckenridge) is one with
 * large gain.
 */
export function terrainLabel(terrain: CourseTerrain): TerrainLabel {
  let band: TerrainLabel = "veryFlat";
  for (const [label, minGainM] of TERRAIN_BANDS) {
    if (terrain.gainM >= minGainM) {
      band = label;
      break;
    }
  }
  const climbs = band === "hilly" || band === "veryHilly";
  return !climbs && isNetDownhill(terrain) ? "downhill" : band;
}

/** Human label for a profile, for the badge and the ranking table. */
export const TERRAIN_LABELS: Record<TerrainLabel, string> = {
  veryFlat: "Very Flat",
  mostlyFlat: "Mostly Flat",
  rolling: "Rolling Hills",
  downhill: "Downhill",
  hilly: "Hilly",
  veryHilly: "Very Hilly",
};

/**
 * The six profiles ordered fastest → hardest, which is the order the badge's
 * colour ramp follows and the order findmymarathon lists them in.
 *
 * Downhill leads because it is the only label that makes a course outright
 * faster; the rest are the climbing bands in ascending order. This is a
 * presentation order, not a scale — no arithmetic reads it, and nothing here
 * knows what colour any stop is. `DifficultyBadge` owns that mapping.
 *
 * (Replaced a three-value `TERRAIN_TIER` on 2026-09-08 that grouped the six
 * into easy/moderate/hard. Grouping them meant Mostly Flat and Rolling Hills —
 * 238 of 326 courses between them — got the same pill.)
 */
export const TERRAIN_ORDER: readonly TerrainLabel[] = [
  "downhill",
  "veryFlat",
  "mostlyFlat",
  "rolling",
  "hilly",
  "veryHilly",
];
