import { describe, it, expect } from "vitest";
import { COURSES, COURSE_LIST, getCourse } from "./courses";
import type { CourseId } from "@/types";

const IDS: CourseId[] = [
  "berlin",
  "chicago",
  "london",
  "tokyo",
  "sydney",
  "newyork",
  "boston",
];

describe("course registry", () => {
  it("contains all 7 course ids", () => {
    expect(Object.keys(COURSES).sort()).toEqual([...IDS].sort());
    expect(COURSE_LIST).toHaveLength(7);
  });

  it("every course has exactly 44 elevation points", () => {
    for (const c of COURSE_LIST) {
      expect(c.elevations).toHaveLength(44);
    }
  });

  it("getCourse returns the matching course", () => {
    expect(getCourse("tokyo").displayName).toBe("Tokyo Marathon");
  });

  it("getCourse throws on an unknown id", () => {
    expect(() => getCourse("paris" as CourseId)).toThrow(
      "Unknown courseId: paris",
    );
  });
});
