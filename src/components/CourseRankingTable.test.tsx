import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, within } from "@testing-library/react";
import { CourseRankingTable } from "./CourseRankingTable";
import { FIXTURE_CATALOG } from "@/data/courses.fixture";
import { parseResultsParams } from "@/lib/resultsParams";
import { totalEffortMultiplier } from "@/lib/units/effort";

// The row click navigates, so the router is the only thing that has to be
// faked. `vi.hoisted` so the mock factory can reach the spy.
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

beforeEach(() => push.mockClear());

const table = () => render(<CourseRankingTable catalog={FIXTURE_CATALOG} />);

/** The race name in each body row, top to bottom. */
const order = (container: HTMLElement): string[] =>
  Array.from(container.querySelectorAll("tbody tr")).map(
    (row) => within(row as HTMLElement).getAllByRole("link")[0].textContent ?? "",
  );

const header = (container: HTMLElement, label: string) =>
  within(container).getByRole("button", { name: new RegExp(label, "i") });

/** Pick a location select by its visible label and choose one option. */
const choose = (container: HTMLElement, label: string, value: string) =>
  fireEvent.change(
    within(container).getByLabelText(new RegExp(`^${label}$`, "i")),
    { target: { value } },
  );

const namesIn = (predicate: (c: (typeof FIXTURE_CATALOG)[number]) => boolean) =>
  FIXTURE_CATALOG.filter(predicate)
    .map((c) => c.displayName)
    .sort();

