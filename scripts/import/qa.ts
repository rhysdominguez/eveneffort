// Step 3 of the bulk course importer: the QA gate the GPX parser's README has
// referenced since before it existed.
//
// Reads what fetch.ts scraped and what parse_gpx.py measured, cross-checks the
// two, and proposes the city / series / recurrence / edition rows each course
// would need. Nothing here writes into src/ — the output is data/import/
// decisions.json, which a human reads and edits. promote.ts is what applies it.
//
//   node scripts/import/qa.ts --batch import-2026-08-07
//
// Flags:
//   --batch <name>   which raw crawl to assess (required)
//   --quiet          suppress the per-course table
//
// A course comes out `ready`, `review` or `rejected`. `review` is not a
// failure — it is the normal state for anything the site does not publish
// (region codes, organizer names) and for every timezone in a country that
// spans more than one. Promote refuses to run until nothing is left in it.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  COUNTRY_NAMES,
  COURSE_DIR,
  DECISIONS_PATH,
  IMPORT_DIR,
  RAW_DIR,
  REPORT_DIR,
  cleanDisplayName,
  flagValue,
  guessTimezone,
  haversineKm,
  isValidTimezone,
  slugify,
  type DecisionFile,
  type RawBatch,
  type RawEvent,
  type StagedCourse,
  type Verdict,
} from "./shared.ts";
import { CITY_SEED } from "../../src/db/seed/cities.ts";
import { SERIES_SEED } from "../../src/db/seed/series.ts";
import { PUBLISHED_COURSE_SLUGS, COURSE_SLUG_PATTERN } from "../../src/db/seed/slug-ledger.ts";

/** One entry from parse_gpx.py's --report JSON. */
interface ParserEntry {
  slug: string;
  status: "ok" | "skipped" | "failed";
  error?: string;
  total_km?: number;
  gain_m?: number;
  start?: [number, number];
  gpx_sha256?: string;
}

/** Countries whose city slugs carry the subdivision: `chicago-il-us`. */
const REGION_IN_CITY_SLUG = new Set(["US", "CA", "AU"]);

function citySlugFor(
  locality: string,
  countryCode: string,
  regionCode: string | null,
): string {
  const parts = [slugify(locality)];
  if (REGION_IN_CITY_SLUG.has(countryCode) && regionCode) {
    // ISO 3166-2 is "US-IL"; the city slug wants just the subdivision half.
    parts.push(slugify(regionCode.split("-").pop() ?? regionCode));
  }
  parts.push(countryCode.toLowerCase());
  return parts.join("-");
}

/**
 * Back out a recurrence rule from a single known date: which weekday it is, and
 * which occurrence of that weekday in its month. Returns nth = -1 when it is
 * the last one, matching the convention in src/db/seed/editions.ts.
 */
function recurrenceFromDate(iso: string): {
  month: number;
  weekday: number;
  nth: number;
} {
  const d = new Date(`${iso}T00:00:00Z`);
  const month = d.getUTCMonth() + 1;
  const weekday = d.getUTCDay();
  const dayOfMonth = d.getUTCDate();
  const nth = Math.ceil(dayOfMonth / 7);
  const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), month, 0)).getUTCDate();
  const isLast = dayOfMonth + 7 > daysInMonth;
  return { month, weekday, nth: isLast ? -1 : nth };
}

function readParserReport(batch: string): Map<string, ParserEntry> {
  const path = join(REPORT_DIR, `${batch}.qa.json`);
  if (!existsSync(path)) {
    throw new Error(
      `no parser report at ${path}\n` +
        `run: python3 scripts/gpx_parser/parse_gpx.py --report ${path}`,
    );
  }
  const parsed = JSON.parse(readFileSync(path, "utf8")) as { courses: ParserEntry[] };
  return new Map(parsed.courses.map((c) => [c.slug, c]));
}

