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

/**
 * A course's FLAT-EQUIVALENT DISTANCE in each display unit: the sum of every
 * segment's length scaled by its own grade cost, Σ(lengthKm ×
 * adjustmentFactor). A course at 41.7 costs what 41.7 km of flat road costs.
 *
 * Unit-dependent because the segmentation is — 43 km segments vs 27 mile ones
 * average the same hills over different distances and so produce different
 * gradients. The gap is small on a road course but reaches 0.43% on the
 * steepest one seeded (Pikes Peak), which is minutes over a marathon, so both
 * are carried rather than one standing in for the other. Computed by
 * src/lib/pacing/effort.ts, which is also where the derivation lives.
 */
export interface CourseEffort {
  /** Flat-equivalent kilometres, from the km segmentation. */
  km: number;
  /** Flat-equivalent miles, from the mile segmentation. */
  miles: number;
}

/**
 * How much a course climbs and drops, from its 44-point elevation array.
 *
 * `gainM`/`lossM` are per-kilometre figures — a consistent floor on the true
 * gain rather than a surveyed one — while `netM` is exact. See the header of
 * src/lib/pacing/terrain.ts before presenting any of them as gospel.
 */
export interface CourseTerrain {
  /** Total metres climbed. */
  gainM: number;
  /** Total metres descended, as a positive number. */
  lossM: number;
  /** Finish minus start; negative on a net-downhill course. */
  netM: number;
}

/** The four terrain bands, by total climbing. */
export type TerrainLabel = "flat" | "rolling" | "hilly" | "mountainous";

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
  /**
   * Phase 3 (optional): how the effort is distributed across the race, and how
   * cautiously it starts. Two independent controls that compose. Absent means
   * the defaults below, which reproduce the original even-effort chart exactly
   * — every link shared before these existed still resolves identically.
   */
  split?: SplitStrategy;
  start?: StartStrategy;
}

/**
 * How effort is distributed front-to-back.
 *
 * `even-effort` is the app's original and only behaviour: constant metabolic
 * cost, so pace follows the terrain. `even-pace` is its opposite — constant
 * pace, terrain ignored — and is the one option here that changes how the
 * course is read rather than how the race is shaped. The other four ramp the
 * effort, mildly or aggressively, in each direction.
 */
export type SplitStrategy =
  | "even-effort"
  | "even-pace"
  | "negative"
  | "negative-aggressive"
  | "positive"
  | "positive-aggressive";

/** How much the first few kilometres are held back. */
export type StartStrategy = "even" | "conservative" | "very-conservative";

/** Defaults, and the definition of "unchanged from before strategies existed". */
export const DEFAULT_SPLIT: SplitStrategy = "even-effort";
export const DEFAULT_START: StartStrategy = "even";

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

/** UI-layer shape only — a pace, per whichever distance unit is displayed. */
export interface PaceInput {
  minutes: number;
  seconds: number;
}

/**
 * How the runner states their goal. All three collapse to `goalTimeSeconds`
 * at the form boundary — the pacing engine only ever sees a finish time, and
 * the URL only ever carries one, so every existing shared link and printed
 * paceband keeps resolving.
 *
 * - "time" — the finish time itself. The original and still the default.
 * - "pace"  — average pace; a multiply by the race distance.
 * - "gap"   — grade-adjusted pace; a multiply by the course's own
 *             CourseSummary.effort. Holding a GAP across a course switch is
 *             the point of it: 5:00/km grade-adjusted is a different finish
 *             time at Boston than at Pikes Peak, and that difference is the
 *             answer the runner came for.
 */
