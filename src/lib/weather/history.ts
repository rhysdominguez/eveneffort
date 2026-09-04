// Past and far-future weather, from Open-Meteo. The sibling of forecast.ts and
// deliberately the same shape: pure URL construction and response mapping, no
// Next.js and no network, so every rule here is unit-testable without a key.
//
// Why a second provider at all: Tomorrow.io's hourly timeline reaches ~5 days.
// That covers a vanishing slice of real visits — a runner planning Boston looks
// months ahead, and a runner reviewing Boston looks months back. Both used to
// land on "outside the forecast range, enter conditions manually", with the
// pacing engine quietly running on 15 °C / 50 % / no wind.
//
// Three sources now, chosen by where the race start falls:
//
//   forecast    within Tomorrow.io's horizon           forecast.ts (unchanged)
//   historical  in the past                            archive, or `past_days`
//   typical     beyond the horizon                     10-year climatology
//
// The pacing engine never learns which one it got. heat.ts, wind.ts and
// progression.ts all receive the same WeatherConditions[] regardless.
import type { WeatherConditions } from "@/types";

export const OPEN_METEO_ARCHIVE_ENDPOINT =
  "https://archive-api.open-meteo.com/v1/archive";
export const OPEN_METEO_FORECAST_ENDPOINT =
  "https://api.open-meteo.com/v1/forecast";

/** Commercial plans get their own hostnames; the free ones are non-commercial. */
export const OPEN_METEO_CUSTOMER_ARCHIVE_ENDPOINT =
  "https://customer-archive-api.open-meteo.com/v1/archive";
export const OPEN_METEO_CUSTOMER_FORECAST_ENDPOINT =
  "https://customer-api.open-meteo.com/v1/forecast";

/**
 * The four variables the pacing engine consumes, in Tomorrow.io's order.
 * Open-Meteo names them differently but returns exactly the same quantities.
 */
const HOURLY_VARS = [
  "temperature_2m",
  "relative_humidity_2m",
  "wind_speed_10m",
  "wind_direction_10m",
] as const;

/**
 * ERA5 — the reanalysis behind the archive — publishes on a ~5 day delay, so a
 * race run last weekend is NOT in the archive yet. Inside this window we ask the
 * forecast endpoint for past days instead, which is backed by the operational
 * model and has no delay. Same variable names, same mapper, different host.
 */
export const ARCHIVE_DELAY_DAYS = 6;

/** How many prior years the "typical conditions" average is taken over. */
export const CLIMATOLOGY_YEARS = 10;

/**
 * WIND UNITS — the one thing in this file that will silently corrupt a chart.
 *
 * Tomorrow.io with `units=metric` returns wind in METRES PER SECOND, and
 * wind.ts is built on that: it scales 10 m readings down to 1.5 m with a
 * power law and feeds a quadratic drag term, all in m/s. Open-Meteo defaults
 * to KM/H. Without this parameter every wind figure arrives 3.6x too large,
 * which does not look like a bug — it looks like a windy day, and it produces
 * a confidently wrong pacing chart.
 */
const WIND_SPEED_UNIT = "ms";

interface OpenMeteoHourly {
  time?: string[];
  temperature_2m?: (number | null)[];
  relative_humidity_2m?: (number | null)[];
  wind_speed_10m?: (number | null)[];
  wind_direction_10m?: (number | null)[];
}

export interface OpenMeteoResponse {
  hourly?: OpenMeteoHourly;
}

function baseParams(lat: number, lon: number, apiKey?: string): URLSearchParams {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: HOURLY_VARS.join(","),
    wind_speed_unit: WIND_SPEED_UNIT,
    // Ask for UTC and match on absolute instants. The caller already resolved
    // the runner's wall clock through the course's IANA zone
    // (`zonedWallClockToUTC`); re-introducing a local zone here would just give
    // us a second chance to get the offset wrong.
    timezone: "UTC",
  });
  if (apiKey) params.set("apikey", apiKey);
  return params;
}

