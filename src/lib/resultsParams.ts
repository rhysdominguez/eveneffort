// Single source of truth for serializing a PacingInput into the /results
// query string and parsing it back. Keeps the homepage form and the
// /results route from drifting. Pacing math is pure + client-side, so the
// results page can recompute from these params alone (shareable URLs).
//
// Phase 2 adds optional params (race date/time, manual weather, body metrics).
// They are only emitted when present, so legacy Phase 1 URLs still parse.
import type {
  BodyMetrics,
  CourseId,
  FuelingStrategy,
  PacingInput,
  Unit,
  WeatherConditions,
} from "@/types";
import { CARBS_PER_HOUR_MAX, CARBS_PER_HOUR_MIN } from "@/lib/weather/fueling";

const UNITS: readonly Unit[] = ["km", "miles"];

/**
 * Course slugs are rows now, not a closed union, so this module can only
 * check the SHAPE of the id — it is pure and synchronous, and the course
 * table lives behind an async server-only query. Existence is proven
 * downstream by `getCourseBySlug` returning null, which every caller must
 * handle. Bounded length and a strict charset keep junk out of the query.
 */
const COURSE_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function buildResultsHref(input: PacingInput): string {
  return `/results?${buildResultsQuery(input)}`;
}

/**
 * The query string alone, without the `/results?` prefix. The paceband order
 * flow posts this to /api/checkout, which feeds it straight back through
 * parseResultsParams — so serialization stays in exactly one place.
 */
export function buildResultsQuery(input: PacingInput): string {
  const params = new URLSearchParams({
    courseId: input.courseId,
    unit: input.unit,
    goalTimeSeconds: String(input.goalTimeSeconds),
  });

  if (input.raceDateISO) params.set("date", input.raceDateISO);
  if (input.raceStartTime) params.set("start", input.raceStartTime);

  if (input.weather) {
    params.set("temp", String(input.weather.tempC));
    params.set("hum", String(input.weather.humidity));
    params.set("wind", String(input.weather.windSpeed));
    params.set("wdir", String(input.weather.windDirection));
  }

  if (input.body) {
    params.set("mass", String(input.body.massKg));
    params.set("height", String(input.body.heightCm));
  }

  // Omitted entirely when fueling is off — absence is the off signal.
  if (input.fueling) {
    params.set("carbs", String(input.fueling.carbsPerHour));
  }

  return params.toString();
}

type ParseResult =
  | { ok: true; input: PacingInput }
  | { ok: false; reason: string };

/** Validate raw query params into a PacingInput, or explain why not. */
export function parseResultsParams(
  params: Record<string, string | string[] | undefined>,
): ParseResult {
  const courseId = first(params.courseId);
  const unit = first(params.unit);
  const goalTimeRaw = first(params.goalTimeSeconds);

  if (!courseId || !COURSE_SLUG_RE.test(courseId)) {
    return { ok: false, reason: "Missing or unknown course." };
  }
  if (!unit || !UNITS.includes(unit as Unit)) {
    return { ok: false, reason: "Missing or invalid unit." };
  }
  const goalTimeSeconds = Number(goalTimeRaw);
  if (
    goalTimeRaw === undefined ||
    !Number.isFinite(goalTimeSeconds) ||
    goalTimeSeconds <= 0
  ) {
    return { ok: false, reason: "Missing or invalid goal time." };
  }

  const input: PacingInput = {
    courseId: courseId as CourseId,
    unit: unit as Unit,
    goalTimeSeconds,
  };

  const date = first(params.date);
  if (date) input.raceDateISO = date;
  const start = first(params.start);
  if (start) input.raceStartTime = start;

  const weather = parseWeather(params);
  if (weather) input.weather = weather;

  const body = parseBody(params);
  if (body) input.body = body;

  const fueling = parseFueling(params);
  if (fueling) input.fueling = fueling;

  return { ok: true, input };
}

/** Parse manual weather only when all four fields are present + finite. */
function parseWeather(
  params: Record<string, string | string[] | undefined>,
): WeatherConditions | null {
  const tempC = num(first(params.temp));
  const humidity = num(first(params.hum));
  const windSpeed = num(first(params.wind));
  const windDirection = num(first(params.wdir));
  if (
    tempC === null ||
    humidity === null ||
    windSpeed === null ||
    windDirection === null
  ) {
    return null;
  }
  return { tempC, humidity, windSpeed, windDirection };
}

/** Parse body metrics only when both fields are present, finite and positive. */
function parseBody(
  params: Record<string, string | string[] | undefined>,
): BodyMetrics | null {
  const massKg = num(first(params.mass));
  const heightCm = num(first(params.height));
  if (massKg === null || heightCm === null || massKg <= 0 || heightCm <= 0) {
    return null;
  }
  return { massKg, heightCm };
}

/**
 * Parse the carb-intake target. Absent (or out of slider range) means no
 * fueling cues — the same "present ⇒ on" convention weather and body follow.
 */
function parseFueling(
  params: Record<string, string | string[] | undefined>,
): FuelingStrategy | null {
  const carbsPerHour = num(first(params.carbs));
  if (
    carbsPerHour === null ||
    carbsPerHour < CARBS_PER_HOUR_MIN ||
    carbsPerHour > CARBS_PER_HOUR_MAX
  ) {
    return null;
  }
  return { carbsPerHour };
}

function num(v: string | undefined): number | null {
  if (v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
