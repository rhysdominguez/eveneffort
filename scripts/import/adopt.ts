// Step 1, alternate route: adopt a course file for a race goandrace does not list.
//
//   node scripts/import/adopt.ts --batch adopt-2026-08-17
//   node scripts/import/adopt.ts --only niagara-ultra-marathon --dry-run
//
// Flags:
//   --batch <name>     staging file name (default adopt-<yyyy-mm-dd>)
//   --only <slug,...>  restrict to these course slugs
//   --dry-run          fetch and validate; write no GPX and no batch
//   --force            re-adopt an entry whose GPX is already on disk
//   --provider <id>    DEM provider for elevation (default srtm30m)
//
// Why this exists: goandrace's catalogue is ~1,089 events and the calendar is
// strong in the US and Italy and thin everywhere else. 558 of the 766 rows in
// the findmymarathon tracker have no goandrace listing in any crawl, so no
// amount of re-sweeping reaches them. findmymarathon itself is not the answer —
// it publishes elevation as a rendered JPEG and no route geometry at all (see
// README.md) — but the organisers of those races usually do publish a course
// file somewhere. This adopts one, from a URL a human found and vouched for.
//
// It writes the same RawBatch that fetch.ts writes, so parse -> qa -> promote
// run afterwards completely unchanged. That seam is the whole design; it is the
// same one reconcile-csv.ts --emit-batch already uses.
//
// The worklist is data/import/adoptions.json, committed, because — exactly like
// decisions.json — it is the record of which permanent public identifier (Rule
// 8) a person signed off on, and of where its geometry came from.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

import { PROVIDERS, OPENTOPODATA } from "./dem.ts";
import { ensureElevation } from "./elevate.ts";
import { assertSingleTrack, dedupe, parseRouteFile, toGpx, RouteError } from "./route.ts";
import {
  DECISIONS_PATH,
  GPX_DIR,
  IMPORT_DIR,
  RAW_DIR,
  REPO_ROOT,
  REQUEST_DELAY_MS,
  findNameMatch,
  flagValue,
  getResponse,
  sleep,
  type RawBatch,
  type RawEvent,
} from "./shared.ts";
import { PUBLISHED_COURSE_SLUGS } from "../../src/db/seed/slug-ledger.ts";
import { SERIES_SEED } from "../../src/db/seed/series.ts";

const ADOPTIONS_PATH = join(IMPORT_DIR, "adoptions.json");

/** One hand-curated race. Mirrors the fields fetch.ts reads off schema.org. */
interface Adoption {
  courseSlug: string;
  name: string;
  /** http(s) URL, or a path relative to the repo for a file downloaded by hand. */
  routeUrl: string;
  /** organizer is the one to prefer; route-host means check the rights again. */
  routeSource: "organizer" | "route-host" | "manual";
  /** Where this came from and why it is trusted. Free text, for the record. */
  routeNote: string;
  startDate: string | null;
  locality: string;
  region: string | null;
  countryCode: string;
  websiteUrl: string | null;
  organizer: string | null;
  /** Opt in to joining a multi-track file. Read route.ts before setting it. */
  allowMerge?: boolean;
}

interface AdoptionFile {
  updatedAt: string;
  races: Adoption[];
}

function loadAdoptions(): Adoption[] {
  if (!existsSync(ADOPTIONS_PATH)) {
    throw new Error(
      `no ${ADOPTIONS_PATH}. Create it with {"updatedAt": "...", "races": []} and add a race.`,
    );
  }
  const file = JSON.parse(readFileSync(ADOPTIONS_PATH, "utf8")) as AdoptionFile;
  return file.races ?? [];
}

async function readRoute(routeUrl: string): Promise<{ buf: Buffer; label: string }> {
  if (/^https?:\/\//i.test(routeUrl)) {
    const res = await getResponse(routeUrl);
    return { buf: Buffer.from(await res.arrayBuffer()), label: routeUrl };
  }
  // A local path is the escape hatch for organisers who publish a course file
  // only behind a click, or by email.
  const path = isAbsolute(routeUrl) ? routeUrl : join(REPO_ROOT, routeUrl);
  if (!existsSync(path)) throw new Error(`no such route file: ${path}`);
  return { buf: readFileSync(path), label: routeUrl };
}

