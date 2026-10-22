// Draw a course from its published map, when nobody published a route file.
//
//   node scripts/import/trace.ts --waypoints data/import/traces/<slug>.json
//   node scripts/import/trace.ts --waypoints <file> --dry-run
//   node scripts/import/trace.ts --waypoints <file> --profile foot
//
// Flags:
//   --waypoints <file>  the hand-placed waypoint file (see below)
//   --dry-run           snap and check the gates; write no GPX
//   --profile <p>       routing profile: foot (default), bike, car
//   --router <url>      routing service base URL (default: the OSRM demo)
//   --no-elevation      skip the DEM pass (for a file that already has ele)
//
// Why this exists, and why it is last in the order: a large share of the ~900
// races in the backlog publish their course as a picture. The organizer has a
// map on a web page, sometimes a beautiful one, and no GPX anywhere. USATF's
// certification packet is the same story from a more authoritative publisher:
// checked 2026-09-23, it is a two-page PDF of raster images with no coordinate
// data in it at all (docs/COURSE-RIGHTS.md §2). Those races are unreachable by
// every other source class, and there are enough of them that "we cannot get
// them" is a real limit on the catalog.
//
// So: a person reads the published map and places waypoints along it. This
// snaps those waypoints to the actual road network and returns the line the
// roads make between them, which is a far better course than the straight
// segments between the waypoints and much cheaper than clicking every corner.
//
// **The output is labelled, not laundered.** adopt.ts carries
// `routeSource: "traced"` into `RawEvent.geometrySource`, qa.ts raises a review
// flag on every traced course and writes `source.geometry` into
// decisions.json, and promote.ts says so in the seed-file comment. That is the
// same treatment modelled elevation has had since `dem:` shipped, and for the
// same reason: a traced course is a real course, but it is a different kind of
// number from a surveyed one and the difference must survive into the record.
//
// The waypoint file, which a person writes:
//
//   {
//     "slug": "example-marathon",
//     "mapUrl": "https://example.org/course-map.pdf",
//     "note": "Traced from the organizer's 2027 course map, retrieved 2026-09-23.",
//     "waypoints": [[42.3601, -71.0589], [42.3555, -71.0655], ...]
//   }
//
// Waypoints are [lat, lon], in running order, start first and finish last.
//
// **Place roughly one per kilometre — about 45 for a marathon — and resist the
// urge to add more.** Calibrated on Berlin 2026-09-23 against its own surveyed
// line (the table is in docs/COURSE-RIGHTS.md §4):
//
//   23 waypoints (1.9 km apart)  -> 41.57 km, 1.5% short: the router cuts corners
//   48 waypoints (0.9 km apart)  -> 42.43 km, 0.6% long:  the setting to use
//   94 waypoints (0.45 km apart) -> 47.03 km, 11% long:   the router zig-zags
//
// The last row is the counter-intuitive one and it is why this note exists.
// Packing waypoints tightly does not refine the line, it wrecks it: each one
// snaps to its own nearest way, and the router detours between them. Spend the
// waypoints where the route could plausibly go two ways, not on straights.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

import { PROVIDERS, OPENTOPODATA } from "./dem.ts";
import { ensureElevation } from "./elevate.ts";
import { toGpx, type RoutePoint } from "./route.ts";
import {
  IMPORT_DIR,
  REPO_ROOT,
  REQUEST_DELAY_MS,
  USER_AGENT,
  flagValue,
  haversineKm,
  sleep,
} from "./shared.ts";

const TRACE_DIR = join(IMPORT_DIR, "traces");

/**
 * The public OSRM demo server.
 *
 * It is the only no-key routing service of its kind, and this pipeline's use of
 * it is genuinely small: a handful of requests per traced course, a handful of
 * courses per session, at build time. That is within what a demo server is for,
 * and `--router` exists so a self-hosted or commercial instance can be pointed
 * at the moment that stops being true. Do not batch a hundred courses through
 * it in one run.
 */
const DEFAULT_ROUTER = "https://router.project-osrm.org";

/**
 * Waypoints per request.
 *
 * OSRM's demo server rejects a very long coordinate list, and a marathon traced
 * at useful resolution can carry more waypoints than it will take. Requests are
 * chunked with one waypoint of overlap so the legs join without a gap.
 */
