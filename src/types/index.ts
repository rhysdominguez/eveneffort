// Shared domain types (PacingInput, GoalTimeInput, Segment, PaceChartRow, Course, ...).

export type Unit = "km" | "miles";

export type CourseId =
  | "berlin"
  | "chicago"
  | "london"
  | "tokyo"
  | "sydney"
  | "newyork"
  | "boston";

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
