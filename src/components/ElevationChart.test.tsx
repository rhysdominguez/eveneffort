import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { ElevationChart } from "./ElevationChart";
import type { PaceChartRow } from "@/types";
import { nearestPointIndex } from "@/lib/chart/geometry";

// jsdom reports a zero-sized rect for everything, which would make the
// pointer→viewBox mapping bail out. Pin the SVG to its natural 880-wide
// viewBox so client x == viewBox x and the assertions can be exact.
const VB_W = 880;
const M_LEFT = 56;
const PLOT_W = VB_W - M_LEFT - 8;
const originalRect = Element.prototype.getBoundingClientRect;

beforeAll(() => {
  Element.prototype.getBoundingClientRect = function () {
    return { x: 0, y: 0, width: VB_W, height: 200, top: 0, left: 0, right: VB_W, bottom: 200, toJSON: () => ({}) } as DOMRect;
  };
});
afterAll(() => {
  Element.prototype.getBoundingClientRect = originalRect;
});

const MARATHON_KM = 42.195;
const M_TO_FT = 3.28084;

// 400 evenly spaced trackpoints: a climb to a peak at halfway, then a descent
// back below the start. Elevations are metres, as the real course data is.
const profile: [number, number][] = Array.from({ length: 400 }, (_, i) => {
  const distKm = (i * MARATHON_KM) / 399;
  const frac = i / 399;
  const elevM = frac <= 0.5 ? 100 + frac * 400 : 300 - (frac - 0.5) * 600;
  return [distKm, elevM];
});

const rows: PaceChartRow[] = Array.from({ length: 43 }, (_, i) => ({
  segmentLabel: String(i + 1),
  elevationDeltaM: 0,
  adjustedPaceSecPerUnit: 270,
  adjustedPaceLabel: "4:30 /km",
  cumulativeSplitSeconds: 270 * (i + 1),
  cumulativeSplitLabel: "0:04:30",
}));

/** Client x for a given fraction across the plot area. */
const xAt = (frac: number) => M_LEFT + PLOT_W * frac;

// The chart snaps to the nearest trackpoint, so expectations are derived from
// the profile rather than hardcoded — hardcoding would only re-assert the
// snapping rule that geometry.test.ts already covers.
const distances = profile.map(([d]) => d);
const pointAt = (frac: number) => {
  const i = nearestPointIndex(distances, frac * MARATHON_KM);
  return {
    index: i,
    km: `${profile[i][0].toFixed(1)} km`,
    ft: `${Math.round(profile[i][1] * M_TO_FT)} ft`,
  };
};

/** The tooltip is the only thing that renders an "N ft" readout. */
const hasReadout = (container: HTMLElement) =>
  /\d+ ft/.test(container.textContent ?? "");

const renderChart = () =>
  render(<ElevationChart profile={profile} unit="km" rows={rows} />);

const svgOf = (container: HTMLElement) =>
  container.querySelector("svg") as SVGSVGElement;

describe("ElevationChart hover", () => {
  it("shows no readout until the pointer enters", () => {
    const { container } = renderChart();
    expect(hasReadout(container)).toBe(false);
  });

  it("reads out elevation, distance and pace at the hovered point", () => {
    const { container } = renderChart();
    fireEvent.mouseMove(svgOf(container), { clientX: xAt(0.5) });
    const text = container.textContent ?? "";
    // Halfway is the ~300 m peak of the synthetic profile.
    const peak = pointAt(0.5);
    expect(text).toContain(peak.ft);
    expect(text).toContain(peak.km);
    expect(text).toContain("4:30 /km");
  });

  it("tracks the pointer to a different point", () => {
    const { container } = renderChart();
    fireEvent.mouseMove(svgOf(container), { clientX: xAt(0.25) });
    expect(container.textContent).toContain(pointAt(0.25).km);
    fireEvent.mouseMove(svgOf(container), { clientX: xAt(0.75) });
    expect(container.textContent).toContain(pointAt(0.75).km);
  });

  it("resolves adjacent trackpoints, not whole kilometres", () => {
    const { container } = renderChart();
    const svg = svgOf(container);
    // Two positions one trackpoint apart, well inside the same kilometre.
    fireEvent.mouseMove(svg, { clientX: xAt(0.5) });
    const a = container.textContent;
    fireEvent.mouseMove(svg, { clientX: xAt(0.5 + 1 / 399) });
    expect(container.textContent).not.toBe(a);
  });

  it("clears the readout when the pointer leaves", () => {
    const { container } = renderChart();
    fireEvent.mouseMove(svgOf(container), { clientX: xAt(0.5) });
    expect(hasReadout(container)).toBe(true);
    fireEvent.mouseLeave(svgOf(container));
    expect(hasReadout(container)).toBe(false);
  });

  it("omits the pace line when no rows are supplied", () => {
    const { container } = render(<ElevationChart profile={profile} unit="km" />);
    fireEvent.mouseMove(svgOf(container), { clientX: xAt(0.5) });
    expect(container.textContent).toContain(pointAt(0.5).km);
    expect(container.textContent).not.toContain("/km");
  });

  it("switches the distance unit with the imperial toggle", () => {
    const { container } = render(
      <ElevationChart profile={profile} unit="miles" />,
    );
    fireEvent.mouseMove(svgOf(container), { clientX: xAt(1) });
    expect(container.textContent).toContain("26.2 mi");
  });
});

