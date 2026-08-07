import { describe, it, expect } from "vitest";
import { allCourseSlugsOnDisk, loadGeometry } from "./courses.fixture";

// The high-resolution profile drives the elevation chart only. The
// 44-point `elevations` array (pacing engine) is covered separately by
// courses.integrity.test.ts and is intentionally untouched here.
//
// See courses.integrity.test.ts for why these scan-then-assert-once. Profiles
// run to ~3000 points each, so this is where the per-point form hurt most.
describe("course profile integrity", () => {
  describe.each(allCourseSlugsOnDisk())("%s", (slug) => {
    it("has a dense profile (>= 100 points)", () => {
      expect(loadGeometry(slug).profile.length).toBeGreaterThanOrEqual(100);
    });

    it("contains only finite [distanceKm, elevationM] pairs", () => {
      const { profile } = loadGeometry(slug);
      const bad = profile.findIndex(
        (pt) =>
          !Array.isArray(pt) ||
          pt.length !== 2 ||
          !Number.isFinite(pt[0]) ||
          !Number.isFinite(pt[1]),
      );
      expect(
        bad,
        bad === -1 ? "" : `bad profile point at index ${bad}: ${JSON.stringify(profile[bad])}`,
      ).toBe(-1);
    });

    it("has strictly ascending distance", () => {
      const { profile } = loadGeometry(slug);
      let bad = -1;
      for (let i = 1; i < profile.length; i++) {
        if (!(profile[i][0] > profile[i - 1][0])) {
          bad = i;
          break;
        }
      }
      expect(
        bad,
        bad === -1
          ? ""
          : `distance not ascending at index ${bad}: ${profile[bad - 1][0]} -> ${profile[bad][0]}`,
      ).toBe(-1);
    });

    it("ends within the marathon distance band", () => {
      const { profile } = loadGeometry(slug);
      const lastKm = profile[profile.length - 1][0];
      expect(lastKm).toBeGreaterThanOrEqual(41.5);
      expect(lastKm).toBeLessThanOrEqual(43.0);
    });
  });
});
