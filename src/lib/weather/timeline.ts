// The weather timeline: the fetched hourly window, re-expressed as the rows a
// runner actually reads — a time of day, where they will be at that time, and
// what it will be like there.
//
// Pure. No DOM, no dates beyond arithmetic, no network. Everything it needs is
// passed in, which is what makes the awkward cases below testable at all.
//
// TWO THINGS HERE ARE NOT OBVIOUS, and both are the difference between a panel
// that is right and one that is plausible.
//
// 1. IT SAMPLES ON THE PROVIDER'S HOUR GRID, NOT ON ELAPSED TIME.
//
//    `selectHourlyWindow` picks the provider entry NEAREST the gun and
//    everything downstream treats it as t=0, so `hours[i]` is "the gun plus i
//    hours" to within half an hour either way. For the pacing engine that is a
//    defensible smear across a 3-hour race. For a panel that prints "11:00 AM"
//    beside a temperature it is a mislabel: with a 9:40 gun, `hours[1]` is the
//    provider's 10:00 reading but the engine calls it 10:40, and a row built at
//    80 minutes elapsed would interpolate to a value that belongs to neither.
//
//    Both providers publish on whole UTC hours, so the grid is recoverable:
//    round the gun to the nearest hour and that instant IS `hours[0]`. An 11:00
//    row then lands on an integer index and reads the provider's own 11:00
//    value exactly. A half-hour zone (Kolkata, St John's, Chatham Islands)
//    lands on x.5 and interpolates honestly between two real readings.
//
// 2. IT DOES NOT USE `conditionsAtElapsed`.
//
//    That function clamps at both ends, which is correct for the engine and
//    wrong here: a negative offset would silently return the gun hour, making
//    the pre-race row an exact copy of the start row. Nobody would notice, and
//    it would be wrong every time. The lead hours are a separate array and are
//    indexed as one.
//
// DST: a race whose wall clock crosses a transition gets labels that repeat or
// skip an hour, because the labels are wall-clock arithmetic off the start
// time. The VALUES are unaffected, since they are sampled on absolute instants.
// It is rare enough (a marathon running through 02:00 local) to be worth this
// paragraph rather than a mechanism.
import type { WeatherConditions } from "@/types";
import type { WeatherSource } from "@/hooks/useWeather";
import { parseTime, toHHMM } from "@/lib/units/date";

const HOUR_MS = 3_600_000;

export type TimelineKind = "pre" | "start" | "hour" | "finish";

export interface TimelineRow {
  kind: TimelineKind;
  /** Minutes from the gun. Negative for "pre", 0 for "start", fractional at the finish. */
  offsetMinutes: number;
  /** Wall clock at the course, zero-padded 24h. Render through `formatTimeDisplay`. */
  clockHHMM: string;
  /** True when this row's wall clock has rolled past midnight into the next day. */
  nextDay: boolean;
  /** Distance reached, km. Null before the gun; 0 at the start. */
  distanceKm: number | null;
  /** Null only when the series has nothing to offer for this row at all. */
  conditions: WeatherConditions | null;
  /**
   * True when the row falls past the end of the fetched window and is holding
   * its last known hour.
   *
   * The window is 8 entries, so it covers the gun plus 7 hours. A slow enough
   * finisher runs off the end of it. The honest move is to SAY the values are
   * being held, not to widen the window: widening it changes what the pacing
   * engine samples for exactly those runners and would move splits that have
   * already been shared and printed.
   */
  beyondSeries: boolean;
}

export interface TimelineParams {
  /** Race start as a wall clock at the course, zero-padded 24h "HH:MM". */
  startHHMM: string;
  /** The gun as an absolute instant (from `zonedWallClockToUTC`). */
  gunUtcMs: number;
  /** Weather-adjusted finish, seconds. */
  finishSeconds: number;
  /** Segment lengths in km, course order (`result.segmentLengthsKm`). */
  segmentLengthsKm: number[];
  /** Cumulative seconds at the END of each segment (`row.cumulativeSplitSeconds`). */
  cumulativeSeconds: number[];
  /** The hourly series, index i = i hours after the gun (`result.hourlySeries`). */
  series: WeatherConditions[];
  /** The hours before the gun, chronological. Empty means no pre-race row. */
  lead: WeatherConditions[];
}

