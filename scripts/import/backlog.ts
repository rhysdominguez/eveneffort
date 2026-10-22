// The one backlog (ROADMAP #23).
//
//   node scripts/import/backlog.ts              # regenerate + re-rank
//   node scripts/import/backlog.ts --top 20     # print the next twenty to work
//   node scripts/import/backlog.ts --stats      # per-source-class hit rates
//   node scripts/import/backlog.ts --dry-run
//
// Flags:
//   --top <n>        print the n highest-scoring open rows and exit
//   --country <cc>   restrict --top to one country
//   --stats          print source-class hit rates from source-hits.json
//   --dry-run        compute and summarise; write no CSV
//
// Why this exists: before #23 the races we do not have were recorded in three
// places, in three shapes, none of them ranked.
//
//   1. data/import/findmymarathon-tracker.csv — the full findmymarathon
//      calendar (771 races on 2026-09-25), of which ~550 have no goandrace
//      listing in any crawl. Overwhelmingly US regional. Carries finisher
//      counts, which rank.ts scores as reach.
//   2. data/import/decisions.json — 205 races goandrace *did* list and that
//      were rejected for the single reason "event page links no course map".
//      These are the cheapest rows in the whole backlog and nobody had ever
//      looked at them as a worklist: the race, its city and often its website
//      are already known, and only the geometry is missing.
//   3. data/import/world-roster.csv — the international roster, new in #23.
//      Neither of the other two can see outside the US, which is why we seed
//      112 US courses and 2 Brazilian.
//
// This merges the three, drops anything already seeded, scores every row for
// reach (rank.ts) and writes one ordered CSV. It is regenerated rather than
// hand-maintained, but it is committed, because it carries the columns a human
// fills in as they work — which source class was tried, how many attempts a
// row has cost, and what was concluded.
//
// Offline by construction. Every input is a file in this repo.

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { score, type RankInput } from "./rank.ts";
import { loadRoster, type Label } from "./roster.ts";
import {
  DECISIONS_PATH,
  IMPORT_DIR,
  RAW_DIR,
  cityOf,
  cleanDisplayName,
  countryOf,
  findNameMatch,
  flagValue,
  flagNumber,
  parseCsv,
  proposeCourseSlug,
  toCsv,
  type DecisionFile,
  type RawEvent,
} from "./shared.ts";
import { SERIES_SEED } from "../../src/db/seed/series.ts";

import { PUBLISHED_COURSE_SLUGS } from "../../src/db/seed/slug-ledger.ts";

const BACKLOG_CSV = join(IMPORT_DIR, "backlog.csv");
const TRACKER_CSV = join(IMPORT_DIR, "findmymarathon-tracker.csv");
const HITS_PATH = join(IMPORT_DIR, "source-hits.json");

/**
 * Where a row was discovered. Not the same thing as where its geometry will
 * come from — that is `sourceClass`, and finding it is the work.
 */
export type Discovery = "findmymarathon" | "goandrace" | "wikipedia";

/**
 * The geometry source classes, in the order they are worth trying.
 *
 * Recording which one landed a course is the point: at ~900 rows, a session
 * that knows the organizer's own site works four times out of five and route
 * hosts are inadmissible does not rediscover that. See docs/COURSE-RIGHTS.md
 * for what each class is and whether it may ship.
 */
export type SourceClass =
  | "" // not yet worked
  | "organizer" // the race's own site published a route file
  | "certification" // USATF/AIMS certificate — validation and a trace input
  | "gis" // a municipal or event GIS file
  | "traced" // drawn from the published course map (trace.ts)
  | "none-found"; // worked honestly, nothing usable exists

export type BacklogStatus =
  | "open" // work it
  | "in-db" // already seeded; kept so it is not re-proposed
  | "shipped" // promoted by this sweep
  | "no-source"; // worked, nothing found; revisit only if a source appears

