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
import type {
  Course,
  CourseSummary,
  EditionOption,
  EditionSummary,
} from "@/types";
import { courseEffort } from "@/lib/pacing/effort";
import { courseTerrain } from "@/lib/pacing/terrain";
import { getDb, isDatabaseConfigured } from "./client";
import { isUserCourseId, readUserCourse } from "./userCourses";
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
 * How many years of editions the year picker offers, either side of today.
 *
 * SEED_YEARS currently spans exactly this window, so the bound is a no-op —
 * it exists so that widening the seed again doesn't silently multiply what
 * ships to every visitor. The edition array rides on every CourseSummary, so
 * its cost is per-course times per-year across the whole catalog.
 */
const EDITION_YEARS_BACK = 4;
const EDITION_YEARS_FORWARD = 2;

/** One row inside the aggregated `json_agg` payload, before mapping. */
interface RawEdition {
  slug: string;
  year: number;
  raceDate: string;
  startTimeLocal: string | null;
  dateConfidence: string;
}

/**
 * Split an edition slug back into its variant suffix, if any.
 *
 * `variant` has no column of its own — it only ever existed as a slug suffix
 * ("london-marathon-2027-mass"), because the two-day case is rare enough that
 * the seed encodes it in the identifier rather than the schema. The picker
 * needs it to label two same-year options apart, so recover it here.
 */
function variantFromSlug(
  slug: string,
  seriesSlug: string,
  year: number,
): string | null {
  const base = `${seriesSlug}-${year}`;
  return slug.length > base.length && slug.startsWith(`${base}-`)
    ? slug.slice(base.length + 1)
    : null;
}

/**
 * Every course with its host city, next scheduled edition, and the full list of
 * editions the year picker can offer.
 *
 * The lateral join picks each series' soonest upcoming edition, so the picker
 * can prefill a race date the moment a course is chosen.
 */
async function loadCourseCatalog(): Promise<CourseSummary[]> {
  if (!isDatabaseConfigured()) return [];
  const db = getDb();

  // Every edition per series, oldest first — including past ones, which are
  // now selectable (that's where historical weather comes from).
  const editionList = db
    .select({
      seriesId: eventEditions.seriesId,
      editions: sql<RawEdition[]>`json_agg(
          json_build_object(
            'slug', ${eventEditions.slug},
            'year', ${eventEditions.year},
            'raceDate', ${eventEditions.raceDate},
            'startTimeLocal', ${eventEditions.startTimeLocal},
            'dateConfidence', ${eventEditions.dateConfidence}
          ) order by ${eventEditions.raceDate}
        )`.as("editions"),
    })
    .from(eventEditions)
    .where(
      and(
        eq(eventEditions.status, "scheduled"),
        sql`${eventEditions.year} >= extract(year from current_date) - ${EDITION_YEARS_BACK}`,
        sql`${eventEditions.year} <= extract(year from current_date) + ${EDITION_YEARS_FORWARD}`,
      ),
    )
    .groupBy(eventEditions.seriesId)
    .as("edition_list");

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
      // The ONE piece of geometry the catalog reads. 44 numbers per row is
      // nothing next to `profile` (7-48 KB), and it never leaves the server:
      // only the two scalars `courseEffort` reduces it to are shipped.
      elevations: courses.elevations,
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
      editions: editionList.editions,
    })
    .from(courses)
    .innerJoin(eventSeries, eq(eventSeries.id, courses.seriesId))
    .innerJoin(cities, eq(cities.id, eventSeries.cityId))
    .leftJoin(nextEdition, eq(nextEdition.seriesId, eventSeries.id))
    .leftJoin(editionList, eq(editionList.seriesId, eventSeries.id))
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
    effort: courseEffort(r.elevations),
    terrain: courseTerrain(r.elevations),
    nextRaceDateISO: r.nextRaceDate ?? null,
    editions: (r.editions ?? []).map(
      (e): EditionOption => ({
        year: Number(e.year),
        raceDateISO: e.raceDate,
        // Postgres hands back "08:00:00"; `parseTime` rejects anything longer
        // than "HH:MM", same slice loadEventCalendar already does.
        startTimeLocal: e.startTimeLocal
          ? e.startTimeLocal.slice(0, 5)
          : null,
        dateConfidence:
          e.dateConfidence as EditionOption["dateConfidence"],
        variant: variantFromSlug(e.slug, r.seriesSlug, Number(e.year)),
      }),
    ),
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
 * "Past" is bounded to the current calendar year, though. SEED_YEARS now
 * reaches back to 2022 so the year picker has history to offer, and without
 * this bound every one of those years would land in the calendar — several
 * thousand extra dimmed chips, all shipped to the client, to make the month
 * arrows scroll through years nobody is navigating to. The year picker is
 * where the deep history is reachable; the calendar stays a calendar.
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
      regionCode: eventCalendar.regionCode,
      regionName: eventCalendar.regionName,
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
        gte(eventCalendar.raceDate, sql`date_trunc('year', current_date)`),
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
    regionCode: r.regionCode,
    regionName: r.regionName,
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
      countryCode: cities.countryCode,
      countryName: cities.countryName,
      regionCode: cities.regionCode,
      regionName: cities.regionName,
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
    countryCode: r.countryCode,
    countryName: r.countryName,
    regionCode: r.regionCode,
    regionName: r.regionName,
    elevations: r.elevations,
    coords: r.coords,
    profile: r.profile,
    start: { lat: Number(r.startLat), lon: Number(r.startLon) },
    timezone: r.timezone,
  };
}

const getSeededCourseBySlug = unstable_cache(
  loadCourseBySlug,
  ["course-by-slug"],
  { revalidate: REVALIDATE_SECONDS, tags: [CATALOG_TAG] },
);

/** An uploaded course, shaped as the same Course the seeded ones produce. */
async function loadUserCourseAsCourse(token: string): Promise<Course | null> {
  const row = await readUserCourse(token);
  if (!row) return null;
  return {
    id: row.token,
    displayName: row.name,
    // An upload has no city, region or country: nobody told us where it is,
    // and guessing from coordinates would need a geocoder this repo does not
    // have. Empty rather than invented — Dashboard renders a label instead.
    city: "",
    countryCode: "",
    countryName: "",
    regionCode: null,
    regionName: null,
    elevations: row.elevations,
    coords: row.coords,
    profile: row.profile,
    start: { lat: row.startLat, lon: row.startLon },
    timezone: row.timezone,
    isUserUpload: true,
    elevationSource: row.elevationSource,
    expiresAtISO: row.expiresAt?.toISOString() ?? null,
  };
}

/**
 * Full geometry for one course id, seeded or uploaded.
 *
 * THE UPLOAD BRANCH SITS OUTSIDE THE CACHE, deliberately. getSeededCourseBySlug
 * is memoised for an hour under the course-catalog tag, which is right for a
 * catalog that only changes at seed time. An uploaded course must resolve on
 * the request immediately after it was created, and it is not part of the
 * catalog that tag invalidates — caching it here would make a fresh upload
 * 404 for up to an hour.
 *
 * This is the single existence proof for a course id in the app: /results
 * renders an error when it returns null, and /api/checkout refuses to charge.
 * Both get uploaded-course support for free by it being the one place that
 * knows about the `u-` prefix.
 */
export async function getCourseBySlug(slug: string): Promise<Course | null> {
  if (isUserCourseId(slug)) return loadUserCourseAsCourse(slug);
  return getSeededCourseBySlug(slug);
}
