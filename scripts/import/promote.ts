// Step 4 of the bulk course importer: apply a reviewed batch to the seed files.
//
//   node scripts/import/promote.ts --dry-run
//   node scripts/import/promote.ts
//
// Reads data/import/decisions.json — the committed record of which permanent
// course slugs a human approved — and applies every entry marked `ready` that
// is not already in the ledger. Re-running is a no-op.
//
// Flags:
//   --dry-run        print the diff summary; write nothing
//   --force          promote even with `review` entries left (does not skip
//                    `rejected` — those never promote)
//
// This is the step that spends permanent identifiers. Everything it writes is
// an APPEND: new entries go in before the closing bracket of the existing
// array, and nothing already in those files is rewritten or reordered. If this
// script ever needs to edit an existing line, that is a bug.
//
// Courses marked `rejected` have their GPX and any generated geometry moved to
// data/import/quarantine/. That is required, not housekeeping:
// src/data/courses.test.ts fails on any parsed course with no SERIES_SEED
// entry, so leaving a rejected course's JSON in src/data/courses/ turns the
// suite red.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  COURSE_DIR,
  GPX_DIR,
  DECISIONS_PATH,
  QUARANTINE_DIR,
  type DecisionFile,
  type StagedCourse,
} from "./shared.ts";
import { PUBLISHED_COURSE_SLUGS } from "../../src/db/seed/slug-ledger.ts";

const SEED_DIR = join(import.meta.dirname, "..", "..", "src", "db", "seed");

const CITIES = join(SEED_DIR, "cities.ts");
const SERIES = join(SEED_DIR, "series.ts");
const EDITIONS = join(SEED_DIR, "editions.ts");
const LEDGER = join(SEED_DIR, "slug-ledger.ts");

/** A TypeScript string literal, correctly escaped. */
function lit(value: string): string {
  return JSON.stringify(value);
}

/**
 * Insert `block` immediately before the closing bracket of the declaration that
 * starts at `anchor`. Deliberately dumb: it finds the first line that is exactly
 * `];` or `};` after the anchor, which is what every seed declaration in this
 * repo ends with. Throws rather than guessing if the shape has changed.
 */
function appendToDeclaration(
  source: string,
  anchor: string,
  block: string,
  file: string,
): string {
  const start = source.indexOf(anchor);
  if (start < 0) throw new Error(`could not find "${anchor}" in ${file}`);
  const closer = source.slice(start).search(/\n[\]}];\n/);
  if (closer < 0) throw new Error(`could not find the end of "${anchor}" in ${file}`);
  const at = start + closer + 1; // just after the newline, at the closing bracket
  return source.slice(0, at) + block + source.slice(at);
}

function cityBlock(courses: StagedCourse[], batch: string): string {
  const cities = courses.map((c) => c.city).filter((c) => c !== null);
  if (cities.length === 0) return "";
  const entries = cities
    .map(
      (c) => `  {
    slug: ${lit(c.slug)},
    name: ${lit(c.name)},
    countryCode: ${lit(c.countryCode)},
    countryName: ${lit(c.countryName)},
    regionCode: ${c.regionCode === null ? "null" : lit(c.regionCode)},
    regionName: ${c.regionName === null ? "null" : lit(c.regionName)},
    latitude: ${c.latitude},
    longitude: ${c.longitude},
    timezone: ${lit(c.timezone)},
  },
`,
    )
    .join("");
  return `  // Imported from goandrace.com — batch ${batch}.\n${entries}`;
}

function seriesBlock(courses: StagedCourse[], batch: string): string {
  const series = courses.map((c) => c.series).filter((s) => s !== null);
  if (series.length === 0) return "";
  const entries = series
    .map(
      (s) => `  {
    slug: ${lit(s.slug)},
    name: ${lit(s.name)},
    citySlug: ${lit(s.citySlug)},
    courseSlug: ${lit(s.courseSlug)},
    isMajor: ${s.isMajor},
    typicalMonth: ${s.typicalMonth},
    websiteUrl: ${lit(s.websiteUrl)},
    organizer: ${lit(s.organizer)},
  },
`,
    )
    .join("");
  return `  // Imported from goandrace.com — batch ${batch}.\n${entries}`;
}

function recurrenceBlock(courses: StagedCourse[], batch: string): string {
  const rules = courses.map((c) => c.recurrence).filter((r) => r !== null);
  if (rules.length === 0) return "";
  const entries = rules
    .map(
      (r) => `  ${lit(r.seriesSlug)}: {
    month: ${r.month},
    weekday: ${r.weekday},
    nth: ${r.nth},
    note: ${lit(r.note)},
  },
`,
    )
    .join("");
  return `  // Imported from goandrace.com — batch ${batch}. Each rule is derived\n` +
    `  // from one observed date, not from the organizer's own statement.\n${entries}`;
}

function editionBlock(courses: StagedCourse[], batch: string): string {
  const editions = courses.map((c) => c.edition).filter((e) => e !== null);
  if (editions.length === 0) return "";
  const entries = editions
    .map((e) => {
      const time = e.startTimeLocal
        ? `, startTimeLocal: ${lit(e.startTimeLocal)}`
        : "";
      return `  { seriesSlug: ${lit(e.seriesSlug)}, year: ${e.year}, raceDate: ${lit(e.raceDate)}${time} },\n`;
    })
    .join("");
  return `  // Imported from goandrace.com — batch ${batch}. Dates as published by\n` +
    `  // the event listing, or verified against the organizer during review.\n` +
    `  // startTimeLocal appears only where a real one was read off the\n` +
    `  // organizer's page — never guessed, since a wrong hour silently keys\n` +
    `  // the weather forecast to it.\n${entries}`;
}

