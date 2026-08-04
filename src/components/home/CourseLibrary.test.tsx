import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { CourseLibrary } from "./CourseLibrary";
import { COURSE_LIST } from "@/data/courses";

describe("CourseLibrary", () => {
  it("renders a card for every registered course", () => {
    const { container } = render(<CourseLibrary />);
    const text = container.textContent ?? "";
    for (const course of COURSE_LIST) {
      expect(text).toContain(course.displayName);
      expect(text).toContain(course.city);
    }
  });

  it("points every course card at the calculator", () => {
    const { container } = render(<CourseLibrary />);
    const links = container.querySelectorAll('a[href="#calculator"]');
    expect(links).toHaveLength(COURSE_LIST.length);
  });

  it("does not claim a course count the catalogue cannot back", () => {
    const { container } = render(<CourseLibrary />);
    const text = (container.textContent ?? "").toLowerCase();
    // The catalogue is seven courses today. Marketing copy here must not
    // overstate it — this is the assertion that keeps a future copy edit
    // honest.
    expect(text).not.toMatch(/hundreds|thousands|\d{3,}\s*(marathons|courses)/);
  });
});
