// Race splits: the per-split, per-factor adjustment chart. What matters here is
// that it cannot mislead: one bar per split row with the stub folded in, the
// two reserved colours used for their reserved meanings, an axis that does not
// zoom a flat course into a mountain range and does not move when a tab does, a
// tab for every factor whether or not it is doing anything, and a hover readout
// that names the row the way the splits table does.
//
// The expected numbers come from `splitImpact` rather than being restated here.
// That is the point of the chart: it draws the decomposition the impact panel
// above it and the splits table below it are built from, and a test that
// recomputed its own version of the series would not notice the day they part.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, fireEvent, renderHook, act } from "@testing-library/react";
import { RaceSplitsChart } from "./RaceSplitsChart";
import { courseHills } from "@/lib/pacing/hills";
import { splitImpact } from "@/lib/pacing/splitImpact";
import { usePacingChart, type PacingResult } from "@/hooks/usePacingChart";
import { fixtureCourse, loadGeometry } from "@/data/courses.fixture";
import type { PacingInput, Unit, WeatherConditions } from "@/types";

const bostonElev = loadGeometry("boston").elevations;
const chicagoElev = loadGeometry("chicago").elevations;
const GOAL = 10800;

const HOT_AND_WINDY: WeatherConditions = {
  tempC: 28,
  humidity: 70,
  windSpeed: 6,
  windDirection: 180,
};

/** The real engine's output for a course, as the dashboard would hand it over. */
function plan(
  slug: string,
  unit: Unit = "km",
  weather?: WeatherConditions,
): PacingResult {
  const course = fixtureCourse(slug);
  const { result } = renderHook(() => usePacingChart());
  const input: PacingInput = {
    goalTimeSeconds: GOAL,
    courseId: course.id,
    unit,
    ...(weather ? { weather } : {}),
  };
  act(() => result.current.calculate(input, course));
  return result.current.result!;
}

/** The series the chart is supposed to be drawing. */
function seriesOf(result: PacingResult) {
  return splitImpact({
    goalTimeSeconds: result.input.goalTimeSeconds,
    segmentLengthsKm: result.segmentLengthsKm,
    segmentDurations: result.segmentDurations,
    heatMultipliers: result.heatMultipliers,
    dryHeatMultipliers: result.dryHeatMultipliers,
    windMultipliers: result.windMultipliers,
  });
}

const chart = (result: PacingResult, elevations: number[]) => (
  <RaceSplitsChart hills={courseHills(elevations)} result={result} />
);

const bars = (c: HTMLElement) => [
  ...c.querySelectorAll<SVGRectElement>("rect[data-bar]"),
];
const bands = (c: HTMLElement) => [
  ...c.querySelectorAll<SVGRectElement>("rect[data-band]"),
];
/** The bars' drawn geometry, for comparing one tab against another. */
const shape = (c: HTMLElement) =>
  bars(c).map((r) => `${r.getAttribute("y")}/${r.getAttribute("height")}`);
/** Every axis reading on screen, e.g. ["+33s", "0s", "−33s"]. */
const axisLabels = (c: HTMLElement) =>
  [...c.querySelectorAll("span")]
    .map((s) => s.textContent ?? "")
    .filter((t) => /^[+−]?\d+s$/.test(t));

const tab = (c: HTMLElement, name: string) =>
  [...c.querySelectorAll("button")].find((b) => b.textContent === name);

/**
 * jsdom lays nothing out, so the plot's bounding box is all zeros and a
 * pointer could never land in a column. Give it the 430px box the geometry
 * tests use. Column `i` of `count` is then centred at 100 + (i + 0.5) * 430 /
 * count.
 */
function stubPlotBox(container: HTMLElement, width = 430) {
  const plot = container.querySelector("svg")!.parentElement!;
  vi.spyOn(plot, "getBoundingClientRect").mockReturnValue({
    left: 100,
    right: 100 + width,
    top: 0,
    bottom: 100,
    width,
    height: 100,
    x: 100,
    y: 0,
    toJSON: () => ({}),
  });
  return plot;
}

