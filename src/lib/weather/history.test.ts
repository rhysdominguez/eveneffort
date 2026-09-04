import { describe, expect, it } from "vitest";
import {
  ARCHIVE_DELAY_DAYS,
  averageWindows,
  buildArchiveUrl,
  buildClimatologyUrls,
  buildRecentPastUrl,
  isArchived,
  meanBearing,
  OPEN_METEO_ARCHIVE_ENDPOINT,
  OPEN_METEO_CUSTOMER_ARCHIVE_ENDPOINT,
  selectHistoricalWindow,
  shiftDate,
  utcDateOf,
} from "@/lib/weather/history";
import type { WeatherConditions } from "@/types";

describe("buildArchiveUrl", () => {
  it("requests wind in METRES PER SECOND", () => {
    // The single most dangerous default in this integration. Tomorrow.io's
    // metric mode returns m/s and wind.ts is built on that — its 10m->1.5m
    // power law and quadratic drag term both assume m/s. Open-Meteo defaults
    // to km/h, so without this parameter every wind figure arrives 3.6x too
    // large. That doesn't look like a bug; it looks like a windy day, and it
    // produces a confidently wrong pacing chart.
    const url = buildArchiveUrl(42.35, -71.07, "2026-04-20", "2026-04-21");
    expect(url).toContain("wind_speed_unit=ms");
  });

  it("asks for the four variables the pacing engine consumes", () => {
    const url = buildArchiveUrl(42.35, -71.07, "2026-04-20", "2026-04-21");
    for (const v of [
      "temperature_2m",
      "relative_humidity_2m",
      "wind_speed_10m",
      "wind_direction_10m",
    ]) {
      expect(decodeURIComponent(url)).toContain(v);
    }
  });

  it("pins the timezone to UTC", () => {
    // The caller already resolved the runner's wall clock through the course's
    // IANA zone. Re-introducing a local zone here is just a second chance to
    // get the offset wrong.
    expect(buildArchiveUrl(1, 2, "2026-04-20", "2026-04-21")).toContain(
      "timezone=UTC",
    );
  });

  it("uses the free host without a key and the customer host with one", () => {
    expect(buildArchiveUrl(1, 2, "2026-04-20", "2026-04-21")).toContain(
      OPEN_METEO_ARCHIVE_ENDPOINT,
    );
    const paid = buildArchiveUrl(1, 2, "2026-04-20", "2026-04-21", "k123");
    expect(paid).toContain(OPEN_METEO_CUSTOMER_ARCHIVE_ENDPOINT);
    expect(paid).toContain("apikey=k123");
  });
});

describe("isArchived / buildRecentPastUrl", () => {
  const now = new Date("2026-08-19T12:00:00Z");

  it("sends a race older than the ERA5 delay to the archive", () => {
    expect(isArchived("2026-08-01T11:30:00Z", now)).toBe(true);
  });

  it("keeps a race inside the delay off the archive", () => {
    // ERA5 publishes ~5 days behind. A race run last weekend simply is not in
    // the archive yet, and asking for it returns an empty window rather than
    // an error — which would read as "no data for this race" forever.
    const yesterday = new Date(now.getTime() - 86_400_000).toISOString();
    expect(isArchived(yesterday, now)).toBe(false);
    expect(ARCHIVE_DELAY_DAYS).toBeGreaterThanOrEqual(5);
  });

  it("asks the forecast endpoint for enough past days to reach the race", () => {
    const url = buildRecentPastUrl(
      42.35,
      -71.07,
      "2026-08-17T11:30:00Z",
      undefined,
      now,
    );
    expect(url).toContain("wind_speed_unit=ms");
    const days = Number(/past_days=(\d+)/.exec(url)![1]);
    expect(days).toBeGreaterThanOrEqual(3);
    expect(days).toBeLessThanOrEqual(92);
  });
});

describe("buildClimatologyUrls", () => {
  const now = new Date("2026-08-19T12:00:00Z");

  it("takes the same calendar date across prior years", () => {
    const urls = buildClimatologyUrls(
      42.35,
      -71.07,
      "2027-04-19T11:30:00Z",
      undefined,
      3,
      now,
    );
    expect(urls).toHaveLength(3);
    const starts = urls.map((u) => /start_date=([\d-]+)/.exec(u)![1]);
    // A 2027 race cannot average years that haven't happened — it counts back
    // from THIS year, not its own.
    expect(starts).toEqual(["2025-04-19", "2024-04-19", "2023-04-19"]);
  });

  it("counts back from the race's own year when the race is in the past", () => {
    const urls = buildClimatologyUrls(
      1,
      2,
      "2023-04-17T11:30:00Z",
      undefined,
      2,
      now,
    );
    const starts = urls.map((u) => /start_date=([\d-]+)/.exec(u)![1]);
    expect(starts).toEqual(["2022-04-17", "2021-04-17"]);
  });
});

