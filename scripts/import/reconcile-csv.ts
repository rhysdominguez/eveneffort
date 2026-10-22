// Reconcile findmymarathon.com's calendar against what this repo has actually
// shipped, and write the tracker other sessions read.
//
//   node scripts/import/reconcile-csv.ts            # rewrite the tracker
//   node scripts/import/reconcile-csv.ts --summary  # print counts, write nothing
//   node scripts/import/reconcile-csv.ts --emit-batch csv-batch-01   # + a raw batch
//   node scripts/import/reconcile-csv.ts --adoptable   # list the not-on-source races
//   node scripts/import/reconcile-csv.ts --missing 25  # the 25 biggest races we lack
//
// Input is data/import/findmymarathon-calendar.csv, the full snapshot of
// https://findmymarathon.com/calendar-all.php that findmymarathon.ts writes
// (every race, every field the site publishes). Output is
// data/import/findmymarathon-tracker.csv: the same rows, each answering "do we
// have this race, with its elevation profile, and if not what is the next
// step". That file is the reference; point other sessions at it.
//
// findmymarathon is a roster, NOT a geometry source: its elevation charts are
// rendered JPEGs and it publishes no route data (see README.md). Most of this
// list is therefore out of reach of the bulk importer, whose only calendar is
// goandrace's. The rows it cannot reach are `not-on-source`, and they are the
// worklist for adopt.ts (organizer file, else a trace) rather than dead ends.
//
// Every status is recomputed from the repo on each run: seeded courses out of
// SERIES_SEED/CITY_SEED and the course files themselves, goandrace availability
// out of the raw crawls in data/import/raw/, prior research out of backlog.csv.
// Nothing here is hand-maintained except findmymarathon-matches.json (below),
// so re-running after an import batch flips exactly the rows that batch landed.

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  COURSE_DIR,
  DECISIONS_PATH,
  IMPORT_DIR,
  RAW_DIR,
  countryOf,
  findNameMatch,
  flagNumber,
  flagValue,
  haversineKm,
  matchTokens,
  nameSimilarity,
  parseCsv,
  proposeCourseSlug,
  toCsv,
  type RawBatch,
  type RawEvent,
} from "./shared.ts";
import { CALENDAR_CSV, CALENDAR_HEADER, type CalendarRow } from "./findmymarathon.ts";
import { SERIES_SEED } from "../../src/db/seed/series.ts";
import { CITY_SEED } from "../../src/db/seed/cities.ts";
import { PUBLISHED_COURSE_SLUGS } from "../../src/db/seed/slug-ledger.ts";

const TRACKER_CSV = join(IMPORT_DIR, "findmymarathon-tracker.csv");
const BACKLOG_CSV = join(IMPORT_DIR, "backlog.csv");
/**
 * Human rulings on matches the automatic rules get wrong, keyed
 * `"<findmymarathon name>|<region>"`. A course slug asserts "this is ours"; null
 * asserts "this is NOT the seeded race it looks like". Committed, and kept small:
 * add an entry only after seeing the rules get a specific row wrong.
 */
const MATCHES_PATH = join(IMPORT_DIR, "findmymarathon-matches.json");

/**
 * Terminal statuses are answers; open statuses are work. `queued` is the only
 * status that means "the importer can do this unattended".
 */
export type Status =
  | "in-db" // seeded, with a complete 44-point elevation profile
  | "queued" // on goandrace with a GPX, waiting for a batch
  | "no-course-map" // listed on goandrace, no geometry published
  | "parser-rejected" // GPX fetched but failed parse_gpx.py's gates
  | "not-on-source" // no goandrace listing in any crawl: adoptable
  | "past-event" // listed date gone and nothing on goandrace; confirm it still runs
  | "no-date"; // no name or date to identify the race by

const OPEN: ReadonlySet<Status> = new Set<Status>(["queued"]);

