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
// The dense `profile` array could give a truer figure and is deliberately not
// used: it is 7-48 KB per course and never leaves the server.
//
// `netM` carries no such caveat — it is the finish minus the start, and that is
// exact at any resolution.
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
 * Gain thresholds for the four terrain bands, in metres — the lower bound of
 * each, largest first so `terrainLabel` can return on the first match.
 *
 * Calibrated against the actual distribution of the 326 seeded courses AND
 * against races whose character is not in dispute, which is what moved them
 * off the round numbers first tried. At a 100 m floor Boston came out "flat",
 * which no one who has run the Newton hills would accept; at 75 m it is
 * rolling, London (63 m) and New York (72 m) stay flat, Sydney (190 m) and Big
 * Sur (270 m) are hilly, and Blue Ridge (727 m) and Pikes Peak (2,350 m) are
 * mountainous. The split lands 133 / 120 / 56 / 17.
 */
export const TERRAIN_BANDS: readonly (readonly [TerrainLabel, number])[] = [
  ["mountainous", 400],
  ["hilly", 150],
  ["rolling", 75],
  ["flat", 0],
];

/** Which band a course's climbing puts it in. */
export function terrainLabel(terrain: CourseTerrain): TerrainLabel {
  for (const [label, minGainM] of TERRAIN_BANDS) {
    if (terrain.gainM >= minGainM) return label;
  }
  return "flat";
}

/**
 * A course that finishes materially below where it started, which is the other
 * thing a runner wants to know and is invisible in the gain band: REVEL Mt
 * Charleston climbs 8 m and drops 1,549, so it is "flat" and also the fastest
 * course in the catalog. 27 of 326 seeded courses clear this bar.
 */
export const NET_DOWNHILL_M = -100;

export function isNetDownhill(terrain: CourseTerrain): boolean {
  return terrain.netM <= NET_DOWNHILL_M;
}

/** Human label for a band, for the badge and the ranking table. */
export const TERRAIN_LABELS: Record<TerrainLabel, string> = {
  flat: "Flat",
  rolling: "Rolling",
  hilly: "Hilly",
  mountainous: "Mountainous",
};
