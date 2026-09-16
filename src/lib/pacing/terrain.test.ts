import { describe, it, expect } from "vitest";
import {
  courseTerrain,
  isNetDownhill,
  NET_DOWNHILL_M,
  terrainLabel,
  TERRAIN_LABELS,
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

  it("puts each climbing band on the right side of its boundary", () => {
    expect(terrainLabel(withGain(0))).toBe("veryFlat");
    expect(terrainLabel(withGain(24))).toBe("veryFlat");
    expect(terrainLabel(withGain(25))).toBe("mostlyFlat");
    expect(terrainLabel(withGain(84))).toBe("mostlyFlat");
    expect(terrainLabel(withGain(85))).toBe("rolling");
    expect(terrainLabel(withGain(214))).toBe("rolling");
    expect(terrainLabel(withGain(215))).toBe("hilly");
    expect(terrainLabel(withGain(354))).toBe("hilly");
    expect(terrainLabel(withGain(355))).toBe("veryHilly");
    expect(terrainLabel(withGain(2350))).toBe("veryHilly");
  });

  // The override, and the reason it is an override rather than a sixth rung:
  // a course can be both, and one of the two facts has to win the label.
  it("calls a flat course with a big net drop Downhill", () => {
    // Climbs 8 m, drops 1,549 — REVEL Mt Charleston's shape.
    const t = courseTerrain(fromDeltas([8, -1549, ...new Array(41).fill(0)], 2600));
    expect(terrainLabel(t)).toBe("downhill");
  });

  it("takes the drop only at the threshold, not just below it", () => {
    const withNet = (netM: number) =>
      courseTerrain(fromDeltas([netM, ...new Array(42).fill(0)], 1000));
    expect(terrainLabel(withNet(-74))).toBe("veryFlat");
    expect(terrainLabel(withNet(-75))).toBe("downhill");
  });

  it("lets the hills win when a course is hilly AND net downhill", () => {
    // Big Sur's shape: 270 m of climbing, 91 m net drop. Both true; the hill
    // label is the more useful one, and it is what findmymarathon shows.
    const t = courseTerrain(fromDeltas([270, -361, ...new Array(41).fill(0)], 500));
    expect(t.gainM).toBeCloseTo(270, 9);
    expect(isNetDownhill(t)).toBe(true);
    expect(terrainLabel(t)).toBe("hilly");

    // Same at the top of the scale.
    const big = courseTerrain(fromDeltas([600, -1600, ...new Array(41).fill(0)]));
    expect(terrainLabel(big)).toBe("veryHilly");
    expect(isNetDownhill(big)).toBe(true);
  });

  it("never calls a net CLIMB downhill, however flat", () => {
    const t = courseTerrain(fromDeltas([20, ...new Array(42).fill(0)], 0));
    expect(terrainLabel(t)).toBe("veryFlat");
  });

  it("gives every label a distinct human string", () => {
    const names = Object.values(TERRAIN_LABELS);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain("Rolling Hills");
    expect(names).toContain("Very Flat");
  });
});

describe("isNetDownhill", () => {
  const withNet = (netM: number) =>
    courseTerrain(fromDeltas([netM, ...new Array(42).fill(0)], 1000));

  it("triggers only at a material drop", () => {
    expect(isNetDownhill(withNet(0))).toBe(false);
    expect(isNetDownhill(withNet(-74))).toBe(false);
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
  it("rates Boston as Downhill — the drop outranks its rolling climb", () => {
    const t = courseTerrain(loadGeometry("boston").elevations);
    expect(t.gainM).toBeCloseTo(96, 0);
    expect(t.lossM).toBeCloseTo(229, 0);
    expect(t.netM).toBeCloseTo(-133, 0);
    // 96 m of gain is the "rolling" band, but -133 m net takes precedence, and
    // findmymarathon lists Boston as Downhill for exactly this reason.
    expect(terrainLabel(t)).toBe("downhill");
    expect(isNetDownhill(t)).toBe(true);
  });

  it("rates London mostly flat and Sydney rolling — the calibration cases", () => {
    expect(terrainLabel(courseTerrain(loadGeometry("london").elevations))).toBe(
      "mostlyFlat",
    );
    expect(terrainLabel(courseTerrain(loadGeometry("sydney").elevations))).toBe(
      "rolling",
    );
  });

  it("rates Berlin mostly flat, not downhill", () => {
    const t = courseTerrain(loadGeometry("berlin").elevations);
    expect(t.gainM).toBeCloseTo(28, 0);
    expect(terrainLabel(t)).toBe("mostlyFlat");
    expect(isNetDownhill(t)).toBe(false);
  });

  it("rates Chicago very flat and Pikes Peak very hilly — the two extremes", () => {
    expect(terrainLabel(courseTerrain(loadGeometry("chicago").elevations))).toBe(
      "veryFlat",
    );
    expect(
      terrainLabel(
        courseTerrain(loadGeometry("pikes-peak-marathon").elevations),
      ),
    ).toBe("veryHilly");
  });

  // Pins the calibration itself, not one course: these counts are what the
  // fitted 25/85/215/355 m bands and the -75 m override produce over the repo.
  // A band edge cannot move without this failing.
  it("splits the catalog the way the fitted bands say it should", () => {
    const counts: Record<string, number> = {};
    for (const slug of allCourseSlugsOnDisk()) {
      const label = terrainLabel(courseTerrain(loadGeometry(slug).elevations));
      counts[label] = (counts[label] ?? 0) + 1;
    }
    expect(counts).toEqual({
      veryFlat: 20,
      mostlyFlat: 118,
      rolling: 120,
      downhill: 28,
      hilly: 22,
      veryHilly: 18,
    });
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
