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
  BR: "Brazil",
  CA: "Canada",
  CH: "Switzerland",
  CL: "Chile",
  CN: "China",
  CO: "Colombia",
  CZ: "Czechia",
  DE: "Germany",
  DK: "Denmark",
  EC: "Ecuador",
  EE: "Estonia",
  EG: "Egypt",
  ES: "Spain",
  FI: "Finland",
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
  LT: "Lithuania",
  LU: "Luxembourg",
  LV: "Latvia",
  MA: "Morocco",
  MT: "Malta",
  MX: "Mexico",
  MY: "Malaysia",
  NL: "Netherlands",
  NO: "Norway",
  NZ: "New Zealand",
  PE: "Peru",
  PH: "Philippines",
  PL: "Poland",
  PT: "Portugal",
  PY: "Paraguay",
  RO: "Romania",
  RS: "Serbia",
  SE: "Sweden",
  SG: "Singapore",
  SI: "Slovenia",
  SK: "Slovakia",
  TH: "Thailand",
  TR: "Turkey",
  TW: "Taiwan",
  UA: "Ukraine",
  US: "United States",
  UY: "Uruguay",
  VE: "Venezuela",
  VN: "Vietnam",
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
  CH: "Europe/Zurich",
  CN: "Asia/Shanghai",
  CO: "America/Bogota",
  CZ: "Europe/Prague",
  DE: "Europe/Berlin",
  DK: "Europe/Copenhagen",
  EC: "America/Guayaquil", // mainland; Galapagos differs, but no marathon runs there
  EE: "Europe/Tallinn",
  EG: "Africa/Cairo",
  ES: "Europe/Madrid", // Canary Islands differ; QA flags a bad distance anyway
  FI: "Europe/Helsinki",
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
  LT: "Europe/Vilnius",
  LU: "Europe/Luxembourg",
  LV: "Europe/Riga",
  MA: "Africa/Casablanca",
  MT: "Europe/Malta",
  MY: "Asia/Kuala_Lumpur",
  NL: "Europe/Amsterdam",
  NO: "Europe/Oslo",
  PE: "America/Lima",
  PH: "Asia/Manila",
  PL: "Europe/Warsaw",
  PT: "Europe/Lisbon", // Azores/Madeira differ
  RO: "Europe/Bucharest",
  RS: "Europe/Belgrade",
  SE: "Europe/Stockholm",
  SG: "Asia/Singapore",
  SI: "Europe/Ljubljana",
  SK: "Europe/Bratislava",
  TH: "Asia/Bangkok",
  TR: "Europe/Istanbul",
  TW: "Asia/Taipei",
  UA: "Europe/Kyiv",
  UY: "America/Montevideo",
  VE: "America/Caracas",
  PY: "America/Asuncion",
  VN: "Asia/Ho_Chi_Minh",
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
  source: { eventUrl: string; gpxUrl: string | null; gpxSha256: string | null };
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
  edition: { seriesSlug: string; year: number; raceDate: string } | null;
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
