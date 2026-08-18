// Reconcile the findmymarathon CSV against what this repo has actually shipped.
//
//   node scripts/import/reconcile-csv.ts            # rewrite the tracker
//   node scripts/import/reconcile-csv.ts --summary  # print counts, write nothing
//   node scripts/import/reconcile-csv.ts --emit-batch csv-batch-01   # + a raw batch
//   node scripts/import/reconcile-csv.ts --adoptable   # list the not-on-source races
//
// The CSV is a 766-row list of US-centric marathon events, taken from
// findmymarathon.com — which is a useful roster of what exists and NOT a
// geometry source: its elevation charts are rendered JPEGs and it publishes no
// route data (see README.md). Most of this list is therefore out of reach of
// the bulk importer, whose only calendar is goandrace's ~377 forward events.
// The point of this script is to say which rows those are, and why, in a form
// that survives a session.
//
// 558 of them are `not-on-source`. Those are not dead — they are the worklist
// for adopt.ts, which takes a course file from the organiser's own site one
// race at a time.
//
// Every status is recomputed from the repo on each run — seeded slugs come out
// of slug-ledger.ts and series.ts, and source availability out of the raw
// crawls in data/import/raw/. Nothing here is hand-maintained, so re-running it
// after an import batch flips exactly the rows that batch landed and leaves the
// rest alone. That is what makes "is this list finished yet" a question you can
// answer by running a command rather than by reading a spreadsheet.

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  COURSE_DIR,
  DECISIONS_PATH,
  IMPORT_DIR,
  RAW_DIR,
  REPO_ROOT,
  findNameMatch,
  flagValue,
  matchTokens,
  nameSimilarity,
  type RawBatch,
  type RawEvent,
} from "./shared.ts";

const SOURCE_CSV = join(IMPORT_DIR, "findmymarathon_766_entries_no_url.csv");
const TRACKER_CSV = join(IMPORT_DIR, "findmymarathon-tracker.csv");

/**
 * Terminal statuses are answers; open statuses are work. `queued` is the only
 * status that means "this can still become an import".
 */
export type Status =
  | "in-db" // already seeded — nothing to do
  | "queued" // on goandrace with a GPX, waiting for a batch
  | "no-course-map" // listed on goandrace, no geometry published
  | "parser-rejected" // GPX fetched but failed parse_gpx.py's gates
  | "not-on-source" // no goandrace listing in any crawl — adoptable, see below
  | "past-event" // date already gone; not worth a slug
  | "no-date" // TBD date, or no name to identify the race by
  ;

/**
 * `queued` is the only status this pipeline can act on unattended.
 *
 * `not-on-source` is no longer terminal — those races are adoptable one at a
 * time via adopt.ts, from a course file a human finds on the organiser's own
 * site. It is deliberately not counted as "open" here, because that number
 * answers "how much can the importer still do by itself", and adoption cannot
 * be done by itself. See `--adoptable`.
 */
const OPEN: ReadonlySet<Status> = new Set<Status>(["queued"]);

interface CsvRow {
  name: string;
  cityField: string;
  state: string;
  date: string;
}

interface TrackerRow extends CsvRow {
  city: string;
  courseSlug: string;
  status: Status;
  sourceUrl: string;
  note: string;
}

// ---------------------------------------------------------------- csv

/** Minimal RFC-4180 reader — the source file quotes its city field. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') cur += c;
      else if (text[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cur);
      cur = "";
    } else if (c === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else if (c !== "\r") cur += c;
  }
  if (cur || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

function toCsvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** `"Kingwood, TX 01/01/2027"` -> `Kingwood`. */
function cityOf(field: string): string {
  return field
    .replace(/\s+\d{2}\/\d{2}\/\d{4}\s*$/, "")
    .replace(/\s+TBD\s*$/, "")
    .split(",")[0]
    .trim();
}