/** "2026-04-20" for an absolute instant, in UTC. */
export function utcDateOf(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

/** Shift an ISO calendar date by whole days. Pure UTC — no local zone. */
export function shiftDate(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Is this instant old enough to be in the ERA5 archive?
 *
 * Returns false for anything inside the publication delay, which routes to the
 * forecast endpoint's `past_days` instead.
 */
export function isArchived(targetISO: string, now: Date = new Date()): boolean {
  const ageDays = (now.getTime() - new Date(targetISO).getTime()) / 86_400_000;
  return ageDays >= ARCHIVE_DELAY_DAYS;
}

/**
 * Archive request covering the race day and the one after it — a race starting
 * in the evening would otherwise run off the end of its own calendar day before
 * the window is full.
 */
export function buildArchiveUrl(
  lat: number,
  lon: number,
  startDate: string,
  endDate: string,
  apiKey?: string,
): string {
  const params = baseParams(lat, lon, apiKey);
  params.set("start_date", startDate);
  params.set("end_date", endDate);
  const endpoint = apiKey
    ? OPEN_METEO_CUSTOMER_ARCHIVE_ENDPOINT
    : OPEN_METEO_ARCHIVE_ENDPOINT;
  return `${endpoint}?${params.toString()}`;
}

/**
 * Recent-past request, for the days ERA5 hasn't published yet. `past_days` is
 * capped at 92 upstream; anything older than that is archived by definition.
 */
export function buildRecentPastUrl(
  lat: number,
  lon: number,
  targetISO: string,
  apiKey?: string,
  now: Date = new Date(),
): string {
  const ageDays = Math.ceil(
    (now.getTime() - new Date(targetISO).getTime()) / 86_400_000,
  );
  const params = baseParams(lat, lon, apiKey);
  params.set("past_days", String(Math.min(92, Math.max(1, ageDays + 1))));
  params.set("forecast_days", "1");
  const endpoint = apiKey
    ? OPEN_METEO_CUSTOMER_FORECAST_ENDPOINT
    : OPEN_METEO_FORECAST_ENDPOINT;
  return `${endpoint}?${params.toString()}`;
}

/**
 * The same calendar date in each of the previous `years` years — the requests
 * whose results get averaged into "typical conditions".
 *
 * Each is a separate two-day archive window rather than one long range, because
 * a single range spanning ten years would return ~87,000 hours to use 80 of.
 */
export function buildClimatologyUrls(
  lat: number,
  lon: number,
  targetISO: string,
  apiKey?: string,
  years: number = CLIMATOLOGY_YEARS,
  now: Date = new Date(),
): string[] {
  const date = utcDateOf(targetISO);
  const [, month, day] = date.split("-");
  const targetYear = Number(date.slice(0, 4));
  // Count back from whichever is earlier: the race's own year, or this year.
  // A race in 2028 must average 2016-2025, not lean on years that don't exist.
  const latest = Math.min(targetYear, now.getUTCFullYear()) - 1;
  const urls: string[] = [];
  for (let i = 0; i < years; i++) {
    const y = latest - i;
    const start = `${y}-${month}-${day}`;
    urls.push(buildArchiveUrl(lat, lon, start, shiftDate(start, 1), apiKey));
  }
  return urls;
}

/**
 * Map an Open-Meteo payload to the window the pacing engine expects: index i is
 * i hours after the race start.
 *
 * Mirrors `selectHourlyWindow` in forecast.ts, including its refusal to serve a
 * distant hour as race-day weather — but the bound is stated in the caller's
 * terms rather than shared, because the failure modes differ: a forecast that
 * has run out returns its last hour, whereas an archive miss means the date was
 * never covered at all.
 */
export function selectHistoricalWindow(
  data: OpenMeteoResponse,
  targetISO: string,
  windowHours: number = 8,
  maxDeltaHours: number = 1,
): WeatherConditions[] | null {
  const h = data.hourly;
  if (!h?.time || h.time.length === 0) return null;

  const target = new Date(targetISO).getTime();
  if (!Number.isFinite(target)) return null;

  let startIdx = 0;
  let best = Infinity;
  for (let i = 0; i < h.time.length; i++) {
    // Open-Meteo returns naive strings ("2026-04-20T07:00") even under
    // timezone=UTC. Appending Z is what makes them absolute — parsed as-is they
    // would be read in the server's own zone.
    const delta = Math.abs(asUTC(h.time[i]) - target);
    if (delta < best) {
      best = delta;
      startIdx = i;
    }
  }
  if (best > maxDeltaHours * 3_600_000) return null;

  const out: WeatherConditions[] = [];
  for (let i = startIdx; i < Math.min(startIdx + windowHours, h.time.length); i++) {
    out.push({
      tempC: h.temperature_2m?.[i] ?? 0,
      humidity: h.relative_humidity_2m?.[i] ?? 0,
      windSpeed: h.wind_speed_10m?.[i] ?? 0,
      windDirection: h.wind_direction_10m?.[i] ?? 0,
    });
  }
  return out.length > 0 ? out : null;
}

function asUTC(naive: string): number {
  return new Date(naive.endsWith("Z") ? naive : `${naive}Z`).getTime();
}

/**
 * Circular mean of compass bearings, in degrees [0, 360).
 *
 * Wind direction CANNOT be averaged arithmetically. The mean of 350° and 10° is
 * 180° that way — a headwind reported as a tailwind, which the drag model in
 * wind.ts will happily turn into a faster predicted finish. Averaging the unit
 * vectors instead gives 0°, which is the answer.
 *
 * Returns 0 for a set with no resultant direction (opposing winds cancelling),
 * where any bearing is equally wrong and the near-zero speed makes it moot.
 */
export function meanBearing(degrees: number[]): number {
  if (degrees.length === 0) return 0;
  let x = 0;
  let y = 0;
  for (const deg of degrees) {
    const rad = (deg * Math.PI) / 180;
    x += Math.cos(rad);
    y += Math.sin(rad);
  }
  if (Math.abs(x) < 1e-9 && Math.abs(y) < 1e-9) return 0;
  const mean = (Math.atan2(y, x) * 180) / Math.PI;
  return (mean + 360) % 360;
}

/**
 * Average several years' windows into one "typical conditions" series.
 *
 * Averaged hour-offset by hour-offset, so index i still means "i hours after
 * the gun". Scalars take the arithmetic mean; direction takes the circular one.
 * Years that returned nothing are dropped rather than counted as zeroes.
 */
export function averageWindows(
  windows: (WeatherConditions[] | null)[],
): WeatherConditions[] | null {
  const usable = windows.filter(
    (w): w is WeatherConditions[] => w !== null && w.length > 0,
  );
  if (usable.length === 0) return null;

  const hours = Math.min(...usable.map((w) => w.length));
  const out: WeatherConditions[] = [];
  for (let i = 0; i < hours; i++) {
    const slice = usable.map((w) => w[i]);
    out.push({
      tempC: mean(slice.map((c) => c.tempC)),
      humidity: mean(slice.map((c) => c.humidity)),
      windSpeed: mean(slice.map((c) => c.windSpeed)),
      windDirection: meanBearing(slice.map((c) => c.windDirection)),
    });
  }
  return out;
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}
