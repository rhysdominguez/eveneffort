// Reconcile the findmymarathon CSV against what this repo has actually shipped.
//
//   node scripts/import/reconcile-csv.ts            # rewrite the tracker
//   node scripts/import/reconcile-csv.ts --summary  # print counts, write nothing
//
// The CSV is a 766-row list of US-centric marathon events. Our only geometry
// source is goandrace.com, whose forward calendar is ~377 events, so most of
// this list is unreachable by the importer. The point of this script is to say
// which rows those are, and why, in a form that survives a session.
//
// Every status is recomputed from the repo on each run — seeded slugs come out
// of slug-ledger.ts and series.ts, and source availability out of the raw
// crawls in data/import/raw/. Nothing here is hand-maintained, so re-running it
// after an import batch flips exactly the rows that batch landed and leaves the
// rest alone. That is what makes "is this list finished yet" a question you can
// answer by running a command rather than by reading a spreadsheet.

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { COURSE_DIR, IMPORT_DIR, RAW_DIR, REPO_ROOT, type RawEvent } from "./shared.ts";

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
  | "not-on-source" // no goandrace listing in any crawl
  | "past-event" // date already gone; not worth a slug
  | "no-date" // TBD date, or no name to identify the race by
  ;

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

// Words that carry no identity: every row is a marathon, and "international
// annual city races" appears often enough to swamp a token overlap score.
const STOP = new Set([
  "marathon", "the", "of", "a", "and", "international", "annual",
  "run", "runs", "races", "race", "festival", "city", "st", "mt",
]);

// The two sources spell the same race differently often enough to matter. The
// CSV writes "Ft. Lauderdale A1A" where goandrace writes "Publix Fort
// Lauderdale A1A"; left alone that scores 0.67 and the row would be closed out
// as unavailable while its GPX sits on the source. Every entry here was added
// after seeing it cause a real miss.
const ALIASES: Record<string, string> = {
  ft: "fort",
  mount: "mt",
  mtn: "mountain",
  intl: "international",
  saint: "st",
  ste: "st",
  "&": "and",
  n: "and",
};

function tokens(input: string): Set<string> {
  return new Set(
    input
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .map((w) => ALIASES[w] ?? w)
      .filter((w) => w && !STOP.has(w)),
  );
}

/** Overlap against the *smaller* token set, so a sponsor prefix cannot sink a match. */
function similarity(a: string, b: string): number {
  const A = tokens(a);
  const B = tokens(b);
  if (A.size === 0 || B.size === 0) return 0;
  let shared = 0;
  for (const t of A) if (B.has(t)) shared += 1;
  return shared / Math.min(A.size, B.size);
}

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
    const score = similarity(label, s.name);
    if (score > bestSeries.score) bestSeries = { score, slug: s.slug, name: s.name };
  }
  const guess = [...tokens(label)].join("-");
  const ledgerHit = [...slugs].find((s) => s === guess || s === `${guess}-marathon`);
  if (bestSeries.score >= 0.99 || ledgerHit) {
    return {
      ...base,
      status: "in-db",
      courseSlug: ledgerHit ?? bestSeries.slug,
      note: bestSeries.name,
    };
  }

  // Dates we will never seed an edition for.
  const year = row.date.match(/\d{4}/)?.[0];
  if (!year) {
    return { ...base, status: "no-date", note: `date is "${row.date}"` };
  }
  if (Number(year) < new Date().getFullYear()) {
    return { ...base, status: "past-event", note: `listed ${row.date}` };
  }

  // On goandrace? A city agreement is worth a nudge but never a match on its
  // own — "Springfield Marathon" exists in three states. A country
  // *disagreement*, on the other hand, is disqualifying.
  const country = countryOf(row.state);
  let best = { score: 0, event: null as RawEvent | null };
  for (const e of events) {
    if (country && e.countryCode && e.countryCode !== country) continue;
    let score = similarity(label, e.name ?? "");
    if (e.locality && similarity(city, e.locality) > 0.5) score += 0.15;
    if (score > best.score) best = { score, event: e };
  }
  if (best.score < 0.85 || !best.event) {
    return { ...base, status: "not-on-source", note: "no goandrace listing in any crawl" };
  }

  const event = best.event;
  const shared = { ...base, sourceUrl: event.eventUrl, courseSlug: event.courseSlug };

  // The name match can miss what the slug catches: the CSV calls it "Bear Lake
  // Utah Marathon", goandrace calls it Bear Lake Trifecta Utah, and we shipped
  // it as `bear-lake-trifecta`. The parser's `<slug>.source.sha256` stamp is
  // left behind under the *source* slug when a course is renamed at enrichment,
  // which makes it the one durable link back to the event it came from.
  if (slugs.has(event.courseSlug) || parsed.has(event.courseSlug)) {
    return { ...shared, status: "in-db", note: `already imported from ${event.courseSlug}` };
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
  const rows = csv.map((r) => classify(r, series, slugs, parsedSlugs, events));

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
