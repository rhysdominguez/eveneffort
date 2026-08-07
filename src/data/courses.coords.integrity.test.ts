import { describe, it, expect } from "vitest";
import { allCourseSlugsOnDisk, loadGeometry } from "./courses.fixture";

// See courses.integrity.test.ts for why these scan-then-assert-once rather than
// calling expect() per coordinate.
describe("course coordinate data integrity", () => {
  describe.each(allCourseSlugsOnDisk())("%s", (slug) => {
    it("has exactly 44 coordinate pairs", () => {
      expect(loadGeometry(slug).coords).toHaveLength(44);
    });

    it("contains only finite [lat, lon] pairs in valid ranges", () => {
      const { coords } = loadGeometry(slug);
      const bad = coords.findIndex(
        (pair) =>
          !Array.isArray(pair) ||
          pair.length !== 2 ||
          !Number.isFinite(pair[0]) ||
          !Number.isFinite(pair[1]) ||
          pair[0] < -90 ||
          pair[0] > 90 ||
          pair[1] < -180 ||
          pair[1] > 180,
      );
      expect(
        bad,
        bad === -1 ? "" : `bad coordinate at index ${bad}: ${JSON.stringify(coords[bad])}`,
      ).toBe(-1);
    });

    it("is not all zeros (placeholder check)", () => {
      expect(
        loadGeometry(slug).coords.some(([lat, lon]) => lat !== 0 || lon !== 0),
      ).toBe(true);
    });

    it("puts the start line at coords[0]", () => {
      // The seed denormalises coords[0] into course.start_lat/start_lon, and
      // CLAUDE.md takes a new city's map pin from it, so it has to be real.
      const [lat, lon] = loadGeometry(slug).coords[0];
      expect(Number.isFinite(lat) && Number.isFinite(lon)).toBe(true);
    });
  });
});
