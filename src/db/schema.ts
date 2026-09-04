// Drizzle schema for the marathon database.
//
// Three levels plus geometry:
//
//   city         a place. Owns the map pin (seeded from a host race's GPX
//                start line for precision) and the country/region facets the
//                calendar filters on.
//   eventSeries  the marathon as a recurring brand ("Boston Marathon"). One
//                row, forever.
//   eventEdition one running of that series in one year. Boston 2026 and
//                Boston 2027 are two editions of one series.
//   course       GPX-derived geometry, versioned, hanging off the SERIES —
//                so every edition reuses one geometry row until the route
//                actually changes.
//
// See drizzle/ for the generated SQL and scripts/seed.ts for how rows get in.
import {
  boolean,
  char,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  pgView,
  serial,
  smallint,
  text,
  time,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/** Marathon distance in metres — the default for a series with no override. */
export const MARATHON_DISTANCE_M = 42195;

/**
 * A city that hosts one or more marathons.
 *
 * `latitude`/`longitude` are the map pin. Seeded from the host race's actual
 * GPX start line (precise, not a guessed centroid) — but the concept is
 * still "one point per city", not "this race's start line": every event
 * hosted in a city shares this single row, so two Toronto marathons are
 * structurally incapable of rendering as two different pins. `course` carries
 * its own start-line columns separately, which is what the weather lookup
 * uses per-race.
 */
export const cities = pgTable(
  "city",
  {
    id: serial("id").primaryKey(),
    /** URL-safe, globally unique: "toronto-on-ca". */
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    /** ISO 3166-1 alpha-2, e.g. "CA". */
    countryCode: char("country_code", { length: 2 }).notNull(),
    countryName: text("country_name").notNull(),
    /** ISO 3166-2 subdivision, e.g. "CA-ON". Null for city-states. */
    regionCode: text("region_code"),
    regionName: text("region_name"),
    latitude: numeric("latitude", { precision: 9, scale: 6 }).notNull(),
    longitude: numeric("longitude", { precision: 9, scale: 6 }).notNull(),
    /** IANA zone, e.g. "America/Toronto". A property of the place, not the route. */
    timezone: text("timezone").notNull(),
  },
  (t) => [
    // Drives the calendar's country -> region cascade.
    index("city_country_region_idx").on(t.countryCode, t.regionCode),
  ],
);

/** A marathon as a recurring brand. The thing users think of as "the race". */
export const eventSeries = pgTable(
  "event_series",
  {
    id: serial("id").primaryKey(),
    /** "boston-marathon" */
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    cityId: integer("city_id")
      .notNull()
      .references(() => cities.id, { onDelete: "restrict" }),
    distanceM: integer("distance_m").notNull().default(MARATHON_DISTANCE_M),
    websiteUrl: text("website_url"),
    organizer: text("organizer"),
    description: text("description"),
    /** World Marathon Major. */
    isMajor: boolean("is_major").notNull().default(false),
    /** 1-12. Lets the calendar say "usually April" before a date is confirmed. */
    typicalMonth: smallint("typical_month"),
    /** 'active' | 'discontinued' */
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("event_series_city_idx").on(t.cityId)],
);

/**
 * GPX-derived course geometry, versioned per series.
 *
 * Hangs off the series rather than the edition: one geometry row serves every
 * year until the organizer actually reroutes, at which point a second row is
 * inserted with `effectiveFromYear` set and later editions are repointed.
 * Nothing is ever rewritten, so old shared results URLs keep resolving.
 *
 * `slug` intentionally reuses the pre-database course ids ("boston", "berlin",
 * ...) so every /results?courseId=... link already in the wild — including on
 * printed pacebands people have paid for — keeps working with no redirects.
 */
export const courses = pgTable(
  "course",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    seriesId: integer("series_id")
      .notNull()
      .references(() => eventSeries.id, { onDelete: "cascade" }),
    /** Human label for the version, e.g. "2018-present course". */
    label: text("label"),
    effectiveFromYear: smallint("effective_from_year"),
    /** Null means this is the current course. */
    effectiveToYear: smallint("effective_to_year"),
    distanceM: integer("distance_m").notNull().default(MARATHON_DISTANCE_M),
    /** 44 absolute elevations (m) at 0,1,...,42,42.195 km. The pacing engine's only input. */
    elevations: jsonb("elevations").$type<number[]>().notNull(),
    /** 44 [lat, lon] pairs at the same marks. Drives per-segment wind bearings. */
    coords: jsonb("coords").$type<[number, number][]>().notNull(),
    /** Dense [distanceKm, elevationM] trackpoints. Presentational only. */
    profile: jsonb("profile").$type<[number, number][]>().notNull(),
    /** == coords[0]. Denormalized so the weather lookup needs no jsonb parse. */
    startLat: numeric("start_lat", { precision: 9, scale: 6 }).notNull(),
    startLon: numeric("start_lon", { precision: 9, scale: 6 }).notNull(),
    gpxSourcePath: text("gpx_source_path"),
    /** Hash of the source JSON. Lets the seed skip unchanged geometry. */
    checksum: text("checksum").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("course_series_idx").on(t.seriesId)],
);

