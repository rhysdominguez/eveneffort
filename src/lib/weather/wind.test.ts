import { describe, it, expect } from "vitest";
import { DEFAULT_BODY } from "@/types";
import { buildSegments } from "@/lib/pacing/segments";
import {
  buildWindMultipliers,
  coordAt,
  headwindComponent,
  segmentBearing,
  windAtRunnerHeight,
  windMultiplier,
} from "./wind";

describe("segmentBearing", () => {
  it("returns cardinal bearings for N/E/S/W legs", () => {
    expect(segmentBearing(0, 0, 1, 0)).toBeCloseTo(0, 4); // north
    expect(segmentBearing(0, 0, 0, 1)).toBeCloseTo(90, 4); // east
    expect(segmentBearing(0, 0, -1, 0)).toBeCloseTo(180, 4); // south
    expect(segmentBearing(0, 0, 0, -1)).toBeCloseTo(270, 4); // west
  });
});

describe("windAtRunnerHeight", () => {
  it("scales a 10 m wind down to runner height (~56.6%)", () => {
    expect(windAtRunnerHeight(10)).toBeCloseTo(5.66, 1);
    expect(windAtRunnerHeight(10)).toBeLessThan(10);
    expect(windAtRunnerHeight(0)).toBe(0);
  });
});

describe("headwindComponent", () => {
  it("is positive into the wind, negative with the wind", () => {
    // wind FROM the north, running north → full headwind.
    expect(headwindComponent(0, 0, 5)).toBeCloseTo(5, 6);
    // wind FROM the south, running north → full tailwind.
    expect(headwindComponent(0, 180, 5)).toBeCloseTo(-5, 6);
    // crosswind → ~0 along-travel component.
    expect(headwindComponent(0, 90, 5)).toBeCloseTo(0, 6);
  });
});

describe("windMultiplier", () => {
  const speed = 3.5; // m/s, ~4:46 /km

  it("is exactly 1.0 in still air", () => {
    expect(windMultiplier(DEFAULT_BODY, speed, 0, 0, 0)).toBe(1);
  });

  it("a headwind slows (>1), a tailwind helps (<1)", () => {
    const head = windMultiplier(DEFAULT_BODY, speed, 0, 10, 0);
    const tail = windMultiplier(DEFAULT_BODY, speed, 0, 10, 180);
    expect(head).toBeGreaterThan(1);
    expect(tail).toBeLessThan(1);
  });

  it("headwind hurts more than an equal tailwind helps (drag asymmetry)", () => {
    const head = windMultiplier(DEFAULT_BODY, speed, 0, 10, 0);
    const tail = windMultiplier(DEFAULT_BODY, speed, 0, 10, 180);
    expect(head - 1).toBeGreaterThan(1 - tail);
  });
});

describe("coordAt", () => {
  const coords: [number, number][] = Array.from({ length: 44 }, (_, i) => [
    0,
    i, // longitude increases 1° per km mark
  ]);

  it("returns endpoints exactly and interpolates the middle", () => {
    expect(coordAt(coords, 0)).toEqual([0, 0]);
    expect(coordAt(coords, 42.195)).toEqual([0, 43]);
    const [, lon] = coordAt(coords, 10.5);
    expect(lon).toBeCloseTo(10.5, 6);
  });
});

describe("buildWindMultipliers", () => {
  const segments = buildSegments(new Array(44).fill(0), "km");
  const coords: [number, number][] = Array.from({ length: 44 }, (_, i) => [
    0,
    i * 0.009, // ~1 km eastward steps
  ]);
  const speeds = segments.map(() => 3.5);

  it("returns one multiplier per segment, all 1.0 with no wind", () => {
    const m = buildWindMultipliers(segments, coords, DEFAULT_BODY, speeds, {
      tempC: 15,
      humidity: 50,
      windSpeed: 0,
      windDirection: 0,
    });
    expect(m).toHaveLength(segments.length);
    for (const v of m) expect(v).toBeCloseTo(1, 10);
  });
});
