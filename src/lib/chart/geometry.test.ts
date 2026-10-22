import { describe, it, expect } from "vitest";
import {
  columnIndexAtX,
  distanceAtViewBoxX,
  nearestPointIndex,
  rowIndexForDistance,
  rowRangeForDistanceRange,
  averagePaceOverRows,
  truncateProfileToMarathon,
  formatFeet,
  formatSignedFeet,
  formatChartDistance,
} from "./geometry";
import { MARATHON_KM, MILE_IN_KM } from "@/lib/pacing/segments";
import type { PaceChartRow } from "@/types";

// The chart's real plot geometry (M.left / PLOT_W in ElevationChart).
const LEFT = 56;
const WIDTH = 816;
const MAX = 42.195;

describe("distanceAtViewBoxX", () => {
  it("maps the plot edges to the start and finish", () => {
    expect(distanceAtViewBoxX(LEFT, MAX, LEFT, WIDTH)).toBe(0);
    expect(distanceAtViewBoxX(LEFT + WIDTH, MAX, LEFT, WIDTH)).toBe(MAX);
  });

  it("maps the midpoint to half the course", () => {
    expect(distanceAtViewBoxX(LEFT + WIDTH / 2, MAX, LEFT, WIDTH)).toBeCloseTo(
      MAX / 2,
      6,
    );
  });

  it("clamps outside the plot area rather than extrapolating", () => {
    expect(distanceAtViewBoxX(0, MAX, LEFT, WIDTH)).toBe(0);
    expect(distanceAtViewBoxX(-500, MAX, LEFT, WIDTH)).toBe(0);
    expect(distanceAtViewBoxX(10_000, MAX, LEFT, WIDTH)).toBe(MAX);
  });
});

describe("columnIndexAtX", () => {
  // A 430px plot starting at x = 100, split into 43 columns of exactly 10px.
  it("finds the column under the pointer", () => {
    expect(columnIndexAtX(100, 100, 430, 43)).toBe(0);
    expect(columnIndexAtX(109.9, 100, 430, 43)).toBe(0);
    expect(columnIndexAtX(110, 100, 430, 43)).toBe(1);
    expect(columnIndexAtX(315, 100, 430, 43)).toBe(21);
  });

  it("clamps at both edges rather than running off the chart", () => {
    expect(columnIndexAtX(40, 100, 430, 43)).toBe(0);
    expect(columnIndexAtX(530, 100, 430, 43)).toBe(42);
    expect(columnIndexAtX(9999, 100, 430, 43)).toBe(42);
  });

  it("returns null when there is nothing to hover", () => {
    expect(columnIndexAtX(5, 0, 0, 43)).toBeNull();
    expect(columnIndexAtX(5, 0, -10, 43)).toBeNull();
    expect(columnIndexAtX(5, 0, 100, 0)).toBeNull();
    expect(columnIndexAtX(Number.NaN, 0, 100, 43)).toBeNull();
  });
});

describe("nearestPointIndex", () => {
  // Deliberately uneven spacing — GPX trackpoints are not equidistant.
  const distances = [0, 0.4, 0.5, 2, 5, 5.05, 9, 20, 42.195];

  it("returns exact hits", () => {
    distances.forEach((d, i) => {
      expect(nearestPointIndex(distances, d)).toBe(i);
    });
  });

  it("snaps to whichever neighbour is closer", () => {
    expect(nearestPointIndex(distances, 0.41)).toBe(1);
    expect(nearestPointIndex(distances, 0.49)).toBe(2);
    expect(nearestPointIndex(distances, 1.4)).toBe(3);
    expect(nearestPointIndex(distances, 6.9)).toBe(5);
    expect(nearestPointIndex(distances, 7.1)).toBe(6);
  });

  it("breaks an exact tie toward the lower index", () => {
    expect(nearestPointIndex(distances, 0.45)).toBe(1);
  });

  it("clamps beyond both ends", () => {
    expect(nearestPointIndex(distances, -3)).toBe(0);
    expect(nearestPointIndex(distances, 99)).toBe(distances.length - 1);
  });

  it("handles a single-point and an empty column", () => {
    expect(nearestPointIndex([7], 100)).toBe(0);
    expect(nearestPointIndex([], 1)).toBe(-1);
  });

  it("agrees with a linear scan over a dense synthetic profile", () => {
    const dense = Array.from({ length: 3000 }, (_, i) => (i * MAX) / 2999);
    for (const probe of [0.001, 3.3, 17.77, 30, 42.19]) {
      const scan = dense.reduce(
        (best, d, i) =>
          Math.abs(d - probe) < Math.abs(dense[best] - probe) ? i : best,
        0,
      );
      expect(nearestPointIndex(dense, probe)).toBe(scan);
    }
  });
});