/**
 * One running of a series, in one year.
 *
 * Dates are stored as a `date` plus a `time`, never a timestamptz. A race
 * start is a wall-clock fact ("8:00 AM local"); the UTC instant it maps to
 * depends on DST rules that governments do change. `zonedWallClockToUTC` in
 * src/lib/weather/timezone.ts resolves it against the city's IANA zone at
 * read time, which stays correct even if the rules move.
 */
export const eventEditions = pgTable(
  "event_edition",
  {
    id: serial("id").primaryKey(),
    /** "boston-marathon-2027" */
    slug: text("slug").notNull().unique(),
    seriesId: integer("series_id")
      .notNull()
      .references(() => eventSeries.id, { onDelete: "cascade" }),
    year: smallint("year").notNull(),
    raceDate: date("race_date").notNull(),
    /** "08:00" wall clock in the host city's timezone. */
    startTimeLocal: time("start_time_local"),
    /** 'confirmed' | 'estimated' | 'tbd' */
    dateConfidence: text("date_confidence").notNull().default("estimated"),
    /** 'scheduled' | 'completed' | 'cancelled' */
    status: text("status").notNull().default("scheduled"),
    /** Which geometry this year ran on. Null until a course is mapped. */
    courseId: integer("course_id").references(() => courses.id, {
      onDelete: "set null",
    }),
    registrationOpensAt: date("registration_opens_at"),
    registrationClosesAt: date("registration_closes_at"),
    registrationUrl: text("registration_url"),
  },
  (t) => [
    // A series runs at most once on any given date. Deliberately NOT
    // unique(seriesId, year) — some majors run a genuine two-day event in
    // one year (London 2027 splits elite/mass across April 24 and 25), which
    // needs two rows sharing a series and year but with different dates.
    unique("event_edition_series_date_key").on(t.seriesId, t.raceDate),
    // The calendar's primary sort/filter.
    index("event_edition_race_date_idx").on(t.raceDate),
  ],
);

export const citiesRelations = relations(cities, ({ many }) => ({
  series: many(eventSeries),
}));

export const eventSeriesRelations = relations(eventSeries, ({ one, many }) => ({
  city: one(cities, { fields: [eventSeries.cityId], references: [cities.id] }),
  editions: many(eventEditions),
  courses: many(courses),
}));

export const coursesRelations = relations(courses, ({ one, many }) => ({
  series: one(eventSeries, {
    fields: [courses.seriesId],
    references: [eventSeries.id],
  }),
  editions: many(eventEditions),
}));

export const eventEditionsRelations = relations(eventEditions, ({ one }) => ({
  series: one(eventSeries, {
    fields: [eventEditions.seriesId],
    references: [eventSeries.id],
  }),
  course: one(courses, {
    fields: [eventEditions.courseId],
    references: [courses.id],
  }),
}));

/**
 * Flattened edition x series x city x course, created by hand in
 * drizzle/0001_event_calendar_view.sql. Declared `.existing()` so drizzle-kit
 * treats it as read-only and never tries to regenerate it.
 *
 * This single view backs all three read patterns: the map (grouped by city),
 * the calendar (filtered by country/region, ordered by race_date), and the
 * course picker (next upcoming edition per series).
 */
