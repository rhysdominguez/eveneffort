import { describe, it, expect } from "vitest";
import {
  buildForecastUrl,
  selectHourlyConditions,
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

describe("selectHourlyConditions", () => {
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
          time: "2026-09-21T08:00:00Z",
          values: {
            temperature: 18,
            humidity: 60,
            windSpeed: 5,
            windDirection: 270,
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

  it("picks the hourly entry nearest the target time", () => {
    const c = selectHourlyConditions(data, "2026-09-21T08:20:00Z");
    expect(c).toEqual({
      tempC: 18,
      humidity: 60,
      windSpeed: 5,
      windDirection: 270,
    });
  });

  it("defaults to the first entry when no target is given", () => {
    const c = selectHourlyConditions(data);
    expect(c?.tempC).toBe(12);
  });

  it("returns null when there is no hourly data", () => {
    expect(selectHourlyConditions({})).toBeNull();
    expect(selectHourlyConditions({ timelines: { hourly: [] } })).toBeNull();
  });

  it("defaults missing fields to 0", () => {
    const c = selectHourlyConditions({
      timelines: { hourly: [{ time: "2026-09-21T08:00:00Z", values: {} }] },
    });
    expect(c).toEqual({
      tempC: 0,
      humidity: 0,
      windSpeed: 0,
      windDirection: 0,
    });
  });
});