describe("rowIndexForDistance", () => {
  it("maps km distances to whole-km rows", () => {
    expect(rowIndexForDistance(0, "km", 43)).toBe(0);
    expect(rowIndexForDistance(0.99, "km", 43)).toBe(0);
    expect(rowIndexForDistance(1, "km", 43)).toBe(1);
    expect(rowIndexForDistance(17.4, "km", 43)).toBe(17);
  });

  it("maps miles distances by mile boundaries", () => {
    expect(rowIndexForDistance(MILE_IN_KM - 0.001, "miles", 27)).toBe(0);
    expect(rowIndexForDistance(MILE_IN_KM, "miles", 27)).toBe(1);
    expect(rowIndexForDistance(5 * MILE_IN_KM, "miles", 27)).toBe(5);
  });

  it("clamps the final partial segment to the last row", () => {
    expect(rowIndexForDistance(42.195, "km", 43)).toBe(42);
    expect(rowIndexForDistance(42.195, "miles", 27)).toBe(26);
  });

  it("returns -1 when there are no rows", () => {
    expect(rowIndexForDistance(10, "km", 0)).toBe(-1);
  });
});

describe("rowRangeForDistanceRange", () => {
  it("is the identity on whole-kilometre ranges in km mode", () => {
    // Boston's Newton climb: km 27 to 34 is rows 27..33, NOT 27..34. The naive
    // rowIndexForDistance(34) returns the row that starts at the top of the
    // climb, a kilometre the runner has already finished.
    expect(rowRangeForDistanceRange(27, 34, "km", 43)).toEqual([27, 33]);
    expect(rowRangeForDistanceRange(0, 1, "km", 43)).toEqual([0, 0]);
    expect(rowRangeForDistanceRange(11, 13, "km", 43)).toEqual([11, 12]);
  });

  it("keeps the 0.195 km finish row rather than measuring it as a clip", () => {
    // The last row is 0.195 km long, not 1 km. Against a nominal width it would
    // read as 19% covered and be dropped off every climb that reaches the line.
    expect(rowRangeForDistanceRange(38, MARATHON_KM, "km", 43)).toEqual([38, 42]);
    expect(rowRangeForDistanceRange(38, MARATHON_KM, "miles", 27)).toEqual([
      24, 26,
    ]);
  });

  it("drops a row the range only clips", () => {
    // Mile row 5 spans 8.047 to 9.656 km; a range ending at 8.3 covers 16% of
    // it, so the pace on that row is not this climb's pace.
    expect(rowRangeForDistanceRange(3, 8.3, "miles", 27)).toEqual([2, 4]);
    // Covering more than half keeps it.
    expect(rowRangeForDistanceRange(3, 9.2, "miles", 27)).toEqual([2, 5]);
  });

  it("returns a single row for a range shorter than one row", () => {
    expect(rowRangeForDistanceRange(8.1, 8.4, "miles", 27)).toEqual([5, 5]);
    expect(rowRangeForDistanceRange(17.2, 17.6, "km", 43)).toEqual([17, 17]);
  });

  it("returns null when there are no rows", () => {
    expect(rowRangeForDistanceRange(3, 8, "km", 0)).toBeNull();
  });
});

