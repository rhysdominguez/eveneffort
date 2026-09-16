import { describe, it, expect } from "vitest";
import { DEFAULT_BODY } from "@/types";
import { buildSegments } from "@/lib/pacing/segments";
import {
  airDensityKgM3,
  buildWindMultipliers,
  coordAt,
  headwindComponent,
  pressureAtElevationPa,
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

  // ROADMAP #7a. Before this the pressure was pinned at sea level, so a race at
  // 2,000 m got sea-level drag.
  it("defaults to sea level, so nothing that predates #7a moved", () => {
    expect(airDensityKgM3(15, 0)).toBe(airDensityKgM3(15));
    expect(airDensityKgM3(22, 0)).toBe(airDensityKgM3(22));
  });

  it("thins with height", () => {
    expect(airDensityKgM3(15, 1609)).toBeLessThan(airDensityKgM3(15));
    // Denver: ~82% of sea-level density, hence ~18% less drag.
    expect(airDensityKgM3(15, 1609) / airDensityKgM3(15)).toBeCloseTo(0.82, 2);
  });
});

describe("pressureAtElevationPa", () => {
  it("is the ISA standard at sea level", () => {
    expect(pressureAtElevationPa(0)).toBeCloseTo(101325, 6);
  });

  it("matches published standard-atmosphere pressures", () => {
    // ISA table values, to within a tenth of a kPa.
    expect(pressureAtElevationPa(1000)).toBeCloseTo(89875, -2);
    expect(pressureAtElevationPa(2000)).toBeCloseTo(79495, -2);
    expect(pressureAtElevationPa(5000)).toBeCloseTo(54020, -2);
  });

  it("falls monotonically and never goes negative", () => {
    let previous = Infinity;
    for (let m = 0; m <= 9000; m += 250) {
      const p = pressureAtElevationPa(m);
      expect(p).toBeLessThan(previous);
      expect(p).toBeGreaterThan(0);
      previous = p;
    }
  });

  it("clamps below sea level rather than extrapolating", () => {
    expect(pressureAtElevationPa(-400)).toBe(101325);
  });
});

describe("windMultiplier", () => {
  const speed = 3.5; // m/s, ~4:46 /km

  it("is exactly 1.0 in still air", () => {
    expect(windMultiplier(DEFAULT_BODY, speed, 0, 0, 0)).toBe(1);
  });

  it("is still exactly 1.0 in still air at altitude", () => {
    // The still-air baseline is subtracted at whatever the local density is, so
    // thin air changes how much the WIND costs, never the no-wind case.
    expect(windMultiplier(DEFAULT_BODY, speed, 0, 0, 0, 15, 2500)).toBe(1);
  });

  it("makes a headwind cost less in thin air", () => {
    const seaLevel = windMultiplier(DEFAULT_BODY, speed, 0, 8, 0, 15, 0);
    const high = windMultiplier(DEFAULT_BODY, speed, 0, 8, 0, 15, 2500);
    expect(seaLevel).toBeGreaterThan(1);
    expect(high).toBeGreaterThan(1);
    expect(high).toBeLessThan(seaLevel);
  });

  it("makes a tailwind help less in thin air", () => {
    const seaLevel = windMultiplier(DEFAULT_BODY, speed, 0, 8, 180, 15, 0);
    const high = windMultiplier(DEFAULT_BODY, speed, 0, 8, 180, 15, 2500);
    expect(seaLevel).toBeLessThan(1);
    expect(high).toBeGreaterThan(seaLevel);
    expect(high).toBeLessThan(1);
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
