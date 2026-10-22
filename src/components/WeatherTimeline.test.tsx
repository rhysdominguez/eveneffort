import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import WeatherTimeline from "./WeatherTimeline";
import type { PacingResult } from "@/hooks/usePacingChart";
import type { PacingInput, WeatherConditions } from "@/types";

// Guards the two things this panel can get WRONG in a way that misleads rather
// than merely looks off: presenting one source's numbers as another's, and
// rendering at all when it has nothing true to say.

const SEGMENTS = 43;

const input: PacingInput = {
  courseId: "boston",
  goalTimeSeconds: 10800,
  unit: "km",
  raceDateISO: "2026-04-20",
  raceStartTime: "10:00",
};

const series = (n: number, over: Partial<WeatherConditions> = {}) =>
  Array.from({ length: n }, (_, i) => ({
    tempC: 10 + i,
    humidity: 55,
    windSpeed: 4,
    windDirection: 225,
    ...over,
  }));

const resultWith = (overrides: Partial<PacingResult> = {}): PacingResult => {
  const seconds = 10800;
  return {
    rows: Array.from({ length: SEGMENTS }, (_, i) => ({
      cumulativeSplitSeconds: (seconds * (i + 1)) / SEGMENTS,
    })) as PacingResult["rows"],
    input,
    adjustedFinishSeconds: seconds,
    weatherApplied: true,
    segmentDurations: Array.from({ length: SEGMENTS }, () => seconds / SEGMENTS),
    segmentLengthsKm: Array.from({ length: SEGMENTS }, () => 42.195 / SEGMENTS),
    heatMultipliers: Array.from({ length: SEGMENTS }, () => 1),
    dryHeatMultipliers: Array.from({ length: SEGMENTS }, () => 1),
    windMultipliers: Array.from({ length: SEGMENTS }, () => 1),
    hourlySeries: series(8, { cloudCover: 80, precipProbability: 40 }),
    ...overrides,
  };
};

const GUN = new Date("2026-04-20T14:00:00.000Z").getTime();

const renderPanel = (props: Partial<Parameters<typeof WeatherTimeline>[0]> = {}) =>
  render(
    <WeatherTimeline
      result={resultWith()}
      source="forecast"
      lead={series(1)}
      startHHMM="10:00"
      gunUtcMs={GUN}
      {...props}
    />,
  );

describe("absent, not empty", () => {
  // The roadmap's requirement: when this panel cannot say something true it
  // removes itself, so the two charts either side close back up.
  const isAbsent = (c: HTMLElement) =>
    expect(c.textContent).not.toContain("Pre-race");

  it("renders nothing with no source (off, manual, or nothing resolved yet)", () => {
    isAbsent(renderPanel({ source: null }).container);
  });

  it("renders nothing without a start time", () => {
    isAbsent(renderPanel({ startHHMM: undefined }).container);
  });

  it("renders nothing without a resolved gun instant", () => {
    isAbsent(renderPanel({ gunUtcMs: null }).container);
  });

  it("renders nothing when the weather series is empty", () => {
    isAbsent(
      renderPanel({ result: resultWith({ hourlySeries: [] }) }).container,
    );
  });
});

describe("a forecast, or nothing", () => {
  // The section is titled "Weather Forecast", and a heading is not something a
  // reader checks against a caption underneath it. So the two sources that are
  // NOT forecasts remove the section rather than retitling it: a ten-year
  // average under that heading is the one way this feature can mislead someone.
  it("renders under the forecast heading for a live forecast", () => {
    const { container } = renderPanel({ source: "forecast" });
    expect(container.textContent).toContain("Weather Forecast");
  });

  it("is absent for a past race day, recorded rather than predicted", () => {
    const { container } = renderPanel({ source: "historical" });
    expect(container.textContent).not.toContain("Weather Forecast");
    expect(container.querySelector("table")).toBeNull();
  });

  it("is absent for a ten-year typical beyond the forecast horizon", () => {
    const { container } = renderPanel({ source: "typical" });
    expect(container.textContent).not.toContain("Weather Forecast");
    expect(container.querySelector("table")).toBeNull();
  });
});

describe("precipitation", () => {
  it("reads as a probability, which is what a forecast states", () => {
    const { container } = renderPanel({ source: "forecast" });
    expect(container.textContent).toContain("40% chance");
  });

  it("omits the column entirely when the forecast reported none", () => {
    const dry = resultWith({ hourlySeries: series(8, { cloudCover: 50 }) });
    const { container } = renderPanel({ result: dry });
    expect(container.textContent).not.toContain("chance");
  });
});

describe("column layout", () => {
  // table-fixed sizes from the colgroup alone, so a column added to the row
  // without a matching width entry does not error: it silently borrows another
  // column's space and every row goes subtly crooked. Counting the two against
  // each other is the only thing that notices.
  const counts = (container: HTMLElement) => ({
    cols: container.querySelectorAll("col").length,
    cells: container.querySelectorAll("tbody tr:first-child > td").length,
  });

  it("declares exactly one width per column, with every column present", () => {
    const { cols, cells } = counts(renderPanel().container);
    expect(cols).toBe(5);
    expect(cells).toBe(cols);
  });

  it("still matches when the optional sky and rain columns drop out", () => {
    // No cloud cover and no precipitation reported: both columns are omitted.
    const bare = resultWith({
      hourlySeries: Array.from({ length: 8 }, (_, i) => ({
        tempC: 10 + i,
        humidity: 55,
        windSpeed: 4,
        windDirection: 225,
      })),
    });
    const { cols, cells } = counts(renderPanel({ result: bare }).container);
    expect(cols).toBe(3);
    expect(cells).toBe(cols);
  });

  it("gives every cell the same vertical alignment", () => {
    // The bug this pins: the rain cell is an icon over a label and is taller
    // than the two-line text cells beside it, so it sets the row height. Any
    // cell left at align-top then floats to the ceiling of a taller row.
    const { container } = renderPanel();
    const cells = [...container.querySelectorAll("tbody td")];
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.every((td) => td.className.includes("align-middle"))).toBe(true);
    expect(cells.some((td) => td.className.includes("align-top"))).toBe(false);
  });
});

describe("the rows a runner reads", () => {
  it("runs pre-race, start, each clock hour with its distance, then finished", () => {
    const { container } = renderPanel();
    const text = container.textContent ?? "";
    expect(text).toContain("Pre-race");
    expect(text).toContain("Start");
    expect(text).toContain("Finished");
    // 10:00 gun, 3 hours: hour rows at 11, 12 and 1.
    expect(text).toContain("11:00 AM");
    expect(text).toContain("12:00 PM");
    expect(text).toContain("1:00 PM");
    // Even 3-hour pacing puts the runner at 14.1 km after an hour.
    expect(text).toContain("14.1 km");
  });

  it("shows the apparent temperature the pacing model itself uses", () => {
    // heatIndexC(10, 55) is about 8 C — the feels-like must come from the same
    // function the heat multiplier is derived from, not a second model.
    const { container } = renderPanel();
    expect(container.textContent).toContain("Feels");
  });

  it("names the wind's direction as one it blows FROM", () => {
    const { container } = renderPanel();
    expect(container.textContent).toContain("from SW");
  });

  it("says so when the window runs out before a slow finish", () => {
    const slow = resultWith({ adjustedFinishSeconds: 7.5 * 3600 });
    const { container } = renderPanel({ result: slow });
    expect(container.textContent).toContain("forecast window runs out");
  });

  it("does not say so when the whole race fits inside the window", () => {
    const { container } = renderPanel();
    expect(container.textContent).not.toContain("forecast window runs out");
  });
});