/** What the tracker adds in front of the calendar's own columns. */
const TRACKER_HEADER = [
  // Kept first and spelled as before: backlog.ts reads these by name.
  "Marathon Name", "City", "State/Country", "Date",
  "inSystem", "status", "courseSlug", "matchBasis", "elevationSource", "nextStep",
  "website", "sourceUrl", "latestFinishers", "profile", "courseType", "surface",
  "hasElevationChart", "maxElevation", "minElevation", "finishLat", "finishLon",
  "raceDates", "finishersByYear", "bostonQualifier", "bqPctByYear", "prScore",
  "courseScore", "wmmQualifier", "usSizeRank", "meanTemp", "avgHigh", "avgLow",
  "paceGroups", "registration", "detailUrl", "description", "note",
] as const;

interface TrackerRow {
  src: CalendarRow;
  status: Status;
  courseSlug: string;
  matchBasis: string;
  elevationSource: string;
  nextStep: string;
  sourceUrl: string;
  note: string;
}

// ---------------------------------------------------------------- repo state

interface SeededCourse {
  seriesSlug: string;
  name: string;
  courseSlug: string;
  cityName: string;
  countryCode: string;
  regionCode: string | null;
  /** Start and finish of the committed course line. Empty if no coords file. */
  ends: [number, number][];
}

function seededCourses(): SeededCourse[] {
  const cities = new Map(CITY_SEED.map((c) => [c.slug, c]));
  return SERIES_SEED.map((s) => {
    const city = cities.get(s.citySlug);
    return {
      seriesSlug: s.slug,
      name: s.name,
      courseSlug: s.courseSlug,
      cityName: city?.name ?? "",
      countryCode: city?.countryCode ?? "",
      regionCode: city?.regionCode ?? null,
      ends: courseEnds(s.courseSlug),
    };
  });
}

function courseEnds(slug: string): [number, number][] {
  const path = join(COURSE_DIR, `${slug}.coords.json`);
  if (!existsSync(path)) return [];
  const coords = JSON.parse(readFileSync(path, "utf8")) as [number, number][];
  return coords.length ? [coords[0], coords[coords.length - 1]] : [];
}

/**
 * "Fully in the system" means the pacing chart can actually be drawn: 44 finite
 * elevations, the coordinate line and the outline. A seeded series whose files
 * are incomplete is reported, not counted.
 */
function courseComplete(slug: string): boolean {
  const elev = join(COURSE_DIR, `${slug}.json`);
  if (!existsSync(elev)) return false;
  const values = JSON.parse(readFileSync(elev, "utf8")) as unknown;
  const ok44 = Array.isArray(values) && values.length === 44 && values.every(Number.isFinite);
  return (
    ok44 &&
    existsSync(join(COURSE_DIR, `${slug}.coords.json`)) &&
    existsSync(join(COURSE_DIR, `${slug}.outline.json`))
  );
}

interface Decision {
  courseSlug?: string;
  verdict?: string;
  reasons?: string[];
  source?: { eventUrl?: string; elevation?: string; geometry?: string; site?: string };
}

function decisions(): Decision[] {
  if (!existsSync(DECISIONS_PATH)) return [];
  return (JSON.parse(readFileSync(DECISIONS_PATH, "utf8")) as { courses?: Decision[] }).courses ?? [];
}

/** `gpx`, `dem:srtm30m`, `traced:…` — where a shipped course's profile came from. */
function elevationSources(all: Decision[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const d of all) {
    if (!d.courseSlug) continue;
    const parts = [d.source?.elevation ?? "gpx"];
    if (d.source?.geometry && d.source.geometry !== "gpx") parts.push(d.source.geometry);
    out.set(d.courseSlug, parts.join(" + "));
  }
  return out;
}

/**
 * Verdicts already recorded against an event URL. A course the parser threw out
 * is not work waiting to happen; re-fetching it re-derives the same measurement.
 */
