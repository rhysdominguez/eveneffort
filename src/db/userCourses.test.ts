// Runs deliberately with NO DATABASE, like weatherCache.test.ts: the point is
// that the read path degrades to a miss rather than throwing (CLAUDE.md Rule
// 9), and that the token generator is correct without one.
import { describe, it, expect } from "vitest";

import {
  UPLOAD_RATE_LIMIT,
  UPLOAD_TTL_DAYS,
  USER_COURSE_PREFIX,
  countRecentUploads,
  isUserCourseId,
  newCourseToken,
  readUserCourse,
} from "./userCourses";
import { COURSE_SLUG_RE } from "@/lib/resultsParams";

describe("newCourseToken", () => {
  it("produces an id the results URL already accepts", () => {
    // THIS IS THE LOAD-BEARING ASSERTION OF THE WHOLE FEATURE. Because the
    // token satisfies COURSE_SLUG_RE, /results?courseId=..., the params parser
    // and the checkout ladder need no change to carry an uploaded course.
    for (let i = 0; i < 200; i += 1) {
      const token = newCourseToken();
      expect(token, token).toMatch(COURSE_SLUG_RE);
      expect(token, token).toMatch(/^u-[a-z0-9]{22}$/);
    }
  });

  it("does not repeat", () => {
    const seen = new Set(Array.from({ length: 2000 }, () => newCourseToken()));
    expect(seen.size).toBe(2000);
  });

  it("uses the whole alphabet — a biased generator loses real entropy", () => {
    const chars = new Set(
      Array.from({ length: 500 }, () => newCourseToken().slice(2)).join(""),
    );
    expect(chars.size).toBe(36);
  });
});

describe("isUserCourseId", () => {
  it("separates uploaded ids from seeded slugs", () => {
    expect(isUserCourseId(newCourseToken())).toBe(true);
    expect(isUserCourseId("boston")).toBe(false);
    expect(isUserCourseId("berlin")).toBe(false);
    // A seeded slug merely containing "u-" is not an upload.
    expect(isUserCourseId("mount-u-something")).toBe(false);
  });
});

describe("policy constants", () => {
  it("keeps a free upload long enough to carry a training block", () => {
    expect(UPLOAD_TTL_DAYS).toBeGreaterThanOrEqual(30);
  });

  it("bounds an unauthenticated route that writes rows and calls a metered API", () => {
    expect(UPLOAD_RATE_LIMIT).toBeGreaterThan(0);
    expect(UPLOAD_RATE_LIMIT).toBeLessThan(100);
  });

  it("reserves a prefix that cannot collide with a seeded slug", () => {
    expect(USER_COURSE_PREFIX).toBe("u-");
  });
});

describe("with no database configured", () => {
  it("reads as a miss instead of throwing", async () => {
    await expect(readUserCourse("u-abcdefghijklmnopqrstuv")).resolves.toBeNull();
  });

  it("counts zero uploads, so the route is not wedged shut by a missing DB", async () => {
    await expect(countRecentUploads("deadbeef")).resolves.toBe(0);
  });
});
