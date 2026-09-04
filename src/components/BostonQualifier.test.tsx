import { describe, it, expect, beforeEach } from "vitest";
import { render, fireEvent, within } from "@testing-library/react";
import { BostonQualifier } from "./BostonQualifier";
import { BQ_PROFILE } from "@/lib/stateKeys";
import { writeState } from "@/lib/clientState";
import { clearStoredState } from "@/test/storage";
import { FIXTURE_CATALOG } from "@/data/courses.fixture";
import { courseTerrain } from "@/lib/pacing/terrain";
import { loadGeometry } from "@/data/courses.fixture";
import type { CourseSummary } from "@/types";

const mounted = (catalog: CourseSummary[] = FIXTURE_CATALOG) =>
  render(<BostonQualifier catalog={catalog} />);

/** The fixture catalog is seven flat-ish majors; this bolts on a real one. */
function withCourse(slug: string, displayName: string): CourseSummary[] {
  const base = FIXTURE_CATALOG[0];
  return [
    ...FIXTURE_CATALOG,
    {
      ...base,
      id: slug,
      seriesSlug: slug,
      displayName,
      terrain: courseTerrain(loadGeometry(slug).elevations),
    },
  ];
}

const setAge = (container: HTMLElement, age: string) => {
  const input = container.querySelector("#bq-age") as HTMLInputElement;
  fireEvent.change(input, { target: { value: age } });
  fireEvent.blur(input);
};

const pickDivision = (container: HTMLElement, label: string) => {
  const group = container.querySelector('[role="group"]') as HTMLElement;
  fireEvent.click(within(group).getByText(label));
};

const setGoal = (container: HTMLElement, h: number, m: number, s: number) => {
  const byLabel = (name: string) =>
    container.querySelector(`input[aria-label="${name}"]`) as HTMLInputElement;
  fireEvent.change(byLabel("hours"), { target: { value: String(h) } });
  fireEvent.change(byLabel("minutes"), { target: { value: String(m) } });
  fireEvent.change(byLabel("seconds"), { target: { value: String(s) } });
};

describe("BostonQualifier", () => {
  beforeEach(clearStoredState);

  it("withholds a verdict until it knows both age and division", () => {
    const { container } = mounted();
    expect(container.textContent).toContain("Enter your age and division");

    setAge(container, "41");
    // Age alone is not enough — no default division is guessed for the runner.
    expect(container.textContent).toContain("Enter your age and division");

    pickDivision(container, "Men");
    expect(container.textContent).not.toContain("Enter your age and division");
    expect(container.textContent).toContain("3:05:00");
  });

  it("renders the full standards table whether or not a profile is set", () => {
    const { container } = mounted();
    expect(container.textContent).toContain("2:55:00"); // 18–34 men
    expect(container.textContent).toContain("5:20:00"); // 80+ women
    expect(container.textContent).toContain("18–34");
    expect(container.textContent).toContain("80+");
  });

  it("marks the runner's own row in the standards table", () => {
    const { container } = mounted();
    expect(container.querySelector('tr[aria-current="true"]')).toBeNull();

    setAge(container, "41");
    pickDivision(container, "Men");
    const row = container.querySelector('tr[aria-current="true"]');
    expect(row?.textContent).toContain("40–44");
  });

  it("clears the standard and reports what recent cut-offs really cost", () => {
    const { container } = mounted();
    setAge(container, "41");
    pickDivision(container, "Men");
    setGoal(container, 3, 0, 0);

    expect(container.textContent).toContain("Boston qualifier");
    expect(container.textContent).toContain("5:00 under");
    // A 5:00 buffer beats 2026 (4:34) and the two no-cut-off years, not 2025.
    expect(container.textContent).toContain("3 of the last 5 years");
    expect(container.textContent).toContain("2025");
  });

  it("does not tell a bare qualifier they are in", () => {
    const { container } = mounted();
    setAge(container, "41");
    pickDivision(container, "Men");
    setGoal(container, 3, 4, 30);

    expect(container.textContent).toContain("Boston qualifier");
    expect(container.textContent).toContain("turned away 8,887");
  });

  it("applies the downhill index once a steep course is picked", () => {
    const { container } = mounted(
      withCourse("revel-mt-charleston-marathon", "REVEL Mt Charleston"),
    );
    setAge(container, "41");
    pickDivision(container, "Men");
    setGoal(container, 3, 0, 0);
    expect(container.textContent).toContain("Boston qualifier");

    const search = container.querySelector("#bq-course") as HTMLInputElement;
    fireEvent.change(search, { target: { value: "REVEL" } });
    // mouseDown, not click — CourseSearch picks on mousedown so the input's
    // blur cannot close the list out from under the pointer first.
    const options = container.querySelectorAll('[role="option"]');
    expect(options).toHaveLength(1);
    fireEvent.mouseDown(options[0]);

    // 3:00 + 10:00 index = 3:10, past the 3:05 standard.
    expect(container.textContent).toContain("+10:00 downhill index");
    expect(container.textContent).toContain("Misses Boston by 5:00");
  });

  it("lists the indexed courses as an estimate, not a determination", () => {
    const { container } = mounted(
      withCourse("st-george-marathon", "St. George Marathon"),
    );
    expect(container.textContent).toContain("St. George Marathon");
    expect(container.textContent).toContain("our estimate, not the B.A.A.");
  });

  it("restores a stored profile without asking again", () => {
    writeState(BQ_PROFILE, { age: 55, division: "women" });
    const { container } = mounted();
    // 55-59 women is 4:00:00.
    expect(container.textContent).toContain("4:00:00");
    expect(container.querySelector('tr[aria-current="true"]')?.textContent).toContain(
      "55–59",
    );
  });

  it("remembers a profile entered here for the next visit", () => {
    const { container } = mounted();
    setAge(container, "62");
    pickDivision(container, "Non-binary");

    const { container: second } = mounted();
    expect(second.querySelector('tr[aria-current="true"]')?.textContent).toContain(
      "60–64",
    );
  });

  it("uses design tokens for every color", () => {
    const { container } = mounted();
    setAge(container, "41");
    pickDivision(container, "Men");
    const html = container.innerHTML;
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/);
    expect(html).not.toMatch(/\b(?:bg|text|border)-(?:zinc|gray|red|green)-\d/);
    expect(html).not.toContain("dark:");
  });
});
