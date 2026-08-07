// Seeds the marathon database from the definitions in src/db/seed/ and the
// GPX-derived JSON in src/data/courses/.
//
// Idempotent: everything upserts by slug, and course geometry is skipped
// entirely when its checksum is unchanged, so re-running is cheap and safe.
//
// Writes are chunked and each chunk is isolated: a chunk that fails is retried
// row by row so one bad course names itself instead of taking the rest of the
// run down with it, and the run always finishes before reporting. There is no
// wrapping transaction because neon-http cannot open one — idempotent upserts
// are what makes a partial run recoverable, so keep them that way.
//
// Run with `npm run db:seed`. Node strips the TypeScript natively, so there is
// no tsx dependency — which is also why the imports below are relative paths
// rather than the `@/` alias (that only resolves inside the bundler).
//
// Flags:
//   --only <slug,...>   seed just these series slugs
//   --dry-run           report what would change; touch nothing
//   --skip-geometry     upsert cities/series/editions but no course jsonb
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { getDb } from "../src/db/client.ts";
import { cities, courses, eventEditions, eventSeries } from "../src/db/schema.ts";
import { CITY_SEED } from "../src/db/seed/cities.ts";
import { SERIES_SEED } from "../src/db/seed/series.ts";
import { buildEditionSeed } from "../src/db/seed/editions.ts";

const COURSE_DIR = join(import.meta.dirname, "..", "src", "data", "courses");

// Cities, series and editions are narrow rows, so a hundred at a time is a
// comfortable single statement. Courses are not: each carries a dense profile
// worth tens of kilobytes of jsonb, and Neon's HTTP endpoint has a request
// size ceiling — five keeps a chunk well inside it.
const CHUNK = { narrow: 100, geometry: 5 };

type Flags = {
  only: Set<string> | null;
  dryRun: boolean;
  skipGeometry: boolean;
};