export const eventCalendar = pgView("event_calendar", {
  editionId: integer("edition_id").notNull(),
  editionSlug: text("edition_slug").notNull(),
  year: smallint("year").notNull(),
  raceDate: date("race_date").notNull(),
  startTimeLocal: time("start_time_local"),
  dateConfidence: text("date_confidence").notNull(),
  status: text("status").notNull(),
  registrationUrl: text("registration_url"),
  seriesId: integer("series_id").notNull(),
  seriesSlug: text("series_slug").notNull(),
  seriesName: text("series_name").notNull(),
  isMajor: boolean("is_major").notNull(),
  distanceM: integer("distance_m").notNull(),
  websiteUrl: text("website_url"),
  cityId: integer("city_id").notNull(),
  citySlug: text("city_slug").notNull(),
  cityName: text("city_name").notNull(),
  countryCode: char("country_code", { length: 2 }).notNull(),
  countryName: text("country_name").notNull(),
  regionCode: text("region_code"),
  regionName: text("region_name"),
  latitude: numeric("latitude", { precision: 9, scale: 6 }).notNull(),
  longitude: numeric("longitude", { precision: 9, scale: 6 }).notNull(),
  timezone: text("timezone").notNull(),
  courseSlug: text("course_slug"),
  startLat: numeric("start_lat", { precision: 9, scale: 6 }),
  startLon: numeric("start_lon", { precision: 9, scale: 6 }),
}).existing();

/**
 * Cached race-day weather, keyed by start line and start instant.
 *
 * The point is that most of what this app asks a weather API for NEVER
 * CHANGES. A race that has been run has one set of conditions, permanently;
 * a ten-year climate average only moves when a new year joins the window.
 * Re-fetching those on every page load buys nothing and is what would make a
 * historical weather subscription a recurring cost rather than a one-off
 * backfill.
 *
 * `expiresAt` is what separates the three sources, and it is the only thing
 * that does — the row shape is identical:
 *
 *   historical  null      settled; a record of a morning that has passed
 *   typical     ~1 year   a 10-year average, restated when a year rolls in
 *   forecast    ~15 min   a prediction, and a stale one is worse than none
 *
 * Written from the /api/weather route rather than the seed, which makes this
 * the one table the app writes to at runtime. That is deliberate and stays
 * safe under Rule 6: the rows are derived public weather, carry nothing about
 * who asked, and a failed write is swallowed — a cache that cannot be written
 * degrades to the API call it was avoiding, never to an error.
 */
