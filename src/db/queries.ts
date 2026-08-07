// Server-only reads. Two tiers, and the split is the point:
//
//   CATALOG   light metadata for every course (~200 bytes each). Safe to ship
//             to the client, so the course picker stays synchronous.
//   GEOMETRY  the heavy jsonb for exactly ONE course, fetched only on the page
//             that actually charts it.
//
// Before the database, src/data/courses.ts statically imported every course's
// dense profile JSON (7-48 KB each) into the client bundle. At 200 courses
// that is megabytes shipped to every visitor. This split is what prevents it:
// profiles never reach the browser except for the single course being run.
import { unstable_cache } from "next/cache";
import { and, asc, eq, gte, isNotNull, sql } from "drizzle-orm";
import type { Course, CourseSummary, EditionSummary } from "@/types";
import { getDb, isDatabaseConfigured } from "./client";
import {
  cities,
  courses,
  eventCalendar,
  eventEditions,
  eventSeries,
} from "./schema";

// Course data changes when we seed, which is a deploy. An hour is generous
// while still letting a corrected race date appear without a redeploy.
const REVALIDATE_SECONDS = 3600;
const CATALOG_TAG = "course-catalog";

// NOTE: `unstable_cache` is deprecated in Next 16 in favour of the `use cache`
// directive, which requires `cacheComponents: true` in next.config.ts. That
// flag changes prerendering and navigation semantics app-wide, so it is a
// deliberate separate decision. When it is taken, these two wrappers are the
// only things that need to change.

/**
 * Every course with its host city and next scheduled edition.
 *
 * The lateral join picks each series' soonest upcoming edition, so the picker
 * can prefill a race date the moment a course is chosen.
 */
async function loadCourseCatalog(): Promise<CourseSummary[]> {
  if (!isDatabaseConfigured()) return [];
  const db = getDb();

  const nextEdition = db
    .select({
      seriesId: eventEditions.seriesId,
      raceDate: sql<string>`min(${eventEditions.raceDate})`.as("race_date"),
    })
    .from(eventEditions)
    .where(
      and(
        eq(eventEditions.status, "scheduled"),
        gte(eventEditions.raceDate, sql`current_date`),
      ),
    )
    .groupBy(eventEditions.seriesId)
    .as("next_edition");

  const rows = await db
    .select({
      slug: courses.slug,
      startLat: courses.startLat,
      startLon: courses.startLon,
      seriesName: eventSeries.name,
      seriesSlug: eventSeries.slug,
      cityName: cities.name,
      countryCode: cities.countryCode,
      countryName: cities.countryName,
      regionCode: cities.regionCode,
      regionName: cities.regionName,
      latitude: cities.latitude,
      longitude: cities.longitude,
      timezone: cities.timezone,
      nextRaceDate: nextEdition.raceDate,
    })
    .from(courses)
    .innerJoin(eventSeries, eq(eventSeries.id, courses.seriesId))
    .innerJoin(cities, eq(cities.id, eventSeries.cityId))
    .leftJoin(nextEdition, eq(nextEdition.seriesId, eventSeries.id))
    .where(sql`${courses.effectiveToYear} is null`)
    .orderBy(asc(eventSeries.name));

  return rows.map((r) => ({
    id: r.slug,
    seriesSlug: r.seriesSlug,
    displayName: r.seriesName,
    city: r.cityName,
    countryCode: r.countryCode,
    countryName: r.countryName,
    regionCode: r.regionCode,
    regionName: r.regionName,
    // The city's shared map pin — distinct from `start`, this course's own start line.
    cityLat: Number(r.latitude),
    cityLon: Number(r.longitude),
    start: { lat: Number(r.startLat), lon: Number(r.startLon) },
    timezone: r.timezone,
    nextRaceDateISO: r.nextRaceDate ?? null,
  }));
}

export const getCourseCatalog = unstable_cache(
  loadCourseCatalog,
  ["course-catalog"],
  { revalidate: REVALIDATE_SECONDS, tags: [CATALOG_TAG] },
);

/**
 * Every scheduled edition that has a course behind it, oldest first.
 *
 * The first consumer of the `event_calendar` view, which was written for
 * exactly this read. Past editions are deliberately included: the homepage
 * calendar renders them dimmed so a month someone scrolls back to doesn't look
 * empty and broken.
 *
 * Still light — no geometry, no prose — so the whole list ships to the client
 * and the month arrows are instant.
 */
async function loadEventCalendar(): Promise<EditionSummary[]> {
  if (!isDatabaseConfigured()) return [];
  const db = getDb();

  const rows = await db
    .select({
      editionSlug: eventCalendar.editionSlug,
      seriesSlug: eventCalendar.seriesSlug,
      seriesName: eventCalendar.seriesName,
      courseSlug: eventCalendar.courseSlug,
      cityName: eventCalendar.cityName,
      countryCode: eventCalendar.countryCode,
      countryName: eventCalendar.countryName,
      raceDate: eventCalendar.raceDate,
      startTimeLocal: eventCalendar.startTimeLocal,
      dateConfidence: eventCalendar.dateConfidence,
    })
    .from(eventCalendar)
    .where(
      and(
        eq(eventCalendar.status, "scheduled"),
        // An edition with no course has no elevation profile, so there is
        // nothing to pace and nowhere for its link to go. Not shown at all.
        isNotNull(eventCalendar.courseSlug),
      ),
    )
    .orderBy(asc(eventCalendar.raceDate));

  return rows.map((r) => ({
    editionSlug: r.editionSlug,
    seriesSlug: r.seriesSlug,
    displayName: r.seriesName,
    courseId: r.courseSlug!, // isNotNull above; drizzle can't narrow through it
    city: r.cityName,
    countryCode: r.countryCode,
    countryName: r.countryName,
    raceDateISO: r.raceDate,
    // Postgres `time` comes back as "08:00:00". src/lib/units/date.ts treats
    // "HH:MM" as a hard contract — `parseTime` rejects anything longer, and
    // the forecast concatenation would silently produce an invalid Date.
    startTimeLocal: r.startTimeLocal ? r.startTimeLocal.slice(0, 5) : null,
    dateConfidence: r.dateConfidence as EditionSummary["dateConfidence"],
  }));
}

export const getEventCalendar = unstable_cache(
  loadEventCalendar,
  ["event-calendar"],
  { revalidate: REVALIDATE_SECONDS, tags: [CATALOG_TAG] },
);

/** Full geometry for one course, or null when the slug is unknown. */
async function loadCourseBySlug(slug: string): Promise<Course | null> {
  if (!isDatabaseConfigured()) return null;
  const db = getDb();

  const rows = await db
    .select({
      slug: courses.slug,
      elevations: courses.elevations,
      coords: courses.coords,
      profile: courses.profile,
      startLat: courses.startLat,
      startLon: courses.startLon,
      seriesName: eventSeries.name,
      cityName: cities.name,
      timezone: cities.timezone,
    })
    .from(courses)
    .innerJoin(eventSeries, eq(eventSeries.id, courses.seriesId))
    .innerJoin(cities, eq(cities.id, eventSeries.cityId))
    .where(eq(courses.slug, slug))
    .limit(1);

  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.slug,
    displayName: r.seriesName,
    city: r.cityName,
    elevations: r.elevations,
    coords: r.coords,
    profile: r.profile,
    start: { lat: Number(r.startLat), lon: Number(r.startLon) },
    timezone: r.timezone,
  };
}

export const getCourseBySlug = unstable_cache(
  loadCourseBySlug,
  ["course-by-slug"],
  { revalidate: REVALIDATE_SECONDS, tags: [CATALOG_TAG] },
);