function priorVerdicts(all: Decision[]): Map<string, { verdict: string; reason: string }> {
  const byUrl = new Map<string, { verdict: string; reason: string }>();
  for (const c of all) {
    const url = c.source?.eventUrl;
    if (!url || !c.verdict) continue;
    byUrl.set(url, { verdict: c.verdict, reason: (c.reasons ?? []).join("; ") });
  }
  return byUrl;
}

/** Source slugs the GPX parser produced a course for; survives a rename at enrichment. */
function parsedSourceSlugs(): Set<string> {
  return new Set(
    readdirSync(COURSE_DIR)
      .filter((f) => f.endsWith(".source.sha256"))
      .map((f) => f.slice(0, -".source.sha256".length)),
  );
}

/** Every event any goandrace crawl has seen, newest file wins on duplicate URLs. */
function crawledEvents(): RawEvent[] {
  const byUrl = new Map<string, RawEvent>();
  if (!existsSync(RAW_DIR)) return [];
  for (const file of readdirSync(RAW_DIR)) {
    if (!file.endsWith(".json")) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(join(RAW_DIR, file), "utf8"));
    } catch {
      continue; // a half-written crawl is not a reason to fail the whole report
    }
    const events: RawEvent[] = Array.isArray(parsed)
      ? (parsed as RawEvent[])
      : ((parsed as { events?: RawEvent[] }).events ?? []);
    for (const e of events) {
      const key = e.eventUrl || e.courseSlug;
      if (key) byUrl.set(key, e);
    }
  }
  return [...byUrl.values()];
}

/** What the adoption work already concluded about a race, from backlog.csv. */
function backlogAttempts(): Map<string, { status: string; sourceClass: string; at: string; note: string }> {
  const out = new Map<string, { status: string; sourceClass: string; at: string; note: string }>();
  if (!existsSync(BACKLOG_CSV)) return out;
  const rows = parseCsv(readFileSync(BACKLOG_CSV, "utf8"));
  const header = rows.shift() ?? [];
  const col = (r: string[], n: string) => r[header.indexOf(n)] ?? "";
  for (const r of rows) {
    if (r.length < header.length) continue;
    if (!col(r, "sourceClass") && col(r, "status") !== "no-source") continue;
    out.set(col(r, "raceSlug"), {
      status: col(r, "status"),
      sourceClass: col(r, "sourceClass"),
      at: col(r, "lastAttemptedAt"),
      note: col(r, "note"),
    });
  }
  return out;
}

function loadMatches(): Record<string, string | null> {
  if (!existsSync(MATCHES_PATH)) return {};
  const file = JSON.parse(readFileSync(MATCHES_PATH, "utf8")) as { matches?: Record<string, string | null> };
  return file.matches ?? {};
}

// ---------------------------------------------------------------- matching
//
// The old reconciler decided "in-db" by name alone, before it looked at
// geography, and 30-odd rows came out wrong: all eight "Bound for Boston"
// qualifiers matched Boston, London OH matched London, York PA matched New
// York City, Athens AR/GA/OH matched Athens in Greece, Victoria BC matched
// Victoria Falls. A shared name is necessary, never sufficient. The rules now:
//
//   1. Same country, and for the US and Canada the same state/province.
//   2. Name similarity >= 0.85 with findNameMatch's half/trail/relay guard.
//   3. Place: findmymarathon's finish line within 25 km of our course's start
//      or finish; or, when either side has no coordinate, the host city agrees
//      or the names are identical. A same-name race further than 60 km away is
//      a different race, whatever its name.

const NEAR_KM = 25;
const FAR_KM = 60;

/** Token overlap against the LARGER set: "Colorado Springs" vs "Colorado" is 0.5, not 1.0. */
function strictSimilarity(a: string, b: string): number {
  const A = matchTokens(a);
  const B = matchTokens(b);
  if (A.size === 0 || B.size === 0) return 0;
  let shared = 0;
  for (const t of A) if (B.has(t)) shared += 1;
  return shared / Math.max(A.size, B.size);
}

