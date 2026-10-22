import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { CourseOutline } from "./CourseOutline";
import { loadGeometry } from "@/data/courses.fixture";
import type { Outline } from "@/lib/course/outline";

const boston = loadGeometry("boston").outline!;

function paths(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("path")).map(
    (p) => p.getAttribute("d") ?? "",
  );
}

describe("CourseOutline", () => {
  it("draws the course as a single path", () => {
    const { container } = render(
      <CourseOutline outline={boston} courseName="Boston Marathon" />,
    );
    const d = paths(container);
    expect(d).toHaveLength(1);
    expect(d[0].startsWith("M")).toBe(true);
    expect(d[0]).not.toContain("NaN");
  });

  it("names the course for a screen reader, since the graphic has no text", () => {
    const { getByRole } = render(
      <CourseOutline outline={boston} courseName="Boston Marathon" />,
    );
    expect(getByRole("img").getAttribute("aria-label")).toContain(
      "Boston Marathon",
    );
  });

  it("renders nothing rather than an empty frame when there is no shape", () => {
    const { container } = render(
      <CourseOutline outline={[[40, -74]]} courseName="Nowhere" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("marks a point-to-point course with a separate start and finish", () => {
    const { container } = render(
      <CourseOutline outline={boston} courseName="Boston Marathon" />,
    );
    // Two end markers and nothing else: the graphic carries no legend, so the
    // only circles on screen are the ones sitting on the route.
    expect(container.querySelectorAll("circle")).toHaveLength(2);
  });

  it("draws no frame, caption or legend around the shape", () => {
    const { container } = render(
      <CourseOutline outline={boston} courseName="Boston Marathon" />,
    );
    // It lives in the results header's whitespace now, so the component is
    // the svg itself and nothing more.
    expect(container.firstChild).toBe(container.querySelector("svg"));
    expect(container.textContent).toBe("");
  });

  it("collapses a loop's coincident ends into one marker", () => {
    // A square that returns to its own start: two dots at the same coordinate
    // would render as one, silently losing whichever painted first.
    const loop: Outline = [
      [40, -74],
      [40, -73.98],
      [40.015, -73.98],
      [40.015, -74],
      [40, -74],
    ];
    const { container } = render(
      <CourseOutline outline={loop} courseName="Loop Marathon" />,
    );
    // One ring plus one fill, at the same coordinate.
    expect(container.querySelectorAll("circle")).toHaveLength(2);
    const [ring, dot] = Array.from(container.querySelectorAll("circle"));
    expect(ring.getAttribute("cx")).toBe(dot.getAttribute("cx"));
    expect(ring.getAttribute("cy")).toBe(dot.getAttribute("cy"));
    expect(container.querySelector("svg")!.getAttribute("aria-label")).toContain(
      "loop",
    );
  });

  it("takes every colour from a token, per Rule 2", () => {
    const { container } = render(
      <CourseOutline outline={boston} courseName="Boston Marathon" />,
    );
    const painted = Array.from(container.querySelectorAll("path, circle"))
      .flatMap((el) => [el.getAttribute("fill"), el.getAttribute("stroke")])
      .filter((v): v is string => Boolean(v) && v !== "none");
    expect(painted.length).toBeGreaterThan(0);
    for (const value of painted) expect(value).toMatch(/^var\(--color-/);
  });
});