/** The x a pointer needs to be at to sit in the middle of column `i`. */
const columnX = (i: number, count: number, width = 430) =>
  100 + ((i + 0.5) * width) / count;

afterEach(() => vi.restoreAllMocks());

describe("RaceSplitsChart", () => {
  it("is its own titled section", () => {
    const { container } = render(chart(plan("boston"), bostonElev));
    expect(container.querySelector("h2")!.textContent).toBe("Race Splits");
  });

  it("draws one bar per split row with the stub folded in, in both units", () => {
    const km = render(chart(plan("boston"), bostonElev));
    // 43 rows in the splits table, 42 bars: the 0.195 km stub is folded back.
    expect(km.container.querySelectorAll("rect[data-bar]")).toHaveLength(42);

    const miles = render(chart(plan("boston", "miles"), bostonElev));
    expect(miles.container.querySelectorAll("rect[data-bar]")).toHaveLength(26);
  });

  it("paints cost red and time given back green, and nothing else", () => {
    const result = plan("boston");
    const total = seriesOf(result).total;
    const { container } = render(chart(result, bostonElev));
    const fills = bars(container).map((r, i) => ({
      fill: r.style.fill,
      seconds: total[i],
    }));
    expect(fills.some((f) => f.seconds > 0)).toBe(true);
    expect(fills.some((f) => f.seconds < 0)).toBe(true);
    for (const f of fills) {
      expect(f.fill).toBe(
        f.seconds > 0
          ? "var(--color-red-primary)"
          : f.seconds < 0
            ? "var(--color-green-primary)"
            : "var(--color-text-tertiary)",
      );
    }
  });

  it("marks each named climb once, and marks none on a flat course", () => {
    const { container } = render(chart(plan("boston"), bostonElev));
    expect(bands(container)).toHaveLength(courseHills(bostonElev).length);
    expect(bands(container).length).toBeGreaterThan(0);

    const flat = render(chart(plan("chicago"), chicagoElev));
    expect(bands(flat.container)).toHaveLength(0);
  });

  it("keeps a flat course flat rather than zooming in on its dust", () => {
    // Chicago's biggest kilometre is a few seconds off even pace. Without the
    // floor the axis would rescale to it and draw a pancake as a mountain range.
    const { container } = render(chart(plan("chicago"), chicagoElev));
    expect(axisLabels(container)).toContain("+10s");
    expect(axisLabels(container)).toContain("−10s");
  });

  it("describes the whole chart to a screen reader", () => {
    const { container } = render(chart(plan("boston"), bostonElev));
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-label")).toMatch(/even pace/);
  });
});

