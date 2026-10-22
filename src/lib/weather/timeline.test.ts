import { describe, expect, it } from "vitest";
import { buildWeatherTimeline, skyIconFor } from "@/lib/weather/timeline";
import type { WeatherConditions } from "@/types";

const HOUR_MS = 3_600_000;

/** A series whose temperature encodes its own index, so a sample names its source. */
const rampSeries = (n: number): WeatherConditions[] =>
  Array.from({ length: n }, (_, i) => ({
    tempC: i,
    humidity: 50,
    windSpeed: 2,
    windDirection: 180,
  }));

const LEAD: WeatherConditions[] = [
  { tempC: -1, humidity: 55, windSpeed: 2, windDirection: 180 },
];

/**
 * A 42.195 km course as 43 km-segments, run at even pace over `finishSeconds`.
 * Real geometry is not needed here: the timeline only inverts time to distance.
 */
function evenCourse(finishSeconds: number) {
  const segmentLengthsKm = [...Array.from({ length: 42 }, () => 1), 0.195];
  const total = 42.195;
  let km = 0;
  const cumulativeSeconds = segmentLengthsKm.map((len) => {
    km += len;
    return (finishSeconds * km) / total;
  });
  return { segmentLengthsKm, cumulativeSeconds };
}

/** The gun as an instant. The zone offset is irrelevant except where stated. */
const gunAt = (utc: string) => new Date(utc).getTime();

function build(overrides: Partial<Parameters<typeof buildWeatherTimeline>[0]> = {}) {
  const finishSeconds = overrides.finishSeconds ?? 3 * 3600;
  return buildWeatherTimeline({
    startHHMM: "10:00",
    gunUtcMs: gunAt("2026-04-20T10:00:00Z"),
    finishSeconds,
    ...evenCourse(finishSeconds),
    series: rampSeries(8),
    lead: LEAD,
    ...overrides,
  });
}

const clocks = (rows: ReturnType<typeof buildWeatherTimeline>) =>
  rows.map((r) => `${r.kind} ${r.clockHHMM}`);

describe("row placement", () => {
  it("puts the pre-race row on the last whole hour before an off-the-hour gun", () => {
    const rows = build({
      startHHMM: "09:30",
      gunUtcMs: gunAt("2026-04-20T09:30:00Z"),
      finishSeconds: 2 * 3600,
      ...evenCourse(2 * 3600),
    });
    expect(clocks(rows)).toEqual([
      "pre 09:00",
      "start 09:30",
      "hour 10:00",
      "hour 11:00",
      "finish 11:30",
    ]);
    expect(rows[0].offsetMinutes).toBe(-30);
  });

  it("backs a full hour off an on-the-hour gun, and emits no duplicate start row", () => {
    // The trap: with the pre row at -0 and the first hour row at +0 this would
    // print 09:00 three times over.
    const rows = build({
      startHHMM: "09:00",
      gunUtcMs: gunAt("2026-04-20T09:00:00Z"),
      finishSeconds: 2 * 3600,
      ...evenCourse(2 * 3600),
    });
    expect(clocks(rows)).toEqual([
      "pre 08:00",
      "start 09:00",
      "hour 10:00",
      "finish 11:00",
    ]);
    expect(rows[0].offsetMinutes).toBe(-60);
  });

  it("emits one row, not two, for a finish landing exactly on the hour", () => {
    const rows = build({
      startHHMM: "09:00",
      gunUtcMs: gunAt("2026-04-20T09:00:00Z"),
      finishSeconds: 3 * 3600,
      ...evenCourse(3 * 3600),
    });
    // 12:00 is the finish. The hour loop must stop strictly short of it.
    expect(clocks(rows).filter((c) => c.endsWith("12:00"))).toEqual([
      "finish 12:00",
    ]);
  });

  it("crosses noon in order", () => {
    const rows = build({
      startHHMM: "10:30",
      gunUtcMs: gunAt("2026-04-20T10:30:00Z"),
      finishSeconds: 3 * 3600,
      ...evenCourse(3 * 3600),
    });
    expect(clocks(rows)).toEqual([
      "pre 10:00",
      "start 10:30",
      "hour 11:00",
      "hour 12:00",
      "hour 13:00",
      "finish 13:30",
    ]);
  });

  it("wraps past midnight without producing a 25th hour", () => {
    const rows = build({
      startHHMM: "22:00",
      gunUtcMs: gunAt("2026-04-20T22:00:00Z"),
      finishSeconds: 4 * 3600,
      ...evenCourse(4 * 3600),
    });
    expect(clocks(rows)).toEqual([
      "pre 21:00",
      "start 22:00",
      "hour 23:00",
      "hour 00:00",
      "hour 01:00",
      "finish 02:00",
    ]);
    expect(rows.map((r) => r.nextDay)).toEqual([
      false,
      false,
      false,
      true,
      true,
      true,
    ]);
  });

  it("emits no hour rows when the race ends before the next whole hour", () => {
    // Deliberately a short duration: this exercises the placement rule, not a
    // plausible marathon. 09:05 plus 45 minutes clears no whole clock hour.
    const rows = build({
      startHHMM: "09:05",
      gunUtcMs: gunAt("2026-04-20T09:05:00Z"),
      finishSeconds: 45 * 60,
      ...evenCourse(45 * 60),
    });
    expect(clocks(rows)).toEqual(["pre 09:00", "start 09:05", "finish 09:50"]);
  });

  it("omits the pre-race row entirely when no earlier hour was fetched", () => {
    const rows = build({ lead: [] });
    expect(rows[0].kind).toBe("start");
    expect(rows.some((r) => r.kind === "pre")).toBe(false);
  });
});

