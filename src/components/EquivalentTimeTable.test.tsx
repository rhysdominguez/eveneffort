import { describe, it, expect } from "vitest";
import { render, fireEvent, within } from "@testing-library/react";
import { EquivalentTimeTable } from "./EquivalentTimeTable";
import { FIXTURE_CATALOG } from "@/data/courses.fixture";
import { parseResultsParams } from "@/lib/resultsParams";

const T = 12000; // 3:20:00
const BOSTON = FIXTURE_CATALOG.find((c) => c.id === "boston")!;

const table = (toId = "berlin") =>
  render(
    <EquivalentTimeTable
      catalog={FIXTURE_CATALOG}
      from={BOSTON}
      toId={toId}
      goalTimeSeconds={T}
    />,
  );

const rows = (c: HTMLElement) => Array.from(c.querySelectorAll("tbody tr"));
const raceNames = (c: HTMLElement) =>
  rows(c).map((r) => r.querySelector("a")!.textContent);

describe("EquivalentTimeTable", () => {
  it("lists every course in the catalog", () => {
    const { container } = table();
    expect(rows(container)).toHaveLength(FIXTURE_CATALOG.length);
  });

  it("sorts fastest-equivalent first by default", () => {
    // Boston is the fastest of the seven fixture courses, so its own row —
    // the baseline — leads, and Berlin, the slowest, closes.
    const { container } = table();
    const names = raceNames(container);
    expect(names[0]).toBe("Boston Marathon");
    expect(names.at(-1)).toBe("Berlin Marathon");
  });

  it("gives the baseline course back exactly the time that was entered", () => {
    // The one row that must be exact rather than converted: converting a time
    // to the course it was already run on has to be the identity, or every
    // other number on the page is suspect.
    const { container } = table();
    const own = rows(container).find((r) =>
      r.textContent?.includes("Boston Marathon"),
    )!;
    expect(within(own).getByText("3:20:00")).toBeTruthy();
    expect(own.textContent).toContain("—"); // no difference, not "+0:00"
    expect(own.textContent).toContain("your time");
  });

  it("converts the other courses", () => {
    const { container } = table();
    const berlin = rows(container).find((r) =>
      r.textContent?.includes("Berlin Marathon"),
    )!;
    expect(berlin.textContent).toContain("3:21:10");
    expect(berlin.textContent).toContain("+1:10");
  });

  it("reverses on a second click of the same column", () => {
    const { container } = table();
    const timeHeader = Array.from(container.querySelectorAll("th")).find((th) =>
      th.textContent?.includes("Your equivalent time"),
    )!;
    expect(timeHeader.getAttribute("aria-sort")).toBe("ascending");

    fireEvent.click(timeHeader.querySelector("button")!);
    expect(timeHeader.getAttribute("aria-sort")).toBe("descending");
    expect(raceNames(container)[0]).toBe("Berlin Marathon");
  });

  it("sorts by name as the alternate", () => {
    const { container } = table();
    const nameHeader = Array.from(container.querySelectorAll("th")).find((th) =>
      th.textContent?.includes("Race"),
    )!;
    fireEvent.click(nameHeader.querySelector("button")!);
    expect(raceNames(container)).toEqual(
      [...raceNames(container)].sort((a, b) => a!.localeCompare(b!)),
    );
  });

  it("filters on name, city or country, the way the pickers do", () => {
    const { container } = table();
    const filter = container.querySelector("#compare-filter")!;

    fireEvent.change(filter, { target: { value: "berlin" } });
    expect(raceNames(container)).toEqual(["Berlin Marathon"]);

    // Germany is the country, not the race name — same matcher as CourseSearch.
    fireEvent.change(filter, { target: { value: "germany" } });
    expect(raceNames(container)).toEqual(["Berlin Marathon"]);
  });

  it("says so rather than showing an empty table when nothing matches", () => {
    const { container } = table();
    fireEvent.change(container.querySelector("#compare-filter")!, {
      target: { value: "atlantis" },
    });
    expect(container.querySelector("tbody")?.textContent).toContain(
      "No races match",
    );
    expect(container.querySelectorAll("tbody a")).toHaveLength(0);
  });

  it("links each row to a pacing chart at that course's OWN converted time", () => {
    const { container } = table();
    const berlin = rows(container).find((r) =>
      r.textContent?.includes("Berlin Marathon"),
    )!;
    const href = berlin.querySelector("a")!.getAttribute("href")!;
    const parsed = parseResultsParams(
      Object.fromEntries(new URLSearchParams(href.slice(href.indexOf("?") + 1))),
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.input.courseId).toBe("berlin");
      expect(parsed.input.goalTimeSeconds).toBe(12070);
    }
  });

  it("highlights both courses from the headline", () => {
    const { container } = table("tokyo");
    // Exact class token, not a substring: every row also carries
    // `hover:bg-[var(--color-bg-elevated)]`, which contains the same text.
    const highlighted = rows(container)
      .filter((r) =>
        r.className.split(/\s+/).includes("bg-[var(--color-bg-elevated)]"),
      )
      .map((r) => r.querySelector("a")!.textContent);
    expect(highlighted).toHaveLength(2);
    expect(highlighted).toContain("Boston Marathon");
    expect(highlighted).toContain("Tokyo Marathon");
  });

  it("renders a terrain badge on every row", () => {
    const { container } = table();
    for (const row of rows(container)) {
      expect(row.textContent).toMatch(/Flat|Rolling|Hilly|Mountainous/);
    }
  });
});