// ------------------------------------------------------------- matching
//
// Token matching itself (stop words, alias folding, year-stripping, the
// half/relay/trail differentiator guard) lives in shared.ts's
// nameSimilarity/findNameMatch — fetch.ts uses the same functions to catch a
// recurring race re-discovered under a new year's URL. Only what's specific
// to this CSV (its US-state/CA-province/non-ISO country column) stays here.

// The CSV writes "Ft. Lauderdale A1A" where goandrace writes "Publix Fort
// Lauderdale A1A"; without alias folding that scores 0.67 and the row closes
// out as unavailable while its GPX sits right there on the source.

// The CSV's fourth column is a US state, a Canadian province, or findmymarathon's
// own country abbreviation — which is not ISO. Mapping it to a real country code
// is what stops "Victoria Marathon" in British Columbia matching Victoria Falls
// in Zimbabwe, and "B and A Marathon" in Maryland matching Båstad in Sweden.
// Both scored above the name threshold on tokens alone.
const US_STATES = new Set(
  ("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO " +
    "MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY").split(" "),
);
const CA_PROVINCES = new Set("ON QC BC AB SK MB NS NB NL PE YT NT NU".split(" "));

/** findmymarathon's non-ISO country abbreviations, as they appear in the file. */
const CSV_COUNTRY: Record<string, string> = {
  GR: "DE", // Germany — Berlin, Hamburg and Frankfurt are all filed under GR
  GC: "GR", // Greece
  NR: "NL", // Netherlands
  AG: "AR", // Argentina
  AA: "AW", // Aruba
  CI: "KY", // Cayman Islands
  UK: "GB",
};

function countryOf(state: string): string | null {
  if (US_STATES.has(state)) return "US";
  if (CA_PROVINCES.has(state)) return "CA";
  if (!/^[A-Z]{2}$/.test(state)) return null;
  return CSV_COUNTRY[state] ?? state;
}

// ---------------------------------------------------------------- repo state

function seededSlugs(): string[] {
  const ledger = readFileSync(join(REPO_ROOT, "src/db/seed/slug-ledger.ts"), "utf8");
  return [...ledger.matchAll(/^\s+"([a-z0-9-]+)",/gm)].map((m) => m[1]);
}

function seededSeries(): { slug: string; name: string }[] {
  const src = readFileSync(join(REPO_ROOT, "src/db/seed/series.ts"), "utf8");
  return [...src.matchAll(/slug:\s*"([^"]+)",\s*\n\s*name:\s*"([^"]+)"/g)].map((m) => ({
    slug: m[1],
    name: m[2],
  }));
}

/**
 * Source slugs the GPX parser has already produced a course for. Survives the
 * rename a slug gets at enrichment, which the ledger alone cannot tell you.
 */
function parsedSourceSlugs(): Set<string> {
  return new Set(
    readdirSync(COURSE_DIR)
      .filter((f) => f.endsWith(".source.sha256"))
      .map((f) => f.slice(0, -".source.sha256".length)),
  );
}

/**
 * Verdicts already recorded against an event URL. A course the parser threw out
 * is not work waiting to happen — its GPX is quarantined and re-fetching it just
 * re-derives the same measurement. The event URL is the key because the slug is
 * the thing that changes.
 */
function priorVerdicts(): Map<string, { verdict: string; reason: string }> {
  const byUrl = new Map<string, { verdict: string; reason: string }>();
  if (!existsSync(DECISIONS_PATH)) return byUrl;
  const file = JSON.parse(readFileSync(DECISIONS_PATH, "utf8")) as {
    courses?: {
      source?: { eventUrl?: string };
      verdict?: string;
      reasons?: string[];
    }[];
  };
  for (const c of file.courses ?? []) {
    const url = c.source?.eventUrl;
    if (!url || !c.verdict) continue;
    byUrl.set(url, { verdict: c.verdict, reason: (c.reasons ?? []).join("; ") });
  }
  return byUrl;
}

