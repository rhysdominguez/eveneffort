// Shared plumbing for the goandrace.com bulk course importer.
//
// Three scripts use this: fetch.ts (discover + download), qa.ts (validate +
// propose seed rows) and promote.ts (append the reviewed batch to the seed
// files). Node strips the TypeScript natively — same as scripts/seed.ts — so
// imports carry explicit .ts extensions and there is no tsx dependency.
//
// No scraping library. The pages are static PHP with no client-side rendering,
// so `fetch` plus a handful of regexes is the whole requirement and CLAUDE.md
// Rule 5 says not to add a dependency without one.

import { join } from "node:path";

export const REPO_ROOT = join(import.meta.dirname, "..", "..");
export const GPX_DIR = join(REPO_ROOT, "data", "gpx_sources");
export const COURSE_DIR = join(REPO_ROOT, "src", "data", "courses");

// Layout fixed by .gitignore: raw crawl output, parser reports and quarantined
// files are disposable and ignored; decisions.json is committed, because it is
// the record of which permanent course slugs a human signed off on.
export const IMPORT_DIR = join(REPO_ROOT, "data", "import");
export const RAW_DIR = join(IMPORT_DIR, "raw");
export const REPORT_DIR = join(IMPORT_DIR, "reports");
export const QUARANTINE_DIR = join(IMPORT_DIR, "quarantine");
export const DECISIONS_PATH = join(IMPORT_DIR, "decisions.json");

export const ORIGIN = "https://www.goandrace.com";

// Identify ourselves honestly and leave a way to be told to stop. goandrace is
// a small site; a nameless bulk crawler is how you get an IP banned and how you
// deserve to be.
export const USER_AGENT =
  "eveneffort-course-importer/1.0 (+https://eveneffort.com; contact: info@eveneffort.com)";

/** Delay between requests, ms. Deliberately unhurried — see USER_AGENT. */
export const REQUEST_DELAY_MS = 1_000;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * GET a URL as text, with the shared UA and one retry on a transient failure.
 * Sequential by construction: callers await this, and nothing here fans out.
 */
export async function getText(
  url: string,
  referer?: string,
): Promise<string> {
  return (await getResponse(url, referer)).text();
}

