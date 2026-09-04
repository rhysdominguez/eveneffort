import { describe, it, expect } from "vitest";
import {
  distanceAtViewBoxX,
  nearestPointIndex,
  rowIndexForDistance,
  truncateProfileToMarathon,
  formatFeet,
  formatSignedFeet,
  formatChartDistance,
} from "./geometry";
import { MARATHON_KM, MILE_IN_KM } from "@/lib/pacing/segments";

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