describe("sampling on the provider hour grid", () => {
  it("reads the provider's own 11:00 value for the 11:00 row, not an interpolation", () => {
    // THE REGRESSION TEST for the half-hour origin smear. The gun is 09:40, so
    // `series[0]` is really the provider's 10:00 reading, and the engine's
    // "one hour elapsed" is 10:40. The 11:00 row must still be series[1]
    // exactly (tempC 1), never a blend around 10:40.
    const rows = build({
      startHHMM: "09:40",
      gunUtcMs: gunAt("2026-04-20T09:40:00Z"),
      finishSeconds: 3 * 3600,
      ...evenCourse(3 * 3600),
    });
    const elevenAM = rows.find((r) => r.clockHHMM === "11:00");
    expect(elevenAM?.conditions?.tempC).toBe(1);
    const tenAM = rows.find((r) => r.clockHHMM === "10:00");
    expect(tenAM?.conditions?.tempC).toBe(0);
  });

  it("interpolates honestly in a half-hour timezone", () => {
    // Kathmandu-style: the gun's wall clock is on the hour but the instant is
    // not, so every row lands between two real readings.
    const rows = build({
      startHHMM: "07:00",
      gunUtcMs: gunAt("2026-04-20T01:15:00Z"),
      finishSeconds: 2 * 3600,
      ...evenCourse(2 * 3600),
    });
    const hour = rows.find((r) => r.clockHHMM === "08:00");
    expect(hour?.conditions?.tempC).toBeGreaterThan(0);
    expect(hour?.conditions?.tempC).toBeLessThan(2);
    expect(Number.isInteger(hour?.conditions?.tempC)).toBe(false);
  });

  it("reads the pre-race row out of lead, never out of the start hour", () => {
    // The `conditionsAtElapsed` trap: a clamping sampler returns series[0] for
    // any negative offset, making this row a silent copy of the start row.
    const rows = build({
      startHHMM: "09:30",
      gunUtcMs: gunAt("2026-04-20T09:30:00Z"),
    });
    expect(rows[0].kind).toBe("pre");
    expect(rows[0].conditions?.tempC).toBe(-1);
    expect(rows[0].conditions?.tempC).not.toBe(rows[1].conditions?.tempC);
  });

  it("flags rows past the end of the window and holds the last known hour", () => {
    // 8 entries cover the gun plus 7 hours; this runner is out for 7.5.
    const finishSeconds = 7.5 * 3600;
    const rows = build({ finishSeconds, ...evenCourse(finishSeconds) });
    const last = rows[rows.length - 1];
    expect(last.kind).toBe("finish");
    expect(last.beyondSeries).toBe(true);
    expect(last.conditions?.tempC).toBe(7);
    // Everything inside the window must NOT be flagged.
    expect(rows.filter((r) => r.beyondSeries).length).toBeLessThan(rows.length);
    expect(rows[1].beyondSeries).toBe(false);
  });
});