export async function getResponse(
  url: string,
  referer?: string,
): Promise<Response> {
  const headers: Record<string, string> = {
    "user-agent": USER_AGENT,
    accept: "text/html,application/xhtml+xml,application/xml,*/*",
  };
  if (referer) headers.referer = referer;

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt > 0) await sleep(REQUEST_DELAY_MS * 3);
    try {
      const res = await fetch(url, { headers, redirect: "follow" });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return res;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

// ---------------------------------------------------------------------------
// Slugs
// ---------------------------------------------------------------------------

/** Mirrors COURSE_SLUG_PATTERN in src/db/seed/slug-ledger.ts. */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents: "Málaga" -> "Malaga"
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Propose a permanent course slug from the event's own name.
 *
 * The original seven are bare city names (`berlin`, `newyork`). That does not
 * generalise: two marathons in one city would collide, and a collision on a
 * permanent public identifier is unfixable. So imported courses keep the full
 * race name minus the year — `barcelona-marathon` — matching the convention
 * SERIES_SEED slugs already use. Every proposed slug is still shown to a human
 * before it ships; see slug-ledger.ts.
 */
export function proposeCourseSlug(eventName: string): string {
  const withoutYear = eventName.replace(/\b(19|20)\d{2}\b/g, " ");
  return slugify(withoutYear);
}

/** Strip a trailing year from a display name: "Barcelona Marathon 2026". */
export function cleanDisplayName(eventName: string): string {
  return eventName.replace(/\s*\b(19|20)\d{2}\b\s*/g, " ").replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Fuzzy name matching
// ---------------------------------------------------------------------------
//
// goandrace pages a fresh event URL for every year of a recurring race, so an
// exact-slug or exact-URL dedup check (both used elsewhere in this pipeline)
// cannot tell that "Flying Pig Marathon 2026" is the same real-world race as
// the already-seeded "Cincinnati Flying Pig Marathon" — the slugs differ and
// so does the URL. This is the shared matching logic that catches it by name
// and city instead. Used at fetch time against SERIES_SEED (see fetch.ts) and
// by the findmymarathon reconciler against its own crawl pool.

/** Words that carry no identity: every race is a "marathon" in some city. */
export const MATCH_STOP_WORDS = new Set([
  "marathon", "the", "of", "a", "and", "international", "annual",
  "run", "runs", "races", "race", "festival", "city", "st", "mt",
]);

/**
 * Words that change what race this *is*, not just how it's phrased — a half
 * marathon is not a marathon, a relay splits the distance across runners, a
 * kids' fun run is not a competitive field, and two marathons in one city can
 * be distinguished by a single word in their names. Unlike MATCH_STOP_WORDS
 * these are never dropped: findNameMatch refuses a match where exactly one
 * side has one, regardless of how high the token overlap scores otherwise.
 *
 * The guard exists because of how the score is computed. Dividing token
 * overlap by the *smaller* set is what stops a sponsor prefix sinking a real
 * match — but the same property makes a distinguishing word on the *larger*
 * side invisible. "Rotterdam Half Marathon" scores a perfect 1.0 against the
 * seeded "Rotterdam Marathon", because {rotterdam} is a subset of
 * {rotterdam, half}.
 *
 * `charity` is here for the same reason and is worth spelling out, since it is
 * neither a distance nor a format: Taipei has two separate marathons, the
 * Standard Chartered Taipei *Charity* Marathon (January, since 2013 — the one
 * seeded) and the plain Taipei Marathon (December, World Athletics Gold Label,
 * since 1986). Without the guard the second scores 1.0 against the first and
 * gets skipped as a duplicate, which is exactly what happened on 2026-08-10.
 * When a word turns out to be the only thing separating two real races in one
 * city, it belongs in this set.
 */
const DISCRIMINATING_WORDS = new Set([
  "half", "quarter", "ultra", "relay", "virtual", "kids", "youth",
  "junior", "5k", "10k", "trail", "charity",
]);

/**
 * Spelling variants seen often enough across the two sources this pipeline
 * reads (goandrace's own listings, and hand-curated CSVs) to fold together
 * rather than let sink a real match. Every entry here was added after seeing
 * it cause one.
 */
export const MATCH_ALIASES: Record<string, string> = {
  ft: "fort",
  mount: "mt",
  mtn: "mountain",
  intl: "international",
  saint: "st",
  ste: "st",
  "&": "and",
  n: "and",

  // A race's own event name is sometimes published in its local language
  // even though this repo already seeded the city under its English exonym
  // (matching the rest of SERIES_SEED — Cologne, not Köln; Munich, not
  // München). Accent-folding alone doesn't bridge these: "firenze" and
  // "florence" share zero characters, let alone tokens. "Estra Firenze
  // Marathon" was about to ship as a second, duplicate series for the
  // already-seeded Florence Marathon — identical GPS start line — before
  // this was added. Not exhaustive; add the next one here when it bites.
  firenze: "florence",
  roma: "rome",
  milano: "milan",
  napoli: "naples",
  torino: "turin",
  venezia: "venice",
  genova: "genoa",
  koln: "cologne",
  munchen: "munich",
};

/** Lowercased, alias-folded, stop-word-stripped identity tokens for a name. */
export function matchTokens(input: string): Set<string> {
  return new Set(
    input
      // Strip accents before anything else, the same way slugify() does —
      // without this, the ASCII-only filter a few lines down treats "ö" and
      // "ü" as punctuation and cuts the word in half around them: "Köln"
      // became the tokens "k" and "ln", "Zürich" became "z" and "rich",
      // neither of which can ever match "Cologne" or "Zurich" (or, for that
      // matter, match a second scrape of "Köln" whose diacritic arrived via
      // a different Unicode normalization form). Found comparing "Estra
      // Firenze Marathon" against the already-seeded "Florence Marathon" —
      // a same-city, different-language pair the exonym alias below handles,
      // but only once the accent isn't mangling the tokens in the first place.
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      // Drop apostrophes rather than turning them into a word break — "Jill's"
      // must fold to the same token as a source that writes "Jills". This was
      // written as /['']/g, intending a straight quote plus a curly one, but
      // both characters between the brackets were the same U+0027 — the
      // typography got lost copying the comment's example into the regex, and
      // the smart quote goandrace actually publishes ("Grandma's" as
      // U+2019) was never one of the two. Every mark a name is realistically
      // apostrophized with is listed explicitly now, not "however many quote
      // characters happen to be between two brackets."
      .replace(/['‘’ʼ]/g, "")
      // A bare distance shorthand attached to a number ("42K", matching this
      // repo's own "Lake Garda 42K") is the same token as the source that
      // spells it "42" with no letter — fold before the letters get stripped
      // by the next line, or "42k" and "42" end up as unrelated tokens.
      .replace(/\b(\d+)k\b/g, "$1")
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      // A bare edition year ("Flying Pig Marathon 2026") carries no identity
      // but does inflate the token count on whichever side has it, which can
      // drag a real match below threshold — proposeCourseSlug() strips years
      // for the same reason.
      .filter((w) => !/^(19|20)\d{2}$/.test(w))
      .map((w) => MATCH_ALIASES[w] ?? w)
      .filter((w) => w && !MATCH_STOP_WORDS.has(w)),
  );
}

/** Token overlap against the *smaller* set, so a sponsor prefix cannot sink a match. */
export function nameSimilarity(a: string, b: string): number {
  const A = matchTokens(a);
  const B = matchTokens(b);
  if (A.size === 0 || B.size === 0) return 0;
  let shared = 0;
  for (const t of A) if (B.has(t)) shared += 1;
  return shared / Math.min(A.size, B.size);
}

/**
 * Does `name` (optionally anchored by `locality`) already match one of
 * `candidates` closely enough to be the same real-world race? A city
 * agreement is worth a nudge but never a match on its own — "Springfield
 * Marathon" exists in three US states alone.
 */
export function findNameMatch<T extends { name: string; citySlug: string }>(
  name: string,
  locality: string | null,
  candidates: readonly T[],
  threshold = 0.85,
): (T & { score: number }) | null {
  const nameTokens = matchTokens(name);
  let best: (T & { score: number }) | null = null;
  for (const candidate of candidates) {
    let score = nameSimilarity(name, candidate.name);
    if (locality && nameSimilarity(locality, candidate.citySlug) > 0.4) score += 0.15;
    if (!best || score > best.score) best = { ...candidate, score };
  }
  if (!best || best.score < threshold) return null;

  // A perfect token-subset score does not survive a differentiator that only
  // one side carries — see the comment on DISCRIMINATING_WORDS.
  const candidateTokens = matchTokens(best.name);
  for (const word of DISCRIMINATING_WORDS) {
    if (nameTokens.has(word) !== candidateTokens.has(word)) return null;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Geography
// ---------------------------------------------------------------------------

/**
 * ISO 3166-1 alpha-2 -> display name, for the countries the marathon calendar
 * actually covers. `countryName` is NOT NULL in the schema, and courses.test.ts
 * asserts countryCode matches /^[A-Z]{2}$/ — an unknown code must fail QA
 * rather than be invented.
 */
export const COUNTRY_NAMES: Record<string, string> = {
  AE: "United Arab Emirates",
  AR: "Argentina",
  AT: "Austria",
  AU: "Australia",
  AW: "Aruba",
  BE: "Belgium",
  BM: "Bermuda",
  BO: "Bolivia",
  BR: "Brazil",
  BT: "Bhutan",
  CA: "Canada",
  CH: "Switzerland",
  CL: "Chile",
  CN: "China",
  CO: "Colombia",
  CY: "Cyprus",
  CZ: "Czechia",
  DE: "Germany",
  DK: "Denmark",
  DO: "Dominican Republic",
  EC: "Ecuador",
  EE: "Estonia",
  EG: "Egypt",
  ES: "Spain",
  FI: "Finland",
  FK: "Falkland Islands",
  FR: "France",
  GB: "United Kingdom",
  GR: "Greece",
  HK: "Hong Kong",
  HR: "Croatia",
  HU: "Hungary",
  ID: "Indonesia",
  IE: "Ireland",
  IL: "Israel",
  IN: "India",
  IS: "Iceland",
  IT: "Italy",
  JP: "Japan",
  KE: "Kenya",
  KR: "South Korea",
  KY: "Cayman Islands",
  KZ: "Kazakhstan",
  LB: "Lebanon",
  LT: "Lithuania",
  LU: "Luxembourg",
  LV: "Latvia",
  MA: "Morocco",
  MP: "Northern Mariana Islands",
  MT: "Malta",
  MX: "Mexico",
  MY: "Malaysia",
  NG: "Nigeria",
  NL: "Netherlands",
  NO: "Norway",
  NP: "Nepal",
  NZ: "New Zealand",
  PE: "Peru",
  PH: "Philippines",
  PL: "Poland",
  PT: "Portugal",
  PY: "Paraguay",
  RO: "Romania",
  RS: "Serbia",
  SA: "Saudi Arabia",
  SE: "Sweden",
  SG: "Singapore",
  SI: "Slovenia",
  SK: "Slovakia",
  TH: "Thailand",
  TN: "Tunisia",
  TR: "Turkey",
  TZ: "Tanzania",
  TW: "Taiwan",
  UA: "Ukraine",
  US: "United States",
  UY: "Uruguay",
  VE: "Venezuela",
  VN: "Vietnam",
  WS: "Samoa",
  ZA: "South Africa",
};

/**
 * Countries with one civil timezone, so the zone follows from the country code
 * alone. Multi-zone countries are handled by longitude band below; anything in
 * neither table fails QA and gets set by hand.
 */
const ZONE_BY_COUNTRY: Record<string, string> = {
  AE: "Asia/Dubai",
  AT: "Europe/Vienna",
  AW: "America/Aruba",
  BE: "Europe/Brussels",
  BM: "Atlantic/Bermuda",
  BO: "America/La_Paz",
  BT: "Asia/Thimphu",
  CH: "Europe/Zurich",
  CN: "Asia/Shanghai",
  CO: "America/Bogota",
  CY: "Asia/Nicosia",
  CZ: "Europe/Prague",
  DE: "Europe/Berlin",
  DK: "Europe/Copenhagen",
  DO: "America/Santo_Domingo",
  EC: "America/Guayaquil", // mainland; Galapagos differs, but no marathon runs there
  EE: "Europe/Tallinn",
  EG: "Africa/Cairo",
  ES: "Europe/Madrid", // Canary Islands differ; QA flags a bad distance anyway
  FI: "Europe/Helsinki",
  FK: "Atlantic/Stanley",
  FR: "Europe/Paris",
  GB: "Europe/London",
  GR: "Europe/Athens",
  HK: "Asia/Hong_Kong",
  HR: "Europe/Zagreb",
  HU: "Europe/Budapest",
  IE: "Europe/Dublin",
  IL: "Asia/Jerusalem",
  IN: "Asia/Kolkata",
  IS: "Atlantic/Reykjavik",
  IT: "Europe/Rome",
  JP: "Asia/Tokyo",
  KE: "Africa/Nairobi",
  KR: "Asia/Seoul",
  KY: "America/Cayman",
  KZ: "Asia/Almaty",
  LB: "Asia/Beirut",
  LT: "Europe/Vilnius",
  LU: "Europe/Luxembourg",
  LV: "Europe/Riga",
  MA: "Africa/Casablanca",
  MP: "Pacific/Saipan",
  MT: "Europe/Malta",
  MY: "Asia/Kuala_Lumpur",
  NG: "Africa/Lagos",
  NL: "Europe/Amsterdam",
  NO: "Europe/Oslo",
  NP: "Asia/Kathmandu",
  PE: "America/Lima",
  PH: "Asia/Manila",
  PL: "Europe/Warsaw",
  PT: "Europe/Lisbon", // Azores/Madeira differ
  RO: "Europe/Bucharest",
  RS: "Europe/Belgrade",
  SA: "Asia/Riyadh",
  SE: "Europe/Stockholm",
  SG: "Asia/Singapore",
  SI: "Europe/Ljubljana",
  SK: "Europe/Bratislava",
  TH: "Asia/Bangkok",
  TN: "Africa/Tunis",
  TR: "Europe/Istanbul",
  TW: "Asia/Taipei",
  TZ: "Africa/Dar_es_Salaam",
  UA: "Europe/Kyiv",
  UY: "America/Montevideo",
  VE: "America/Caracas",
  PY: "America/Asuncion",
  VN: "Asia/Ho_Chi_Minh",
  WS: "Pacific/Apia",
  ZA: "Africa/Johannesburg",
  AR: "America/Argentina/Buenos_Aires",
  NZ: "Pacific/Auckland", // Chatham Islands differ
};

/**
 * Longitude bands for the big multi-zone countries. Coarse but checkable, and
 * always paired with a QA note telling the reviewer to confirm it — a wrong
 * zone shifts a start time by hours, which is exactly the failure editions.ts
 * warns about.
 */
function zoneByLongitude(
  countryCode: string,
  lat: number,
  lon: number,
): string | null {
  switch (countryCode) {
    case "US":
      if (lat > 50 && lon < -130) return "America/Anchorage";
      if (lon < -150) return "Pacific/Honolulu";
      if (lon < -114) return "America/Los_Angeles";
      if (lon < -102) return "America/Denver";
      if (lon < -85) return "America/Chicago";
      return "America/New_York";
    case "CA":
      if (lon < -120) return "America/Vancouver";
      if (lon < -110) return "America/Edmonton";
      if (lon < -90) return "America/Winnipeg";
      if (lon < -65) return "America/Toronto";
      return "America/Halifax";
    case "AU":
      if (lon < 129) return "Australia/Perth";
      if (lon < 141) return "Australia/Adelaide";
      if (lat < -40) return "Australia/Hobart";
      if (lon < 145 && lat > -25) return "Australia/Brisbane";
      return "Australia/Sydney";
    case "BR":
      if (lon < -60) return "America/Manaus";
      return "America/Sao_Paulo";
    case "MX":
      if (lon < -109) return "America/Tijuana";
      if (lon < -101) return "America/Chihuahua";
      return "America/Mexico_City";
    case "ID":
      if (lon < 112) return "Asia/Jakarta";
      if (lon < 128) return "Asia/Makassar";
      return "Asia/Jayapura";
    case "CL":
      return "America/Santiago";
    default:
      return null;
  }
}

export interface ZoneGuess {
  timezone: string | null;
  /** True when the country spans zones, so a human must confirm the guess. */
  needsConfirmation: boolean;
}

export function guessTimezone(
  countryCode: string,
  lat: number,
  lon: number,
): ZoneGuess {
  const single = ZONE_BY_COUNTRY[countryCode];
  if (single) return { timezone: single, needsConfirmation: false };
  const banded = zoneByLongitude(countryCode, lat, lon);
  if (banded) return { timezone: banded, needsConfirmation: true };
  return { timezone: null, needsConfirmation: true };
}

/** The IANA check src/data/courses.test.ts performs, run early so CI stays green. */
export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Great-circle distance in km. Same sphere radius the GPX parser uses. */
export function haversineKm(
  a: [number, number],
  b: [number, number],
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ---------------------------------------------------------------------------
// Staging file shapes
// ---------------------------------------------------------------------------

/**
 * Where a course's geometry came from. goandrace.com was the only answer until
 * adopt.ts, so it is the default everywhere and the 600-odd decisions.json
 * entries written before that stay valid without a migration.
 */
export const DEFAULT_SOURCE_SITE = "goandrace.com";

/**
 * How a course's elevation was obtained — surveyed from the source file, or
 * sampled off a terrain model. Materially different in accuracy, so it is
 * recorded rather than inferred. See elevate.ts for what the difference costs.
 */
export type ElevationSource = "gpx" | `dem:${string}`;

/** One event as scraped, before any geometry exists. Written by fetch.ts. */
export interface RawEvent {
  courseSlug: string;
  eventUrl: string;
  mapUrl: string | null;
  gpxUrl: string | null;
  gpxBytes: number | null;
  /** schema.org SportsEvent fields, as published. */
  name: string;
  startDate: string | null;
  locality: string | null;
  region: string | null;
  countryCode: string | null;
  organizer: string | null;
  websiteUrl: string | null;
  /** Host the geometry came from. Absent means goandrace.com — see above. */
  sourceSite?: string;
  /** Absent means "gpx": nothing but adopt.ts has ever produced anything else. */
  elevationSource?: ElevationSource;
  /** Why a human vouched for this route file. Set by adopt.ts only. */
  routeNote?: string;
  /** Non-fatal notes from normalisation/elevation, surfaced by qa.ts. */
  warnings?: string[];
  /** Populated when the event could not be turned into a GPX on disk. */
  error?: string;
}

export interface RawBatch {
  batch: string;
  fetchedAt: string;
  query: Record<string, string>;
  events: RawEvent[];
}

export type Verdict = "ready" | "review" | "rejected";

/** One course after geometry + QA. Written by qa.ts, read by promote.ts. */
export interface StagedCourse {
  courseSlug: string;
  verdict: Verdict;
  reasons: string[];
  source: {
    eventUrl: string;
    gpxUrl: string | null;
    gpxSha256: string | null;
    /** Absent on entries written before a second source existed. */
    site?: string;
    elevation?: ElevationSource;
    note?: string;
  };
  stats: { totalKm: number | null; gainM: number | null };
  /** Null when the city is already in CITY_SEED — never repoint an existing pin. */
  city: {
    slug: string;
    name: string;
    countryCode: string;
    countryName: string;
    regionCode: string | null;
    regionName: string | null;
    latitude: number;
    longitude: number;
    timezone: string;
  } | null;
  citySlug: string;
  series: {
    slug: string;
    name: string;
    citySlug: string;
    courseSlug: string;
    isMajor: boolean;
    typicalMonth: number;
    websiteUrl: string;
    organizer: string;
  } | null;
  recurrence: {
    seriesSlug: string;
    month: number;
    weekday: number;
    nth: number;
    note: string;
  } | null;
  /**
   * `startTimeLocal` is optional and stays unset for a scraped date — the
   * listing does not publish one, and a guessed start silently keys the
   * weather forecast to the wrong hour. Set it only when a real start time was
   * read off the organizer's own page, which the archive workflow's
   * still-runs check tends to surface anyway.
   */
  edition: {
    seriesSlug: string;
    year: number;
    raceDate: string;
    startTimeLocal?: string;
  } | null;
}

/**
 * data/import/decisions.json — committed, and the only durable state the
 * importer keeps. One entry per course ever proposed, carrying the human's
 * verdict. qa.ts merges into it and never overwrites an entry a person has
 * already touched; promote.ts reads `ready` entries out of it.
 */
export interface DecisionFile {
  updatedAt: string;
  courses: StagedCourse[];
}

// ---------------------------------------------------------------------------
// CLI helpers
// ---------------------------------------------------------------------------

export function flagValue(argv: string[], name: string): string | null {
  const i = argv.indexOf(name);
  return i >= 0 ? (argv[i + 1] ?? null) : null;
}

export function flagNumber(
  argv: string[],
  name: string,
  fallback: number,
): number {
  const raw = flagValue(argv, name);
  if (raw === null) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number, got "${raw}"`);
  return n;
}
