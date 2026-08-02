import { describe, it, expect } from "vitest";
import {
  buildForecastUrl,
  selectHourlyWindow,
  TOMORROW_FORECAST_ENDPOINT,
} from "./forecast";

describe("buildForecastUrl", () => {
  it("encodes location, hourly timestep, metric units and the key", () => {
    const url = buildForecastUrl(40.6022, -74.0536, "secret-key");
    expect(url.startsWith(`${TOMORROW_FORECAST_ENDPOINT}?`)).toBe(true);
    const params = new URL(url).searchParams;
    expect(params.get("location")).toBe("40.6022,-74.0536");
    expect(params.get("timesteps")).toBe("1h");
    expect(params.get("units")).toBe("metric");
    expect(params.get("apikey")).toBe("secret-key");
  });
});

describe("selectHourlyWindow", () => {
  const data = {
    timelines: {
      hourly: [
        {
          time: "2026-09-21T06:00:00Z",
          values: {
            temperature: 12,
            humidity: 80,
            windSpeed: 2,
            windDirection: 180,
          },
        },
        {
          time: "2026-09-21T07:00:00Z",
          values: {
            temperature: 14,
            humidity: 72,
            windSpeed: 3,
            windDirection: 200,
          },
        },
        {
          time: "2026-09-21T08:00:00Z",
          values: {
            temperature: 18,
            humidity: 60,
            windSpeed: 5,
            windDirection: 270,
          },
        },
        {
          time: "2026-09-21T09:00:00Z",
          values: {
            temperature: 21,
            humidity: 52,
            windSpeed: 6,
            windDirection: 280,
          },
        },
        {
          time: "2026-09-21T10:00:00Z",
          values: {
            temperature: 24,
            humidity: 45,
            windSpeed: 7,
            windDirection: 300,
          },
        },
      ],
    },
  };

  it("starts the window at the hourly entry nearest the target time", () => {
    const hours = selectHourlyWindow(data, "2026-09-21T08:20:00Z");
    expect(hours).not.toBeNull();
    expect(hours![0]).toEqual({
      tempC: 18,
      humidity: 60,
      windSpeed: 5,
      windDirection: 270,
    });
    // Consecutive hours follow, through the end of the payload.
    expect(hours!.map((h) => h.tempC)).toEqual([18, 21, 24]);
  });

  it("defaults to the first entry when no target is given", () => {
    const hours = selectHourlyWindow(data);
    expect(hours![0].tempC).toBe(12);
    expect(hours).toHaveLength(5);
  });

  it("caps the window at windowHours entries", () => {
    const hours = selectHourlyWindow(data, undefined, 2);
    expect(hours).toHaveLength(2);
    expect(hours!.map((h) => h.tempC)).toEqual([12, 14]);
  });

  it("returns null when race day is beyond the forecast horizon", () => {
    // The payload tops out on 2026-09-21; a race three months later must not
    // be served that last hour as though it were race-day weather.
    expect(selectHourlyWindow(data, "2026-12-21T08:00:00Z")).toBeNull();
    // Even a single day past the end is out of range.
    expect(selectHourlyWindow(data, "2026-09-22T08:00:00Z")).toBeNull();
  });

  it("still accepts a target just past the end, within the tolerance", () => {
    // 50 minutes beyond the final 10:00 entry — inside the 1 h allowance, so
    // the last hour is served rather than rejected.
    const hours = selectHourlyWindow(data, "2026-09-21T10:50:00Z");
    expect(hours).not.toBeNull();
    expect(hours![0].tempC).toBe(24);
  });

  it("treats the target as absolute, not as runtime-local time", () => {
    // A "+02:00" offset target must resolve to the 08:00Z entry, proving the
    // comparison happens on instants rather than on wall-clock digits.
    const hours = selectHourlyWindow(data, "2026-09-21T10:00:00+02:00");
    expect(hours![0].tempC).toBe(18);
  });

  it("returns null when there is no hourly data", () => {
    expect(selectHourlyWindow({})).toBeNull();
    expect(selectHourlyWindow({ timelines: { hourly: [] } })).toBeNull();
  });

  it("defaults missing fields to 0", () => {
    const hours = selectHourlyWindow({
      timelines: { hourly: [{ time: "2026-09-21T08:00:00Z", values: {} }] },
    });
    expect(hours).toEqual([
      { tempC: 0, humidity: 0, windSpeed: 0, windDirection: 0 },
    ]);
  });
});