describe("RaceSplitsChart tabs", () => {
  // All five are always on screen. A control that appears only once the weather
  // panel is switched on reads as a feature that was never built, which is
  // exactly how the first version of this was received.
  const tabState = (c: HTMLElement) =>
    [...c.querySelectorAll<HTMLButtonElement>("[role='group'] button")].map(
      (b) => [b.textContent, b.disabled] as const,
    );

  it("offers every factor, live, whatever the weather is doing", () => {
    for (const result of [plan("boston"), plan("boston", "km", HOT_AND_WINDY)]) {
      const { container, unmount } = render(chart(result, bostonElev));
      expect(tabState(container)).toEqual([
        ["Total", false],
        ["Elevation", false],
        ["Heat", false],
        ["Humidity", false],
        ["Wind", false],
      ]);
      unmount();
    }
  });

  // A flat line is the true answer to "what is the wind costing me?" on a still
  // day, and a runner who can see it is better served than one told not to ask.
  it("opens a factor that is doing nothing onto a flat line", () => {
    const { container } = render(chart(plan("boston"), bostonElev));
    const axis = axisLabels(container);
    fireEvent.click(tab(container, "Heat")!);

    // Every bar sits on the zero rule at its minimum height, and none of them
    // claims a cost by being red.
    expect(new Set(shape(container)).size).toBe(1);
    expect(
      bars(container).every(
        (r) => r.style.fill === "var(--color-text-tertiary)",
      ),
    ).toBe(true);
    // The axis has not collapsed onto the empty series, so the flat line reads
    // as flat AGAINST the scale the other tabs use rather than as no scale.
    expect(axisLabels(container)).toEqual(axis);
  });

  it("keeps the red, white and grayscale palette on the control itself", () => {
    const { container } = render(chart(plan("boston"), bostonElev));
    const [total, elevation] = [
      tab(container, "Total")!,
      tab(container, "Elevation")!,
    ];
    // Selected segment: the fill DESIGN.md assigns to an active toggle.
    expect(total.className).toContain("bg-[var(--color-red-fill)]");
    expect(total.className).toContain("text-white");
    // Unselected segments are painted too, so the control reads as one object.
    expect(elevation.className).toContain("bg-[var(--color-bg-surface)]");
    expect(elevation.className).not.toContain("red");
  });

  it("draws the chosen factor's series, not the total", () => {
    const result = plan("boston", "km", HOT_AND_WINDY);
    const series = seriesOf(result);
    const { container } = render(chart(result, bostonElev));

    const totalShape = shape(container);
    fireEvent.click(tab(container, "Heat")!);
    const heatShape = shape(container);
    expect(heatShape).not.toEqual(totalShape);

    // Heat never gives time back, so every bar is on or above the line.
    expect(series.byFactor.heat.every((v) => v >= 0)).toBe(true);
    expect(
      bars(container).every((r) => r.style.fill === "var(--color-red-primary)"),
    ).toBe(true);
    // Wind does go both ways, which is why it needs both colours.
    fireEvent.click(tab(container, "Wind")!);
    expect(
      bars(container).some(
        (r) => r.style.fill === "var(--color-green-primary)",
      ),
    ).toBe(true);
  });

  it("holds one axis across every tab, so the factors stay comparable", () => {
    const { container } = render(
      chart(plan("boston", "km", HOT_AND_WINDY), bostonElev),
    );
    const axis = axisLabels(container);
    for (const name of ["Elevation", "Heat", "Humidity", "Wind", "Total"]) {
      fireEvent.click(tab(container, name)!);
      expect(axisLabels(container), name).toEqual(axis);
    }
  });

  it("shades the climbs behind the terrain only", () => {
    const { container } = render(
      chart(plan("boston", "km", HOT_AND_WINDY), bostonElev),
    );
    expect(bands(container).length).toBeGreaterThan(0);
    fireEvent.click(tab(container, "Elevation")!);
    expect(bands(container).length).toBeGreaterThan(0);
    fireEvent.click(tab(container, "Heat")!);
    expect(bands(container)).toHaveLength(0);
  });
});

