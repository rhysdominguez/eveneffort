import { describe, it, expect } from "vitest";
import { COURSE_LIST } from "./courses";

describe("course elevation data integrity", () => {
  for (const course of COURSE_LIST) {
    describe(course.id, () => {
      it("has exactly 44 elevation points", () => {
        expect(course.elevations.length).toBe(44);
      });
      it("contains only finite numbers", () => {
        for (const e of course.elevations) {
          expect(Number.isFinite(e)).toBe(true);
        }
      });
      it("is not all zeros (placeholder check)", () => {
        expect(course.elevations.some((e) => e !== 0)).toBe(true);
      });
    });
  }
});