async function adopt(
  race: Adoption,
  opts: { dryRun: boolean; providerId: string },
): Promise<RawEvent> {
  const event: RawEvent = {
    courseSlug: race.courseSlug,
    // adopt.ts has no event page, so the route file's own URL is the stable
    // identity this race dedupes on — the role eventUrl plays for fetch.ts.
    eventUrl: race.routeUrl,
    mapUrl: null,
    gpxUrl: /^https?:/i.test(race.routeUrl) ? race.routeUrl : null,
    gpxBytes: null,
    name: race.name,
    startDate: race.startDate,
    locality: race.locality,
    region: race.region,
    countryCode: race.countryCode,
    organizer: race.organizer,
    websiteUrl: race.websiteUrl,
    // For a manual entry the bytes come from a local file, but the seed-file
    // comment this feeds should still name a real host — the race's own site
    // is the truthful answer, not an internal placeholder. "manual" is the
    // fallback only when even that is missing.
    sourceSite: /^https?:/i.test(race.routeUrl)
      ? new URL(race.routeUrl).hostname
      : race.websiteUrl
        ? new URL(race.websiteUrl).hostname
        : "manual",
    routeNote: `${race.routeSource}: ${race.routeNote}`,
    warnings: [],
  };

  try {
    const { buf } = await readRoute(race.routeUrl);
    const route = parseRouteFile(buf, race.routeUrl);
    assertSingleTrack(route, race.allowMerge === true);
    if (race.allowMerge && (route.trackCount > 1 || route.segmentCount > 1)) {
      event.warnings!.push(
        `joined ${route.trackCount} track(s) / ${route.segmentCount} segment(s) into one ` +
          `course on an explicit allowMerge — verify the route is continuous`,
      );
    }

    const points = dedupe(route.points);
    if (points.length < 100) {
      // parse_gpx.py would reject this anyway; saying so here is cheaper.
      throw new RouteError(`only ${points.length} distinct points (parser needs >= 100)`);
    }

    const outcome = await ensureElevation(points, {
      provider: PROVIDERS[opts.providerId],
      onProgress: (d, t) =>
        process.stdout.write(`\r    ${race.courseSlug} … DEM ${d}/${t}   `),
    });
    event.elevationSource = outcome.source;
    event.warnings!.push(...outcome.warnings);

    const gpx = toGpx(outcome.points, {
      name: race.name,
      provenance: [
        `course: ${race.name}`,
        `geometry: ${race.routeUrl}`,
        `vouched: ${race.routeSource} — ${race.routeNote}`,
        `elevation: ${outcome.source}`,
        `format in: ${route.format}`,
      ],
    });
    event.gpxBytes = Buffer.byteLength(gpx);
    if (!opts.dryRun) writeFileSync(join(GPX_DIR, `${race.courseSlug}.gpx`), gpx);

    process.stdout.write(
      `\r    ${race.courseSlug}: ${points.length} pts, ${route.format}, ` +
        `elevation ${outcome.source}${opts.dryRun ? " (dry-run)" : ""}`.padEnd(30) + "\n",
    );
  } catch (err) {
    event.error = err instanceof Error ? err.message : String(err);
    console.log(`\r    ${race.courseSlug}: FAILED — ${event.error}`.padEnd(60));
  }
  return event;
}

async function main(argv: string[]): Promise<void> {
  const dryRun = argv.includes("--dry-run");
  const force = argv.includes("--force");
  const providerId = flagValue(argv, "--provider") ?? OPENTOPODATA.id;
  if (!PROVIDERS[providerId]) throw new Error(`unknown DEM provider "${providerId}"`);
  const onlyRaw = flagValue(argv, "--only");
  const only = onlyRaw ? new Set(onlyRaw.split(",").map((s) => s.trim())) : null;
  const batch = flagValue(argv, "--batch") ?? `adopt-${new Date().toISOString().slice(0, 10)}`;

  const races = loadAdoptions().filter((r) => !only || only.has(r.courseSlug));
  if (races.length === 0) throw new Error("no races selected from adoptions.json");

  const published = new Set(PUBLISHED_COURSE_SLUGS);
  const importedUrls = new Set<string>();
  if (existsSync(DECISIONS_PATH)) {
    const decided = JSON.parse(readFileSync(DECISIONS_PATH, "utf8")) as {
      courses?: { source?: { eventUrl?: string } }[];
    };
    for (const c of decided.courses ?? []) {
      if (c.source?.eventUrl) importedUrls.add(c.source.eventUrl);
    }
  }

  console.log(`adopting  ${races.length} race(s) into batch ${batch}\n`);

  const events: RawEvent[] = [];
  const claimed = new Set<string>();
  for (const race of races) {
    // Rule 8: a published slug is spent forever, and re-adopting one would
    // overwrite the geometry behind links people have already paid for.
    if (published.has(race.courseSlug)) {
      console.log(`    ${race.courseSlug}: skipped — already in the published slug ledger`);
      continue;
    }
    if (claimed.has(race.courseSlug)) {
      console.log(`    ${race.courseSlug}: skipped — listed twice in adoptions.json`);
      continue;
    }
    if (importedUrls.has(race.routeUrl) && !force) {
      console.log(`    ${race.courseSlug}: skipped — this route URL is already in decisions.json`);
      continue;
    }
    if (existsSync(join(GPX_DIR, `${race.courseSlug}.gpx`)) && !force) {
      console.log(`    ${race.courseSlug}: skipped — GPX already on disk (use --force)`);
      continue;
    }

    // The same guard fetch.ts applies: a race can sit on both sources under
    // different names, and a name+city match is the only thing that catches it.
    const dup = findNameMatch(race.name, race.locality, SERIES_SEED);
    if (dup) {
      console.log(
        `    ${race.courseSlug}: skipped — looks like the already-seeded "${dup.name}"`,
      );
      continue;
    }

    claimed.add(race.courseSlug);
    events.push(await adopt(race, { dryRun, providerId }));
    await sleep(REQUEST_DELAY_MS);
  }

  const ok = events.filter((e) => !e.error);
  console.log(`\nadopted   ${ok.length} / ${events.length} attempted`);

  if (dryRun) {
    console.log("dry-run: no GPX and no batch file written");
    return;
  }
  if (ok.length === 0) return;

  mkdirSync(RAW_DIR, { recursive: true });
  const out = join(RAW_DIR, `${batch}.raw.json`);
  const payload: RawBatch = {
    batch,
    fetchedAt: new Date().toISOString(),
    query: { source: "adoptions.json", races: String(events.length) },
    events,
  };
  writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`wrote ${out}`);
  console.log(
    `\nnext: npm run import:parse -- --only ${ok.map((e) => e.courseSlug).join(",")} ` +
      `--report data/import/reports/${batch}.qa.json`,
  );
}

main(process.argv.slice(2)).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