describe("distance reached", () => {
  it("is null before the gun, zero at the start, and the full course at the finish", () => {
    const rows = build();
    expect(rows[0].distanceKm).toBeNull();
    expect(rows[1].distanceKm).toBe(0);
    expect(rows[rows.length - 1].distanceKm).toBeCloseTo(42.195, 6);
  });

  it("is monotone and matches even pacing at the hour rows", () => {
    const rows = build();
    const hours = rows.filter((r) => r.kind === "hour");
    // 3-hour even-pace race: 14.065 km per hour.
    expect(hours[0].distanceKm).toBeCloseTo(14.065, 2);
    expect(hours[1].distanceKm).toBeCloseTo(28.13, 2);
    const walked = rows
      .map((r) => r.distanceKm)
      .filter((d): d is number => d !== null);
    for (let i = 1; i < walked.length; i++) {
      expect(walked[i]).toBeGreaterThanOrEqual(walked[i - 1]);
    }
  });
});

describe("refusals", () => {
  it("returns nothing rather than a frame around nothing", () => {
    expect(build({ series: [] })).toEqual([]);
    expect(build({ startHHMM: "" })).toEqual([]);
    expect(build({ startHHMM: "25:00" })).toEqual([]);
    expect(build({ finishSeconds: 0, ...evenCourse(1) })).toEqual([]);
    expect(build({ gunUtcMs: Number.NaN })).toEqual([]);
  });
});

describe("skyIconFor", () => {
  const base: WeatherConditions = {
    tempC: 12,
    humidity: 60,
    windSpeed: 3,
    windDirection: 200,
  };

  it("never draws a sun over missing data", () => {
    expect(skyIconFor(base, "forecast")).toBe("unknown");
  });

  it("steps through the cloud thresholds", () => {
    expect(skyIconFor({ ...base, cloudCover: 0 }, "forecast")).toBe("clear");
    expect(skyIconFor({ ...base, cloudCover: 24 }, "forecast")).toBe("clear");
    expect(skyIconFor({ ...base, cloudCover: 25 }, "forecast")).toBe("partly");
    expect(skyIconFor({ ...base, cloudCover: 59 }, "forecast")).toBe("partly");
    expect(skyIconFor({ ...base, cloudCover: 60 }, "forecast")).toBe("cloudy");
    expect(skyIconFor({ ...base, cloudCover: 100 }, "forecast")).toBe("cloudy");
  });

  it("draws rain at even odds for a forecast and a climatology", () => {
    const wet = { ...base, cloudCover: 90, precipProbability: 60 };
    expect(skyIconFor(wet, "forecast")).toBe("rain");
    expect(skyIconFor(wet, "typical")).toBe("rain");
  });

  it("draws rain on a past day only when rain actually fell", () => {
    // A recorded morning emits 0 or 100 and nothing between, so a 60 here
    // could only come from a source confusion. It must not read as rain.
    expect(
      skyIconFor({ ...base, cloudCover: 90, precipProbability: 60 }, "historical"),
    ).toBe("cloudy");
    expect(
      skyIconFor({ ...base, cloudCover: 90, precipProbability: 100 }, "historical"),
    ).toBe("rain");
  });

  it("falls back to the sky when the odds are against rain", () => {
    expect(
      skyIconFor({ ...base, cloudCover: 10, precipProbability: 5 }, "forecast"),
    ).toBe("clear");
  });
});