const HEADER = [
  "raceSlug", "name", "city", "region", "countryCode", "nextDate",
  "discoverySource", "sourceUrl", "status", "reachScore", "reachBasis",
  "sourceClass", "sourceAttempts", "lastAttemptedAt", "note",
] as const;

export interface BacklogRow {
  raceSlug: string;
  name: string;
  city: string;
  region: string;
  countryCode: string;
  nextDate: string;
  discoverySource: Discovery;
  sourceUrl: string;
  status: BacklogStatus;
  reachScore: number;
  reachBasis: string;
  sourceClass: SourceClass;
  sourceAttempts: number;
  lastAttemptedAt: string;
  note: string;
}

// -------------------------------------------------------------- feeders

/** ISO passes through; `01/09/2027` (the pre-snapshot tracker's US order) -> `2027-01-09`. */
function isoDate(date: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) return date.trim();
  const m = date.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : "";
}

interface Candidate extends RankInput {
  raceSlug: string;
  name: string;
  region: string;
  discoverySource: Discovery;
  sourceUrl: string;
  note: string;
}

/** Feeder 1: the findmymarathon tracker's unreachable and map-less rows. */
function fromTracker(): Candidate[] {
  if (!existsSync(TRACKER_CSV)) return [];
  const rows = parseCsv(readFileSync(TRACKER_CSV, "utf8"));
  const header = rows.shift() ?? [];
  const col = (r: string[], name: string) => r[header.indexOf(name)] ?? "";

  const out: Candidate[] = [];
  for (const r of rows) {
    if (r.length < header.length) continue;
    const status = col(r, "status");
    if (status !== "not-on-source" && status !== "no-course-map" && status !== "past-event") continue;
    const name = col(r, "Marathon Name");
    if (!name) continue;
    const region = col(r, "State/Country");
    out.push({
      raceSlug: col(r, "courseSlug") || proposeCourseSlug(name),
      name,
      city: cityOf(col(r, "City")),
      region,
      countryCode: countryOf(region) ?? "",
      nextDate: isoDate(col(r, "Date")) || null,
      label: null,
      isMajor: false,
      inception: null,
      finishers: Number(col(r, "latestFinishers")) || null,
      discoverySource: "findmymarathon",
      // The goandrace listing when there is one, else the organizer's own site
      // as findmymarathon links it: where the adoption search starts.
      sourceUrl: col(r, "sourceUrl") || col(r, "website"),
      note: status === "no-course-map" ? "goandrace lists it, no course map" : "",
    });
  }
  return out;
}

/**
 * Feeder 2: races goandrace listed but that were rejected for want of geometry.
 *
 * Only that one reason qualifies. A rejection for a duplicate match is not a
 * missing race, and one for a distance failure is a race whose published file
 * is wrong rather than absent — re-proposing either would put work back on the
 * list that was already correctly taken off it.
 */
const NO_MAP_REASON = "event page links no course map";

/**
 * What the crawls already know about a rejected event: its real name, city and
 * country, none of which qa.ts keeps for a rejection.
 *
 * `data/import/raw/` is gitignored and disposable, so this is enrichment and
 * never a requirement: on a fresh checkout the map is empty, those rows keep
 * the name recovered from their slug, and rank.ts scores them without a country
 * rather than guessing one. Regenerating the crawl restores the detail.
 */
function crawledByUrl(): Map<string, RawEvent> {
  const byUrl = new Map<string, RawEvent>();
  if (!existsSync(RAW_DIR)) return byUrl;
  for (const file of readdirSync(RAW_DIR)) {
    if (!file.endsWith(".json")) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(join(RAW_DIR, file), "utf8"));
    } catch {
      continue; // a half-written crawl is not a reason to fail the report
    }
    const events: RawEvent[] = Array.isArray(parsed)
      ? (parsed as RawEvent[])
      : ((parsed as { events?: RawEvent[] }).events ?? []);
    for (const e of events) if (e.eventUrl) byUrl.set(e.eventUrl, e);
  }
  return byUrl;
}

