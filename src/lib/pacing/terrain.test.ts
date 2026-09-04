import { describe, it, expect } from "vitest";
import {
  courseTerrain,
  isNetDownhill,
  NET_DOWNHILL_M,
  terrainLabel,
} from "./terrain";
import { allCourseSlugsOnDisk, loadGeometry } from "@/data/courses.fixture";

/** A 44-point array from a per-kilometre delta list (43 deltas). */
const fromDeltas = (deltas: number[], start = 0): number[] => {
  const out = [start];
  for (const d of deltas) out.push(out[out.length - 1] + d);
  return out;
};
const flat44 = () => new Array(44).fill(50);

describe("courseTerrain", () => {
  it("sums climbs and descents separately and reports the exact net", () => {
    const t = courseTerrain(fromDeltas([10, -4, 6, ...new Array(40).fill(0)], 100));
    expect(t.gainM).toBeCloseTo(16, 9);
    expect(t.lossM).toBeCloseTo(4, 9);
    expect(t.netM).toBeCloseTo(12, 9);
  });

  it("reports zeros for a flat course", () => {
    expect(courseTerrain(flat44())).toEqual({ gainM: 0, lossM: 0, netM: 0 });
  });

  it("gives a monotone descent no gain at all", () => {
    const t = courseTerrain(fromDeltas(new Array(43).fill(-10), 500));
    expect(t.gainM).toBe(0);
    expect(t.lossM).toBeCloseTo(430, 9);
    expect(t.netM).toBeCloseTo(-430, 9);
  });

  it("net is exactly finish minus start, whatever happens between", () => {
    const elevations = fromDeltas(
      Array.from({ length: 43 }, (_, i) => (i % 2 === 0 ? 30 : -30)),
      12,
    );
    const t = courseTerrain(elevations);
    expect(t.netM).toBe(elevations[43] - elevations[0]);
    // Gain and loss are never negative, however jagged the profile.
    expect(t.gainM).toBeGreaterThan(0);
    expect(t.lossM).toBeGreaterThan(0);
  });

  it("rejects anything that isn't 44 finite numbers", () => {
    expect(() => courseTerrain(new Array(43).fill(0))).toThrow();
    const bad = flat44();
    bad[7] = Number.NaN;
    expect(() => courseTerrain(bad)).toThrow();
  });
});

describe("terrainLabel", () => {
  const withGain = (gainM: number) =>
    courseTerrain(fromDeltas([gainM, ...new Array(42).fill(0)], 0));

  it("puts each band on the right side of its boundary", () => {
    expect(terrainLabel(withGain(0))).toBe("flat");
    expect(terrainLabel(withGain(74))).toBe("flat");
    expect(terrainLabel(withGain(75))).toBe("rolling");
    expect(terrainLabel(withGain(149))).toBe("rolling");
    expect(terrainLabel(withGain(150))).toBe("hilly");
    expect(terrainLabel(withGain(399))).toBe("hilly");
    expect(terrainLabel(withGain(400))).toBe("mountainous");
    expect(terrainLabel(withGain(2350))).toBe("mountainous");
  });

  it("reads gain only — a big net drop does not make a course flat", () => {
    // Climbs 600 m and drops 1,600: mountainous AND net downhill, both true.
    const t = courseTerrain(fromDeltas([600, -1600, ...new Array(41).fill(0)]));
    expect(terrainLabel(t)).toBe("mountainous");
    expect(isNetDownhill(t)).toBe(true);
  });
});

describe("isNetDownhill", () => {
  const withNet = (netM: number) =>
    courseTerrain(fromDeltas([netM, ...new Array(42).fill(0)], 1000));

  it("triggers only at a material drop", () => {
    expect(isNetDownhill(withNet(0))).toBe(false);
    expect(isNetDownhill(withNet(-99))).toBe(false);
    expect(isNetDownhill(withNet(NET_DOWNHILL_M))).toBe(true);
    expect(isNetDownhill(withNet(-1541))).toBe(true);
    // A net CLIMB never counts, however big.
    expect(isNetDownhill(withNet(800))).toBe(false);
  });
});

// The numbers these pin are the ones a runner reads off the badge, and they
// are checkable against published figures: Boston is a net ~140 m drop with
// ~230 m of descending, Berlin is famously flat. If smoothing, resolution or
// the band edges ever change, every course's rating moves and this fails.
describe("real courses off disk", () => {
  it("rates Boston as rolling, net downhill", () => {
    const t = courseTerrain(loadGeometry("boston").elevations);
    expect(t.gainM).toBeCloseTo(96, 0);
    expect(t.lossM).toBeCloseTo(229, 0);
    expect(t.netM).toBeCloseTo(-133, 0);
    expect(terrainLabel(t)).toBe("rolling");
    expect(isNetDownhill(t)).toBe(true);
  });

  it("rates London flat and Sydney hilly — the calibration cases", () => {
    expect(terrainLabel(courseTerrain(loadGeometry("london").elevations))).toBe(
      "flat",
    );
    expect(terrainLabel(courseTerrain(loadGeometry("sydney").elevations))).toBe(
      "hilly",
    );
  });

  it("rates Berlin as flat, not downhill", () => {
    const t = courseTerrain(loadGeometry("berlin").elevations);
    expect(t.gainM).toBeCloseTo(28, 0);
    expect(terrainLabel(t)).toBe("flat");
    expect(isNetDownhill(t)).toBe(false);
  });

  // The integrity sweep's shape (see courses.integrity.test.ts): one scan, one
  // assertion naming the offender, rather than 326 × 4 expect() calls.
  it("produces finite stats and a label for every course in the repo", () => {
    const bad = allCourseSlugsOnDisk().filter((slug) => {
      const t = courseTerrain(loadGeometry(slug).elevations);
      return (
        !Number.isFinite(t.gainM) ||
        !Number.isFinite(t.lossM) ||
        !Number.isFinite(t.netM) ||
        t.gainM < 0 ||
        t.lossM < 0 ||
        !terrainLabel(t)
      );
    });
    expect(bad, `courses with unusable terrain stats: ${bad.join(", ")}`).toEqual(
      [],
    );
  });
});