describe("RaceSplitsChart hover", () => {
  const tooltip = (c: HTMLElement) =>
    c.querySelector<HTMLElement>("[aria-hidden='true'].absolute");

  it("shows nothing until the pointer is over the plot", () => {
    const { container } = render(chart(plan("boston"), bostonElev));
    expect(tooltip(container)).toBeNull();
    expect(container.querySelector("rect[data-hover]")).toBeNull();
  });

  it("names the kilometre under the pointer and how far it is from even pace", () => {
    const { container } = render(chart(plan("boston"), bostonElev));
    const plot = stubPlotBox(container);

    fireEvent.pointerMove(plot, { clientX: columnX(0, 42) });
    const first = tooltip(container)!;
    expect(first.textContent).toContain("Km 1");
    expect(first.textContent).toContain("vs even");
    // Boston opens on a descent, so the first kilometre runs ahead of even pace.
    expect(first.textContent).toMatch(/−\d+s/);

    fireEvent.pointerMove(plot, { clientX: columnX(21, 42) });
    expect(tooltip(container)!.textContent).toContain("Km 22");
  });

  it("agrees with the bars: the tooltip's seconds are the hovered bar's", () => {
    const result = plan("boston");
    const total = seriesOf(result).total;
    const { container } = render(chart(result, bostonElev));
    const plot = stubPlotBox(container);

    for (const col of [0, 8, 16, 29, 33, 41]) {
      fireEvent.pointerMove(plot, { clientX: columnX(col, 42) });
      const seconds = Math.round(total[col]);
      const expected =
        seconds === 0
          ? "0s"
          : seconds > 0
            ? `+${seconds}s`
            : `−${Math.abs(seconds)}s`;
      expect(tooltip(container)!.textContent, `column ${col}`).toContain(
        expected,
      );
    }
  });

  it("names the factor rather than the baseline once a tab is chosen", () => {
    const result = plan("boston", "km", HOT_AND_WINDY);
    const { container } = render(chart(result, bostonElev));
    fireEvent.click(tab(container, "Wind")!);
    fireEvent.pointerMove(stubPlotBox(container), { clientX: columnX(9, 42) });
    expect(tooltip(container)!.textContent).toContain("Wind");
    expect(tooltip(container)!.textContent).not.toContain("vs even");
  });

  it("colours a costly kilometre red and an easy one green", () => {
    const result = plan("boston");
    const total = seriesOf(result).total;
    const { container } = render(chart(result, bostonElev));
    const plot = stubPlotBox(container);
    const hardest = total.indexOf(Math.max(...total));
    const easiest = total.indexOf(Math.min(...total));

    fireEvent.pointerMove(plot, { clientX: columnX(hardest, 42) });
    expect(
      tooltip(container)!.firstElementChild!.getAttribute("style"),
    ).toContain("--color-red-primary");
    fireEvent.pointerMove(plot, { clientX: columnX(easiest, 42) });
    expect(
      tooltip(container)!.firstElementChild!.getAttribute("style"),
    ).toContain("--color-green-primary");
  });

  it("names the final folded row the way the splits table does", () => {
    const km = render(chart(plan("boston"), bostonElev));
    fireEvent.pointerMove(stubPlotBox(km.container), {
      clientX: columnX(41, 42),
    });
    expect(tooltip(km.container)!.textContent).toContain("Km 42.2");
    // Never "Km 43": there is no forty-third kilometre, and never "Km 42"
    // alone, because this bar runs all the way to the line.
    expect(tooltip(km.container)!.textContent).not.toContain("Km 43");

    const mi = render(chart(plan("boston", "miles"), bostonElev));
    fireEvent.pointerMove(stubPlotBox(mi.container), {
      clientX: columnX(25, 26),
    });
    expect(tooltip(mi.container)!.textContent).toContain("Mile 26.2");
  });

  it("highlights the hovered column and clears on leave", () => {
    const { container } = render(chart(plan("boston"), bostonElev));
    const plot = stubPlotBox(container);

    fireEvent.pointerMove(plot, { clientX: columnX(11, 42) });
    expect(container.querySelectorAll("rect[data-hover]")).toHaveLength(1);
    expect(tooltip(container)).not.toBeNull();

    fireEvent.pointerLeave(plot);
    expect(container.querySelector("rect[data-hover]")).toBeNull();
    expect(tooltip(container)).toBeNull();
  });

  it("works for a finger: a press reads the column too", () => {
    const { container } = render(chart(plan("boston"), bostonElev));
    fireEvent.pointerDown(stubPlotBox(container), { clientX: columnX(4, 42) });
    expect(tooltip(container)!.textContent).toContain("Km 5");
  });

  it("puts the tooltip in the half the bar is not in", () => {
    const result = plan("boston");
    const total = seriesOf(result).total;
    const { container } = render(chart(result, bostonElev));
    const plot = stubPlotBox(container);
    const hardest = total.indexOf(Math.max(...total));
    const easiest = total.indexOf(Math.min(...total));

    fireEvent.pointerMove(plot, { clientX: columnX(hardest, 42) });
    expect(tooltip(container)!.className).toContain("bottom-1");
    fireEvent.pointerMove(plot, { clientX: columnX(easiest, 42) });
    expect(tooltip(container)!.className).toContain("top-1");
  });

  it("does not announce itself as a live region", () => {
    const { container } = render(chart(plan("boston"), bostonElev));
    fireEvent.pointerMove(stubPlotBox(container), { clientX: columnX(11, 42) });
    expect(container.querySelector("[role='status']")).toBeNull();
    expect(container.querySelector("[aria-live]")).toBeNull();
  });
});
