// @vitest-environment node
//
// Opt-in integration test against the real Tomorrow.io API. Everything else in
// the weather suite is pure and offline; this is the one place that proves the
// contract we assume — endpoint shape, field names, and units — actually holds.
//
// It SKIPS silently when no key is present, so `npm run test` stays green for
// contributors and in CI without secrets. To run it:
//
//   1. cp .env.example .env.local  and paste your key, or
//   2. TOMORROW_IO_API_KEY=xxx npm run test -- forecast.live
//
// It costs a handful of API calls against the free tier's daily quota.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { buildForecastUrl, selectHourlyWindow } from "./forecast";
import { zonedWallClockToUTC } from "./timezone";
import { COURSES } from "@/data/courses";

/** Vitest doesn't load .env.local the way Next does, so read it directly. */
function readKey(): string | undefined {
  if (process.env.TOMORROW_IO_API_KEY) return process.env.TOMORROW_IO_API_KEY;
  try {
    const text = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    const line = text
      .split("\n")
      .find((l) => l.trim().startsWith("TOMORROW_IO_API_KEY="));
    const value = line?.split("=").slice(1).join("=").trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}

const apiKey = readKey();

describe.skipIf(!apiKey)("Tomorrow.io — live forecast retrieval", () => {
  const berlin = COURSES.berlin;

  it("returns an hourly timeline with the fields we map", async () => {
    const res = await fetch(buildForecastUrl(berlin.start.lat, berlin.start.lon, apiKey!), {
      headers: { accept: "application/json" },
    });
    expect(res.ok, `HTTP ${res.status}: ${await res.clone().text()}`).toBe(true);

    const data = await res.json();
    const hourly = data?.timelines?.hourly;
    expect(Array.isArray(hourly), "timelines.hourly must be an array").toBe(true);
    expect(hourly.length).toBeGreaterThan(0);

    // The four values the pacing engine consumes must all be present and sane.
    const v = hourly[0].values;
    expect(typeof hourly[0].time).toBe("string");
    expect(v.temperature).toBeTypeOf("number");
    expect(v.humidity).toBeGreaterThanOrEqual(0);
    expect(v.humidity).toBeLessThanOrEqual(100);
    expect(v.windSpeed).toBeGreaterThanOrEqual(0);
    expect(v.windDirection).toBeGreaterThanOrEqual(0);
    expect(v.windDirection).toBeLessThanOrEqual(360);

    // units=metric must mean m/s, not km/h — the canonical unit of
    // WeatherConditions.windSpeed. Surface wind above ~40 m/s is a hurricane,
    // so a km/h payload would almost certainly trip this.
    expect(v.windSpeed).toBeLessThan(40);
  });

  it("selects a usable window for a start time inside the horizon", async () => {
    const res = await fetch(buildForecastUrl(berlin.start.lat, berlin.start.lon, apiKey!), {
      headers: { accept: "application/json" },
    });
    const data = await res.json();

    // Tomorrow.io's hourly timeline reaches only ~5 days out, so target a race
    // "tomorrow" rather than a real marathon date, which would be months away.
    const tomorrow = new Date(Date.now() + 86_400_000)
      .toISOString()
      .slice(0, 10);
    const target = zonedWallClockToUTC(tomorrow, "09:15", berlin.timezone)!;

    const hours = selectHourlyWindow(data, target);
    expect(hours, "expected a window within the forecast horizon").not.toBeNull();
    expect(hours!.length).toBeGreaterThan(0);
    for (const h of hours!) {
      expect(Number.isFinite(h.tempC)).toBe(true);
      expect(Number.isFinite(h.humidity)).toBe(true);
      expect(Number.isFinite(h.windSpeed)).toBe(true);
      expect(Number.isFinite(h.windDirection)).toBe(true);
    }
  });

  it("rejects a race date beyond the forecast horizon instead of guessing", async () => {
    const res = await fetch(buildForecastUrl(berlin.start.lat, berlin.start.lon, apiKey!), {
      headers: { accept: "application/json" },
    });
    const data = await res.json();

    const farOut = new Date(Date.now() + 120 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const target = zonedWallClockToUTC(farOut, "09:15", berlin.timezone)!;
    expect(selectHourlyWindow(data, target)).toBeNull();
  });
});
