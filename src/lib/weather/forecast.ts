// Pure helpers for the Tomorrow.io weather proxy (Phase 2). Kept free of any
// Next.js / network code so the URL construction and response mapping are
// unit-testable without a live API key.
import type { WeatherConditions } from "@/types";

export const TOMORROW_FORECAST_ENDPOINT =
  "https://api.tomorrow.io/v4/weather/forecast";

/** A single hourly entry from the Tomorrow.io forecast `timelines.hourly`. */
interface HourlyEntry {
  time: string;
  values: {
    temperature?: number;
    humidity?: number;
    windSpeed?: number;
    windDirection?: number;
  };
}

interface ForecastResponse {
  timelines?: { hourly?: HourlyEntry[] };
}

/** Build the upstream Tomorrow.io request URL (hourly, metric). */
export function buildForecastUrl(
  lat: number,
  lon: number,
  apiKey: string,
): string {
  const params = new URLSearchParams({
    location: `${lat},${lon}`,
    timesteps: "1h",
    units: "metric",
    apikey: apiKey,
  });
  return `${TOMORROW_FORECAST_ENDPOINT}?${params.toString()}`;
}

const toConditions = (entry: HourlyEntry): WeatherConditions => ({
  tempC: entry.values.temperature ?? 0,
  humidity: entry.values.humidity ?? 0,
  windSpeed: entry.values.windSpeed ?? 0,
  windDirection: entry.values.windDirection ?? 0,
});

/**
 * How far the nearest hourly entry may sit from the requested start before the
 * window is rejected. Tomorrow.io's hourly timeline only reaches ~120 h ahead,
 * so a race months out returns a payload whose "nearest" entry is the last
 * available hour — days from race day. Without this bound that stale hour
 * would be served as race-day weather, silently and confidently wrong.
 * One hour of slack is enough to absorb rounding to the hourly grid.
 */
export const MAX_TARGET_DELTA_HOURS = 1;

/**
 * Select a race-long window of hourly conditions: starting at the entry
 * nearest `targetISO` (or the first entry when no target is given), take up to
 * `windowHours` consecutive hours. Index i of the result is i hours after the
 * race start — the shape `conditionsAtElapsed` interpolates over. Missing
 * fields default to 0.
 *
 * `targetISO` must be an absolute instant (with `Z` or a UTC offset) — see
 * `zonedWallClockToUTC`. A naive local string would be parsed in the runtime's
 * own zone and select the wrong hours.
 *
 * Returns null when the payload has no usable hourly data, or when race day
 * lies beyond the forecast horizon (see `MAX_TARGET_DELTA_HOURS`).
 */
export function selectHourlyWindow(
  data: ForecastResponse,
  targetISO?: string,
  windowHours: number = 8,
  maxDeltaHours: number = MAX_TARGET_DELTA_HOURS,
): WeatherConditions[] | null {
  const hourly = data.timelines?.hourly;
  if (!hourly || hourly.length === 0) return null;

  let startIdx = 0;
  if (targetISO) {
    const target = new Date(targetISO).getTime();
    if (Number.isFinite(target)) {
      let best = Infinity;
      for (let i = 0; i < hourly.length; i++) {
        const delta = Math.abs(new Date(hourly[i].time).getTime() - target);
        if (delta < best) {
          best = delta;
          startIdx = i;
        }
      }
      // Out of forecast range — report "no data" rather than the closest
      // hour we happen to hold, which could be days away.
      if (best > maxDeltaHours * 3_600_000) return null;
    }
  }

  return hourly.slice(startIdx, startIdx + windowHours).map(toConditions);
}
