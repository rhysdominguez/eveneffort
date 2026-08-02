import { describe, it, expect } from "vitest";
import { buildResultsHref, parseResultsParams } from "./resultsParams";
import type { PacingInput } from "@/types";

function paramsFromHref(href: string): Record<string, string> {
  const qs = href.slice(href.indexOf("?") + 1);
  return Object.fromEntries(new URLSearchParams(qs));
}

describe("resultsParams", () => {
  const input: PacingInput = {
    courseId: "berlin",
    unit: "km",
    goalTimeSeconds: 14400,
  };

  it("roundtrips build -> parse losslessly", () => {
    const parsed = parseResultsParams(paramsFromHref(buildResultsHref(input)));
    expect(parsed).toEqual({ ok: true, input });
  });

  it("rejects an unknown course", () => {
    const r = parseResultsParams({
      courseId: "atlantis",
      unit: "km",
      goalTimeSeconds: "14400",
    });
    expect(r.ok).toBe(false);
  });

  it("rejects an invalid unit", () => {
    const r = parseResultsParams({
      courseId: "berlin",
      unit: "leagues",
      goalTimeSeconds: "14400",
    });
    expect(r.ok).toBe(false);
  });

  it("rejects missing/zero/negative/non-numeric goal time", () => {
    for (const goalTimeSeconds of [undefined, "0", "-1", "abc"]) {
      const r = parseResultsParams({
        courseId: "berlin",
        unit: "km",
        ...(goalTimeSeconds === undefined ? {} : { goalTimeSeconds }),
      });
      expect(r.ok).toBe(false);
    }
  });

  it("takes the first value when a param is repeated", () => {
    const r = parseResultsParams({
      courseId: ["berlin", "tokyo"],
      unit: ["km"],
      goalTimeSeconds: ["14400"],
    });
    expect(r).toEqual({ ok: true, input });
  });

  it("roundtrips Phase 2 optional params (date, time, weather, body)", () => {
    const full: PacingInput = {
      courseId: "berlin",
      unit: "km",
      goalTimeSeconds: 14400,
      raceDateISO: "2026-09-21",
      raceStartTime: "08:00",
      weather: { tempC: 18, humidity: 60, windSpeed: 5, windDirection: 270 },
      body: { massKg: 72, heightCm: 178 },
      fueling: { carbsPerHour: 80 },
    };
    const parsed = parseResultsParams(paramsFromHref(buildResultsHref(full)));
    expect(parsed).toEqual({ ok: true, input: full });
  });

  it("treats an absent carbs param as fueling off", () => {
    const r = parseResultsParams({
      courseId: "berlin",
      unit: "km",
      goalTimeSeconds: "14400",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.input.fueling).toBeUndefined();
  });

  it("ignores a carbs value outside the slider range", () => {
    for (const carbs of ["25", "150", "abc"]) {
      const r = parseResultsParams({
        courseId: "berlin",
        unit: "km",
        goalTimeSeconds: "14400",
        carbs,
      });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.input.fueling).toBeUndefined();
    }
  });

  it("omits the carbs param entirely when fueling is off", () => {
    expect(buildResultsHref(input)).not.toContain("carbs");
  });

  it("ignores partial weather (needs all four fields)", () => {
    const r = parseResultsParams({
      courseId: "berlin",
      unit: "km",
      goalTimeSeconds: "14400",
      temp: "18",
      hum: "60",
      // missing wind + wdir
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.input.weather).toBeUndefined();
  });

  it("still parses a legacy Phase 1 URL with no optional params", () => {
    const parsed = parseResultsParams(paramsFromHref(buildResultsHref(input)));
    expect(parsed).toEqual({ ok: true, input });
  });
});