function fromDecisions(): Candidate[] {
  if (!existsSync(DECISIONS_PATH)) return [];
  const file = JSON.parse(readFileSync(DECISIONS_PATH, "utf8")) as DecisionFile;
  const crawled = crawledByUrl();
  const out: Candidate[] = [];
  for (const c of file.courses ?? []) {
    if (c.verdict !== "rejected") continue;
    if (!c.reasons.some((r) => r.includes(NO_MAP_REASON))) continue;
    // The event URL is the only place the name and city survive for a rejected
    // entry: qa.ts writes no series or city block for one, by design.
    const url = c.source.eventUrl ?? "";
    const crawl = crawled.get(url);
    out.push({
      raceSlug: c.courseSlug,
      name: crawl ? cleanDisplayName(crawl.name) : nameFromSlug(c.courseSlug),
      city: crawl?.locality || cityFromEventUrl(url),
      region: crawl?.region ?? "",
      countryCode: crawl?.countryCode ?? "",
      nextDate: crawl?.startDate ?? null,
      label: null,
      isMajor: false,
      inception: null,
      discoverySource: "goandrace",
      // The organizer's own site is the one we actually want; the event page is
      // the fallback, and it is where the organizer URL was read from anyway.
      sourceUrl: crawl?.websiteUrl || url,
      note: "goandrace listed it without a course map",
    });
  }
  return out;
}

/** `pisa-marathon` -> `Pisa Marathon`. Only for display; the slug is the id. */
function nameFromSlug(slug: string): string {
  return slug.split("-").map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
}

/** goandrace event URLs end `<name>-<year>-<city>.php`. */
function cityFromEventUrl(url: string): string {
  const m = url.match(/-(19|20)\d{2}-([a-z0-9-]+)\.php$/i);
  if (!m) return "";
  return m[2].split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}

/** Feeder 3: the world roster. */
function fromRoster(): Candidate[] {
  return loadRoster().map((r) => ({
    raceSlug: r.raceSlug,
    name: r.name,
    city: r.city,
    region: "",
    countryCode: r.countryCode,
    // The roster publishes a month, never a date. A month is enough for the
    // proximity signal, so it is projected onto the next occurrence of that
    // month — and it lands in `nextDate` only as a hint, never as an edition
    // date. The real date comes off the organizer's own site at adopt time.
    nextDate: r.month ? nextOccurrence(r.month) : null,
    label: r.label as Label,
    isMajor: r.isMajor,
    inception: r.inception,
    discoverySource: "wikipedia",
    sourceUrl: r.websiteUrl,
    note: "",
  }));
}

function nextOccurrence(month: number, today = new Date()): string {
  const year = month >= today.getUTCMonth() + 1 ? today.getUTCFullYear() : today.getUTCFullYear() + 1;
  return `${year}-${String(month).padStart(2, "0")}-15`;
}

// --------------------------------------------------------------- dedupe

/**
 * Is this race already in the catalog?
 *
 * Three checks, because a race reaches us under three different spellings. The
 * slug check is exact and catches a re-proposal; the ledger check catches a
 * retired slug that must never be reused (Rule 8); the name+city check is the
 * same fuzzy guard fetch.ts and adopt.ts use, and is the only one that catches
 * "Flying Pig Marathon" against the seeded "Cincinnati Flying Pig Marathon".
 */
function seededMatch(
  candidate: Candidate,
  published: Set<string>,
  seriesBySlug: Set<string>,
): string | null {
  if (published.has(candidate.raceSlug)) return candidate.raceSlug;
  if (seriesBySlug.has(candidate.raceSlug)) return candidate.raceSlug;
  const dup = findNameMatch(candidate.name, candidate.city, SERIES_SEED);
  return dup ? dup.name : null;
}

// ----------------------------------------------------------------- main

