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

/**
 * Pick the hourly entry nearest `targetISO` (or the first entry when no target
 * is given) and map it to our WeatherConditions. Returns null when the payload
 * has no usable hourly data. Missing individual fields default to 0.
 */
export function selectHourlyConditions(
  data: ForecastResponse,
  targetISO?: string,
): WeatherConditions | null {
  const hourly = data.timelines?.hourly;
  if (!hourly || hourly.length === 0) return null;

  let chosen = hourly[0];
  if (targetISO) {
    const target = new Date(targetISO).getTime();
    if (Number.isFinite(target)) {
      let best = Infinity;
      for (const entry of hourly) {
        const delta = Math.abs(new Date(entry.time).getTime() - target);
        if (delta < best) {
          best = delta;
          chosen = entry;
        }
      }
    }
  }

  const v = chosen.values;
  return {
    tempC: v.temperature ?? 0,
    humidity: v.humidity ?? 0,
    windSpeed: v.windSpeed ?? 0,
    windDirection: v.windDirection ?? 0,
  };
}
