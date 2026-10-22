import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The cache is stubbed to a permanent miss. These tests are about which
// UPSTREAM the route reaches for and what it does when one of them says no,
// and a cache that answered would hide exactly that.
vi.mock("@/db/weatherCache", () => ({
  readWindow: vi.fn(async () => null),
  writeWindow: vi.fn(async () => undefined),
}));

import { GET } from "./route";

const LAT = 42.2288;
const LON = -71.5148;

/** A near-future start, inside the horizon whatever day the suite runs. */
const soon = () =>
  new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 13) + ":00:00Z";

/**
 * An Open-Meteo payload for one climatology year.
 *
 * The year matters. `loadTypical` fetches the same calendar date across the
 * last ten years and matches each response against THAT year's instant, so a
 * fixture pinned to the current year misses every window by a decade and the
 * route answers 404. The year is therefore read back out of the request URL's
 * `start_date`, which is how the route itself keeps them aligned.
 */
function openMeteoFor(url: string, targetISO: string, tempC: number) {
  const year = /start_date=(\d{4})-/.exec(url)?.[1];
  const base = new Date(targetISO);
  if (year) base.setUTCFullYear(Number(year));
  const start = base.getTime();
  const time: string[] = [];
  for (let i = 0; i < 10; i++) {
    time.push(new Date(start + i * 3_600_000).toISOString().slice(0, 16));
  }
  return {
    hourly: {
      time,
      temperature_2m: time.map(() => tempC),
      relative_humidity_2m: time.map(() => 60),
      wind_speed_10m: time.map(() => 2),
      wind_direction_10m: time.map(() => 180),
    },
  };
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const call = (time: string) =>
  GET(
    new Request(
      `https://x.test/api/weather?lat=${LAT}&lon=${LON}&time=${encodeURIComponent(time)}`,
    ),
  );

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  process.env.TOMORROW_IO_API_KEY = "test-key";
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GET /api/weather", () => {
  it("serves a Tomorrow.io forecast for a near-future race", async () => {
    const time = soon();
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("tomorrow.io")
        ? jsonResponse({
            timelines: {
              hourly: Array.from({ length: 8 }, (_, i) => ({
                time: new Date(
                  new Date(time).getTime() + i * 3_600_000,
                ).toISOString(),
                values: {
                  temperature: 12,
                  humidity: 55,
                  windSpeed: 3,
                  windDirection: 90,
                },
              })),
            },
          })
        : jsonResponse({}),
    );

    const body = await (await call(time)).json();
    expect(body.source).toBe("forecast");
    expect(body.hours[0].tempC).toBe(12);
  });

  /**
   * The regression this file exists for.
   *
   * Tomorrow.io's free tier allows 25 requests an hour, and a handful of page
   * refreshes in development spends it. Before the fix, the 429 threw out of
   * `loadForecast`, unwound past the climatology fallback and landed in the
   * route's outer catch, which answered 502 — so a race five days out showed
   * "Conditions unavailable. (Failed to reach the weather service.)" while a
   * perfectly good ten-year average sat one branch away, unreached.
   */
  it("falls through to climatology when Tomorrow.io rate-limits", async () => {
    const time = soon();
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("tomorrow.io")
        ? jsonResponse({ code: 429001, type: "Too Many Calls" }, 429)
        : jsonResponse(openMeteoFor(String(url), time, 17)),
    );

    const res = await call(time);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe("typical");
    expect(body.hours[0].tempC).toBe(17);
  });

  it("falls through when Tomorrow.io 500s, not just when it rate-limits", async () => {
    const time = soon();
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("tomorrow.io")
        ? jsonResponse({ error: "boom" }, 500)
        : jsonResponse(openMeteoFor(String(url), time, 19)),
    );

    const body = await (await call(time)).json();
    expect(body.source).toBe("typical");
  });

  /**
   * Quota is the scarce resource, so a race months out must not spend a call
   * discovering what the horizon constant already knows.
   */
  it("does not call Tomorrow.io at all for a race beyond the horizon", async () => {
    const time =
      new Date(Date.now() + 120 * 86_400_000).toISOString().slice(0, 13) +
      ":00:00Z";
    fetchMock.mockImplementation(async (url: string) =>
      jsonResponse(openMeteoFor(String(url), time, 9)),
    );

    const body = await (await call(time)).json();
    expect(body.source).toBe("typical");
    expect(
      fetchMock.mock.calls.filter(([u]) => String(u).includes("tomorrow.io")),
    ).toHaveLength(0);
  });

  it("still errors when every upstream is unreachable", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    const res = await call(soon());
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("rejects a missing time rather than guessing one", async () => {
    const res = await GET(
      new Request(`https://x.test/api/weather?lat=${LAT}&lon=${LON}`),
    );
    expect(res.status).toBe(400);
  });
});