/** Every event any crawl has ever seen, newest file wins on duplicate URLs. */
function crawledEvents(): RawEvent[] {
  const byUrl = new Map<string, RawEvent>();
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

// ---------------------------------------------------------------- classify

function classify(
  row: CsvRow,
  series: { slug: string; name: string }[],
  slugs: Set<string>,
  parsed: Set<string>,
  verdicts: Map<string, { verdict: string; reason: string }>,
  events: RawEvent[],
): TrackerRow {
  const city = cityOf(row.cityField);
  const label = row.name || (city ? `${city} Marathon` : "");
  const base: TrackerRow = {
    ...row,
    city,
    courseSlug: "",
    status: "not-on-source",
    sourceUrl: "",
    note: "",
  };

  if (!label) {
    return { ...base, status: "no-date", note: "no race name in the source row" };
  }

  // Seeded already? Name match against SERIES_SEED, or a direct ledger hit on
  // the slug the importer would have proposed for this name.
  let bestSeries = { score: 0, slug: "", name: "" };
  for (const s of series) {
    const score = nameSimilarity(label, s.name);
    if (score > bestSeries.score) bestSeries = { score, slug: s.slug, name: s.name };
  }
  const guess = [...matchTokens(label)].join("-");
  const ledgerHit = [...slugs].find((s) => s === guess || s === `${guess}-marathon`);
  if (bestSeries.score >= 0.99 || ledgerHit) {
    return {
      ...base,
      status: "in-db",
      courseSlug: ledgerHit ?? bestSeries.slug,
      note: bestSeries.name,
    };
  }

  const year = row.date.match(/\d{4}/)?.[0];
  if (!year) {
    return { ...base, status: "no-date", note: `date is "${row.date}"` };
  }
  // A past CSV date does not mean the race is gone — it means this specific
  // running already happened. Annual races recur, and goandrace's GPX for a
  // past edition measures the same course as next year's. So this checks the
  // source before giving up: only fall back to "past-event" once nothing on
  // goandrace answers for this row either.
  const isPast = Number(year) < new Date().getFullYear();

  // On goandrace? findNameMatch wants a city on the candidate, which RawEvent
  // calls `locality`; a country *disagreement* is disqualifying in a way a
  // city agreement never gets to be, so that's filtered before scoring rather
  // than folded into the shared match — country isn't reliable enough data on
  // fetch.ts's side to belong in the generic function.
  const country = countryOf(row.state);
  const inCountry = country
    ? events.filter((e) => !e.countryCode || e.countryCode === country)
    : events;
  const candidates = inCountry.map((e) => ({ ...e, name: e.name ?? "", citySlug: e.locality ?? "" }));
  const hit = findNameMatch(label, city, candidates, 0.85);
  if (!hit) {
    return isPast
      ? { ...base, status: "past-event", note: `listed ${row.date}` }
      : { ...base, status: "not-on-source", note: "no goandrace listing in any crawl" };
  }

  const event = hit;
  const shared = { ...base, sourceUrl: event.eventUrl, courseSlug: event.courseSlug };

  // The name match can miss what the slug catches: the CSV calls it "Bear Lake
  // Utah Marathon", goandrace calls it Bear Lake Trifecta Utah, and we shipped
  // it as `bear-lake-trifecta`. The parser's `<slug>.source.sha256` stamp is
  // left behind under the *source* slug when a course is renamed at enrichment,
  // which makes it the one durable link back to the event it came from.
  if (slugs.has(event.courseSlug) || parsed.has(event.courseSlug)) {
    return { ...shared, status: "in-db", note: `already imported from ${event.courseSlug}` };
  }

  // A verdict already recorded is the answer; do not re-queue settled work.
  const prior = verdicts.get(event.eventUrl);
  if (prior?.verdict === "rejected") {
    return { ...shared, status: "parser-rejected", note: prior.reason || "rejected at QA" };
  }

  if (event.gpxUrl) return { ...shared, status: "queued", note: event.name };
  return {
    ...shared,
    status: "no-course-map",
    note: event.error ?? "goandrace publishes no course map for this event",
  };
}

// ---------------------------------------------------------------- main

function main(argv: string[]): void {
  const summaryOnly = argv.includes("--summary");

  const text = readFileSync(SOURCE_CSV, "utf8").replace(/^﻿/, "");
  const table = parseCsv(text).filter((r) => r.length >= 4 && r.some((c) => c.trim()));
  table.shift(); // header
  const csv: CsvRow[] = table.map((r) => ({
    name: r[0].trim(),
    cityField: r[1].trim(),
    state: r[2].trim(),
    date: r[3].trim(),
  }));

  const series = seededSeries();
  const slugs = new Set(seededSlugs());
  const events = crawledEvents();
  const parsedSlugs = parsedSourceSlugs();
  const verdicts = priorVerdicts();
  const rows = csv.map((r) => classify(r, series, slugs, parsedSlugs, verdicts, events));

  const counts = new Map<Status, number>();
  for (const r of rows) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
  const open = rows.filter((r) => OPEN.has(r.status)).length;

  console.log(`source        ${csv.length} rows`);
  console.log(`crawl pool    ${events.length} goandrace events (${events.filter((e) => e.gpxUrl).length} with GPX)`);
  console.log(`seeded        ${slugs.size} course slugs in the ledger`);
  console.log("");
  for (const [status, n] of [...counts].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${status.padEnd(16)} ${String(n).padStart(4)}${OPEN.has(status) ? "  <- open" : ""}`);
  }
  console.log("");
  console.log(open === 0 ? "No rows left to import." : `${open} rows still importable.`);

  // not-on-source used to be the end of the conversation. It is now the adopt.ts
  // worklist, so print it as work rather than leaving it filed under "answers".
  const adoptable = rows.filter((r) => r.status === "not-on-source");
  if (adoptable.length > 0) {
    console.log(
      `${adoptable.length} more are adoptable one at a time — no goandrace listing, but the\n` +
        `organiser often publishes a course file. See --adoptable and adoptions.json.`,
    );
  }
  if (argv.includes("--adoptable")) {
    const byRegion = new Map<string, TrackerRow[]>();
    for (const r of adoptable) {
      byRegion.set(r.state, [...(byRegion.get(r.state) ?? []), r]);
    }
    console.log("\nadoptable, by state/country:\n");
    for (const [region, list] of [...byRegion].sort((a, b) => b[1].length - a[1].length)) {
      console.log(`  ${region.padEnd(5)} ${String(list.length).padStart(3)}`);
      for (const r of list) console.log(`        ${r.date}  ${r.name}`);
    }
  }

  // The queued rows are spread across every crawl we have ever run, but qa.ts
  // assesses exactly one raw batch file. Gathering them into a synthetic batch
  // is what lets a slice of this CSV enter the normal pipeline unchanged.
  const emit = flagValue(argv, "--emit-batch");
  if (emit) {
    const byUrl = new Map(events.map((e) => [e.eventUrl, e]));
    const queued = rows
      .filter((r) => r.status === "queued")
      .map((r) => byUrl.get(r.sourceUrl))
      .filter((e): e is RawEvent => Boolean(e));
    const batch: RawBatch = {
      batch: emit,
      fetchedAt: new Date().toISOString(),
      query: { source: "findmymarathon CSV reconciliation", rows: String(queued.length) },
      events: queued,
    };
    const path = join(RAW_DIR, `${emit}.raw.json`);
    writeFileSync(path, `${JSON.stringify(batch, null, 2)}\n`);
    console.log(`\nwrote ${path} — ${queued.length} events`);
    console.log(`\nnext: npm run import:parse -- --only ${queued.map((e) => e.courseSlug).join(",")} --report data/import/reports/${emit}.qa.json`);
  }

  if (summaryOnly) return;

  const header = "Marathon Name,City,State/Country,Date,courseSlug,status,sourceUrl,note";
  const body = rows.map((r) =>
    [r.name, r.cityField, r.state, r.date, r.courseSlug, r.status, r.sourceUrl, r.note]
      .map(toCsvField)
      .join(","),
  );
  writeFileSync(TRACKER_CSV, `${[header, ...body].join("\n")}\n`);
  console.log(`\nwrote ${TRACKER_CSV}`);
}

main(process.argv.slice(2));