function ledgerBlock(courses: StagedCourse[], batch: string): string {
  if (courses.length === 0) return "";
  const entries = courses.map((c) => `  ${lit(c.courseSlug)},\n`).join("");
  const today = new Date().toISOString().slice(0, 10);
  return `  // Batch ${batch}, imported from goandrace.com on ${today}.\n${entries}`;
}

function quarantine(slug: string, dryRun: boolean): string[] {
  const moved: string[] = [];
  const candidates = [
    [join(GPX_DIR, `${slug}.gpx`), join(QUARANTINE_DIR, `${slug}.gpx`)],
    [join(COURSE_DIR, `${slug}.json`), join(QUARANTINE_DIR, `${slug}.json`)],
    [join(COURSE_DIR, `${slug}.coords.json`), join(QUARANTINE_DIR, `${slug}.coords.json`)],
    [join(COURSE_DIR, `${slug}.profile.json`), join(QUARANTINE_DIR, `${slug}.profile.json`)],
  ];
  for (const [from, to] of candidates) {
    if (!existsSync(from)) continue;
    moved.push(from);
    if (!dryRun) {
      mkdirSync(QUARANTINE_DIR, { recursive: true });
      renameSync(from, to);
    }
  }
  return moved;
}

function main(): void {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const force = argv.includes("--force");

  if (!existsSync(DECISIONS_PATH)) {
    throw new Error(`no decisions file at ${DECISIONS_PATH} — run qa.ts first`);
  }
  const decisions = JSON.parse(
    readFileSync(DECISIONS_PATH, "utf8"),
  ) as DecisionFile;
  const batch = new Date().toISOString().slice(0, 10);

  // Anything already in the ledger has been promoted before. Skipping it is what
  // makes this script safe to re-run after a partially applied batch.
  const alreadyLive = new Set(PUBLISHED_COURSE_SLUGS);
  const outstanding = decisions.courses.filter((c) => !alreadyLive.has(c.courseSlug));

  const rejected = outstanding.filter((c) => c.verdict === "rejected");
  const pending = outstanding.filter((c) => c.verdict === "review");
  const ready = outstanding.filter((c) => c.verdict === "ready");

  if (pending.length > 0 && !force) {
    console.error(
      `${pending.length} course(s) still marked "review". Resolve them in\n` +
        `  ${DECISIONS_PATH}\n` +
        `by fixing the entry and setting its verdict to "ready" (or "rejected"),\n` +
        `then re-run. Use --force only if you have read every one of them.\n\n` +
        pending.map((c) => `  ? ${c.courseSlug}: ${c.reasons[0] ?? ""}`).join("\n"),
    );
    process.exit(1);
  }

  const promoting = force ? [...ready, ...pending] : ready;
  if (promoting.length === 0 && rejected.length === 0) {
    console.log("nothing to promote");
    return;
  }

  // Every one of these slugs becomes permanent the moment this commit ships.
  console.log(`promoting ${promoting.length} course(s)${dryRun ? " (dry run)" : ""}:`);
  for (const c of promoting) {
    console.log(
      `  ${c.courseSlug}  ->  city ${c.citySlug}${c.city ? " (new)" : " (existing)"}` +
        `, series ${c.series?.slug}, ${c.edition?.raceDate}`,
    );
  }

  for (const c of rejected) {
    const moved = quarantine(c.courseSlug, dryRun);
    console.log(
      `  rejected ${c.courseSlug}: ${moved.length} file(s) ${dryRun ? "would move" : "moved"} to quarantine`,
    );
  }

  if (promoting.length > 0) {
    const edits: [string, string][] = [];

    let cities = readFileSync(CITIES, "utf8");
    const cityText = cityBlock(promoting, batch);
    if (cityText) {
      cities = appendToDeclaration(cities, "export const CITY_SEED", cityText, CITIES);
      edits.push([CITIES, cities]);
    }

    let series = readFileSync(SERIES, "utf8");
    const seriesText = seriesBlock(promoting, batch);
    if (seriesText) {
      series = appendToDeclaration(series, "export const SERIES_SEED", seriesText, SERIES);
      edits.push([SERIES, series]);
    }

    let editions = readFileSync(EDITIONS, "utf8");
    const recurrenceText = recurrenceBlock(promoting, batch);
    const editionText = editionBlock(promoting, batch);
    if (recurrenceText) {
      editions = appendToDeclaration(
        editions,
        "export const RECURRENCE",
        recurrenceText,
        EDITIONS,
      );
    }
    if (editionText) {
      editions = appendToDeclaration(
        editions,
        "export const CONFIRMED_EDITIONS",
        editionText,
        EDITIONS,
      );
    }
    if (recurrenceText || editionText) edits.push([EDITIONS, editions]);

    let ledger = readFileSync(LEDGER, "utf8");
    ledger = appendToDeclaration(
      ledger,
      "export const PUBLISHED_COURSE_SLUGS",
      ledgerBlock(promoting, batch),
      LEDGER,
    );
    edits.push([LEDGER, ledger]);

    if (dryRun) {
      console.log(`\nwould edit:\n${edits.map(([f]) => `  ${f}`).join("\n")}`);
    } else {
      for (const [file, content] of edits) writeFileSync(file, content);
      console.log(`\nedited:\n${edits.map(([f]) => `  ${f}`).join("\n")}`);
    }
  }

  console.log(
    dryRun
      ? "\ndry run — nothing written"
      : "\nnext: npm run test && npm run build, then npm run db:seed",
  );
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
