import { describe, it, expect } from "vitest";
import { computePaceChart } from "./index";
import { buildSegments, MARATHON_KM, MILE_IN_KM } from "./segments";
import type {
  Course,
  PaceChartRow,
  PacingInput,
  Segment,
  SplitStrategy,
  StartStrategy,
  WeatherAdjustments,
} from "@/types";

const courseFrom = (elevations: number[]): Course => ({
  id: "berlin",
  displayName: "Test Marathon",
  city: "Testville",
  countryCode: "DE",
  countryName: "Germany",
  regionCode: null,
  regionName: null,
  elevations,
  profile: [],
  coords: Array.from({ length: 44 }, (_, i) => [0, i * 0.009]),
  start: { lat: 0, lon: 0 },
  timezone: "UTC",
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
      heatMultipliers: new Array(segCount).fill(1),
      windMultipliers: new Array(segCount).fill(1),
    };
    expect(computePaceChart(input, course, identity)).toEqual(base);
  });

  it("a uniform heat multiplier extends the finish proportionally and is NOT re-normalized", () => {
    const heat: WeatherAdjustments = {
      heatMultipliers: new Array(segCount).fill(1.05),
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

  it("progressive heat: rising per-segment multipliers slow later km more", () => {
    const base = computePaceChart(input, course);
    // Linear ramp 1.00 → 1.08 across the race, like a warming fall morning.
    const heatMultipliers = Array.from(
      { length: segCount },
      (_, i) => 1 + (0.08 * i) / (segCount - 1),
    );
    const rows = computePaceChart(input, course, {
      heatMultipliers,
      windMultipliers: new Array(segCount).fill(1),
    });
    // First segment untouched, last slowed by the full 8%.
    expect(rows[0].adjustedPaceSecPerUnit).toBeCloseTo(
      base[0].adjustedPaceSecPerUnit,
      6,
    );
    expect(rows[segCount - 1].adjustedPaceSecPerUnit).toBeCloseTo(
      base[segCount - 1].adjustedPaceSecPerUnit * 1.08,
      6,
    );
    // The relative slowdown vs the elevation-only band grows monotonically.
    for (let i = 1; i < segCount; i++) {
      const prev =
        rows[i - 1].adjustedPaceSecPerUnit / base[i - 1].adjustedPaceSecPerUnit;
      const curr =
        rows[i].adjustedPaceSecPerUnit / base[i].adjustedPaceSecPerUnit;
      expect(curr).toBeGreaterThan(prev);
    }
  });

  it("per-segment wind multipliers scale each segment's pace independently", () => {
    const base = computePaceChart(input, course);
    const wind: WeatherAdjustments = {
      heatMultipliers: new Array(segCount).fill(1),
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

describe("computePaceChart — Phase 3 strategy layer", () => {
  const base: PacingInput = {
    goalTimeSeconds: 3 * 3600 + 30 * 60,
    courseId: "berlin",
    unit: "km",
  };
  const hilly = courseFrom(hilly44());
  const flat = courseFrom(flat44());

  const SPLITS: SplitStrategy[] = [
    "even-effort",
    "even-pace",
    "negative",
    "negative-aggressive",
    "positive",
    "positive-aggressive",
  ];
  const STARTS: StartStrategy[] = ["even", "conservative", "very-conservative"];

  const finish = (rows: PaceChartRow[]) =>
    rows[rows.length - 1].cumulativeSplitSeconds;

  /** Elapsed time at the halfway point of the race, by distance. */
  const halfwaySeconds = (rows: PaceChartRow[], segs: Segment[]) => {
    let elapsed = 0;
    for (let i = 0; i < segs.length; i++) {
      const duration =
        rows[i].cumulativeSplitSeconds - (i === 0 ? 0 : rows[i - 1].cumulativeSplitSeconds);
      const half = MARATHON_KM / 2;
      if (segs[i].endDistanceKm >= half) {
        const frac =
          (half - segs[i].startDistanceKm) / segs[i].lengthKm;
        return elapsed + duration * frac;
      }
      elapsed += duration;
    }
    return elapsed;
  };

  it("the defaults are byte-identical to omitting the fields entirely", () => {
    // The guarantee behind every link already shared and every paceband
    // already printed: strategies existing must not move an existing chart.
    for (const course of [flat, hilly]) {
      for (const unit of ["km", "miles"] as const) {
        const legacy = computePaceChart({ ...base, unit }, course);
        expect(
          computePaceChart(
            { ...base, unit, split: "even-effort", start: "even" },
            course,
          ),
        ).toEqual(legacy);
      }
    }
  });

  it("every split × start combination still finishes exactly on the goal", () => {
    for (const unit of ["km", "miles"] as const) {
      for (const split of SPLITS) {
        for (const start of STARTS) {
          const rows = computePaceChart(
            { ...base, unit, split, start },
            hilly,
          );
          expect(
            finish(rows),
            `${unit}/${split}/${start}`,
          ).toBeCloseTo(base.goalTimeSeconds, 6);
        }
      }
    }
  });

  it("negative splits run the second half faster, positive slower, even equal", () => {
    const segs = buildSegments(flat44(), "km");
    const half = base.goalTimeSeconds / 2;
    const firstHalf = (split: SplitStrategy) =>
      halfwaySeconds(computePaceChart({ ...base, split }, flat), segs);

    expect(firstHalf("even-effort")).toBeCloseTo(half, 6);
    expect(firstHalf("negative")).toBeGreaterThan(half);
    expect(firstHalf("positive")).toBeLessThan(half);
  });

  it("a standard split differential is ≈ its bias, and aggressive is bigger", () => {
    const segs = buildSegments(flat44(), "km");
    const half = base.goalTimeSeconds / 2;
    const differential = (split: SplitStrategy) =>
      halfwaySeconds(computePaceChart({ ...base, split }, flat), segs) - half;

    // b = 1.5% of a half (6300 s) ≈ 94 s of half-to-half spread, i.e. ~47 s
    // either side of the midpoint.
    expect(differential("negative")).toBeGreaterThan(40);
    expect(differential("negative")).toBeLessThan(55);
    expect(differential("negative-aggressive")).toBeGreaterThan(
      differential("negative"),
    );
    expect(differential("positive-aggressive")).toBeLessThan(
      differential("positive"),
    );
  });

  it("a conservative start slows the opening km and quickens everything after", () => {
    const rows = computePaceChart({ ...base, start: "conservative" }, flat);
    const plain = computePaceChart(base, flat);
    expect(rows[0].adjustedPaceSecPerUnit).toBeGreaterThan(
      plain[0].adjustedPaceSecPerUnit,
    );
    // Paid back: by the closing kilometres the runner is ahead of even pace.
    expect(rows[rows.length - 1].adjustedPaceSecPerUnit).toBeLessThan(
      plain[rows.length - 1].adjustedPaceSecPerUnit,
    );
    // And the penalty itself decays — km 2 is held back less than km 1.
    const heldBack = (i: number) =>
      rows[i].adjustedPaceSecPerUnit / plain[i].adjustedPaceSecPerUnit;
    expect(heldBack(1)).toBeLessThan(heldBack(0));
    expect(finish(rows)).toBeCloseTo(base.goalTimeSeconds, 6);
  });

  it("very conservative holds back harder than conservative", () => {
    const mild = computePaceChart({ ...base, start: "conservative" }, flat);
    const hard = computePaceChart({ ...base, start: "very-conservative" }, flat);
    expect(hard[0].adjustedPaceSecPerUnit).toBeGreaterThan(
      mild[0].adjustedPaceSecPerUnit,
    );
  });

  it("even-pace ignores the terrain that even-effort responds to", () => {
    // hilly44 is a uniform ramp, so even effort is nearly flat-paced on it
    // too — the contrast needs a course whose grade actually varies.
    const rolling = courseFrom(
      Array.from({ length: 44 }, (_, i) => 50 + 40 * Math.sin(i / 3)),
    );
    const evenPace = computePaceChart({ ...base, split: "even-pace" }, rolling);
    const evenEffort = computePaceChart(base, rolling);
    const full = evenPace.slice(0, -1); // the 195 m tail is a partial segment
    for (const row of full) {
      expect(row.adjustedPaceSecPerUnit).toBeCloseTo(
        full[0].adjustedPaceSecPerUnit,
        6,
      );
    }
    // The same course under even effort is not flat-paced — the climb costs.
    const effortPaces = evenEffort.slice(0, -1).map((r) => r.adjustedPaceSecPerUnit);
    expect(Math.max(...effortPaces) - Math.min(...effortPaces)).toBeGreaterThan(1);
  });

  it("the two controls compose rather than override each other", () => {
    const both = computePaceChart(
      { ...base, split: "negative", start: "conservative" },
      hilly,
    );
    const splitOnly = computePaceChart({ ...base, split: "negative" }, hilly);
    const startOnly = computePaceChart({ ...base, start: "conservative" }, hilly);
    expect(both).not.toEqual(splitOnly);
    expect(both).not.toEqual(startOnly);
    // The start penalty is still visible on top of the split ramp.
    expect(both[0].adjustedPaceSecPerUnit).toBeGreaterThan(
      splitOnly[0].adjustedPaceSecPerUnit,
    );
    expect(finish(both)).toBeCloseTo(base.goalTimeSeconds, 6);
  });

  it("the weather layer still composes on top of a biased band", () => {
    const input: PacingInput = {
      ...base,
      split: "negative-aggressive",
      start: "conservative",
    };
    const segCount = buildSegments(hilly44(), "km").length;
    const biased = computePaceChart(input, hilly);
    const identity: WeatherAdjustments = {
      heatMultipliers: new Array(segCount).fill(1),
      windMultipliers: new Array(segCount).fill(1),
    };
    expect(computePaceChart(input, hilly, identity)).toEqual(biased);

    const hot = computePaceChart(input, hilly, {
      heatMultipliers: new Array(segCount).fill(1.05),
      windMultipliers: new Array(segCount).fill(1),
    });
    expect(finish(hot)).toBeCloseTo(base.goalTimeSeconds * 1.05, 6);
  });
});