/**
 * Build the timeline rows: a pre-race hour, the start, every whole clock hour
 * the runner is out there for, and the finish.
 *
 * The hour rows are STRICTLY between the gun and the finish at both ends. That
 * strictness is the whole rule: without it a 9:00 gun emits an hour row at 9:00
 * that duplicates the start, and a finish landing exactly on 12:00 emits both
 * an hour row and a finish row for the same minute.
 *
 * Returns an empty array when there is no usable series or the start time is
 * malformed, so the caller renders nothing rather than a frame around nothing.
 */
export function buildWeatherTimeline(params: TimelineParams): TimelineRow[] {
  const {
    startHHMM,
    gunUtcMs,
    finishSeconds,
    segmentLengthsKm,
    cumulativeSeconds,
    series,
    lead,
  } = params;

  const parsed = parseTime(startHHMM);
  if (!parsed) return [];
  if (series.length === 0) return [];
  if (!Number.isFinite(gunUtcMs)) return [];
  if (!(finishSeconds > 0)) return [];

  const startMinutes = parsed.hour24 * 60 + parsed.minute;
  const finishMinutes = finishSeconds / 60;
  const m = parsed.minute;

  const offsets: { kind: TimelineKind; offsetMinutes: number }[] = [];

  // Pre-race: the last whole clock hour strictly before the gun. A 9:30 gun
  // gives 9:00 (-30); a 9:00 gun gives 8:00 (-60), never a second 9:00 row.
  // Only when we actually hold an earlier hour to show.
  if (lead.length > 0) {
    offsets.push({ kind: "pre", offsetMinutes: m === 0 ? -60 : -m });
  }
  offsets.push({ kind: "start", offsetMinutes: 0 });
  for (
    let off = m === 0 ? 60 : 60 - m;
    off < finishMinutes;
    off += 60
  ) {
    offsets.push({ kind: "hour", offsetMinutes: off });
  }
  offsets.push({ kind: "finish", offsetMinutes: finishMinutes });

  // The instant `series[0]` really is. See note 1 in the module header.
  const gridStartMs = Math.round(gunUtcMs / HOUR_MS) * HOUR_MS;
  const totalKm = segmentLengthsKm.reduce((a, b) => a + b, 0);

  return offsets.map(({ kind, offsetMinutes }) => {
    const wallTotal = startMinutes + offsetMinutes;
    const wall = ((wallTotal % 1440) + 1440) % 1440;
    const index = (gunUtcMs + offsetMinutes * 60_000 - gridStartMs) / HOUR_MS;
    return {
      kind,
      offsetMinutes,
      clockHHMM: toHHMM(Math.floor(wall / 60), Math.round(wall % 60)),
      nextDay: wallTotal >= 1440,
      distanceKm:
        kind === "pre"
          ? null
          : kind === "finish"
            ? totalKm
            : distanceAt(offsetMinutes * 60, segmentLengthsKm, cumulativeSeconds),
      conditions: sampleAt(index, series, lead),
      beyondSeries: index > series.length - 1,
    };
  });
}

/**
 * The conditions at a fractional grid index, where 0 is `series[0]`.
 *
 * Negative indices read backwards out of `lead`, so -1 is the hour before the
 * gun. Out of range at either end, the nearest known hour is held (which the
 * caller flags via `beyondSeries` rather than hiding).
 */