describe("averagePaceOverRows", () => {
  /** Rows from per-row seconds, so the cumulative column is the real running total. */
  const rowsFrom = (seconds: number[]): PaceChartRow[] => {
    let cumulative = 0;
    return seconds.map((s, i) => {
      cumulative += s;
      return {
        segmentLabel: String(i + 1),
        elevationDeltaM: 0,
        adjustedPaceSecPerUnit: s,
        adjustedPaceLabel: "",
        cumulativeSplitSeconds: cumulative,
        cumulativeSplitLabel: "",
      };
    });
  };

  it("is the elapsed time over the distance, in kilometres", () => {
    // Rows 27..33 at 250, 260, 270, 250, 240, 250, 260 s/km: 1780 s over 7 km.
    const seconds = new Array(43).fill(300);
    [250, 260, 270, 250, 240, 250, 260].forEach((s, i) => (seconds[27 + i] = s));
    expect(averagePaceOverRows(rowsFrom(seconds), [27, 33], "km")).toBeCloseTo(
      1780 / 7,
      9,
    );
  });

  it("is that row's own pace when the range is one row", () => {
    const seconds = new Array(43).fill(300);
    seconds[10] = 333;
    expect(averagePaceOverRows(rowsFrom(seconds), [10, 10], "km")).toBe(333);
  });

  it("starts from zero when the range opens at the first row", () => {
    expect(averagePaceOverRows(rowsFrom(new Array(43).fill(240)), [0, 3], "km")).toBe(
      240,
    );
  });

  it("measures the finish row at its real length, not as a whole unit", () => {
    // 42 rows at 300 s/km, then the 0.195 km stub run in 58.5 s (also 300 s/km).
    // Averaged as a whole kilometre the stub would drag the result to
    // (300*4 + 58.5) / 5 = 251.7 rather than the true 300.
    const seconds = new Array(43).fill(300);
    seconds[42] = 300 * (MARATHON_KM - 42);
    expect(averagePaceOverRows(rowsFrom(seconds), [38, 42], "km")).toBeCloseTo(300, 9);

    const mile = new Array(27).fill(480);
    mile[26] = 480 * ((MARATHON_KM - 26 * MILE_IN_KM) / MILE_IN_KM);
    expect(averagePaceOverRows(rowsFrom(mile), [24, 26], "miles")).toBeCloseTo(480, 9);
  });

  it("returns null rather than NaN for a range that does not exist", () => {
    const rows = rowsFrom(new Array(43).fill(300));
    expect(averagePaceOverRows(rows, [5, 2], "km")).toBeNull();
    expect(averagePaceOverRows(rows, [-1, 2], "km")).toBeNull();
    expect(averagePaceOverRows(rows, [40, 43], "km")).toBeNull();
    expect(averagePaceOverRows([], [0, 0], "km")).toBeNull();
  });
});

describe("truncateProfileToMarathon", () => {
  it("cuts a long track at the finish line and interpolates the endpoint", () => {
    // Bend's shape: overshoots to 42.7. The last kept raw point is 42.0.
    const profile: [number, number][] = [
      [0, 1100],
      [21, 1150],
      [42, 1200],
      [42.6, 1260],
      [42.7114, 1101],
    ];
    const out = truncateProfileToMarathon(profile);

    expect(out[out.length - 1][0]).toBe(MARATHON_KM);
    expect(out.every(([d]) => d <= MARATHON_KM)).toBe(true);
    // 42.195 sits 0.195/0.6 = 32.5% of the way from 42.0 to 42.6.
    expect(out[out.length - 1][1]).toBeCloseTo(1200 + 0.325 * 60, 6);
    // Everything up to the finish survives untouched.
    expect(out.slice(0, 3)).toEqual([
      [0, 1100],
      [21, 1150],
      [42, 1200],
    ]);
  });

  it("leaves a track that ends short of the finish untouched", () => {
    // Busselton ends at 41.5158 — no synthetic tail is invented.
    const profile: [number, number][] = [
      [0, 3],
      [20, 8],
      [41.5158, 4],
    ];
    expect(truncateProfileToMarathon(profile)).toEqual(profile);
  });

  it("leaves a track that lands exactly on the finish untouched", () => {
    const profile: [number, number][] = [
      [0, 3],
      [MARATHON_KM, 9],
    ];
    expect(truncateProfileToMarathon(profile)).toEqual(profile);
  });

  it("does not duplicate a point already sitting on the finish line", () => {
    const profile: [number, number][] = [
      [0, 3],
      [MARATHON_KM, 9],
      [42.9, 11],
    ];
    const out = truncateProfileToMarathon(profile);
    expect(out).toEqual([
      [0, 3],
      [MARATHON_KM, 9],
    ]);
  });

  it("keeps distances strictly ascending", () => {
    const profile: [number, number][] = [
      [0, 0],
      [42.19, 5],
      [42.8, 9],
    ];
    const out = truncateProfileToMarathon(profile);
    for (let i = 1; i < out.length; i++) {
      expect(out[i][0]).toBeGreaterThan(out[i - 1][0]);
    }
  });

  it("handles an empty profile", () => {
    expect(truncateProfileToMarathon([])).toEqual([]);
  });
});

describe("formatters", () => {
  it("rounds elevation to whole feet", () => {
    expect(formatFeet(311.6)).toBe("312 ft");
    expect(formatFeet(-40.2)).toBe("-40 ft");
  });

  it("signs the delta and uses a true minus for descents", () => {
    expect(formatSignedFeet(412.4)).toBe("+412 ft");
    expect(formatSignedFeet(-180.7)).toBe("−181 ft");
    expect(formatSignedFeet(0.2)).toBe("0 ft");
    expect(formatSignedFeet(-0.2)).toBe("0 ft");
  });

  it("formats distance in the active unit", () => {
    expect(formatChartDistance(12.44, "km")).toBe("12.4 km");
    expect(formatChartDistance(12.44, "miles")).toBe("7.7 mi");
    expect(formatChartDistance(42.195, "miles")).toBe("26.2 mi");
  });
});