function assess(
  event: RawEvent,
  parsed: ParserEntry | undefined,
  taken: { courses: Set<string>; cities: Map<string, (typeof CITY_SEED)[number]>; series: Set<string> },
): StagedCourse {
  const reasons: string[] = [];
  const slug = event.courseSlug;

  const staged: StagedCourse = {
    courseSlug: slug,
    verdict: "rejected",
    reasons,
    source: { eventUrl: event.eventUrl, gpxUrl: event.gpxUrl, gpxSha256: null },
    stats: { totalKm: null, gainM: null },
    city: null,
    citySlug: "",
    series: null,
    recurrence: null,
    edition: null,
  };

  // --- hard rejections: no usable geometry or a spent identifier ------------
  if (event.error) {
    reasons.push(`fetch: ${event.error}`);
    return staged;
  }
  if (!parsed) {
    reasons.push("no entry in the parser report — was parse_gpx.py run for this slug?");
    return staged;
  }
  if (parsed.status !== "ok") {
    reasons.push(`parser ${parsed.status}: ${parsed.error ?? "unknown error"}`);
    return staged;
  }
  if (!COURSE_SLUG_PATTERN.test(slug)) {
    reasons.push(`slug "${slug}" does not match COURSE_SLUG_PATTERN`);
    return staged;
  }
  if (PUBLISHED_COURSE_SLUGS.includes(slug)) {
    reasons.push(`slug "${slug}" is already spent — see Rule 8, it can never be reused`);
    return staged;
  }
  if (taken.courses.has(slug)) {
    reasons.push(`slug "${slug}" is claimed twice in this batch`);
    return staged;
  }
  if (!event.countryCode || !COUNTRY_NAMES[event.countryCode]) {
    reasons.push(
      `country code ${event.countryCode ?? "(none)"} is not in COUNTRY_NAMES — add it to shared.ts`,
    );
    return staged;
  }
  if (!event.locality) {
    reasons.push("event publishes no addressLocality, so there is no city to hang this on");
    return staged;
  }
  if (!event.startDate || !/^\d{4}-\d{2}-\d{2}$/.test(event.startDate)) {
    reasons.push(`startDate ${event.startDate ?? "(none)"} is not an ISO date`);
    return staged;
  }

  staged.source.gpxSha256 = parsed.gpx_sha256 ?? null;
  staged.stats = { totalKm: parsed.total_km ?? null, gainM: parsed.gain_m ?? null };

  // The start line is the authority for the map pin — never the event page's
  // own coordinates, which are demonstrably wrong on some listings.
  const coordsPath = join(COURSE_DIR, `${slug}.coords.json`);
  if (!existsSync(coordsPath)) {
    reasons.push(`missing ${slug}.coords.json — parser wrote no geometry`);
    return staged;
  }
  const coords = JSON.parse(readFileSync(coordsPath, "utf8")) as [number, number][];
  const [lat, lon] = coords[0];

  // --- soft flags: usable, but a human should look ------------------------
  const km = parsed.total_km ?? 0;
  if (km < 42.0 || km > 42.4) {
    reasons.push(`measured ${km.toFixed(3)} km, outside the [42.0, 42.4] band`);
  }
  if (Math.abs(lat) < 0.5 && Math.abs(lon) < 0.5) {
    reasons.push("start line sits on Null Island — the GPX has no real coordinates");
    return staged;
  }

  const countryCode = event.countryCode;
  const countryName = COUNTRY_NAMES[countryCode];
  const regionCode = event.region || null;
  const regionName = event.region || null;
  if (!regionCode && REGION_IN_CITY_SLUG.has(countryCode)) {
    reasons.push(
      `no addressRegion published; ${countryCode} city slugs normally carry the subdivision ` +
        `(chicago-il-us) — set regionCode/regionName and the citySlug by hand`,
    );
  }

  const zone = guessTimezone(countryCode, lat, lon);
  if (!zone.timezone || !isValidTimezone(zone.timezone)) {
    reasons.push(`could not derive an IANA timezone for ${countryCode} — set it by hand`);
    return staged;
  }
  if (zone.needsConfirmation) {
    reasons.push(
      `timezone ${zone.timezone} was guessed from longitude (${countryCode} spans zones) — confirm it`,
    );
  }

  const citySlug = citySlugFor(event.locality, countryCode, regionCode);
  staged.citySlug = citySlug;

  const existingCity = taken.cities.get(citySlug);
  if (existingCity) {
    // One pin per city, always. scripts/seed.ts upserts latitude from the
    // excluded row, so emitting a city here would silently move an existing
    // pin to this race's start line.
    const drift = haversineKm([lat, lon], [existingCity.latitude, existingCity.longitude]);
    reasons.push(
      `city ${citySlug} is already seeded (start lines ${drift.toFixed(1)} km apart); ` +
        `reusing its existing pin, emitting no city row`,
    );
  } else {
    staged.city = {
      slug: citySlug,
      name: event.locality,
      countryCode,
      countryName,
      regionCode,
      regionName,
      latitude: lat,
      longitude: lon,
      timezone: zone.timezone,
    };
  }

  const displayName = cleanDisplayName(event.name);
  let seriesSlug = slugify(displayName);
  if (taken.series.has(seriesSlug)) {
    seriesSlug = `${seriesSlug}-${citySlug}`;
    reasons.push(`series slug collided; disambiguated to "${seriesSlug}"`);
  }

  const raceDate = event.startDate;
  const year = Number(raceDate.slice(0, 4));
  const { month, weekday, nth } = recurrenceFromDate(raceDate);

  if (!event.websiteUrl) {
    reasons.push("no official website published — SeriesSeed.websiteUrl needs one");
  }
  if (!event.organizer) {
    reasons.push("no organizer name published — fill SeriesSeed.organizer by hand");
  }

  staged.series = {
    slug: seriesSlug,
    name: displayName,
    citySlug,
    courseSlug: slug,
    isMajor: false,
    typicalMonth: month,
    websiteUrl: event.websiteUrl ?? "",
    organizer: event.organizer ?? "",
  };
  staged.recurrence = {
    seriesSlug,
    month,
    weekday,
    nth,
    note: `Derived from the ${raceDate} edition; not verified against the organizer`,
  };
  staged.edition = { seriesSlug, year, raceDate };

  staged.verdict = reasons.length === 0 ? "ready" : "review";
  return staged;
}