describe("meanBearing", () => {
  it("averages across the 0/360 wrap", () => {
    // The reason this function exists. An arithmetic mean of 350 and 10 is
    // 180 — a headwind reported as a tailwind, which wind.ts will happily
    // turn into a FASTER predicted finish.
    expect(meanBearing([350, 10])).toBeCloseTo(0, 6);
  });

  it("averages ordinary bearings", () => {
    expect(meanBearing([80, 100])).toBeCloseTo(90, 6);
    expect(meanBearing([270])).toBeCloseTo(270, 6);
  });

  it("always returns a bearing in [0, 360)", () => {
    for (const set of [[350, 10], [181, 179], [1, 359], [90, 270, 0]]) {
      const b = meanBearing(set);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(360);
    }
  });

  it("returns 0 for winds that cancel out, and for an empty set", () => {
    expect(meanBearing([0, 180])).toBe(0);
    expect(meanBearing([])).toBe(0);
  });
});

describe("selectHistoricalWindow", () => {
  const payload = {
    hourly: {
      // Open-Meteo returns NAIVE strings even under timezone=UTC. Parsed as-is
      // they'd be read in the server's own zone and select the wrong hours.
      time: ["2026-04-20T06:00", "2026-04-20T07:00", "2026-04-20T08:00"],
      temperature_2m: [8, 10, 12],
      relative_humidity_2m: [70, 65, 60],
      wind_speed_10m: [3, 4, 5],
      wind_direction_10m: [90, 100, 110],
    },
  };

  it("starts at the hour nearest the gun", () => {
    const w = selectHistoricalWindow(payload, "2026-04-20T07:00:00Z");
    expect(w).not.toBeNull();
    expect(w![0]).toEqual({
      tempC: 10,
      humidity: 65,
      windSpeed: 4,
      windDirection: 100,
    });
    expect(w).toHaveLength(2);
  });

  it("honours the window length", () => {
    expect(
      selectHistoricalWindow(payload, "2026-04-20T06:00:00Z", 2),
    ).toHaveLength(2);
  });

  it("refuses a date the archive never covered", () => {
    // Same rule forecast.ts enforces: serving the nearest hour we happen to
    // hold, days away, would be silently and confidently wrong.
    expect(
      selectHistoricalWindow(payload, "2026-06-01T07:00:00Z"),
    ).toBeNull();
  });

  it("returns null for an empty payload", () => {
    expect(selectHistoricalWindow({}, "2026-04-20T07:00:00Z")).toBeNull();
    expect(
      selectHistoricalWindow({ hourly: { time: [] } }, "2026-04-20T07:00:00Z"),
    ).toBeNull();
  });
});

describe("averageWindows", () => {
  const w = (...temps: number[]): WeatherConditions[] =>
    temps.map((tempC) => ({
      tempC,
      humidity: 50,
      windSpeed: 2,
      windDirection: 0,
    }));

  it("averages hour-offset by hour-offset", () => {
    const out = averageWindows([w(10, 12), w(20, 22)])!;
    expect(out.map((c) => c.tempC)).toEqual([15, 17]);
  });

  it("drops years that returned nothing rather than counting them as zero", () => {
    const out = averageWindows([w(10), null, w(20)])!;
    expect(out[0].tempC).toBe(15);
  });

  it("uses the circular mean for direction", () => {
    const a = [{ tempC: 0, humidity: 0, windSpeed: 1, windDirection: 350 }];
    const b = [{ tempC: 0, humidity: 0, windSpeed: 1, windDirection: 10 }];
    expect(averageWindows([a, b])![0].windDirection).toBeCloseTo(0, 6);
  });

  it("truncates to the shortest window so every index is a real average", () => {
    expect(averageWindows([w(10, 12, 14), w(20, 22)])).toHaveLength(2);
  });

  it("returns null when nothing usable came back", () => {
    expect(averageWindows([null, null])).toBeNull();
    expect(averageWindows([])).toBeNull();
  });
});

describe("date helpers", () => {
  it("takes the UTC calendar date of an instant", () => {
    expect(utcDateOf("2026-04-20T11:30:00Z")).toBe("2026-04-20");
  });

  it("shifts dates across month and year ends", () => {
    expect(shiftDate("2026-04-20", 1)).toBe("2026-04-21");
    expect(shiftDate("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDate("2026-03-01", -1)).toBe("2026-02-28");
  });
});
