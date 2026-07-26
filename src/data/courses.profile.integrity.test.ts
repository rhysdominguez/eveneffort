import { describe, it, expect } from "vitest";
import { COURSE_LIST } from "./courses";

// The high-resolution profile drives the elevation chart only. The
// 44-point `elevations` array (pacing engine) is covered separately by
// courses.integrity.test.ts and is intentionally untouched here.
describe("course profile integrity", () => {
  for (const course of COURSE_LIST) {
    describe(course.id, () => {
      it("has a dense profile (>= 100 points)", () => {
        expect(course.profile.length).toBeGreaterThanOrEqual(100);
      });

      it("contains only finite [distanceKm, elevationM] pairs", () => {
        for (const pt of course.profile) {
          expect(pt).toHaveLength(2);
          expect(Number.isFinite(pt[0])).toBe(true);
          expect(Number.isFinite(pt[1])).toBe(true);
        }
      });

      it("has strictly ascending distance", () => {
        for (let i = 1; i < course.profile.length; i++) {
          expect(course.profile[i][0]).toBeGreaterThan(
            course.profile[i - 1][0],
          );
        }
      });

      it("ends within the marathon distance band", () => {
        const lastKm = course.profile[course.profile.length - 1][0];
        expect(lastKm).toBeGreaterThanOrEqual(41.5);
        expect(lastKm).toBeLessThanOrEqual(43.0);
      });
    });
  }
});
