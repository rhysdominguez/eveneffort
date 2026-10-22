import { describe, it, expect } from "vitest";
import {
  SPARKLINE_HEIGHT,
  SPARKLINE_MIN_SPAN_M,
  SPARKLINE_VIEWBOX,
  SPARKLINE_WIDTH,
  elevationSparklinePath,
} from "./sparkline";
import { loadGeometry } from "@/data/courses.fixture";

/** The [x, y] of every vertex in a path this module emitted. */
function points(d: string): [number, number][] {
  return d
    .split(/[ML]/)
    .filter(Boolean)
    .map((p) => p.split(" ").map(Number) as [number, number]);
}

const ys = (d: string) => points(d).map(([, y]) => y);
const relief = (d: string) => Math.max(...ys(d)) - Math.min(...ys(d));

/** 44 points climbing evenly from 0 to `rise` metres. */
const ramp = (rise: number) =>
  Array.from({ length: 44 }, (_, i) => (i / 43) * rise);

describe("elevationSparklinePath", () => {
  it("emits 44 vertices spanning the course, the last at the 42.195 km finish", () => {
    const pts = points(elevationSparklinePath(ramp(50)));
    expect(pts).toHaveLength(44);
    expect(pts[0][0]).toBe(0);
    expect(pts[1][0]).toBe(2);
    expect(pts[42][0]).toBe(84);
    // Two units per kilometre, so the last step is the 0.195 km stub, not a
    // whole kilometre.
    expect(pts[43][0]).toBeCloseTo(84.4, 1);
    expect(SPARKLINE_WIDTH).toBeCloseTo(87.4, 1);
    expect(SPARKLINE_VIEWBOX).toBe(`-1.5 -1.5 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`);
  });

  it("draws a course whose elevations are all equal as a flat line, not NaN", () => {
    const d = elevationSparklinePath(new Array(44).fill(317));
    expect(d).not.toMatch(/NaN|Infinity/);
    expect(new Set(ys(d)).size).toBe(1);
  });

  it("sits every course on its own minimum, so altitude does not move the shape", () => {
    const sea = ramp(60);
    const high = sea.map((e) => e + 2400);
    expect(elevationSparklinePath(high)).toBe(elevationSparklinePath(sea));
  });

  it("uses ONE scale for every course under the floor: relief is proportional to metres", () => {
    // Per-course scaling would give both of these the same height.
    const small = relief(elevationSparklinePath(ramp(10)));
    const big = relief(elevationSparklinePath(ramp(100)));
    expect(big / small).toBeCloseTo(10, 0);
  });

  it("fills the band at exactly the floor span, and fits taller courses to it whole", () => {
    const full = elevationSparklinePath(ramp(SPARKLINE_MIN_SPAN_M));
    expect(Math.min(...ys(full))).toBeCloseTo(0, 1);
    expect(Math.max(...ys(full))).toBeCloseTo(25, 1);

    // Past the floor nothing runs off the band, which is what the first draft
    // did: it rendered a mountain course as two stubs. Every vertex stays inside.
    for (const rise of [SPARKLINE_MIN_SPAN_M * 4, 2350]) {
      const tall = ys(elevationSparklinePath(ramp(rise)));
      expect(Math.min(...tall)).toBeCloseTo(0, 1);
      expect(Math.max(...tall)).toBeCloseTo(25, 1);
    }
  });

  it("keeps a flat course flat and draws a mountain course whole, on real data", () => {
    const flat = relief(
      elevationSparklinePath(loadGeometry("chicago").elevations),
    );
    const mountain = ys(
      elevationSparklinePath(loadGeometry("pikes-peak-marathon").elevations),
    );
    // Chicago has 6 m of relief, about 3% of the floor.
    expect(flat).toBeLessThan(2);
    expect(Math.min(...mountain)).toBeCloseTo(0, 1);
    expect(Math.max(...mountain)).toBeCloseTo(25, 1);
  });

  it("rejects anything that is not 44 finite numbers", () => {
    expect(() => elevationSparklinePath([])).toThrow(/44/);
    expect(() => elevationSparklinePath(ramp(10).slice(1))).toThrow(/44/);
    const bad = ramp(10);
    bad[7] = NaN;
    expect(() => elevationSparklinePath(bad)).toThrow(/44/);
  });
});
