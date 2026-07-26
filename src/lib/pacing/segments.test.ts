import { describe, it, expect } from "vitest";
import {
  buildSegments,
  interpolateElevation,
  smoothElevations,
} from "./segments";

const flat44 = (): number[] => new Array(44).fill(0);
const ramp44 = (): number[] => Array.from({ length: 44 }, (_, i) => i);

describe("buildSegments validation", () => {
  it("throws when elevations length is not 44", () => {
    expect(() => buildSegments(new Array(43).fill(0), "km")).toThrow(
      "Elevations array must have exactly 44 entries",
    );
    expect(() => buildSegments(new Array(45).fill(0), "km")).toThrow(
      "Elevations array must have exactly 44 entries",
    );
  });
});

describe("buildSegments — km mode", () => {
  it("produces 43 flat segments with correct lengths", () => {
    const segs = buildSegments(flat44(), "km");
    expect(segs).toHaveLength(43);
    for (let i = 0; i < 42; i++) {
      expect(segs[i].lengthKm).toBe(1.0);
      expect(segs[i].gradient).toBe(0);
    }
    expect(segs[42].lengthKm).toBeCloseTo(0.195, 9);
    expect(segs[42].gradient).toBe(0);
  });

  it("computes gradient from elevation delta on a smoothing-invariant ramp", () => {
    // A linear ramp (+1 m/km) is invariant under the symmetric 3-tap smooth,
    // so the first km segment is 0→1 m over 1000 m = 0.001.
    const segs = buildSegments(ramp44(), "km");
    expect(segs[0].gradient).toBeCloseTo(0.001, 12);
    expect(segs[10].gradient).toBeCloseTo(0.001, 12);
  });

  it("smooths a lone elevation spike before computing grade", () => {
    // Raw spike of 10 m at km 1 would give gradient 0.01; smoothing spreads
    // it (km1 → 5 m) so the first segment gradient is halved to 0.005.
    const el = flat44();
    el[1] = 10;
    const segs = buildSegments(el, "km");
    expect(segs[0].gradient).toBeCloseTo(0.005, 12);
  });
});

describe("smoothElevations", () => {
  it("preserves length and both endpoints exactly", () => {
    const raw = Array.from({ length: 44 }, (_, i) => Math.sin(i) * 30 + i);
    const s = smoothElevations(raw);
    expect(s).toHaveLength(44);
    expect(s[0]).toBe(raw[0]);
    expect(s[43]).toBe(raw[43]);
  });

  it("does not mutate the input array", () => {
    const raw = flat44();
    raw[5] = 100;
    const copy = raw.slice();
    smoothElevations(raw);
    expect(raw).toEqual(copy);
  });

  it("is invariant on a linear ramp (real slopes preserved)", () => {
    const raw = ramp44();
    const s = smoothElevations(raw);
    for (let i = 0; i < 44; i++) expect(s[i]).toBeCloseTo(raw[i], 12);
  });

  it("reduces high-frequency variance of a noisy profile", () => {
    const raw = Array.from({ length: 44 }, (_, i) => (i % 2 === 0 ? 0 : 40));
    const s = smoothElevations(raw);
    const variance = (a: number[]) => {
      const m = a.reduce((x, y) => x + y, 0) / a.length;
      return a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length;
    };
    expect(variance(s)).toBeLessThan(variance(raw));
  });

  it("preserves net drop within ~1 m on a realistic profile (Boston)", () => {
    const boston = [
      138.0, 103.2, 98.1, 95.0, 91.6, 70.2, 56.2, 62.5, 62.1, 57.4, 51.7,
      51.1, 48.0, 50.1, 45.7, 45.8, 51.1, 56.2, 59.0, 47.9, 46.2, 43.1, 42.2,
      44.2, 48.8, 41.2, 20.4, 34.1, 29.8, 44.8, 41.8, 30.3, 44.8, 54.9, 67.4,
      45.4, 35.0, 33.4, 23.6, 7.8, 5.0, 3.6, 5.6, 5.1,
    ];
    const s = smoothElevations(boston);
    const netRaw = boston[0] - boston[43];
    const netSmooth = s[0] - s[43];
    expect(Math.abs(netSmooth - netRaw)).toBeLessThan(1);
  });
});

describe("buildSegments — miles mode", () => {
  it("produces 27 segments with mile-length spans", () => {
    const segs = buildSegments(flat44(), "miles");
    expect(segs).toHaveLength(27);
    for (let i = 0; i < 26; i++) {
      expect(segs[i].lengthKm).toBeCloseTo(1.609344, 9);
    }
    expect(segs[26].lengthKm).toBeCloseTo(0.352056, 9);
  });
});

describe("interpolateElevation", () => {
  it("linearly interpolates on a 0..43 ramp", () => {
    expect(interpolateElevation(ramp44(), 1.609344)).toBeCloseTo(1.609344, 9);
  });
});
