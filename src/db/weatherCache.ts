// Read/write for the weather_window cache. Server-only, and the first thing in
// this app that writes to Postgres at runtime rather than through the seed.
//
// THE CONTRACT IS THAT THIS CANNOT FAIL A REQUEST. Every function here
// swallows its errors and reports "no cache" instead: a database that is
// missing, unreachable, un-migrated or read-only degrades the route to the API
// call it was avoiding, never to an error page. That is what keeps CLAUDE.md
// Rule 9 true — `npm run build` and `npm run test` still pass with no database
// reachable, because a cache miss is a normal outcome rather than a fault.
//
// Why it is worth having at all: most of what the route asks for never
// changes. A race that has been run has one set of conditions, permanently.
// Without this, every visit to a past race re-bought the same immutable answer
// from a metered API — which is the difference between paying for a historical
// weather plan once, to backfill, and paying for it every month forever.
import { and, eq, isNull, or, sql } from "drizzle-orm";
import type { WeatherConditions } from "@/types";
import { getDb, isDatabaseConfigured } from "./client";
import { weatherWindows } from "./schema";

export type WeatherSource = "forecast" | "historical" | "typical";

export interface CachedWindow {
  hours: WeatherConditions[];
  meta: { raceDateISO?: string; years?: number } | null;
}

/**
 * How long each source stays usable.
 *
 * `null` means permanent. Only `historical` earns that: it is a record of a
 * morning that has already happened and no later fetch can improve it. A
 * forecast is a prediction that moves, and serving a stale one is worse than
 * having none — hence a window short enough that it behaves like the 15-minute
 * HTTP cache it replaces.
 */
export const TTL_SECONDS: Record<WeatherSource, number | null> = {
  historical: null,
  typical: 365 * 24 * 3600,
  forecast: 900,
};

/**
 * Coordinates are rounded to 4dp (~11 m) before they become a cache key.
 *
 * Start lines are stored as numeric and arrive through a query string, so the
 * same course can present as 42.2288 or 42.228800000000004 depending on the
 * path it took. Unrounded, those are different keys and every lookup misses.
 */
export function roundCoord(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

/** A stored window for this exact start, or null on a miss or any failure. */
export async function readWindow(
  lat: number,
  lon: number,
  startUtc: string,
  source: WeatherSource,
): Promise<CachedWindow | null> {
  if (!isDatabaseConfigured()) return null;
  try {
    const rows = await getDb()
      .select({ hours: weatherWindows.hours, meta: weatherWindows.meta })
      .from(weatherWindows)
      .where(
        and(
          eq(weatherWindows.lat, String(roundCoord(lat))),
          eq(weatherWindows.lon, String(roundCoord(lon))),
          eq(weatherWindows.startUtc, new Date(startUtc)),
          eq(weatherWindows.source, source),
          // A null expiry is permanent; anything else must still be in date.
          or(
            isNull(weatherWindows.expiresAt),
            sql`${weatherWindows.expiresAt} > now()`,
          ),
        ),
      )
      .limit(1);

    const hours = rows[0]?.hours as WeatherConditions[] | undefined;
    if (!hours || hours.length === 0) return null;
    return {
      hours,
      meta: (rows[0].meta as CachedWindow["meta"]) ?? null,
    };
  } catch {
    // Unreachable, un-migrated, whatever — a miss is always a safe answer.
    return null;
  }
}

/**
 * Store a window, replacing any previous one for the same key.
 *
 * Upsert rather than insert because a forecast for a given start is re-fetched
 * as its TTL lapses, and because a race that has passed gets a `historical`
 * row written over whatever `forecast` row preceded it — different sources, so
 * different keys, and both are kept.
 *
 * Returns nothing and throws nothing: the caller has already produced an
 * answer for the user, and failing to memoise it is not their problem.
 */
export async function writeWindow(
  lat: number,
  lon: number,
  startUtc: string,
  source: WeatherSource,
  hours: WeatherConditions[],
  meta: CachedWindow["meta"],
): Promise<void> {
  if (!isDatabaseConfigured()) return;
  if (hours.length === 0) return;
  try {
    const ttl = TTL_SECONDS[source];
    const expiresAt = ttl === null ? null : new Date(Date.now() + ttl * 1000);
    await getDb()
      .insert(weatherWindows)
      .values({
        lat: String(roundCoord(lat)),
        lon: String(roundCoord(lon)),
        startUtc: new Date(startUtc),
        source,
        hours,
        meta,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: [
          weatherWindows.lat,
          weatherWindows.lon,
          weatherWindows.startUtc,
          weatherWindows.source,
        ],
        set: {
          hours,
          meta,
          expiresAt,
          fetchedAt: new Date(),
        },
      });
  } catch {
    // Deliberately silent — see the module header.
  }
}
