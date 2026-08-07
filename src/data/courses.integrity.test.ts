import { describe, it, expect } from "vitest";
import { allCourseSlugsOnDisk, loadGeometry } from "./courses.fixture";

// Runs over every course file on disk, not just the seeded ones — a corrupt
// elevation array has to fail here, offline, before it can reach a database.
//
// Each check scans in plain JS and asserts once on the first offending index
// rather than calling expect() per point. At a few hundred courses the
// per-point form is ~100k assertions and minutes of runtime; this is the same
// guarantee in under a second, and the failure message names the exact index.
describe("course elevation data integrity", () => {
  describe.each(allCourseSlugsOnDisk())("%s", (slug) => {
    it("has exactly 44 elevation points", () => {
      expect(loadGeometry(slug).elevations).toHaveLength(44);
    });

    it("contains only finite numbers", () => {
      const { elevations } = loadGeometry(slug);
      const bad = elevations.findIndex((e) => !Number.isFinite(e));
      expect(
        bad,
        bad === -1 ? "" : `non-finite elevation at index ${bad}`,
      ).toBe(-1);
    });

    it("is not all zeros (placeholder check)", () => {
      expect(loadGeometry(slug).elevations.some((e) => e !== 0)).toBe(true);
    });
  });
});