function loadExisting(): Map<string, BacklogRow> {
  if (!existsSync(BACKLOG_CSV)) return new Map();
  const rows = parseCsv(readFileSync(BACKLOG_CSV, "utf8"));
  const header = rows.shift() ?? [];
  const col = (r: string[], name: string) => r[header.indexOf(name)] ?? "";
  const out = new Map<string, BacklogRow>();
  for (const r of rows) {
    if (r.length < header.length) continue;
    const slug = col(r, "raceSlug");
    if (!slug) continue;
    out.set(slug, {
      raceSlug: slug,
      name: col(r, "name"),
      city: col(r, "city"),
      region: col(r, "region"),
      countryCode: col(r, "countryCode"),
      nextDate: col(r, "nextDate"),
      discoverySource: col(r, "discoverySource") as Discovery,
      sourceUrl: col(r, "sourceUrl"),
      status: col(r, "status") as BacklogStatus,
      reachScore: Number(col(r, "reachScore")) || 0,
      reachBasis: col(r, "reachBasis"),
      sourceClass: col(r, "sourceClass") as SourceClass,
      sourceAttempts: Number(col(r, "sourceAttempts")) || 0,
      lastAttemptedAt: col(r, "lastAttemptedAt"),
      note: col(r, "note"),
    });
  }
  return out;
}

function build(): BacklogRow[] {
  const published = new Set(PUBLISHED_COURSE_SLUGS);
  const seriesCourseSlugs = new Set(SERIES_SEED.map((s) => s.courseSlug));
  const existing = loadExisting();

  // Feeder order is the order a row's own facts are trusted in. The roster
  // comes last but wins on the fields it alone knows (label, inception), while
  // the tracker alone knows a real date. A row seen twice is merged, not
  // duplicated.
  const merged = new Map<string, Candidate>();
  for (const c of [...fromTracker(), ...fromDecisions(), ...fromRoster()]) {
    if (!c.raceSlug) continue;
    const prior = merged.get(c.raceSlug);
    if (!prior) {
      merged.set(c.raceSlug, c);
      continue;
    }
    merged.set(c.raceSlug, {
      ...prior,
      city: prior.city || c.city,
      region: prior.region || c.region,
      countryCode: prior.countryCode || c.countryCode,
      nextDate: prior.nextDate ?? c.nextDate,
      sourceUrl: prior.sourceUrl || c.sourceUrl,
      label: prior.label ?? c.label,
      isMajor: prior.isMajor || c.isMajor,
      inception: prior.inception ?? c.inception,
    });
  }

  const rows: BacklogRow[] = [];
  for (const c of merged.values()) {
    const prior = existing.get(c.raceSlug);
    const seeded = seededMatch(c, published, seriesCourseSlugs);

    // A hand-set score survives regeneration. `reachBasis: manual` is the
    // marker, and it is a marker rather than a separate file because the
    // person overriding the score is looking at this row in a spreadsheet.
    const manual = prior?.reachBasis === "manual";
    const ranked = manual
      ? { score: prior.reachScore, basis: "manual" }
      : score(c);

    rows.push({
      raceSlug: c.raceSlug,
      name: c.name,
      city: c.city,
      region: c.region,
      countryCode: c.countryCode,
      nextDate: c.nextDate ?? "",
      discoverySource: c.discoverySource,
      sourceUrl: c.sourceUrl,
      status: seeded
        ? // A row that shipped this sweep and a row that was already seeded are
          // the same fact once the seed files land; `shipped` is kept only
          // until the next regeneration sees it in the ledger.
          "in-db"
        : prior?.status === "no-source"
          ? "no-source"
          : "open",
      reachScore: ranked.score,
      reachBasis: ranked.basis,
      sourceClass: prior?.sourceClass ?? "",
      sourceAttempts: prior?.sourceAttempts ?? 0,
      lastAttemptedAt: prior?.lastAttemptedAt ?? "",
      note: prior?.note || c.note || (seeded && seeded !== c.raceSlug ? `seeded as ${seeded}` : ""),
    });
  }

  rows.sort((a, b) => b.reachScore - a.reachScore || a.raceSlug.localeCompare(b.raceSlug));
  return rows;
}

