// Digital elevation model (DEM) lookup — elevation for a route that has none.
//
// goandrace's GPX files carry surveyed elevation, so the original pipeline never
// needed this. A course file taken from a race organiser very often does not:
// plenty of them are coordinate-only exports, and parse_gpx.py hard-rejects a
// track point with no <ele>. Sampling a terrain model is what turns those files
// into something the parser will accept.
//
// This is a materially different kind of number from a surveyed elevation, and
// callers are expected to record which one a course got — see ElevationSource in
// elevate.ts. A DEM reads the ground, not the road: it is wrong on bridges, in
// tunnels, under tree canopy and in urban canyons. parse_gpx.py's 200 m moving
// average absorbs most of the point noise, but not a systematic error, which is
// why scripts/import/calibrate-dem.ts exists and why it is a gate rather than a
// formality.
//
// No new dependency (CLAUDE.md Rule 5): both providers are plain JSON over fetch.

// Constants are local rather than shared with scripts/import/shared.ts: that
// module's USER_AGENT identifies the goandrace crawler, and this file is now
// app code reached from the upload route. A DEM request is not a crawl of
// anybody's site, and it should not claim to be one.

/** Identify ourselves honestly and leave a way to be told to stop. */
export const DEM_USER_AGENT =
  "eveneffort/1.0 (+https://eveneffort.com; contact: info@eveneffort.com)";

/** Delay between requests, ms. Matches OpenTopoData's 1 call/second free tier. */
export const REQUEST_DELAY_MS = 1_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A DEM provider, named so the choice can be recorded per course. */
export interface DemProvider {
  /** Stable id, stored as `dem:<id>` in the provenance field. */
  id: string;
  /** Max coordinates per request. */
  batchSize: number;
  lookup(points: readonly [number, number][]): Promise<number[]>;
}

/**
 * OpenTopoData's public SRTM 30 m endpoint. The documented free-tier limits are
 * 100 locations per call and 1 call/second, which REQUEST_DELAY_MS already
 * satisfies.
 */
export const OPENTOPODATA: DemProvider = {
  id: "srtm30m",
  batchSize: 100,
  async lookup(points) {
    const locations = points.map(([lat, lon]) => `${lat},${lon}`).join("|");
    const url = `https://api.opentopodata.org/v1/srtm30m?locations=${encodeURIComponent(locations)}`;
    const body = (await getJson(url)) as {
      status?: string;
      results?: { elevation: number | null }[];
    };
    if (body.status !== "OK" || !body.results) {
      throw new Error(`opentopodata returned status ${body.status ?? "(none)"}`);
    }
    return body.results.map((r) => {
      if (r.elevation === null || !Number.isFinite(r.elevation)) {
        throw new Error("opentopodata returned a null elevation (point outside coverage)");
      }
      return r.elevation;
    });
  },
};

/**
 * Open-Meteo's elevation API — a fallback, not a preference. It reads a
 * different model (Copernicus GLO-90), so a disagreement between the two is a
 * useful signal rather than redundancy.
 */
export const OPEN_METEO: DemProvider = {
  id: "copernicus90m",
  batchSize: 100,
  async lookup(points) {
    const lat = points.map((p) => p[0]).join(",");
    const lon = points.map((p) => p[1]).join(",");
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`;
    const body = (await getJson(url)) as { elevation?: number[] };
    if (!body.elevation || body.elevation.length !== points.length) {
      throw new Error("open-meteo returned no elevation array");
    }
    return body.elevation;
  },
};

export const PROVIDERS: Record<string, DemProvider> = {
  [OPENTOPODATA.id]: OPENTOPODATA,
  [OPEN_METEO.id]: OPEN_METEO,
};

async function getJson(url: string): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await sleep(REQUEST_DELAY_MS * 3);
    try {
      const res = await fetch(url, {
        headers: { "user-agent": DEM_USER_AGENT, accept: "application/json" },
      });
      // 429 and 5xx are the shapes a free tier fails with; both are worth the retry.
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.json();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/**
 * Elevation, in metres, for every point — in the order given.
 *
 * Sequential and unhurried on purpose: these are free public endpoints and a
 * marathon is a few thousand points, so a batch is tens of requests. `onProgress`
 * exists because that is slow enough that a silent script looks hung.
 */
export async function lookupElevations(
  points: readonly [number, number][],
  provider: DemProvider = OPENTOPODATA,
  onProgress?: (done: number, total: number) => void,
): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i < points.length; i += provider.batchSize) {
    if (i > 0) await sleep(REQUEST_DELAY_MS);
    const chunk = points.slice(i, i + provider.batchSize);
    const elevations = await provider.lookup(chunk);
    if (elevations.length !== chunk.length) {
      throw new Error(
        `${provider.id} returned ${elevations.length} elevations for ${chunk.length} points`,
      );
    }
    out.push(...elevations);
    onProgress?.(out.length, points.length);
  }
  return out;
}