function main(): void {
  const argv = process.argv.slice(2);
  const batch = flagValue(argv, "--batch");
  if (!batch) throw new Error("--batch <name> is required");
  const quiet = argv.includes("--quiet");

  const raw = JSON.parse(
    readFileSync(join(RAW_DIR, `${batch}.raw.json`), "utf8"),
  ) as RawBatch;
  const report = readParserReport(batch);

  // decisions.json accumulates across batches and is committed. An entry that
  // already exists is left exactly as it is: it may carry a human's edits, and
  // silently recomputing over those would throw away the review this whole
  // two-step exists to capture. Re-assessing a course means deleting its entry.
  const existing: StagedCourse[] = existsSync(DECISIONS_PATH)
    ? (JSON.parse(readFileSync(DECISIONS_PATH, "utf8")) as DecisionFile).courses
    : [];
  const decided = new Map(existing.map((c) => [c.courseSlug, c]));

  const taken = {
    // Slugs already decided in an earlier batch are spent for this one too.
    courses: new Set(decided.keys()),
    cities: new Map(CITY_SEED.map((c) => [c.slug, c])),
    series: new Set(SERIES_SEED.map((s) => s.slug)),
  };
  for (const c of decided.values()) {
    if (c.verdict === "rejected") continue;
    if (c.city) taken.cities.set(c.city.slug, c.city);
    if (c.series) taken.series.add(c.series.slug);
  }

  const fresh: StagedCourse[] = [];
  let kept = 0;
  for (const event of raw.events) {
    if (decided.has(event.courseSlug)) {
      kept += 1;
      continue;
    }
    const staged = assess(event, report.get(event.courseSlug), taken);
    if (staged.verdict !== "rejected") {
      taken.courses.add(staged.courseSlug);
      if (staged.city) taken.cities.set(staged.city.slug, staged.city);
      if (staged.series) taken.series.add(staged.series.slug);
    }
    fresh.push(staged);
    decided.set(staged.courseSlug, staged);
  }

  const merged = [...decided.values()].sort((a, b) =>
    a.courseSlug.localeCompare(b.courseSlug),
  );
  const payload: DecisionFile = {
    updatedAt: new Date().toISOString(),
    courses: merged,
  };
  mkdirSync(IMPORT_DIR, { recursive: true });
  writeFileSync(DECISIONS_PATH, `${JSON.stringify(payload, null, 2)}\n`);

  if (!quiet) {
    console.log();
    for (const c of fresh) {
      const mark = { ready: "✓", review: "?", rejected: "✗" }[c.verdict];
      console.log(`${mark} ${c.courseSlug}`);
      for (const r of c.reasons) console.log(`    ${r}`);
    }
  }

  const tally = (v: Verdict) => fresh.filter((c) => c.verdict === v).length;
  console.log(
    `\n${tally("ready")} ready · ${tally("review")} need review · ` +
      `${tally("rejected")} rejected${kept > 0 ? ` · ${kept} already decided` : ""}`,
  );
  console.log(`wrote ${DECISIONS_PATH}`);
  if (tally("review") > 0) {
    console.log(
      `\nEdit that file, resolve each "review" entry and set its verdict to\n` +
        `"ready" (or "rejected"), then:\n` +
        `  node scripts/import/promote.ts --dry-run`,
    );
  }
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