function sampleAt(
  index: number,
  series: WeatherConditions[],
  lead: WeatherConditions[],
): WeatherConditions | null {
  const at = (i: number): WeatherConditions | null => {
    if (i >= 0) return series[Math.min(i, series.length - 1)] ?? null;
    // lead is chronological, so its LAST entry is index -1.
    return lead[lead.length + i] ?? lead[0] ?? series[0] ?? null;
  };

  const lo = Math.floor(index);
  const frac = index - lo;
  const a = at(lo);
  if (!a) return null;
  if (frac === 0) return a;
  const b = at(lo + 1);
  if (!b) return a;
  return {
    tempC: lerp(a.tempC, b.tempC, frac),
    humidity: lerp(a.humidity, b.humidity, frac),
    windSpeed: lerp(a.windSpeed, b.windSpeed, frac),
    windDirection: lerpDirection(a.windDirection, b.windDirection, frac),
    ...(a.cloudCover === undefined || b.cloudCover === undefined
      ? a.cloudCover === undefined
        ? {}
        : { cloudCover: a.cloudCover }
      : { cloudCover: lerp(a.cloudCover, b.cloudCover, frac) }),
    // Precipitation is NOT interpolated across the hour boundary for the two
    // past sources, where it is a 0/100 record of whether rain fell: half of
    // "it rained" is not a 50% chance of anything. Holding the hour the row
    // falls in is the only reading that stays true for all three sources.
    ...(a.precipProbability === undefined
      ? {}
      : { precipProbability: a.precipProbability }),
  };
}

/**
 * How far along the course the runner is at `elapsedSeconds`, interpolated
 * within whichever segment brackets it. Clamped to the full course.
 */
function distanceAt(
  elapsedSeconds: number,
  segmentLengthsKm: number[],
  cumulativeSeconds: number[],
): number {
  if (elapsedSeconds <= 0) return 0;
  let priorKm = 0;
  let priorSeconds = 0;
  for (let i = 0; i < cumulativeSeconds.length; i++) {
    const endSeconds = cumulativeSeconds[i];
    const km = segmentLengthsKm[i] ?? 0;
    if (elapsedSeconds <= endSeconds) {
      const span = endSeconds - priorSeconds;
      const frac = span > 0 ? (elapsedSeconds - priorSeconds) / span : 0;
      return priorKm + km * frac;
    }
    priorKm += km;
    priorSeconds = endSeconds;
  }
  return priorKm;
}

const lerp = (a: number, b: number, t: number): number => a + t * (b - a);

// Shortest arc, so 350 to 10 passes through 0 rather than 180.
function lerpDirection(a: number, b: number, t: number): number {
  const delta = ((b - a + 540) % 360) - 180;
  return (a + delta * t + 360) % 360;
}

// --- Sky condition -------------------------------------------------------

export type SkyIcon = "clear" | "partly" | "cloudy" | "rain" | "unknown";

/** Cloud cover, in percent, at or above which the sky reads as the next step up. */
const PARTLY_CLOUD_PCT = 25;
const CLOUDY_CLOUD_PCT = 60;

/**
 * A forecast or a climatology draws rain at even odds. A RECORDED day draws it
 * only when rain actually fell, which is the 100 the historical mapper sets:
 * that source never emits anything between 0 and 100 in the first place.
 */
const RAIN_CHANCE_PCT = 50;

/**
 * Which glyph the sky gets. Total over missing data on purpose: a provider that
 * reported no cloud cover gets "unknown" and an empty cell, never a sun. A sun
 * drawn over a gap is a claim about the weather that nobody made.
 */
export function skyIconFor(
  conditions: WeatherConditions,
  source: WeatherSource,
): SkyIcon {
  const rain = conditions.precipProbability;
  if (rain !== undefined) {
    const threshold = source === "historical" ? 100 : RAIN_CHANCE_PCT;
    if (rain >= threshold) return "rain";
  }
  const cloud = conditions.cloudCover;
  if (cloud === undefined) return "unknown";
  if (cloud < PARTLY_CLOUD_PCT) return "clear";
  if (cloud < CLOUDY_CLOUD_PCT) return "partly";
  return "cloudy";
}