function parseFlags(argv: string[]): Flags {
  const only = argv.includes("--only")
    ? new Set(
        (argv[argv.indexOf("--only") + 1] ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      )
    : null;
  return {
    only,
    dryRun: argv.includes("--dry-run"),
    skipGeometry: argv.includes("--skip-geometry"),
  };
}

function readCourseJson<T>(slug: string, suffix: string): T {
  return JSON.parse(
    readFileSync(join(COURSE_DIR, `${slug}${suffix}.json`), "utf8"),
  ) as T;
}

function checksum(...parts: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

function chunk<T>(xs: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

/** Failures collected across the run, reported together at the end. */
const failures: { stage: string; slug: string; error: string }[] = [];

/**
 * Run `write` over `rows` in chunks. If a chunk throws, retry its rows one at
 * a time so the failure is attributed to a specific slug rather than to a
 * batch of twenty, and so one bad row does not discard nineteen good ones.
 */
async function writeChunked<T extends { slug: string }, R>(
  stage: string,
  rows: T[],
  size: number,
  write: (batch: T[]) => Promise<R[]>,
): Promise<R[]> {
  const results: R[] = [];
  for (const batch of chunk(rows, size)) {
    try {
      results.push(...(await write(batch)));
    } catch {
      for (const row of batch) {
        try {
          results.push(...(await write([row])));
        } catch (err) {
          failures.push({
            stage,
            slug: row.slug,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  }
  return results;
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const db = getDb();

  const series = flags.only
    ? SERIES_SEED.filter((s) => flags.only!.has(s.slug))
    : SERIES_SEED;
  if (flags.only && series.length === 0) {
    throw new Error(
      `--only matched no series. Known slugs: ${SERIES_SEED.map((s) => s.slug).join(", ")}`,
    );
  }
  // Only the cities those series actually need, so --only stays narrow.
  const neededCities = new Set(series.map((s) => s.citySlug));
  const cityRows = flags.only
    ? CITY_SEED.filter((c) => neededCities.has(c.slug))
    : CITY_SEED;

  // --- read geometry + decide what changed --------------------------------
  // One query for every existing checksum, rather than a SELECT per course.
  const existingCourses = flags.skipGeometry
    ? []
    : await db.select({ id: courses.id, slug: courses.slug, checksum: courses.checksum }).from(courses);
  const existingBySlug = new Map(existingCourses.map((r) => [r.slug, r]));

  const courseIdBySlug = new Map<string, number>();
  const geometryToWrite: {
    slug: string;
    seriesSlug: string;
    elevations: number[];
    coords: [number, number][];
    profile: [number, number][];
    checksum: string;
  }[] = [];

  if (!flags.skipGeometry) {
    for (const s of series) {
      const slug = s.courseSlug;
      let elevations: number[];
      let coords: [number, number][];
      let profile: [number, number][];
      try {
        elevations = readCourseJson<number[]>(slug, "");
        coords = readCourseJson<[number, number][]>(slug, ".coords");
        profile = readCourseJson<[number, number][]>(slug, ".profile");
      } catch (err) {
        // Missing geometry used to be an unhandled ENOENT that killed the run.
        failures.push({
          stage: "course-read",
          slug,
          error: err instanceof Error ? err.message : String(err),
        });
        continue;
      }
      const sum = checksum(elevations, coords, profile);
      const existing = existingBySlug.get(slug);
      if (existing && existing.checksum === sum) {
        courseIdBySlug.set(slug, existing.id); // unchanged — skip the jsonb write
        continue;
      }
      geometryToWrite.push({
        slug,
        seriesSlug: s.slug,
        elevations,
        coords,
        profile,
        checksum: sum,
      });
    }
  }

  const editions = buildEditionSeed(series.map((s) => s.slug));

  if (flags.dryRun) {
    console.log("dry run — nothing written\n");
    console.log(`cities:   ${cityRows.length} would upsert`);
    console.log(`series:   ${series.length} would upsert`);
    console.log(
      `courses:  ${geometryToWrite.length} geometry write(s), ` +
        `${courseIdBySlug.size} unchanged`,
    );
    if (geometryToWrite.length > 0) {
      console.log(`          changed: ${geometryToWrite.map((g) => g.slug).join(", ")}`);
    }
    console.log(`editions: ${editions.length} would upsert`);
    reportFailures();
    return;
  }

  // --- cities -------------------------------------------------------------
  const cityIdBySlug = new Map<string, number>();
  const cityResults = await writeChunked(
    "city",
    cityRows.map((c) => ({
      slug: c.slug,
      name: c.name,
      countryCode: c.countryCode,
      countryName: c.countryName,
      regionCode: c.regionCode,
      regionName: c.regionName,
      latitude: String(c.latitude),
      longitude: String(c.longitude),
      timezone: c.timezone,
    })),
    CHUNK.narrow,
    (batch) =>
      db
        .insert(cities)
        .values(batch)
        .onConflictDoUpdate({
          target: cities.slug,
          set: {
            name: sql`excluded.name`,
            countryCode: sql`excluded.country_code`,
            countryName: sql`excluded.country_name`,
            regionCode: sql`excluded.region_code`,
            regionName: sql`excluded.region_name`,
            latitude: sql`excluded.latitude`,
            longitude: sql`excluded.longitude`,
            timezone: sql`excluded.timezone`,
          },
        })
        .returning({ id: cities.id, slug: cities.slug }),
  );
  for (const r of cityResults) cityIdBySlug.set(r.slug, r.id);
  console.log(`cities:   ${cityIdBySlug.size} upserted`);

  // --- series -------------------------------------------------------------
  const seriesRows = [];
  for (const s of series) {
    const cityId = cityIdBySlug.get(s.citySlug);
    if (!cityId) {
      failures.push({
        stage: "series",
        slug: s.slug,
        error: `Unknown citySlug "${s.citySlug}"`,
      });
      continue;
    }
    seriesRows.push({
      slug: s.slug,
      name: s.name,
      cityId,
      isMajor: s.isMajor,
      typicalMonth: s.typicalMonth,
      websiteUrl: s.websiteUrl,
      organizer: s.organizer,
    });
  }

  const seriesIdBySlug = new Map<string, number>();
  const seriesResults = await writeChunked(
    "series",
    seriesRows,
    CHUNK.narrow,
    (batch) =>
      db
        .insert(eventSeries)
        .values(batch)
        .onConflictDoUpdate({
          target: eventSeries.slug,
          set: {
            name: sql`excluded.name`,
            cityId: sql`excluded.city_id`,
            isMajor: sql`excluded.is_major`,
            typicalMonth: sql`excluded.typical_month`,
            websiteUrl: sql`excluded.website_url`,
            organizer: sql`excluded.organizer`,
            updatedAt: new Date(),
          },
        })
        .returning({ id: eventSeries.id, slug: eventSeries.slug }),
  );
  for (const r of seriesResults) seriesIdBySlug.set(r.slug, r.id);
  console.log(`series:   ${seriesIdBySlug.size} upserted`);

  // --- courses (geometry from the repo JSON) ------------------------------
  const courseRows = [];
  for (const g of geometryToWrite) {
    const seriesId = seriesIdBySlug.get(g.seriesSlug);
    if (!seriesId) continue; // its series failed above; already reported
    courseRows.push({
      slug: g.slug,
      seriesId,
      label: "Current course",
      elevations: g.elevations,
      coords: g.coords,
      profile: g.profile,
      startLat: String(g.coords[0][0]),
      startLon: String(g.coords[0][1]),
      gpxSourcePath: `data/gpx_sources/${g.slug}.gpx`,
      checksum: g.checksum,
    });
  }

  const courseResults = await writeChunked(
    "course",
    courseRows,
    CHUNK.geometry,
    (batch) =>
      db
        .insert(courses)
        .values(batch)
        .onConflictDoUpdate({
          target: courses.slug,
          set: {
            elevations: sql`excluded.elevations`,
            coords: sql`excluded.coords`,
            profile: sql`excluded.profile`,
            startLat: sql`excluded.start_lat`,
            startLon: sql`excluded.start_lon`,
            checksum: sql`excluded.checksum`,
            updatedAt: new Date(),
          },
        })
        .returning({ id: courses.id, slug: courses.slug }),
  );
  for (const r of courseResults) courseIdBySlug.set(r.slug, r.id);
  console.log(
    `courses:  ${courseIdBySlug.size} present, ${courseResults.length} geometry write(s)`,
  );

  // --- editions -----------------------------------------------------------
  const courseSlugBySeries = new Map(series.map((s) => [s.slug, s.courseSlug]));
  const editionRows = [];
  for (const e of editions) {
    const seriesId = seriesIdBySlug.get(e.seriesSlug);
    if (!seriesId) continue; // its series failed above; already reported
    editionRows.push({
      slug: e.slug,
      seriesId,
      year: e.year,
      raceDate: e.raceDate,
      startTimeLocal: e.startTimeLocal,
      dateConfidence: e.dateConfidence,
      status: e.status,
      courseId: courseIdBySlug.get(courseSlugBySeries.get(e.seriesSlug)!) ?? null,
    });
  }

  const editionResults = await writeChunked(
    "edition",
    editionRows,
    CHUNK.narrow,
    (batch) =>
      db
        .insert(eventEditions)
        .values(batch)
        .onConflictDoUpdate({
          target: eventEditions.slug,
          set: {
            seriesId: sql`excluded.series_id`,
            year: sql`excluded.year`,
            raceDate: sql`excluded.race_date`,
            startTimeLocal: sql`excluded.start_time_local`,
            dateConfidence: sql`excluded.date_confidence`,
            status: sql`excluded.status`,
            courseId: sql`excluded.course_id`,
          },
        })
        .returning({ slug: eventEditions.slug }),
  );
  console.log(`editions: ${editionResults.length} upserted`);

  const estimated = editions.filter((e) => e.dateConfidence === "estimated");
  if (estimated.length > 0) {
    console.log(
      `\n  ⚠  ${estimated.length} of ${editions.length} editions have ESTIMATED dates,\n` +
        `     derived from the recurrence rules in src/db/seed/editions.ts.\n` +
        `     Confirm them against each organizer before relying on the calendar.`,
    );
  }

  await revalidateCatalog();
  reportFailures();
}

/**
 * Drop the cached catalog so an import shows up immediately.
 *
 * src/db/queries.ts caches under the "course-catalog" tag for an hour, so
 * without this a freshly seeded course is invisible until the TTL lapses or
 * something redeploys — long enough to look like the seed silently failed.
 */
async function revalidateCatalog() {
  const url = process.env.REVALIDATE_URL;
  const secret = process.env.REVALIDATE_SECRET;
  if (!url || !secret) {
    console.log(
      "\n  cache not revalidated (REVALIDATE_URL / REVALIDATE_SECRET unset).\n" +
        "  New courses appear once the 1h catalog cache lapses or on next deploy.",
    );
    return;
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "x-revalidate-secret": secret },
    });
    console.log(
      res.ok
        ? "\n  course catalog cache revalidated"
        : `\n  ⚠  revalidate failed: HTTP ${res.status}`,
    );
  } catch (err) {
    console.log(`\n  ⚠  revalidate request failed: ${err}`);
  }
}

function reportFailures() {
  if (failures.length === 0) return;
  console.error(`\n  ✗ ${failures.length} row(s) failed:`);
  for (const f of failures) {
    console.error(`      [${f.stage}] ${f.slug}: ${f.error}`);
  }
}

main()
  .then(() => process.exit(failures.length > 0 ? 1 : 0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
