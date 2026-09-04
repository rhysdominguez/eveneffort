import { describe, it, expect } from "vitest";
import { render, fireEvent, within } from "@testing-library/react";
import { CourseRankingTable } from "./CourseRankingTable";
import { FIXTURE_CATALOG } from "@/data/courses.fixture";
import { parseResultsParams } from "@/lib/resultsParams";
import { effortMultiplier } from "@/lib/pacing/effort";

const table = () => render(<CourseRankingTable catalog={FIXTURE_CATALOG} />);

/** The race name in each body row, top to bottom. */
const order = (container: HTMLElement): string[] =>
  Array.from(container.querySelectorAll("tbody tr")).map(
    (row) => within(row as HTMLElement).getAllByRole("link")[0].textContent ?? "",
  );

const header = (container: HTMLElement, label: string) =>
  within(container).getByRole("button", { name: new RegExp(label, "i") });

describe("CourseRankingTable", () => {
  it("lists every course in the catalog", () => {
    const { container } = table();
    expect(order(container)).toHaveLength(FIXTURE_CATALOG.length);
  });

  it("opens sorted fastest-first", () => {
    const { container } = table();
    const expected = [...FIXTURE_CATALOG]
      .sort((a, b) => effortMultiplier(a.effort) - effortMultiplier(b.effort))
      .map((c) => c.displayName);
    expect(order(container)).toEqual(expected);
  });

  it("reverses the same column when its header is clicked twice", () => {
    const { container } = table();
    const first = order(container);
    fireEvent.click(header(container, "vs flat"));
    expect(order(container)).toEqual([...first].reverse());
    fireEvent.click(header(container, "vs flat"));
    expect(order(container)).toEqual(first);
  });

  it("sorts by climbing, net change and name", () => {
    const { container } = table();

    fireEvent.click(header(container, "Climbing"));
    expect(order(container)).toEqual(
      [...FIXTURE_CATALOG]
        .sort((a, b) => a.terrain.gainM - b.terrain.gainM)
        .map((c) => c.displayName),
    );

    fireEvent.click(header(container, "Net change"));
    expect(order(container)).toEqual(
      [...FIXTURE_CATALOG]
        .sort((a, b) => a.terrain.netM - b.terrain.netM)
        .map((c) => c.displayName),
    );

    fireEvent.click(header(container, "Race"));
    expect(order(container)).toEqual(
      [...FIXTURE_CATALOG]
        .map((c) => c.displayName)
        .sort((a, b) => a.localeCompare(b)),
    );
  });

  it("marks the active column with aria-sort, and only that one", () => {
    const { container } = table();
    const sorted = () =>
      Array.from(container.querySelectorAll("th[aria-sort]")).filter(
        (th) => th.getAttribute("aria-sort") !== "none",
      );
    expect(sorted()).toHaveLength(1);
    expect(sorted()[0].textContent).toContain("vs flat");
    expect(sorted()[0].getAttribute("aria-sort")).toBe("ascending");

    fireEvent.click(header(container, "vs flat"));
    expect(sorted()[0].getAttribute("aria-sort")).toBe("descending");

    fireEvent.click(header(container, "Climbing"));
    expect(sorted()).toHaveLength(1);
    expect(sorted()[0].textContent).toContain("Climbing");
  });

  it("links every row into the calculator with a query that parses", () => {
    const { container } = table();
    const links = Array.from(container.querySelectorAll("tbody a"));
    expect(links).toHaveLength(FIXTURE_CATALOG.length);
    for (const link of links) {
      const href = link.getAttribute("href") ?? "";
      const params = Object.fromEntries(
        new URLSearchParams(href.slice(href.indexOf("?") + 1)),
      );
      const parsed = parseResultsParams(params);
      expect(parsed.ok, href).toBe(true);
      if (parsed.ok) expect(parsed.input.goalTimeSeconds).toBe(14400);
    }
  });

  it("renders a terrain badge on every row", () => {
    const { container } = table();
    for (const row of Array.from(container.querySelectorAll("tbody tr"))) {
      expect(row.textContent).toMatch(/Flat|Rolling|Hilly|Mountainous/);
    }
  });
});