function finishOf(r: CalendarRow): [number, number] | null {
  const lat = Number(r.finishLat);
  const lon = Number(r.finishLon);
  return r.finishLat && r.finishLon && Number.isFinite(lat) && Number.isFinite(lon) ? [lat, lon] : null;
}

function kmTo(point: [number, number] | null, s: SeededCourse): number | null {
  if (!point || s.ends.length === 0) return null;
  return Math.min(...s.ends.map((e) => haversineKm(point, e)));
}

/** Same country, same US/CA subdivision, and not provably far apart. */
function placeAgrees(r: CalendarRow, s: SeededCourse): boolean {
  const country = countryOf(r.region);
  if (country && s.countryCode && s.countryCode !== country) return false;
  if ((country === "US" || country === "CA") && s.regionCode && s.regionCode !== `${country}-${r.region}`) return false;
  const km = kmTo(finishOf(r), s);
  return km === null || km <= FAR_KM;
}

function seededMatch(r: CalendarRow, seeded: SeededCourse[]): { course: SeededCourse; basis: string } | null {
  const finish = finishOf(r);
  let best: { course: SeededCourse; basis: string; rank: number } | null = null;

  for (const s of seeded) {
    if (!placeAgrees(r, s)) continue;
    if (!findNameMatch(r.name, r.city, [{ name: s.name, citySlug: s.cityName }], 0.85)) continue;
    if (nameSimilarity(r.name, s.name) < 0.85) continue; // the city nudge alone must not carry it

    const km = kmTo(finish, s);
    if (km !== null && km > FAR_KM) continue;
    const cityAgrees = nameSimilarity(r.city, s.cityName) > 0.4;
    const exactName = strictSimilarity(r.name, s.name) >= 0.99;
    const near = km !== null && km <= NEAR_KM;
    if (!(near || cityAgrees || (km === null && exactName))) continue;

    const rank = (near ? 2 : 0) + (cityAgrees ? 1 : 0) + strictSimilarity(r.name, s.name);
    const where = km !== null ? `${km.toFixed(1)} km` : cityAgrees ? "same city" : "same name, no coords";
    if (!best || rank > best.rank) {
      best = { course: s, rank, basis: `name ${nameSimilarity(r.name, s.name).toFixed(2)} · ${where}` };
    }
  }
  return best;
}

/** A seeded course close to this race's finish that did NOT match by name: worth a look. */
function nearbyUnmatched(r: CalendarRow, seeded: SeededCourse[]): string {
  const finish = finishOf(r);
  if (!finish) return "";
  let best: { s: SeededCourse; km: number } | null = null;
  for (const s of seeded) {
    const km = kmTo(finish, s);
    if (km !== null && km <= 3 && (!best || km < best.km)) best = { s, km };
  }
  return best ? `seeded ${best.s.courseSlug} starts/finishes ${best.km.toFixed(1)} km away; same race under another name?` : "";
}

// ---------------------------------------------------------------- classify

const NEXT_STEP: Record<Status, string> = {
  "in-db": "",
  queued: "goandrace has a GPX: import:reconcile --emit-batch, then parse/qa/promote",
  "no-course-map": "goandrace lists it without a map: adopt from the organizer site, else trace",
  "parser-rejected": "goandrace GPX failed the parser: adopt a better file from the organizer, else trace",
  "not-on-source": "adopt: organizer's course file, else trace the published map (elevation from DEM if the file has none)",
  "past-event": "last listed date is over a year old: confirm it still runs, then adopt",
  "no-date": "identify the race first",
};

interface Context {
  seeded: SeededCourse[];
  complete: (slug: string) => boolean;
  elevation: Map<string, string>;
  ledger: Set<string>;
  parsed: Set<string>;
  verdicts: Map<string, { verdict: string; reason: string }>;
  /** goandrace event URL -> the course slug it finally shipped as. */
  shippedByUrl: Map<string, string>;
  events: RawEvent[];
  attempts: ReturnType<typeof backlogAttempts>;
  matches: Record<string, string | null>;
  yearAgo: string;
}

