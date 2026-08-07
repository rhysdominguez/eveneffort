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

  // Courses are database rows now, so this parser — which is pure and
  // synchronous — can only vouch for the SHAPE of a slug. Whether the course
  // exists is proven by getCourseBySlug returning null, which /results and
  // /api/checkout both handle. So a well-formed but unknown slug parses fine
  // here on purpose, and only malformed ones are rejected.
  it("accepts a well-formed slug it has never heard of", () => {
    const r = parseResultsParams({
      courseId: "atlantis-marathon",
      unit: "km",
      goalTimeSeconds: "14400",
    });
    expect(r.ok).toBe(true);
  });

  it("rejects a missing or malformed course slug", () => {
    const base = { unit: "km", goalTimeSeconds: "14400" };
    for (const courseId of [
      undefined,
      "",
      "Berlin", // uppercase
      "-berlin", // leading hyphen
      "berlin marathon", // whitespace
      "berlin/../etc", // path traversal
      "b".repeat(65), // over the length cap
    ]) {
      expect(
        parseResultsParams({ ...base, courseId }).ok,
        `courseId: ${JSON.stringify(courseId)}`,
      ).toBe(false);
    }
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