describe("CourseRankingTable", () => {
  it("lists every course in the catalog", () => {
    const { container } = table();
    expect(order(container)).toHaveLength(FIXTURE_CATALOG.length);
  });

  it("opens sorted fastest-first", () => {
    const { container } = table();
    const expected = [...FIXTURE_CATALOG]
      .sort((a, b) => totalEffortMultiplier(a) - totalEffortMultiplier(b))
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

  it("names each row's profile for screen readers, and shows no pill", () => {
    const { container } = table();
    for (const row of Array.from(container.querySelectorAll("tbody tr"))) {
      const cell = row.querySelectorAll("td")[5];
      const label = cell.querySelector(".sr-only");
      expect(label?.textContent).toMatch(
        /Very Flat|Mostly Flat|Rolling Hills|Downhill|Hilly|Very Hilly/,
      );
      expect(cell.textContent).toBe(label?.textContent);
    }
  });

  it("narrows the table by continent, country and region", () => {
    const { container } = table();

    choose(container, "Continent", "NA");
    expect(order(container).sort()).toEqual(
      namesIn((c) => c.countryCode === "US" || c.countryCode === "CA"),
    );

    choose(container, "Country", "US");
    expect(order(container).sort()).toEqual(
      namesIn((c) => c.countryCode === "US"),
    );

    // The state level only appears for a country with races in two or more of
    // them, which the US fixture has and every other country here does not.
    const region = FIXTURE_CATALOG.find(
      (c) => c.countryCode === "US" && c.regionCode,
    )!.regionCode!;
    choose(container, "State", region);
    expect(order(container).sort()).toEqual(
      namesIn((c) => c.regionCode === region),
    );
  });

  it("names the filtered place in the count, and says worldwide when it isn't filtered", () => {
    const { container } = table();
    // The live region is the count line; it is announced, not labelled, so
    // there is no role to query it by.
    const status = () =>
      container.querySelector("[aria-live]")?.textContent ?? "";

    expect(status()).toBe(`${FIXTURE_CATALOG.length} courses worldwide.`);

    choose(container, "Country", "JP");
    const japan = namesIn((c) => c.countryCode === "JP");
    expect(status()).toBe(
      `${japan.length} course${japan.length === 1 ? "" : "s"} in Japan.`,
    );
  });

  it("restores the whole catalog when the filter is cleared", () => {
    const { container } = table();
    choose(container, "Country", "JP");
    fireEvent.click(within(container).getByRole("button", { name: "Clear" }));
    expect(order(container)).toHaveLength(FIXTURE_CATALOG.length);
  });

  it("leaves the catalog it was given untouched", () => {
    const before = FIXTURE_CATALOG.map((c) => c.id);
    const { container } = table();
    fireEvent.click(header(container, "Race"));
    expect(FIXTURE_CATALOG.map((c) => c.id)).toEqual(before);
  });

  it("opens the race from anywhere in the row, not just the name", () => {
    const { container } = table();
    const first = container.querySelector("tbody tr")!;
    const href = within(first as HTMLElement)
      .getAllByRole("link")[0]
      .getAttribute("href");

    // A cell with no link in it: the terrain cell.
    fireEvent.click(first.querySelectorAll("td")[4]);
    expect(push).toHaveBeenCalledWith(href);
  });

  it("leaves the race-name link to the browser rather than navigating twice", () => {
    const { container } = table();
    const first = container.querySelector("tbody tr")!;
    fireEvent.click(within(first as HTMLElement).getAllByRole("link")[0]);
    expect(push).not.toHaveBeenCalled();
  });

  it("opens a new tab for a modified click instead of swallowing it", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const { container } = table();
    const first = container.querySelector("tbody tr")!;
    fireEvent.click(first.querySelectorAll("td")[4], { metaKey: true });
    expect(push).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith(
      expect.stringContaining("/results?courseId="),
      "_blank",
      "noopener",
    );
    open.mockRestore();
  });

  it("lands on the race with fueling on, the way a fresh form opens", () => {
    const { container } = table();
    const href =
      container.querySelector("tbody a")?.getAttribute("href") ?? "";
    const params = new URLSearchParams(href.slice(href.indexOf("?") + 1));
    // Absence of `carbs` is what InputForm reads as "fueling turned off", so a
    // row that omitted it would open the chart with the gel cues missing.
    expect(params.get("carbs")).toBe("60");
  });
});

// The Altitude column (ROADMAP #7). It prints a height and never a penalty,
// so a sea-level course reads "23 ft" rather than a placeholder.
// FIXTURE_CATALOG is the seven majors, all of them near sea level, plus a high
// course spliced in by hand.
describe("the altitude column", () => {
  /** The altitude cell is the fourth, after race, climbing and net change. */
  const altitudeCells = (container: HTMLElement): string[] =>
    Array.from(container.querySelectorAll("tbody tr")).map(
      (row) => row.querySelectorAll("td")[3].textContent ?? "",
    );

  it("is sortable", () => {
    const { container } = table();
    expect(header(container, "altitude")).toBeTruthy();
  });

  it("gives a sea-level catalog its height and claims no penalty", () => {
    const { container } = table();
    // Every major is below the threshold, so no percentage is claimed
    // anywhere, but each row still says how high it runs.
    for (const cell of altitudeCells(container)) {
      expect(cell).not.toMatch(/%/);
      expect(cell).toMatch(/^-?\d+ ft$/);
    }
  });

  it("reports the mean height for a high course", () => {
    const high = {
      ...FIXTURE_CATALOG[0],
      id: "high-course",
      displayName: "High Course",
      altitude: { meanM: 2000, maxM: 2200, multiplier: 1.07 },
    };
    const { container } = render(
      <CourseRankingTable catalog={[...FIXTURE_CATALOG, high]} />,
    );
    const row = Array.from(container.querySelectorAll("tbody tr")).find(
      (r) => r.textContent?.includes("High Course"),
    );
    expect(row).toBeTruthy();
    const cell = row!.querySelectorAll("td")[3].textContent ?? "";
    expect(cell).toBe("6562 ft");
    expect(cell).not.toContain("slower");
  });

  it("folds the penalty into vs flat, which is the all-in number", () => {
    const high = {
      ...FIXTURE_CATALOG[0],
      id: "high-course",
      displayName: "High Course",
      altitude: { meanM: 2000, maxM: 2200, multiplier: 1.07 },
    };
    const { container } = render(
      <CourseRankingTable catalog={[...FIXTURE_CATALOG, high]} />,
    );
    const row = Array.from(container.querySelectorAll("tbody tr")).find(
      (r) => r.textContent?.includes("High Course"),
    );
    // Berlin's geometry is flat-equivalent, so ×1.07 has to surface as roughly
    // 7% harder here — and would read "flat-equivalent" without the altitude.
    const vsFlat = row!.querySelectorAll("td")[4].textContent ?? "";
    expect(vsFlat).toMatch(/harder/);
    expect(parseFloat(vsFlat)).toBeGreaterThan(6);
  });
});

// The Terrain column's elevation thumbnail (ROADMAP #15). The table draws paths
// it is handed and does no geometry of its own, so what is worth pinning is the
// wiring: which row gets which path, that the label survives, and that it stays
// inert.
describe("the elevation thumbnail", () => {
  const paths = Object.fromEntries(
    FIXTURE_CATALOG.map((c) => [c.id, `M0 ${c.id.length} L2 3`]),
  );

  const renderWithPaths = () =>
    render(<CourseRankingTable catalog={FIXTURE_CATALOG} profilePaths={paths} />);

  /** The terrain cell is the sixth, after the five sortable columns. */
  const terrainCell = (row: Element) => row.querySelectorAll("td")[5];

  // The badge draws its own icon SVG in the same cell, so the thumbnail is
  // selected by what marks it rather than by being an svg.
  const SPARK = "svg[data-profile-sparkline]";

  it("gives each row the path built for its own course", () => {
    const { container } = renderWithPaths();
    for (const row of Array.from(container.querySelectorAll("tbody tr"))) {
      const name = within(row as HTMLElement).getAllByRole("link")[0]
        .textContent;
      const course = FIXTURE_CATALOG.find((c) => c.displayName === name)!;
      expect(
        terrainCell(row).querySelector(`${SPARK} path`)?.getAttribute("d"),
      ).toBe(paths[course.id]);
    }
  });

  it("is the only thing visible in the terrain cell", () => {
    const { container } = renderWithPaths();
    for (const row of Array.from(container.querySelectorAll("tbody tr"))) {
      const cell = terrainCell(row);
      expect(cell.querySelectorAll("svg")).toHaveLength(1);
      expect(cell.querySelector(SPARK)).toBeTruthy();
    }
  });

  it("is non-interactive: hidden from assistive tech, with no tooltip or handler", () => {
    const { container } = renderWithPaths();
    const svg = container.querySelector(`tbody ${SPARK}`)!;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.querySelector("title")).toBeNull();
    expect(svg.getAttribute("focusable")).toBe("false");
    expect(container.querySelectorAll(`tbody ${SPARK} a, tbody ${SPARK} [tabindex]`)).toHaveLength(0);
  });

  it("degrades to the screen-reader label alone when a course has no path", () => {
    const [first, ...rest] = FIXTURE_CATALOG;
    const partial = Object.fromEntries(rest.map((c) => [c.id, paths[c.id]]));
    const { container } = render(
      <CourseRankingTable catalog={FIXTURE_CATALOG} profilePaths={partial} />,
    );
    const rows = Array.from(container.querySelectorAll("tbody tr"));
    const firstRow = rows.find((r) => r.textContent?.includes(first.displayName))!;
    expect(terrainCell(firstRow).querySelector(SPARK)).toBeNull();
    expect(terrainCell(firstRow).textContent).toMatch(/Flat|Hills|Hilly|Downhill/);
    expect(container.querySelectorAll(`tbody ${SPARK}`)).toHaveLength(rest.length);
  });

  it("renders no thumbnails, and does not throw, when no paths are supplied", () => {
    const { container } = table();
    expect(container.querySelectorAll(`tbody ${SPARK}`)).toHaveLength(0);
  });

  it("follows the row through a sort, since each path is keyed by course", () => {
    const { container } = renderWithPaths();
    fireEvent.click(header(container, "Climbing"));
    for (const row of Array.from(container.querySelectorAll("tbody tr"))) {
      const name = within(row as HTMLElement).getAllByRole("link")[0]
        .textContent;
      const course = FIXTURE_CATALOG.find((c) => c.displayName === name)!;
      expect(
        terrainCell(row).querySelector(`${SPARK} path`)?.getAttribute("d"),
      ).toBe(paths[course.id]);
    }
  });
});