export const weatherWindows = pgTable(
  "weather_window",
  {
    id: serial("id").primaryKey(),
    /**
     * The course start line, rounded to 4dp (~11 m) so that two requests for
     * the same start agree on a cache key. Full float precision would make
     * every request a miss the moment a coordinate was re-derived.
     */
    lat: numeric("lat", { precision: 9, scale: 4 }).notNull(),
    lon: numeric("lon", { precision: 9, scale: 4 }).notNull(),
    /** The gun, as an absolute instant — already resolved through the city's zone. */
    startUtc: timestamp("start_utc", { withTimezone: true }).notNull(),
    /** 'forecast' | 'historical' | 'typical' */
    source: text("source").notNull(),
    /** WeatherConditions[], index i = i hours after the gun. */
    hours: jsonb("hours").notNull(),
    /** Whatever the UI needs to explain the numbers (race date, years averaged). */
    meta: jsonb("meta"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
    /** Null means permanent — see the table comment. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (t) => [
    // One row per start line per instant per source. A forecast and a later
    // historical reading of the SAME race are two different facts and both
    // worth keeping, which is why source is part of the key.
    unique("weather_window_key").on(t.lat, t.lon, t.startUtc, t.source),
    index("weather_window_expires_idx").on(t.expiresAt),
  ],
);

/**
 * A course a runner uploaded, addressed by an unguessable token.
 *
 * THIS IS THE ONE PLACE THE APP HOLDS USER-SUBMITTED CONTENT, and it is a
 * deliberate, bounded exception to CLAUDE.md Rule 6 rather than a drift away
 * from it. See docs/UPLOADED-COURSES.md for the full argument. In short:
 *
 *   - There are still no accounts, no login and no session. A row here is not
 *     OWNED by anybody; it is reachable by whoever holds the link, the same
 *     way an unlisted document is. That is what lets uploads exist without
 *     inventing the auth Rule 6 refuses.
 *   - It is separate from `course` on purpose. `course` is the seeded, curated
 *     catalog whose slugs are permanent public identifiers signed off in the
 *     slug ledger (Rule 8). Nothing uploaded is ever allowed into that ledger,
 *     and the `u-` token prefix is reserved so the two namespaces cannot
 *     collide — courses.test.ts asserts no seeded slug starts with it.
 *   - The geometry columns mirror `course` exactly, so one Course object can
 *     be built from either table and everything downstream — the chart, the
 *     splits, the paceband, checkout — is reused untouched.
 *
 * `expiresAt` carries the retention promise, following the weather_window
 * precedent: enforced at read time, no sweeper. A free upload lapses after
 * ~90 days; ordering a physical paceband sets it to null, because a printed
 * band has a URL on it and Rule 8 exists precisely so a printed link cannot
 * die. Paying is what makes a course permanent.
 */
export const userCourses = pgTable(
  "user_course",
  {
    id: serial("id").primaryKey(),
    /**
     * The public course id, shaped `u-<22 lowercase alphanumerics>`.
     *
     * Deliberately matched to COURSE_SLUG_RE in src/lib/resultsParams.ts, so an
     * uploaded course travels through /results?courseId=... and the checkout
     * validation ladder with no change to either. ~113 bits of entropy: the
     * link is the only credential, so it has to be unguessable.
     */
    token: text("token").notNull().unique(),
    /** What the runner called it. Sanitised and length-capped at the route. */
    name: text("name").notNull(),
    /** 44 elevations (m), the pacing engine's only geometry input. */
    elevations: jsonb("elevations").$type<number[]>().notNull(),
    /** 44 [lat, lon] at the same marks — per-segment wind bearings. */
    coords: jsonb("coords").$type<[number, number][]>().notNull(),
    /** Dense [distanceKm, elevationM] for the chart. Presentational only. */
    profile: jsonb("profile").$type<[number, number][]>().notNull(),
    /** == coords[0]. Denormalised so the weather lookup needs no jsonb parse. */
    startLat: numeric("start_lat", { precision: 9, scale: 6 }).notNull(),
    startLon: numeric("start_lon", { precision: 9, scale: 6 }).notNull(),
    /**
     * IANA zone. There is no coordinate-to-timezone data in this repo, so the
     * browser's own zone is what gets sent and validated. Right for the common
     * case (you upload a race near you) and wrong only for the start time.
     */
    timezone: text("timezone").notNull(),
    /**
     * 'gpx' when the file carried surveyed elevation, 'dem:<dataset>' when it
     * was modelled from a terrain model. Never conflated — the UI discloses
     * the difference, exactly as the import pipeline's QA step does.
     */
    elevationSource: text("elevation_source").notNull(),
    /** Measured route length in metres, as parsed. */
    distanceM: integer("distance_m").notNull(),
    /**
     * Salted SHA-256 of the client IP, kept ONLY as the rate-limit key.
     *
     * Note this is a real departure from weather_window's "carries nothing
     * about who asked": an unauthenticated route that writes rows and calls a
     * metered elevation API needs some bound, and this is the least
     * identifying one that works. It is unsalted-irreversible, never displayed,
     * never joined to anything, and disclosed in the terms page.
     */
    creatorHash: text("creator_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** Null means permanent — set by a completed paceband order. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (t) => [
    // The rate-limit query: "how many rows from this hash since <time>".
    index("user_course_creator_idx").on(t.creatorHash, t.createdAt),
    index("user_course_expires_idx").on(t.expiresAt),
  ],
);

export type CityRow = typeof cities.$inferSelect;
export type EventSeriesRow = typeof eventSeries.$inferSelect;
export type CourseRow = typeof courses.$inferSelect;
export type EventEditionRow = typeof eventEditions.$inferSelect;
export type WeatherWindowRow = typeof weatherWindows.$inferSelect;
export type UserCourseRow = typeof userCourses.$inferSelect;
