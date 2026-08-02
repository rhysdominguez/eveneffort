import { describe, it, expect } from "vitest";
import type { WeatherConditions } from "@/types";
import {
  FALL_WARMING_C_PER_HOUR,
  conditionsAtElapsed,
  dewPointC,
  humidityAtTemp,
  synthesizeHourly,
} from "./progression";

const START: WeatherConditions = {
  tempC: 12,
  humidity: 80,
  windSpeed: 3,
  windDirection: 270,
};

describe("dew point round-trip", () => {
  it("humidityAtTemp inverts dewPointC at the anchor temperature", () => {
    const dew = dewPointC(20, 65);
    expect(humidityAtTemp(20, dew)).toBeCloseTo(65, 6);
  });

  it("dew point is below air temperature for RH < 100%", () => {
    expect(dewPointC(15, 50)).toBeLessThan(15);
  });

  it("dew point equals air temperature at 100% RH", () => {
    expect(dewPointC(18, 100)).toBeCloseTo(18, 6);
  });
});

describe("synthesizeHourly", () => {
  const series = synthesizeHourly(START, 6);

  it("returns hours + 1 points starting at the entered conditions", () => {
    expect(series).toHaveLength(7);
    expect(series[0]).toEqual(START);
  });

  it("warms at the documented fall rate", () => {
    for (let h = 1; h < series.length; h++) {
      expect(series[h].tempC - series[h - 1].tempC).toBeCloseTo(
        FALL_WARMING_C_PER_HOUR,
        9,
      );
    }
  });

  it("humidity falls monotonically as the air warms", () => {
    for (let h = 1; h < series.length; h++) {
      expect(series[h].humidity).toBeLessThan(series[h - 1].humidity);
    }
  });

  it("holds the dew point constant while RH falls", () => {
    const dew0 = dewPointC(series[0].tempC, series[0].humidity);
    for (const point of series) {
      expect(dewPointC(point.tempC, point.humidity)).toBeCloseTo(dew0, 6);
    }
  });

  it("holds wind speed and direction constant", () => {
    for (const point of series) {
      expect(point.windSpeed).toBe(START.windSpeed);
      expect(point.windDirection).toBe(START.windDirection);
    }
  });
});

describe("conditionsAtElapsed", () => {
  const series = synthesizeHourly(START, 4);

  it("returns the endpoints exactly and clamps beyond them", () => {
    expect(conditionsAtElapsed(series, 0)).toEqual(series[0]);
    expect(conditionsAtElapsed(series, 4 * 3600).tempC).toBeCloseTo(
      series[4].tempC,
      9,
    );
    // Clamped past the series end.
    expect(conditionsAtElapsed(series, 10 * 3600).tempC).toBeCloseTo(
      series[4].tempC,
      9,
    );
    expect(conditionsAtElapsed(series, -100)).toEqual(series[0]);
  });

  it("linearly interpolates temperature at the half hour", () => {
    const mid = conditionsAtElapsed(series, 1800);
    expect(mid.tempC).toBeCloseTo(
      (series[0].tempC + series[1].tempC) / 2,
      9,
    );
  });

  it("interpolates wind direction along the shortest arc across north", () => {
    const wrap: WeatherConditions[] = [
      { tempC: 10, humidity: 50, windSpeed: 5, windDirection: 350 },
      { tempC: 10, humidity: 50, windSpeed: 5, windDirection: 10 },
    ];
    expect(conditionsAtElapsed(wrap, 1800).windDirection).toBeCloseTo(0, 6);
  });

  it("handles a single-point series", () => {
    expect(conditionsAtElapsed([START], 7200)).toEqual(START);
  });
});
