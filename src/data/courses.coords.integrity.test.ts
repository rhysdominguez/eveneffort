import { describe, it, expect } from "vitest";
import { COURSE_LIST } from "./courses";

describe("course coordinate data integrity", () => {
  for (const course of COURSE_LIST) {
    describe(course.id, () => {
      it("has exactly 44 coordinate pairs", () => {
        expect(course.coords).toHaveLength(44);
      });

      it("contains only finite [lat, lon] pairs in valid ranges", () => {
        for (const pair of course.coords) {
          expect(pair).toHaveLength(2);
          const [lat, lon] = pair;
          expect(Number.isFinite(lat)).toBe(true);
          expect(Number.isFinite(lon)).toBe(true);
          expect(lat).toBeGreaterThanOrEqual(-90);
          expect(lat).toBeLessThanOrEqual(90);
          expect(lon).toBeGreaterThanOrEqual(-180);
          expect(lon).toBeLessThanOrEqual(180);
        }
      });

      it("is not all zeros (placeholder check)", () => {
        expect(course.coords.some(([lat, lon]) => lat !== 0 || lon !== 0)).toBe(
          true,
        );
      });

      it("derives the start line from coords[0]", () => {
        expect(course.start.lat).toBe(course.coords[0][0]);
        expect(course.start.lon).toBe(course.coords[0][1]);
      });
    });
  }
});