// ---------------------------------------------------------------- reports

interface HitFile {
  updatedAt: string;
  classes: Record<string, { attempts: number; hits: number }>;
}

function printStats(rows: BacklogRow[]): void {
  const worked = rows.filter((r) => r.sourceClass !== "");
  if (worked.length === 0) {
    console.log(
      "No row has been worked yet. Fill in `sourceClass` as you work rows and\n" +
        "re-run this with --stats to see which class is worth trying first.",
    );
    return;
  }
  const byClass = new Map<string, { attempts: number; hits: number }>();
  for (const r of worked) {
    const e = byClass.get(r.sourceClass) ?? { attempts: 0, hits: 0 };
    e.attempts += Math.max(1, r.sourceAttempts);
    if (r.status === "in-db" || r.status === "shipped") e.hits += 1;
    byClass.set(r.sourceClass, e);
  }
  console.log("\nsource class       attempts   hits   rate");
  for (const [cls, e] of [...byClass].sort((a, b) => b[1].hits - a[1].hits)) {
    const rate = e.attempts > 0 ? `${Math.round((100 * e.hits) / e.attempts)}%` : "—";
    console.log(`  ${cls.padEnd(16)} ${String(e.attempts).padStart(6)} ${String(e.hits).padStart(6)}   ${rate}`);
  }
  const hits: HitFile = {
    updatedAt: new Date().toISOString().slice(0, 10),
    classes: Object.fromEntries(byClass),
  };
  writeFileSync(HITS_PATH, `${JSON.stringify(hits, null, 2)}\n`);
  console.log(`\nwrote ${HITS_PATH}`);
}

function printTop(rows: BacklogRow[], n: number, country: string | null): void {
  const open = rows.filter(
    (r) => r.status === "open" && (!country || r.countryCode === country.toUpperCase()),
  );
  console.log(`\ntop ${Math.min(n, open.length)} of ${open.length} open rows:\n`);
  for (const r of open.slice(0, n)) {
    console.log(
      `  ${String(r.reachScore).padStart(3)}  ${r.raceSlug.padEnd(38)} ` +
        `${`${r.city}, ${r.countryCode}`.padEnd(28)} ${r.sourceUrl || "(no url)"}`,
    );
    console.log(`       ${r.reachBasis}`);
  }
}

function main(argv: string[]): void {
  const rows = build();

  if (argv.includes("--stats")) {
    printStats(rows);
    return;
  }

  const open = rows.filter((r) => r.status === "open");
  const byDiscovery = open.reduce<Record<string, number>>((acc, r) => {
    acc[r.discoverySource] = (acc[r.discoverySource] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`${rows.length} rows  ·  ${open.length} open  ·  ${rows.length - open.length} closed`);
  console.log(`  ${Object.entries(byDiscovery).map(([k, v]) => `${v} ${k}`).join(" · ")}`);
  console.log(`  ${new Set(open.map((r) => r.countryCode).filter(Boolean)).size} countries represented`);

  const top = flagValue(argv, "--top");
  if (top !== null) {
    printTop(rows, flagNumber(argv, "--top", 20), flagValue(argv, "--country"));
    return;
  }

  if (argv.includes("--dry-run")) {
    console.log("\ndry-run: no CSV written");
    return;
  }

  writeFileSync(
    BACKLOG_CSV,
    toCsv(
      HEADER,
      rows.map((r) => [
        r.raceSlug, r.name, r.city, r.region, r.countryCode, r.nextDate,
        r.discoverySource, r.sourceUrl, r.status, String(r.reachScore), r.reachBasis,
        r.sourceClass, String(r.sourceAttempts), r.lastAttemptedAt, r.note,
      ]),
    ),
  );
  console.log(`\nwrote ${BACKLOG_CSV}`);
  console.log("next: npm run import:backlog -- --top 20");
}


main(process.argv.slice(2));
