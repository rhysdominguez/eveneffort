import { describe, it, expect } from "vitest";
import { downhillIndex, isIndexed, NEAR_THRESHOLD_FT } from "./downhill";
import { M_TO_FT } from "@/lib/units/elevation";
import { courseTerrain } from "@/lib/pacing/terrain";
import { allCourseSlugsOnDisk, loadGeometry } from "@/data/courses.fixture";
import type { CourseTerrain } from "@/types";

/**
 * A course that ends `dropFt` feet below where it started. Gain and loss are
 * irrelevant to this rule — only the endpoints are — so they stay zero.
 */
const dropped = (dropFt: number): CourseTerrain => ({
  gainM: 0,
  lossM: 0,
  netM: -dropFt / M_TO_FT,
});

describe("downhillIndex — the band edges", () => {
  // The thresholds are the whole feature. Each is asserted at the value itself
  // and one foot below, because ">= 1500" vs "> 1500" is the difference between
  // adding five minutes to someone's time and not.
  it.each([
    [0, 0],
    [1499, 0],
    [1500, 300],
    [2999, 300],
    [3000, 600],
    [5999, 600],
  ])("a %i ft drop is indexed +%i s", (dropFt, expected) => {
    expect(downhillIndex(dropped(dropFt)).indexSeconds).toBe(expected);
  });

  it("makes a course of 6,000 ft or more ineligible rather than indexing it", () => {
    const at = downhillIndex(dropped(6000));
    expect(at.eligible).toBe(false);
    expect(at.indexSeconds).toBe(0);
    expect(isIndexed(at)).toBe(true);

    expect(downhillIndex(dropped(5999)).eligible).toBe(true);
  });

  it("does not index a course that finishes above where it started", () => {
    const climbed = downhillIndex({ gainM: 500, lossM: 0, netM: 500 });
    expect(climbed.dropFt).toBeLessThan(0);
    expect(climbed.indexSeconds).toBe(0);
    expect(climbed.eligible).toBe(true);
    expect(isIndexed(climbed)).toBe(false);
  });
});

describe("downhillIndex — the near-threshold caveat", () => {
  it("flags a course sitting within the margin of a band edge, either side", () => {
    expect(downhillIndex(dropped(1500 - NEAR_THRESHOLD_FT)).nearThreshold).toBe(true);
    expect(downhillIndex(dropped(1500 + NEAR_THRESHOLD_FT)).nearThreshold).toBe(true);
    expect(downhillIndex(dropped(3000 + 10)).nearThreshold).toBe(true);
    expect(downhillIndex(dropped(6000 - 10)).nearThreshold).toBe(true);
  });

  it("leaves an ordinary road course unflagged", () => {
    expect(downhillIndex(dropped(0)).nearThreshold).toBe(false);
    expect(downhillIndex(dropped(800)).nearThreshold).toBe(false);
    expect(downhillIndex(dropped(4000)).nearThreshold).toBe(false);
  });
});

describe("downhillIndex — against the real catalog", () => {
  const indexFor = (slug: string) =>
    downhillIndex(courseTerrain(loadGeometry(slug).elevations));

  // Real geometry, because a units slip is the plausible bug here and synthetic
  // terrain built from the same constant would not catch it.
  it.each([
    ["revel-mt-charleston-marathon", 600],
    ["eker-i-run-marathon", 600],
    ["st-george-marathon", 300],
    ["utah-valley-marathon", 300],
    ["boston", 0],
    ["berlin", 0],
  ])("indexes %s at +%i s", (slug, expected) => {
    expect(indexFor(slug).indexSeconds).toBe(expected);
  });

  it("flags every course clustered on the 1,500 ft line", () => {
    // Five of the eight indexed courses land within 150 ft of the threshold —
    // four barely over, Deseret News barely under. Our elevation source is not
    // accurate to a few tens of feet over a marathon, so the UI must not assert
    // which side any of them falls on.
    for (const slug of [
      "n4-elands-marathon",
      "estes-park-marathon",
      "mendoza-marathon",
      "utah-valley-marathon",
      "bhutan-international-marathon",
      "deseret-news-marathon",
    ]) {
      expect(indexFor(slug).nearThreshold, slug).toBe(true);
    }
  });

  it("does not flag the courses that are unambiguously in a band", () => {
    for (const slug of ["revel-mt-charleston-marathon", "st-george-marathon"]) {
      expect(indexFor(slug).nearThreshold, slug).toBe(false);
    }
  });

  it("finds no seeded course too downhill to qualify on", () => {
    // An ineligible course is the one case where showing a BQ verdict at all
    // would be wrong, so its arrival should stop the build and get a human's
    // attention rather than pass silently.
    const ineligible = allCourseSlugsOnDisk().filter(
      (slug) => !indexFor(slug).eligible,
    );
    expect(ineligible).toEqual([]);
  });
});
