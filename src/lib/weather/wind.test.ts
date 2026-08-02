import { describe, it, expect } from "vitest";
import { DEFAULT_BODY } from "@/types";
import { buildSegments } from "@/lib/pacing/segments";
import {
  airDensityKgM3,
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

describe("airDensityKgM3", () => {
  it("reproduces the ISA standard 1.225 kg/m³ at 15 °C", () => {
    expect(airDensityKgM3(15)).toBeCloseTo(1.225, 3);
  });

  it("is thinner when warm, denser when cold", () => {
    expect(airDensityKgM3(30)).toBeLessThan(airDensityKgM3(15));
    expect(airDensityKgM3(0)).toBeGreaterThan(airDensityKgM3(15));
    // ~5% thinner at 30 °C than at 15 °C.
    expect(airDensityKgM3(30) / airDensityKgM3(15)).toBeCloseTo(0.95, 2);
  });
});

describe("windMultiplier", () => {
  const speed = 3.5; // m/s, ~4:46 /km

  it("is exactly 1.0 in still air", () => {
    expect(windMultiplier(DEFAULT_BODY, speed, 0, 0, 0)).toBe(1);
  });

  it("charges a smaller headwind penalty in hot (thin) air than cold air", () => {
    const hot = windMultiplier(DEFAULT_BODY, speed, 0, 10, 0, 30);
    const cold = windMultiplier(DEFAULT_BODY, speed, 0, 10, 0, 0);
    expect(hot).toBeGreaterThan(1);
    expect(cold).toBeGreaterThan(hot);
  });

  it("defaults to 15 °C density when no temperature is passed", () => {
    expect(windMultiplier(DEFAULT_BODY, speed, 0, 10, 0)).toBeCloseTo(
      windMultiplier(DEFAULT_BODY, speed, 0, 10, 0, 15),
      12,
    );
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

  const still = {
    tempC: 15,
    humidity: 50,
    windSpeed: 0,
    windDirection: 0,
  };

  it("returns one multiplier per segment, all 1.0 with no wind", () => {
    const m = buildWindMultipliers(
      segments,
      coords,
      DEFAULT_BODY,
      speeds,
      segments.map(() => still),
    );
    expect(m).toHaveLength(segments.length);
    for (const v of m) expect(v).toBeCloseTo(1, 10);
  });

  it("applies each segment's own conditions (wind arriving mid-race)", () => {
    // Calm for the first half, a headwind (from due east, into the eastward
    // course) for the second half.
    const weatherBySegment = segments.map((_, i) =>
      i < 20 ? still : { ...still, windSpeed: 8, windDirection: 90 },
    );
    const m = buildWindMultipliers(
      segments,
      coords,
      DEFAULT_BODY,
      speeds,
      weatherBySegment,
    );
    expect(m[0]).toBeCloseTo(1, 10);
    expect(m[25]).toBeGreaterThan(1);
  });
});