function classify(src: CalendarRow, ctx: Context): TrackerRow {
  const row = (status: Status, extra: Partial<TrackerRow> = {}): TrackerRow => ({
    src,
    status,
    courseSlug: "",
    matchBasis: "",
    elevationSource: "",
    nextStep: NEXT_STEP[status],
    sourceUrl: "",
    note: "",
    ...extra,
  });
  const inDb = (courseSlug: string, matchBasis: string, note = ""): TrackerRow => {
    if (!ctx.complete(courseSlug)) {
      return row("in-db", {
        courseSlug,
        matchBasis,
        nextStep: "seeded but course files incomplete: rebuild the 44-point profile / outline",
        note,
      });
    }
    return row("in-db", {
      courseSlug,
      matchBasis,
      elevationSource: ctx.elevation.get(courseSlug) ?? "gpx",
      note,
    });
  };

  if (!src.name) return row("no-date", { note: "no race name in the source row" });

  // 0. A human ruling beats every rule below.
  const key = `${src.name}|${src.region}`;
  if (key in ctx.matches) {
    const ruled = ctx.matches[key];
    if (ruled) return inDb(ruled, "manual (findmymarathon-matches.json)");
  }
  const ruledOut = key in ctx.matches && ctx.matches[key] === null;

  // 1. Seeded already, by name + place.
  if (!ruledOut) {
    const hit = seededMatch(src, ctx.seeded);
    if (hit) return inDb(hit.course.courseSlug, hit.basis, hit.course.name);
  }
  const nearby = nearbyUnmatched(src, ctx.seeded);

  // 2. On goandrace? A country disagreement is disqualifying before scoring.
  const country = countryOf(src.region);
  const inCountry = country ? ctx.events.filter((e) => !e.countryCode || e.countryCode === country) : ctx.events;
  const candidates = inCountry.map((e) => ({ ...e, name: e.name ?? "", citySlug: e.locality ?? "" }));
  let event = findNameMatch(src.name, src.city, candidates, 0.85);
  // goandrace's listing carries a country but its region is free text, so a
  // hit that resolves to a course we already seed is checked against that
  // course's actual place: "Mesa Falls Marathon" (Ashton, ID) name-matches the
  // goandrace listing for the Mesa Marathon (AZ), which we seed. Same name,
  // different race; the listing is not this row's.
  //
  // The listing's slug is the *source* slug; enrichment often renamed it
  // (goandrace's `the-colorado-marathon` shipped as `colorado-marathon`), so
  // the shipped slug is resolved through decisions.json by event URL first.
  // Without that, "Colorado Springs Marathon" matched the Fort Collins race.
  const shippedSlug = event ? (ctx.shippedByUrl.get(event.eventUrl) ?? event.courseSlug) : "";
  const seededTwin = event ? ctx.seeded.find((s) => s.courseSlug === shippedSlug) : undefined;
  if (event && seededTwin && !placeAgrees(src, seededTwin)) event = null;

  // Prior adoption research, so nobody repeats a search that already failed.
  const attempt = ctx.attempts.get(event?.courseSlug ?? "") ?? ctx.attempts.get(proposeCourseSlug(src.name));
  const attemptNote = attempt
    ? `researched ${attempt.at || "earlier"}: ${attempt.sourceClass || attempt.status}${attempt.note ? ` (${attempt.note})` : ""}`
    : "";
  const notes = (...n: string[]) => n.filter(Boolean).join("; ");
  const researched = attempt?.status === "no-source" || attempt?.sourceClass === "none-found";

  if (event) {
    const shared = { sourceUrl: event.eventUrl, courseSlug: event.courseSlug };
    // The name match can miss what the slug catches ("Bear Lake Utah" vs
    // goandrace's "Bear Lake Trifecta", shipped as `bear-lake-trifecta`); the
    // parser's `<slug>.source.sha256` stamp outlives the rename.
    if (!ruledOut && seededTwin) {
      const renamed = shippedSlug !== event.courseSlug ? ` (renamed from ${event.courseSlug})` : "";
      return inDb(shippedSlug, `goandrace listing${renamed}`);
    }
    if (!ruledOut && ctx.ledger.has(event.courseSlug)) {
      return inDb(event.courseSlug, `goandrace ${event.courseSlug}`);
    }
    if (!ruledOut && ctx.parsed.has(event.courseSlug)) {
      return row("in-db", {
        ...shared,
        matchBasis: `goandrace ${event.courseSlug} (renamed at enrichment)`,
        note: `already imported from ${event.courseSlug}`,
        elevationSource: "gpx",
      });
    }
    const prior = ctx.verdicts.get(event.eventUrl);
    // fetch.ts's duplicate guard is name+city only, and it threw out real races
    // as copies of seeded ones: San Antonio as "Rock 'n' Roll San Diego", every
    // Bound for Boston as Boston. Reaching this line means the place check
    // above found no seeded twin, so that verdict was wrong; the listing is
    // worth another pass rather than being filed as a dead end.
    if (prior?.verdict === "rejected" && /already-seeded/.test(prior.reason)) {
      return row(event.gpxUrl ? "queued" : "no-course-map", {
        ...shared,
        nextStep: `goandrace rejected it as a duplicate, wrongly (different place): re-import with import:fetch -- --url ${event.eventUrl}${event.gpxUrl ? "" : ", or adopt if the listing has no map"}`,
        note: notes(prior.reason, attemptNote, nearby),
      });
    }
    if (prior?.verdict === "rejected") {
      return row(event.gpxUrl ? "parser-rejected" : "no-course-map", {
        ...shared,
        nextStep: researched ? "worked: no usable source found; revisit only if one appears" : NEXT_STEP[event.gpxUrl ? "parser-rejected" : "no-course-map"],
        note: notes(prior.reason || "rejected at QA", attemptNote, nearby),
      });
    }
    if (event.gpxUrl) return row("queued", { ...shared, note: notes(event.name ?? "", nearby) });
    return row("no-course-map", {
      ...shared,
      nextStep: researched ? "worked: no usable source found; revisit only if one appears" : NEXT_STEP["no-course-map"],
      note: notes(event.error ?? "goandrace publishes no course map for this event", attemptNote, nearby),
    });
  }

  if (!src.date) return row("no-date", { note: notes("no date on findmymarathon", nearby) });
  // A past date means this running happened and findmymarathon has not listed
  // the next one yet: not that the race is gone. Worth a still-runs check.
  // findmymarathon keeps showing the last running until the next date is
  // posted, so a date earlier this year is normal. Only a date more than a
  // year old suggests the race may have stopped.
  const status: Status = src.date < ctx.yearAgo ? "past-event" : "not-on-source";
  return row(status, {
    nextStep: researched ? "worked: no usable source found; revisit only if one appears" : NEXT_STEP[status],
    note: notes(attemptNote, nearby),
  });
}

