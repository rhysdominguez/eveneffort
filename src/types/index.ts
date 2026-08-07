// Shared domain types (PacingInput, GoalTimeInput, Segment, PaceChartRow, Course, ...).

export type Unit = "km" | "miles";

/**
 * A course slug, e.g. "boston". Was a closed union of 7 literals before the
 * database; now open, because courses are rows. Existence is proven by the
 * lookup in src/db/queries.ts, not by the type — callers must handle null.
 *
 * The pre-database values are preserved as slugs, so every shared
 * /results?courseId=... link (including printed pacebands) still resolves.
 */
export type CourseId = string;

export interface PacingInput {
  goalTimeSeconds: number;
  courseId: CourseId;
  unit: Unit;
  /** Phase 2 (optional): race timing used to pick the forecast hour. */
  raceDateISO?: string; // "2026-09-21"
  raceStartTime?: string; // "08:00" (24h, local to the course)
  /** Phase 2 (optional): weather conditions to apply (forecast or manual). */
  weather?: WeatherConditions;
  /** Phase 2 (optional): runner body metrics for the wind drag model. */
  body?: BodyMetrics;
  /**
   * Phase 2 (optional): carb-intake target driving gel placement. Present
   * means fueling cues are on; absent means the runner turned them off.
   */
  fueling?: FuelingStrategy;
}

/** Phase 2: race-day weather conditions feeding heat + wind adjustments. */
export interface WeatherConditions {
  tempC: number; // air temperature, Celsius
  humidity: number; // relative humidity, %
  windSpeed: number; // m/s, reported at the standard 10 m station height
  windDirection: number; // degrees, the direction the wind blows FROM (meteorological)
}

/** Phase 2: runner body metrics for the aerodynamic-drag wind model. */
export interface BodyMetrics {
  massKg: number;
  heightCm: number;
}

/** Default body metrics when the user hasn't entered their own. */
export const DEFAULT_BODY: BodyMetrics = { massKg: 70, heightCm: 175 };

/** Phase 2: the runner's carb-intake target, which sets the gel cadence. */
export interface FuelingStrategy {
  carbsPerHour: number; // grams of carbohydrate per hour
}

/** Default intake target — ~60 g/hr is the long-standing endurance baseline. */
export const DEFAULT_FUELING: FuelingStrategy = { carbsPerHour: 60 };

/** A single carbohydrate-gel cue mapped onto a pace-chart row. */
export interface FuelingCue {
  segmentIndex: number; // which segment (row) this gel lands on
  atSeconds: number; // intended intake time (cumulative race seconds)
  label: string; // e.g. "Take Gel (25g)"
}

/**
 * Precomputed weather multipliers applied to the elevation-normalized
 * durations. Both arrays align 1:1 with the segment list — each segment is
 * adjusted for the conditions forecast (or assumed) at the time the runner
 * passes through it, so heat can bite progressively through the race.
 */
export interface WeatherAdjustments {
  heatMultipliers: number[]; // per-segment, each ≥ 1
  windMultipliers: number[]; // per-segment, length === segments.length
}

/** UI-layer shape only — parsed into PacingInput.goalTimeSeconds at the form boundary. */
export interface GoalTimeInput {
  hours: number;
  minutes: number;
  seconds: number;
}

/**
 * Light course metadata — everything the picker, the map and the calendar
 * need, and nothing the pacing engine needs. Small enough (~200 bytes) that
 * the whole catalog ships to the client even at hundreds of courses.
 */
export interface CourseSummary {
  id: CourseId;
  seriesSlug: string; // e.g. "boston-marathon"
  displayName: string; // e.g. "Boston Marathon"
  city: string; // e.g. "Boston"
  countryCode: string; // ISO 3166-1 alpha-2
  countryName: string;
  regionCode: string | null; // ISO 3166-2
  regionName: string | null;
  /**
   * The map pin, seeded from a host race's GPX start line for precision.
   * Every marathon in a city shares this one point, so two races in one
   * city still render as a single pin. Not necessarily this race's OWN
   * start line — `start` below is that, and is what the weather forecast
   * is keyed to.
   */
  cityLat: number;
  cityLon: number;
  start: { lat: number; lon: number };
  timezone: string;
  /** Next scheduled edition, for prefilling the race-date picker. */
  nextRaceDateISO: string | null;
}

/**
 * One dated running of a series — the calendar's unit. Same "small enough to
 * ship the whole list" contract as CourseSummary: no geometry, no prose.
 *
 * `courseId` is the course SLUG, not the edition's own slug, because that is
 * what /results?courseId=… resolves. An edition with no course attached is
 * unpaceable and never reaches this type — the query filters it out.
 */
export interface EditionSummary {
  editionSlug: string; // e.g. "berlin-marathon-2026"
  seriesSlug: string; // e.g. "berlin-marathon"
  displayName: string; // series name, e.g. "Berlin Marathon"
  courseId: CourseId; // course slug, e.g. "berlin"
  city: string;
  countryCode: string; // ISO 3166-1 alpha-2
  countryName: string;
  raceDateISO: string; // "2026-09-27" — a wall-clock calendar date, not an instant
  /**
   * Local start as zero-padded "HH:MM", or null when the organizer hasn't
   * announced one. Null is meaningful: the seed refuses to guess an hour
   * because a wrong one silently keys the forecast to the wrong conditions.
   */
  startTimeLocal: string | null;
  dateConfidence: "confirmed" | "estimated" | "tbd";
}

/** A course plus its geometry. Fetched one at a time, server-side only. */
export interface Course {
  id: CourseId;
  displayName: string; // e.g. "Berlin Marathon"
  city: string; // e.g. "Berlin"
  /** 44 absolute elevations (m) at 0,1,…,42,42.195 km */
  elevations: number[];
  /**
   * Raw, dense [distanceKm, elevationM] trackpoints. Presentational only —
   * drives the elevation chart's ruggedness. NEVER used by the pacing
   * engine, which reads `elevations` exclusively.
   */
  profile: [number, number][];
  /**
   * Phase 2: 44 [lat, lon] pairs sampled at the same 0,1,…,42,42.195 km marks
   * as `elevations`. Drives per-segment wind bearings. The pacing elevation
   * engine never reads this.
   */
  coords: [number, number][];
  /** Phase 2: start-line coordinates (== coords[0]) for the weather lookup. */
  start: { lat: number; lon: number };
  /**
   * Phase 2: IANA zone of the start line, e.g. "Europe/Berlin". The race start
   * is entered as a local wall clock, so this is what turns it into the
   * absolute instant the forecast is indexed by. DST-correct by construction.
   */
  timezone: string;
}

export interface Segment {
  index: number; // 0-based segment number
  startDistanceKm: number;
  endDistanceKm: number;
  lengthKm: number; // ~1.0, last ≈0.195
  startElevationM: number;
  endElevationM: number;
  elevationDeltaM: number;
  gradient: number; // rise/run, dimensionless
}

export interface PaceChartRow {
  segmentLabel: string; // "1", "2", … "42.2" / mile equiv
  elevationDeltaM: number;
  adjustedPaceSecPerUnit: number;
  adjustedPaceLabel: string; // "4:32 /km"
  cumulativeSplitSeconds: number;
  cumulativeSplitLabel: string; // "1:23:45"
  /** Phase 2 (optional): carb-gel cue landing on this row, if any. */
  fueling?: FuelingCue | null;
}