export type GoalMode = "time" | "pace" | "gap";

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
   * The host city's shared coordinate. NOT this race's location and NOT the
   * map pin — use `start` for both.
   *
   * It is seeded from *a* host race's GPX start line, whichever was added
   * first, and a later race in that city never repoints it. So in a city with
   * two races this is one of them standing in for the other: it put Toronto
   * Waterfront 11.6 km from its real start and Lisbon Marathon 16.1 km from
   * its own, stacked on top of the neighbour it was borrowed from. Pinning
   * with it is what made those races unreachable on the map.
   *
   * Read by nothing today. Kept only as the city locator it honestly is.
   */
  cityLat: number;
  cityLon: number;
  /**
   * This race's own GPX start line. The map pins here, "Near me" measures
   * here, and the weather forecast is keyed here.
   */
  start: { lat: number; lon: number };
  timezone: string;
  /**
   * This course's FLAT-EQUIVALENT DISTANCE: the sum of each segment's length
   * scaled by its own grade cost, Σ(lengthKm × adjustmentFactor). A course at
   * 41.7 costs what 41.7 km of flat road costs; against 42.195 it reads
   * directly as "this course is 1.2% easier than flat".
   *
   * Derived from the 44-point elevation array, which is exactly why it is
   * here: it lets a grade-adjusted goal pace be inverted into a finish time
   * WITHOUT shipping any geometry to the client. Two scalars, computed once
   * server-side — see src/lib/pacing/effort.ts for the derivation.
   *
   * Unit-dependent because the segmentation is (43 km segments vs 27 mile
   * ones); the two agree to well within a tenth of a percent, but the pace
   * inversion is exact per unit and worth keeping that way.
   */
  effort: CourseEffort;
  /**
   * How hilly the course is: gain, loss and net change over the same 44-point
   * array `effort` is reduced from. Three more scalars, well inside this
   * type's "a few numbers" budget, and the geometry itself still never ships.
   *
   * Separate from `effort` on purpose — they answer different questions. A
   * course's effort multiplier says how FAST it is, and climbing and descending
   * nearly cancel inside it; this says how HILLY it is. Boston reads 0.2%
   * faster than flat and still climbs 96 m.
   */
  terrain: CourseTerrain;
  /** Next scheduled edition, for prefilling the race-date picker. */
  nextRaceDateISO: string | null;
  /**
   * Every seeded edition of this course's series, oldest first — what the year
   * picker offers. Past editions are included on purpose: they are selectable,
   * and they are where historical weather comes from.
   */
  editions: EditionOption[];
}

/**
 * One selectable year in the race-year picker.
 *
 * A trimmed EditionSummary: the picker already knows which course it is on, so
 * everything identifying the series/city is dropped. Kept deliberately small —
 * this rides on every CourseSummary, so it ships to the client multiplied by
 * the whole catalog.
 */
export interface EditionOption {
  year: number;
  /** "2026-04-20" — a wall-clock calendar date, not an instant. */
  raceDateISO: string;
  /** Local start as zero-padded "HH:MM", or null when unannounced. */
  startTimeLocal: string | null;
  /**
   * Whether the date is a record or a guess from the series' recurrence rule.
   * Load-bearing for weather: an `estimated` past date cannot be used to claim
   * "these are the conditions recorded on race day" — it may be the wrong day.
   */
  dateConfidence: "confirmed" | "estimated" | "tbd";
  /** Set only where a series runs twice in one year (London 2027 elite/mass). */
  variant: string | null;
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
  /**
   * ISO 3166-2 subdivision, or null where none is recorded. Only the countries
   * whose city slugs carry one (US, CA, AU) reliably have it, which is exactly
   * where a country filter is too coarse to be useful — 100+ US races on one
   * option. Null elsewhere, and the calendar hides the state filter there.
   */
  regionCode: string | null;
  regionName: string | null;
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
  countryCode: string; // ISO 3166-1 alpha-2
  countryName: string;
  regionCode: string | null; // ISO 3166-2
  regionName: string | null;
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
  /**
   * True when this came from a runner's upload rather than the seeded catalog
   * (ROADMAP #10). Uploaded courses carry no city, region or country — nobody
   * told us where they are — so anything rendering a location must check this
   * rather than printing three empty strings.
   */
  isUserUpload?: boolean;
  /**
   * "gpx" when the file carried surveyed elevation, "dem:<dataset>" when it was
   * modelled from a terrain model. Present only on uploads, and shown to the
   * runner: a modelled profile is a materially different number, and the same
   * distinction the import pipeline's QA step draws.
   */
  elevationSource?: string;
  /**
   * When an uploaded course's link stops resolving, ISO 8601, or null once a
   * paceband order has made it permanent. Absent on seeded courses, which
   * never expire.
   */
  expiresAtISO?: string | null;
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