// ---------------------------------------------------------------- main

function loadCalendar(): CalendarRow[] {
  if (!existsSync(CALENDAR_CSV)) {
    throw new Error(`${CALENDAR_CSV} is missing: run node scripts/import/findmymarathon.ts first`);
  }
  const table = parseCsv(readFileSync(CALENDAR_CSV, "utf8"));
  const header = table.shift() ?? [];
  return table
    .filter((r) => r.length >= header.length)
    .map((r) => Object.fromEntries(CALENDAR_HEADER.map((h) => [h, r[header.indexOf(h)] ?? ""])) as CalendarRow);
}

function main(argv: string[]): void {
  const calendar = loadCalendar();
  const all = decisions();
  const completeCache = new Map<string, boolean>();
  const ctx: Context = {
    seeded: seededCourses(),
    complete: (slug) => {
      if (!completeCache.has(slug)) completeCache.set(slug, courseComplete(slug));
      return completeCache.get(slug) ?? false;
    },
    elevation: elevationSources(all),
    ledger: new Set(PUBLISHED_COURSE_SLUGS),
    parsed: parsedSourceSlugs(),
    verdicts: priorVerdicts(all),
    shippedByUrl: new Map(
      all
        .filter((d) => d.courseSlug && d.source?.eventUrl && d.verdict === "ready")
        .map((d) => [d.source?.eventUrl ?? "", d.courseSlug ?? ""]),
    ),
    events: crawledEvents(),
    attempts: backlogAttempts(),
    matches: loadMatches(),
    yearAgo: new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10),
  };
  let rows = calendar.map((r) => classify(r, ctx));

  // One seeded course, several rows claiming it: "Irving Frost Marathon" and
  // "Seattle Ghost Marathon" are different races in the same city as the
  // Irving and Seattle marathons we seed, and nothing about place can tell
  // them apart. The row whose name is closest keeps the course; the others are
  // re-classified with it ruled out. A genuine double listing (a race run on
  // two days over one course) is settled in findmymarathon-matches.json.
  const claims = new Map<string, TrackerRow[]>();
  for (const r of rows) {
    if (r.status !== "in-db" || !r.courseSlug || r.matchBasis.startsWith("manual")) continue;
    claims.set(r.courseSlug, [...(claims.get(r.courseSlug) ?? []), r]);
  }
  const demoted = new Set<CalendarRow>();
  for (const [slug, claimants] of claims) {
    if (claimants.length < 2) continue;
    const seriesName = ctx.seeded.find((s) => s.courseSlug === slug)?.name ?? slug;
    const ranked = [...claimants].sort(
      (a, b) => strictSimilarity(b.src.name, seriesName) - strictSimilarity(a.src.name, seriesName),
    );
    for (const loser of ranked.slice(1)) demoted.add(loser.src);
  }
  if (demoted.size) {
    rows = rows.map((r) => {
      if (!demoted.has(r.src)) return r;
      const key = `${r.src.name}|${r.src.region}`;
      const again = classify(r.src, { ...ctx, matches: { ...ctx.matches, [key]: null } });
      return { ...again, note: [`name resembles seeded ${r.courseSlug}, kept apart as a different race`, again.note].filter(Boolean).join("; ") };
    });
  }

  const counts = new Map<Status, number>();
  for (const r of rows) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
  const have = rows.filter((r) => r.status === "in-db").length;

  console.log(`findmymarathon ${calendar.length} races (${CALENDAR_CSV.split("/").pop()})`);
  console.log(`crawl pool     ${ctx.events.length} goandrace events (${ctx.events.filter((e) => e.gpxUrl).length} with GPX)`);
  console.log(`seeded         ${ctx.seeded.length} series`);
  console.log(`\nin the system  ${have} / ${calendar.length} (${Math.round((100 * have) / calendar.length)}%)\n`);
  for (const [status, n] of [...counts].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${status.padEnd(16)} ${String(n).padStart(4)}${OPEN.has(status) ? "  <- importable now" : ""}`);
  }
  const dup = new Map<string, string[]>();
  for (const r of rows) if (r.status === "in-db" && r.courseSlug && !r.matchBasis.startsWith("manual")) dup.set(r.courseSlug, [...(dup.get(r.courseSlug) ?? []), r.src.name]);
  const shared = [...dup].filter(([, names]) => names.length > 1);
  if (shared.length) {
    console.log("\none course answering for several findmymarathon rows (check these):");
    for (const [slug, names] of shared) console.log(`  ${slug.padEnd(34)} ${names.join(" | ")}`);
  }

  const missing = rows.filter((r) => r.status !== "in-db" && r.status !== "no-date");
  if (argv.includes("--adoptable")) {
    const adoptable = rows.filter((r) => r.status === "not-on-source");
    console.log(`\n${adoptable.length} adoptable (no goandrace listing):\n`);
    for (const r of adoptable) console.log(`  ${r.src.date}  ${r.src.region.padEnd(3)} ${r.src.name}  ${r.src.website}`);
  }
  const top = flagValue(argv, "--missing");
  if (top !== null) {
    const n = flagNumber(argv, "--missing", 25);
    const ranked = [...missing]
      .filter((r) => !r.nextStep.startsWith("worked"))
      .sort((a, b) => (Number(b.src.latestFinishers) || 0) - (Number(a.src.latestFinishers) || 0));
    console.log(`\n${n} largest races we do not have (by latest finishers):\n`);
    for (const r of ranked.slice(0, n)) {
      console.log(
        `  ${(r.src.latestFinishers || "?").padStart(6)}  ${r.src.date}  ${`${r.src.name} (${r.src.city}, ${r.src.region})`.padEnd(58)} ${r.status}`,
      );
      console.log(`          ${r.sourceUrl || r.src.website || "(no website listed)"}`);
    }
  }

  // The queued rows are spread across every crawl we have run, but qa.ts
  // assesses exactly one raw batch file; this gathers them into one.
  const emit = flagValue(argv, "--emit-batch");
  if (emit) {
    const byUrl = new Map(ctx.events.map((e) => [e.eventUrl, e]));
    const queued = rows
      .filter((r) => r.status === "queued")
      .map((r) => byUrl.get(r.sourceUrl))
      .filter((e): e is RawEvent => Boolean(e));
    const batch: RawBatch = {
      batch: emit,
      fetchedAt: new Date().toISOString(),
      query: { source: "findmymarathon reconciliation", rows: String(queued.length) },
      events: queued,
    };
    const path = join(RAW_DIR, `${emit}.raw.json`);
    writeFileSync(path, `${JSON.stringify(batch, null, 2)}\n`);
    console.log(`\nwrote ${path}: ${queued.length} events`);
    console.log(`\nnext: npm run import:parse -- --only ${queued.map((e) => e.courseSlug).join(",")} --report data/import/reports/${emit}.qa.json`);
  }

  if (argv.includes("--summary")) return;

  const body = rows.map((r) => {
    const s = r.src;
    const byName: Record<(typeof TRACKER_HEADER)[number], string> = {
      "Marathon Name": s.name,
      City: s.city,
      "State/Country": s.region,
      Date: s.date,
      inSystem: r.status === "in-db" && r.elevationSource ? "yes" : "no",
      status: r.status,
      courseSlug: r.courseSlug,
      matchBasis: r.matchBasis,
      elevationSource: r.elevationSource,
      nextStep: r.nextStep,
      sourceUrl: r.sourceUrl,
      note: r.note,
      website: s.website,
      latestFinishers: s.latestFinishers,
      profile: s.profile,
      courseType: s.courseType,
      surface: s.surface,
      hasElevationChart: s.hasElevationChart,
      maxElevation: s.maxElevation,
      minElevation: s.minElevation,
      finishLat: s.finishLat,
      finishLon: s.finishLon,
      raceDates: s.raceDates,
      finishersByYear: s.finishersByYear,
      bostonQualifier: s.bostonQualifier,
      bqPctByYear: s.bqPctByYear,
      prScore: s.prScore,
      courseScore: s.courseScore,
      wmmQualifier: s.wmmQualifier,
      usSizeRank: s.usSizeRank,
      meanTemp: s.meanTemp,
      avgHigh: s.avgHigh,
      avgLow: s.avgLow,
      paceGroups: s.paceGroups,
      registration: s.registration,
      detailUrl: s.detailUrl,
      description: s.description,
    };
    return TRACKER_HEADER.map((h) => byName[h]);
  });
  writeFileSync(TRACKER_CSV, toCsv(TRACKER_HEADER, body));
  console.log(`\nwrote ${TRACKER_CSV}`);
}

main(process.argv.slice(2));
