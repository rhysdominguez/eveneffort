import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { CourseSearch, filterCourses } from "./CourseSearch";
import { FIXTURE_CATALOG } from "@/data/courses.fixture";

const berlin = FIXTURE_CATALOG.find((c) => c.id === "berlin")!;
const tokyo = FIXTURE_CATALOG.find((c) => c.id === "tokyo")!;

function setup(onSelect = vi.fn()) {
  const utils = render(
    <CourseSearch
      id="course"
      catalog={FIXTURE_CATALOG}
      value={berlin.id}
      onSelect={onSelect}
    />,
  );
  const input = utils.container.querySelector("#course") as HTMLInputElement;
  return { ...utils, input, onSelect };
}

const optionNames = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('[role="option"]')).map(
    (el) => el.textContent ?? "",
  );

describe("filterCourses", () => {
  it("returns everything for an empty query", () => {
    expect(filterCourses(FIXTURE_CATALOG, "  ")).toHaveLength(
      FIXTURE_CATALOG.length,
    );
  });

  it("matches race name, city and country, case-insensitively", () => {
    expect(filterCourses(FIXTURE_CATALOG, "tOkYo").map((c) => c.id)).toEqual([
      "tokyo",
    ]);
    expect(filterCourses(FIXTURE_CATALOG, berlin.city).map((c) => c.id)).toEqual(
      ["berlin"],
    );
    expect(
      filterCourses(FIXTURE_CATALOG, tokyo.countryName).map((c) => c.id),
    ).toEqual(["tokyo"]);
  });

  it("returns nothing when nothing matches", () => {
    expect(filterCourses(FIXTURE_CATALOG, "zzzz")).toEqual([]);
  });
});

describe("CourseSearch", () => {
  it("rests showing the selected course, with no list open", () => {
    const { input, container } = setup();
    expect(input.value).toBe(berlin.displayName);
    expect(container.querySelector('[role="listbox"]')).toBeNull();
  });

  it("opens on focus with the query cleared, so the whole catalog is browsable", () => {
    const { input, container } = setup();
    fireEvent.focus(input);
    expect(input.value).toBe("");
    expect(optionNames(container)).toHaveLength(FIXTURE_CATALOG.length);
  });

  it("filters as the runner types", () => {
    const { input, container } = setup();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "tok" } });
    const names = optionNames(container);
    expect(names).toHaveLength(1);
    expect(names[0]).toContain(tokyo.displayName);
  });

  it("shows the empty state when nothing matches", () => {
    const { input, container } = setup();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "zzzz" } });
    expect(container.querySelectorAll('[role="option"]')).toHaveLength(0);
    expect(container.textContent).toContain("No races match");
  });

  it("selects a course on click and redisplays its name", () => {
    const { input, container, onSelect } = setup();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "tok" } });
    fireEvent.mouseDown(container.querySelector('[role="option"]')!);

    expect(onSelect).toHaveBeenCalledWith(tokyo.id);
    expect(container.querySelector('[role="listbox"]')).toBeNull();
    // `value` is owned by the parent, so the input falls back to the course
    // this component was rendered with.
    expect(input.value).toBe(berlin.displayName);
  });

  // Opening pre-highlights the current course, so each ArrowDown steps one
  // past it.
  it("walks the list with arrow keys and selects on Enter", () => {
    const { input, onSelect } = setup();
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(FIXTURE_CATALOG[2].id);
  });

  it("closes on Escape without selecting, restoring the current course", () => {
    const { input, container, onSelect } = setup();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "tok" } });
    fireEvent.keyDown(document, { key: "Escape" });

    expect(onSelect).not.toHaveBeenCalled();
    expect(container.querySelector('[role="listbox"]')).toBeNull();
    expect(input.value).toBe(berlin.displayName);
  });

  it("tracks the highlighted option with aria-activedescendant", () => {
    const { input } = setup();
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBe(
      `course-option-${FIXTURE_CATALOG[1].id}`,
    );
  });
});