describe("ElevationChart drag selection", () => {
  /** Press and move, without releasing — the range readout is live-only. */
  const dragTo = (container: HTMLElement, fromFrac: number, toFrac: number) => {
    fireEvent.mouseDown(svgOf(container), { clientX: xAt(fromFrac) });
    fireEvent.mouseMove(document, { clientX: xAt(toFrac) });
  };

  it("reports a net climb in red with an up arrow (uphill reads harder)", () => {
    const { container } = renderChart();
    dragTo(container, 0.1, 0.4);
    const text = container.textContent ?? "";
    expect(text).toContain("↑");
    expect(text).toMatch(/\+\d+ ft/);
    expect(container.innerHTML).toContain("--color-red-primary");
    expect(container.innerHTML).not.toContain("--color-green-primary");
  });

  it("reports a net descent in green with a down arrow (downhill reads easier)", () => {
    const { container } = renderChart();
    dragTo(container, 0.6, 0.9);
    const text = container.textContent ?? "";
    expect(text).toContain("↓");
    expect(text).toContain("−");
    expect(container.innerHTML).toContain("--color-green-primary");
    expect(container.innerHTML).not.toContain("--color-red-primary");
  });

  it("gives the same range dragging right-to-left", () => {
    // Unmount between the two: an unreleased drag keeps document-level
    // listeners attached, so a second mounted chart would steer the first.
    const { container: a, unmount } = renderChart();
    dragTo(a, 0.2, 0.6);
    const forward = a.textContent;
    unmount();

    const { container: b } = renderChart();
    dragTo(b, 0.6, 0.2);
    expect(b.textContent).toBe(forward);
  });

  it("labels the range with both endpoints", () => {
    const { container } = renderChart();
    dragTo(container, 0, 0.5);
    expect(container.textContent).toContain(
      `${pointAt(0).km} – ${pointAt(0.5).km}`,
    );
  });

  it("drops the range on release, falling back to the hover readout", () => {
    const { container } = renderChart();
    dragTo(container, 0.2, 0.7);
    expect(container.textContent).toContain("–");
    fireEvent.mouseUp(document, { clientX: xAt(0.7) });
    expect(container.textContent).not.toContain("–");
    // The point under the pointer is still read out.
    expect(container.textContent).toContain(pointAt(0.7).km);
  });

  it("drops the range even when released outside the chart", () => {
    const { container } = renderChart();
    dragTo(container, 0.2, 0.7);
    fireEvent.mouseLeave(svgOf(container));
    fireEvent.mouseUp(document, { clientX: xAt(0.7) });
    expect(container.textContent).not.toContain("–");
  });

  it("clears a live range on Escape", () => {
    const { container } = renderChart();
    dragTo(container, 0.2, 0.8);
    expect(container.textContent).toContain("–");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(container.textContent).not.toContain("–");
  });
});

describe("ElevationChart keyboard", () => {
  it("moves the cursor with the arrow keys", () => {
    const { container } = renderChart();
    const svg = svgOf(container);
    fireEvent.keyDown(svg, { key: "End" });
    expect(container.textContent).toContain("42.2 km");
    fireEvent.keyDown(svg, { key: "Home" });
    expect(container.textContent).toContain("0.0 km");
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    expect(container.textContent).not.toContain("0.0 km");
  });

  it("extends a selection with shift and the arrow keys", () => {
    const { container } = renderChart();
    const svg = svgOf(container);
    fireEvent.keyDown(svg, { key: "Home" });
    fireEvent.keyDown(svg, { key: "ArrowRight", shiftKey: true });
    fireEvent.keyDown(svg, { key: "ArrowRight", shiftKey: true });
    expect(container.textContent).toContain("–");
    // Extending from the start climbs the synthetic profile's uphill —
    // reads red under the inverted (uphill=harder) convention.
    expect(container.innerHTML).toContain("--color-red-primary");
  });

  it("is focusable and no longer hides its contents from assistive tech", () => {
    const { container } = renderChart();
    const svg = svgOf(container);
    expect(svg.getAttribute("tabindex")).toBe("0");
    expect(svg.getAttribute("role")).toBeNull();
  });
});
