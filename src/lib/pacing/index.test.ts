import { describe, it, expect } from "vitest";
import { computePaceChart } from "./index";
import { buildSegments, MARATHON_KM, MILE_IN_KM } from "./segments";
import type { Course, PacingInput, WeatherAdjustments } from "@/types";

const courseFrom = (elevations: number[]): Course => ({
  id: "berlin",
  displayName: "Test Marathon",
  city: "Testville",
  elevations,
});

const flat44 = (): number[] => new Array(44).fill(0);

// Linear ramp 0 m → 100 m over the full 42.195 km (index i at km i; index 43 at the finish).
const hilly44 = (): number[] =>
  Array.from({ length: 44 }, (_, i) =>
    i === 43 ? 100 : (100 * i) / MARATHON_KM,
  );

describe("computePaceChart — flat course, km mode", () => {
  const input: PacingInput = {
    goalTimeSeconds: 3 * 3600 + 30 * 60,
    courseId: "berlin",
    unit: "km",
  };
  const rows = computePaceChart(input, courseFrom(flat44()));
  const segs = buildSegments(flat44(), "km");

  it("has 43 rows with identical pace = goal / 42.195", () => {
    const expected = (3 * 3600 + 30 * 60) / MARATHON_KM;
    expect(rows).toHaveLength(43);
    for (const r of rows) {
      expect(r.adjustedPaceSecPerUnit).toBeCloseTo(expected, 6);
    }
  });

  it("reconstructed total duration equals the goal time", () => {
    const total = rows.reduce(
      (acc, r, i) => acc + r.adjustedPaceSecPerUnit * segs[i].lengthKm,
      0,
    );
    expect(total).toBeCloseTo(input.goalTimeSeconds, 6);
    expect(rows[rows.length - 1].cumulativeSplitSeconds).toBeCloseTo(
      input.goalTimeSeconds,
      6,
    );
  });
});

describe("computePaceChart — flat course, miles mode", () => {
  const input: PacingInput = {
    goalTimeSeconds: 3 * 3600 + 30 * 60,
    courseId: "berlin",
    unit: "miles",
  };
  const rows = computePaceChart(input, courseFrom(flat44()));
  const segs = buildSegments(flat44(), "miles");

  it("has 27 rows with identical sec/mile pace", () => {
    expect(rows).toHaveLength(27);
    const first = rows[0].adjustedPaceSecPerUnit;
    for (const r of rows) {
      expect(r.adjustedPaceSecPerUnit).toBeCloseTo(first, 6);
    }
  });

  it("total time equals the goal exactly", () => {
    const total = rows.reduce(
      (acc, r, i) =>
        acc + (r.adjustedPaceSecPerUnit * segs[i].lengthKm) / MILE_IN_KM,
      0,
    );
    expect(total).toBeCloseTo(input.goalTimeSeconds, 6);
    expect(rows[rows.length - 1].cumulativeSplitSeconds).toBeCloseTo(
      input.goalTimeSeconds,
      6,
    );
  });
});

describe("computePaceChart — Boston 3:20 regression (damping + smoothing)", () => {
  // Real Boston per-km elevation profile.
  const boston = [
    138.0, 103.2, 98.1, 95.0, 91.6, 70.2, 56.2, 62.5, 62.1, 57.4, 51.7, 51.1,
    48.0, 50.1, 45.7, 45.8, 51.1, 56.2, 59.0, 47.9, 46.2, 43.1, 42.2, 44.2,
    48.8, 41.2, 20.4, 34.1, 29.8, 44.8, 41.8, 30.3, 44.8, 54.9, 67.4, 45.4,
    35.0, 33.4, 23.6, 7.8, 5.0, 3.6, 5.6, 5.1,
  ];
  const input: PacingInput = {
    goalTimeSeconds: 3 * 3600 + 20 * 60, // 3:20:00
    courseId: "berlin",
    unit: "miles",
  };
  const rows = computePaceChart(input, courseFrom(boston));
  const paces = rows.map((r) => r.adjustedPaceSecPerUnit);

  it("total time is exactly the goal", () => {
    expect(rows[rows.length - 1].cumulativeSplitSeconds).toBeCloseTo(
      input.goalTimeSeconds,
      6,
    );
  });

  it("produces a damped, commercial-magnitude band (not raw Minetti)", () => {
    // Raw Minetti would give ~85 s swing / mile 1 ≈ 6:49. Damped+smoothed
    // lands near the reference bands: mile 1 ≈ 7:23, swing ≈ 25 s.
    const swing = Math.max(...paces) - Math.min(...paces);
    expect(paces[0]).toBeGreaterThan(435); // ≈ 7:15+
    expect(paces[0]).toBeLessThan(450); // ≈ 7:30−
    expect(swing).toBeGreaterThan(15);
    expect(swing).toBeLessThan(40); // far below raw Minetti's ~85 s
  });
});

describe("computePaceChart — Phase 2 weather layer", () => {
  const input: PacingInput = {
    goalTimeSeconds: 4 * 3600,
    courseId: "berlin",
    unit: "km",
  };
  const course = courseFrom(hilly44());
  const segCount = buildSegments(hilly44(), "km").length;

  it("identity weather (×1 everywhere) is byte-identical to no weather", () => {
    const base = computePaceChart(input, course);
    const identity: WeatherAdjustments = {
      heatMultiplier: 1,
      windMultipliers: new Array(segCount).fill(1),
    };
    expect(computePaceChart(input, course, identity)).toEqual(base);
  });

  it("a global heat multiplier extends the finish proportionally and is NOT re-normalized", () => {
    const heat: WeatherAdjustments = {
      heatMultiplier: 1.05,
      windMultipliers: new Array(segCount).fill(1),
    };
    const rows = computePaceChart(input, course, heat);
    expect(rows[rows.length - 1].cumulativeSplitSeconds).toBeCloseTo(
      input.goalTimeSeconds * 1.05,
      6,
    );
    expect(rows[rows.length - 1].cumulativeSplitSeconds).toBeGreaterThan(
      input.goalTimeSeconds,
    );
  });

  it("per-segment wind multipliers scale each segment's pace independently", () => {
    const base = computePaceChart(input, course);
    const wind: WeatherAdjustments = {
      heatMultiplier: 1,
      windMultipliers: Array.from({ length: segCount }, (_, i) =>
        i === 0 ? 1.2 : 1,
      ),
    };
    const rows = computePaceChart(input, course, wind);
    expect(rows[0].adjustedPaceSecPerUnit).toBeCloseTo(
      base[0].adjustedPaceSecPerUnit * 1.2,
      6,
    );
    expect(rows[1].adjustedPaceSecPerUnit).toBeCloseTo(
      base[1].adjustedPaceSecPerUnit,
      6,
    );
  });
});

describe("computePaceChart — hilly course", () => {
  const input: PacingInput = {
    goalTimeSeconds: 4 * 3600,
    courseId: "berlin",
    unit: "km",
  };
  const rows = computePaceChart(input, courseFrom(hilly44()));
  const segs = buildSegments(hilly44(), "km");

  it("reconstructed total (pace × length) equals the goal time", () => {
    const total = rows.reduce(
      (acc, r, i) => acc + r.adjustedPaceSecPerUnit * segs[i].lengthKm,
      0,
    );
    expect(total).toBeCloseTo(input.goalTimeSeconds, 6);
  });

  it("final row cumulative split equals the goal time", () => {
    expect(rows[rows.length - 1].cumulativeSplitSeconds).toBeCloseTo(
      input.goalTimeSeconds,
      6,
    );
  });
});
