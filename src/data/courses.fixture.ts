// TEST FIXTURE ONLY — do not import from application code.
//
// The app reads courses from the database (src/db/queries.ts). But
// src/data/courses/*.json remains the SOURCE OF TRUTH that the seed script
// loads, so the integrity tests must keep validating those files directly:
// a corrupt elevation array has to fail in CI, offline, before it can ever
// reach a database.
//
// This module is the old static registry, kept alive for exactly that purpose
// and for supplying real geometry to component and hook tests. Geometry is read
// from disk rather than statically imported: at a few hundred courses, three
// import lines per course is a bottleneck, and — worse — a JSON file nobody
// remembered to import is a file CI never validates.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Course, CourseSummary } from "@/types";
import { SERIES_SEED } from "@/db/seed/series";
import { CITY_SEED } from "@/db/seed/cities";

type Pairs = [number, number][];

// Resolved off the vitest root rather than import.meta.url: under the jsdom
// environment import.meta.url is an http: URL, which fileURLToPath rejects.
// This module is test-only, so the vitest root is always the repo root.
const COURSE_DIR = join(process.cwd(), "src", "data", "courses");

/**
 * Every course slug with geometry on disk, whether or not it is seeded. The
 * integrity tests run over THIS, so a stray or half-added course still gets
 * validated instead of passing unnoticed.
 */
export function allCourseSlugsOnDisk(): string[] {
  return readdirSync(COURSE_DIR)
    .filter((f) => f.endsWith(".json"))
    .filter((f) => !f.endsWith(".coords.json") && !f.endsWith(".profile.json"))
    .map((f) => f.slice(0, -".json".length))
    .sort();
}

function readJson<T>(slug: string, suffix: "" | ".coords" | ".profile"): T {
  return JSON.parse(
    readFileSync(join(COURSE_DIR, `${slug}${suffix}.json`), "utf8"),
  ) as T;
}

/**
 * Read one course's three geometry files. Deliberately NOT memoised and not
 * eager: the integrity tests walk every course, and holding hundreds of dense
 * profiles in memory at once is what makes that suite slow.
 */
export function loadGeometry(slug: string): {
  elevations: number[];
  profile: Pairs;
  coords: Pairs;
} {
  return {
    elevations: readJson<number[]>(slug, ""),
    profile: readJson<Pairs>(slug, ".profile"),
    coords: readJson<Pairs>(slug, ".coords"),
  };
}

/**
 * The courses component and hook tests are allowed to see — pinned, not derived
 * from SERIES_SEED.
 *
 * This pinning is load-bearing. courseMapData.test.ts asserts which course is
 * nearest to a given point and CourseLibrary.test.tsx asserts a literal count;
 * both quietly become wrong the day a bulk import adds a marathon nearer to
 * Boston than Boston. Component tests get a stable seven-course world, and
 * data-integrity coverage comes from allCourseSlugsOnDisk() instead.
 */
export const CORE_FIXTURE_SLUGS = [
  "berlin",
  "chicago",
  "london",
  "tokyo",
  "sydney",
  "newyork",
  "boston",
] as const;

const CORE = new Set<string>(CORE_FIXTURE_SLUGS);
const CITY_BY_SLUG = new Map(CITY_SEED.map((c) => [c.slug, c]));
const CORE_SERIES = SERIES_SEED.filter((s) => CORE.has(s.courseSlug));

/**
 * The seven core courses, assembled from the seed definitions plus the repo
 * JSON — i.e. exactly what `npm run db:seed` puts in the database for them.
 */
export const FIXTURE_COURSES: Course[] = CORE_SERIES.map((s) => {
  const geo = loadGeometry(s.courseSlug);
  const city = CITY_BY_SLUG.get(s.citySlug);
  if (!city) throw new Error(`Unknown citySlug "${s.citySlug}"`);

  return {
    id: s.courseSlug,
    displayName: s.name,
    city: city.name,
    elevations: geo.elevations,
    profile: geo.profile,
    coords: geo.coords,
    start: { lat: geo.coords[0][0], lon: geo.coords[0][1] },
    timezone: city.timezone,
  };
});

/** The catalog shape the app ships to the client, built from the same seed. */
export const FIXTURE_CATALOG: CourseSummary[] = CORE_SERIES.map((s) => {
  const city = CITY_BY_SLUG.get(s.citySlug)!;
  const coords = loadGeometry(s.courseSlug).coords;
  return {
    id: s.courseSlug,
    seriesSlug: s.slug,
    displayName: s.name,
    city: city.name,
    countryCode: city.countryCode,
    countryName: city.countryName,
    regionCode: city.regionCode,
    regionName: city.regionName,
    cityLat: city.latitude,
    cityLon: city.longitude,
    start: { lat: coords[0][0], lon: coords[0][1] },
    timezone: city.timezone,
    nextRaceDateISO: null,
  };
});

export function fixtureCourse(slug: string): Course {
  const c = FIXTURE_COURSES.find((x) => x.id === slug);
  if (!c) throw new Error(`Unknown course fixture: ${slug}`);
  return c;
}