const CHUNK = 20;

interface TraceFile {
  slug: string;
  mapUrl: string;
  note?: string;
  waypoints: [number, number][];
}

interface Snapped {
  points: RoutePoint[];
  /** Distance the router reports, km. Compared against the measured line. */
  routedKm: number;
}

function loadTraceFile(path: string): TraceFile {
  const full = isAbsolute(path) ? path : join(REPO_ROOT, path);
  if (!existsSync(full)) throw new Error(`no waypoint file at ${full}`);
  const parsed = JSON.parse(readFileSync(full, "utf8")) as Partial<TraceFile>;

  if (!parsed.slug) throw new Error(`${path}: "slug" is required`);
  // The map URL is not decoration. It is the only way anyone can later check
  // whether the traced line actually follows the course it claims to, which is
  // the single check a traced course needs. adopt.ts copies it into routeNote.
  if (!parsed.mapUrl) {
    throw new Error(
      `${path}: "mapUrl" is required — a traced course is only auditable if the ` +
        `map it was traced from is recorded`,
    );
  }
  const wp = parsed.waypoints;
  if (!Array.isArray(wp) || wp.length < 2) {
    throw new Error(`${path}: "waypoints" needs at least a start and a finish`);
  }
  for (const [i, p] of wp.entries()) {
    if (
      !Array.isArray(p) || p.length !== 2 ||
      !Number.isFinite(p[0]) || !Number.isFinite(p[1]) ||
      Math.abs(p[0]) > 90 || Math.abs(p[1]) > 180
    ) {
      throw new Error(`${path}: waypoint ${i} is not a valid [lat, lon] pair`);
    }
  }
  return { slug: parsed.slug, mapUrl: parsed.mapUrl, note: parsed.note, waypoints: wp };
}

async function snapChunk(
  router: string,
  profile: string,
  chunk: [number, number][],
): Promise<Snapped> {
  // OSRM takes lon,lat — the opposite order to the waypoint file, which is
  // lat,lon because that is the order a person reads off a map.
  const coords = chunk.map(([lat, lon]) => `${lon},${lat}`).join(";");
  const url =
    `${router}/route/v1/${profile}/${coords}` +
    `?overview=full&geometries=geojson&continue_straight=false`;

  const res = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!res.ok) throw new Error(`router returned HTTP ${res.status}`);
  const body = (await res.json()) as {
    code: string;
    message?: string;
    routes?: { distance: number; geometry: { coordinates: [number, number][] } }[];
  };
  if (body.code !== "Ok" || !body.routes?.[0]) {
    throw new Error(`router said ${body.code}${body.message ? `: ${body.message}` : ""}`);
  }
  const route = body.routes[0];
  return {
    points: route.geometry.coordinates.map(([lon, lat]) => ({ lat, lon, ele: null })),
    routedKm: route.distance / 1000,
  };
}

async function snap(
  waypoints: [number, number][],
  opts: { router: string; profile: string },
): Promise<Snapped> {
  const points: RoutePoint[] = [];
  let routedKm = 0;

  for (let i = 0; i < waypoints.length - 1; i += CHUNK - 1) {
    const chunk = waypoints.slice(i, i + CHUNK);
    if (chunk.length < 2) break;
    const leg = await snapChunk(opts.router, opts.profile, chunk);
    routedKm += leg.routedKm;
    // Drop the first point of every leg but the first: it is the previous
    // leg's last waypoint, and a duplicated point becomes a zero-length step
    // the resampler has to think about for no reason.
    points.push(...(points.length === 0 ? leg.points : leg.points.slice(1)));
    process.stdout.write(
      `\r  snapped ${Math.min(i + CHUNK, waypoints.length)}/${waypoints.length} waypoints, ` +
        `${routedKm.toFixed(2)} km   `,
    );
    await sleep(REQUEST_DELAY_MS);
  }
  process.stdout.write("\n");
  return { points, routedKm };
}

