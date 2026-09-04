// Server-side proxy for race-day weather. Keeps every API key on the server —
// the client only ever calls this internal route.
//
// One route, three sources, chosen by where the race start actually falls:
//
//   forecast    within Tomorrow.io's ~5-day hourly horizon
//   historical  in the past — what was actually recorded that morning
//   typical     beyond the horizon — a 10-year average of that calendar date
//
// Before this split, the two common cases (a race already run, a race months
// out) both returned "outside the forecast range", and the pacing engine fell
// back to its visible 15 °C / 50 % / no-wind defaults. The response now names
// its `source` so the UI can say which of the three the runner is looking at
// rather than implying everything is a forecast.
//
// On any failure the response is a JSON error with a non-200 status, so the
// client can still fall back to manual entry.
import { buildForecastUrl, selectHourlyWindow } from "@/lib/weather/forecast";
import {
  averageWindows,
  buildArchiveUrl,
  buildClimatologyUrls,
  buildRecentPastUrl,
  CLIMATOLOGY_YEARS,
  isArchived,
  selectHistoricalWindow,
  shiftDate,
  utcDateOf,
} from "@/lib/weather/history";
import { readWindow, writeWindow } from "@/db/weatherCache";
import type { WeatherConditions } from "@/types";

export type WeatherSource = "forecast" | "historical" | "typical";

interface WeatherPayload {
  hours: WeatherConditions[];
  source: WeatherSource;
  /** What the UI needs to explain the number it is showing. */
  meta?: { raceDateISO?: string; years?: number };
  /** True when this came out of Postgres rather than off an upstream API. */
  cached?: boolean;
}

// Past weather is settled — it will not change, so cache it for a year.
// A climatology average only moves when a new year enters the window.
const CACHE_FORECAST = 900;
const CACHE_HISTORICAL = 31_536_000;
const CACHE_TYPICAL = 86_400;

async function fetchJson(url: string, revalidate: number): Promise<unknown> {
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    next: { revalidate },
  });
  if (!res.ok) throw new Error(`Upstream weather error (${res.status}).`);
  return res.json();
}

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));
  const time = searchParams.get("time") ?? undefined;
  // The client's read of the edition's date confidence. An ESTIMATED past date
  // came from a recurrence rule, not a record, and can miss the true race day
  // by a week — so it is answered with climatology and labelled typical rather
  // than being presented as the conditions on a day we aren't sure about.
  const forceTypical = searchParams.get("typical") === "1";

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return Response.json({ error: "Missing or invalid lat/lon." }, { status: 400 });
  }
  if (!time || !Number.isFinite(new Date(time).getTime())) {
    return Response.json({ error: "Missing or invalid time." }, { status: 400 });
  }

  const isPast = new Date(time).getTime() < Date.now();

  // Which source this request WOULD use, so the cache can be consulted before
  // any upstream call rather than after one.
  const wanted: WeatherSource = forceTypical
    ? "typical"
    : isPast
      ? "historical"
      : "forecast";

  const hit = await readWindow(lat, lon, time, wanted);
  if (hit) {
    return Response.json({
      hours: hit.hours,
      source: wanted,
      ...(hit.meta ? { meta: hit.meta } : {}),
      cached: true,
    });
  }

  try {
    let payload: WeatherPayload | null = null;

    if (isPast && !forceTypical) {
      payload = await loadHistorical(lat, lon, time);
      // Archive gap — fall through to climatology rather than failing outright.
    } else if (!forceTypical) {
      payload = await loadForecast(lat, lon, time);
      // Beyond Tomorrow.io's horizon. Not an error: it's the common case, and
      // climatology is a better answer than asking the runner to invent one.
    }

    // The fallbacks land on a DIFFERENT source than `wanted`, so they get their
    // own cache lookup before their own upstream call.
    if (!payload) {
      const fallback = await readWindow(lat, lon, time, "typical");
      if (fallback) {
        return Response.json({
          hours: fallback.hours,
          source: "typical",
          ...(fallback.meta ? { meta: fallback.meta } : {}),
          cached: true,
        });
      }
      payload = await loadTypical(lat, lon, time);
    }

    if (!payload) {
      return Response.json(
        { error: "No weather data available for this date. Enter conditions manually." },
        { status: 404 },
      );
    }

    // Memoise before responding. `writeWindow` never throws and never blocks a
    // valid answer — a cache that cannot be written is just a cache miss next
    // time. Awaited rather than fired-and-forgotten because a serverless
    // function can be frozen the moment its response is returned, which would
    // drop the write and make the cache permanently cold.
    await writeWindow(lat, lon, time, payload.source, payload.hours, payload.meta ?? null);

    return Response.json(payload);
  } catch {
    return Response.json(
      { error: "Failed to reach the weather service." },
      { status: 502 },
    );
  }
}

/** Tomorrow.io, unchanged. Returns null when race day is past its horizon. */
async function loadForecast(
  lat: number,
  lon: number,
  time: string,
): Promise<WeatherPayload | null> {
  const apiKey = process.env.TOMORROW_IO_API_KEY;
  if (!apiKey) return null;
  const data = await fetchJson(buildForecastUrl(lat, lon, apiKey), CACHE_FORECAST);
  const hours = selectHourlyWindow(data as never, time);
  if (!hours || hours.length === 0) return null;
  return { hours, source: "forecast" };
}

/**
 * What was actually recorded. ERA5 lags ~5 days, so a race run last weekend
 * comes from the operational model's past days instead of the archive.
 */
async function loadHistorical(
  lat: number,
  lon: number,
  time: string,
): Promise<WeatherPayload | null> {
  const apiKey = process.env.OPEN_METEO_API_KEY;
  const date = utcDateOf(time);
  const url = isArchived(time)
    ? buildArchiveUrl(lat, lon, date, shiftDate(date, 1), apiKey)
    : buildRecentPastUrl(lat, lon, time, apiKey);
  const data = await fetchJson(url, CACHE_HISTORICAL);
  const hours = selectHistoricalWindow(data as never, time);
  if (!hours || hours.length === 0) return null;
  return { hours, source: "historical", meta: { raceDateISO: date } };
}

/** The same calendar date across the previous ten years, averaged. */
async function loadTypical(
  lat: number,
  lon: number,
  time: string,
): Promise<WeatherPayload | null> {
  const apiKey = process.env.OPEN_METEO_API_KEY;
  const urls = buildClimatologyUrls(lat, lon, time, apiKey);

  // One year's outage must not lose the whole average — settle, don't race.
  const results = await Promise.allSettled(
    urls.map((u) => fetchJson(u, CACHE_TYPICAL)),
  );
  const windows = results.map((r, i) =>
    r.status === "fulfilled"
      ? // Each year's window is keyed to the same clock time on its own date.
        selectHistoricalWindow(r.value as never, shiftYear(time, yearOfUrl(urls[i])))
      : null,
  );

  const hours = averageWindows(windows);
  if (!hours || hours.length === 0) return null;
  return {
    hours,
    source: "typical",
    meta: { raceDateISO: utcDateOf(time), years: CLIMATOLOGY_YEARS },
  };
}

/** The `start_date` year a climatology URL was built for. */
function yearOfUrl(url: string): number {
  const m = /start_date=(\d{4})-/.exec(url);
  return m ? Number(m[1]) : new Date().getUTCFullYear();
}

/** The same instant-of-day, moved to another year. */
function shiftYear(iso: string, year: number): string {
  const d = new Date(iso);
  d.setUTCFullYear(year);
  return d.toISOString();
}