function measureKm(points: RoutePoint[]): number {
  let km = 0;
  for (let i = 1; i < points.length; i += 1) {
    km += haversineKm([points[i - 1].lat, points[i - 1].lon], [points[i].lat, points[i].lon]);
  }
  return km;
}

async function main(argv: string[]): Promise<void> {
  const wpPath = flagValue(argv, "--waypoints");
  if (!wpPath) throw new Error("usage: trace.ts --waypoints <file> [--dry-run]");

  const dryRun = argv.includes("--dry-run");
  const profile = flagValue(argv, "--profile") ?? "foot";
  const router = (flagValue(argv, "--router") ?? DEFAULT_ROUTER).replace(/\/+$/, "");
  const providerId = flagValue(argv, "--provider") ?? OPENTOPODATA.id;
  if (!PROVIDERS[providerId]) throw new Error(`unknown DEM provider "${providerId}"`);

  const trace = loadTraceFile(wpPath);
  console.log(`tracing ${trace.slug} from ${trace.waypoints.length} waypoints\n`);

  const { points, routedKm } = await snap(trace.waypoints, { router, profile });
  const km = measureKm(points);
  console.log(`  ${points.length} points, ${km.toFixed(3)} km measured (router said ${routedKm.toFixed(3)})`);

  // --- the gates ----------------------------------------------------------
  // Deliberately the parser's own band rather than a looser one. A traced
  // course that comes out at 40 km is not a course that needs a tolerance, it
  // is a trace that took a wrong turn, and the whole point of tracing is that
  // it is checkable.
  if (points.length < 100) {
    throw new Error(`only ${points.length} points — parse_gpx.py needs at least 100`);
  }
  if (km < 41.5 || km > 43.6) {
    throw new Error(
      `${km.toFixed(3)} km is outside the parser's [41.5, 43.6] band. The trace is ` +
        `wrong, not the band: re-check the waypoints against the map, especially ` +
        `anywhere the route doubles back or the router could have cut a corner.`,
    );
  }
  // A trace whose snapped line is much longer than the routed distance means
  // the router went somewhere the waypoints did not ask it to.
  if (Math.abs(km - routedKm) > 0.5) {
    console.log(
      `  warning: measured and routed distance differ by ${Math.abs(km - routedKm).toFixed(3)} km`,
    );
  }

  const outcome = await ensureElevation(points, {
    provider: PROVIDERS[providerId],
    onProgress: (d, t) => process.stdout.write(`\r  DEM ${d}/${t}   `),
  });
  console.log(`\n  elevation source: ${outcome.source}`);
  for (const w of outcome.warnings) console.log(`  warning: ${w}`);

  if (dryRun) {
    console.log("\ndry-run: no GPX written");
    return;
  }

  mkdirSync(TRACE_DIR, { recursive: true });
  const out = join(TRACE_DIR, `${trace.slug}.gpx`);
  writeFileSync(
    out,
    toGpx(outcome.points, {
      name: trace.slug,
      provenance: [
        `course: ${trace.slug}`,
        `geometry: traced from ${trace.mapUrl}`,
        `traced: ${trace.waypoints.length} waypoints snapped via ${router} (${profile})`,
        `elevation: ${outcome.source}`,
        ...(trace.note ? [`note: ${trace.note}`] : []),
      ],
    }),
  );
  console.log(`wrote ${out}`);

  // The operator's next step is an adoptions.json entry, and getting its
  // routeSource wrong is the one mistake that would defeat the labelling. So
  // the entry is printed rather than described.
  console.log("\nnext: add this to data/import/adoptions.json, then run import:adopt\n");
  console.log(
    JSON.stringify(
      {
        courseSlug: trace.slug,
        name: "<display name>",
        routeUrl: `data/import/traces/${trace.slug}.gpx`,
        routeSource: "traced",
        traceMethod: `osrm-${profile}`,
        routeNote:
          trace.note ??
          `Traced from ${trace.mapUrl}, ${trace.waypoints.length} waypoints snapped to the road network.`,
        startDate: "<yyyy-mm-dd>",
        locality: "<city>",
        region: null,
        countryCode: "<cc>",
        websiteUrl: null,
        organizer: null,
      },
      null,
      2,
    ),
  );
}

main(process.argv.slice(2)).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
