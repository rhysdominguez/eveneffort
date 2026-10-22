// The Hill segments section on /results. What is guarded here is mostly about
// honesty: that the pace it prints is the plan's own pace rather than a second
// opinion, that a flat course says so instead of showing an empty box, and that
// the unit toggle changes how the climbs are written down and not which climbs
// exist. The per-kilometre chart is a different section, tested in
// RaceSplitsChart.test.tsx.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { HillPanel } from "./HillPanel";
import { courseHills } from "@/lib/pacing/hills";
import { buildSegments, MARATHON_KM, MILE_IN_KM } from "@/lib/pacing/segments";
import { formatPace } from "@/lib/units/pace";
import { loadGeometry } from "@/data/courses.fixture";
import type { PaceChartRow, Unit } from "@/types";

const boston = loadGeometry("boston").elevations;
const chicago = loadGeometry("chicago").elevations;
const bigSur = loadGeometry("big-sur-marathon").elevations;

/**
 * Plausible rows with a distinct pace per row, so a figure can be traced back to
 * the rows it came from, and a REAL cumulative column: the panel averages from
 * `cumulativeSplitSeconds`, so a stubbed zero there would test nothing.
 */
function rows(unit: Unit): PaceChartRow[] {
  let cumulative = 0;
  return buildSegments(boston, unit).map((seg, i) => {
    const pace = 250 + i;
    const units = seg.lengthKm / (unit === "km" ? 1 : MILE_IN_KM);
    cumulative += pace * units;
    return {
      segmentLabel: String(i + 1),
      elevationDeltaM: seg.elevationDeltaM,
      adjustedPaceSecPerUnit: pace,
      adjustedPaceLabel: formatPace(pace, unit),
      cumulativeSplitSeconds: cumulative,
      cumulativeSplitLabel: "0:00:00",
    };
  });
}

const props = (elevations = boston, unit: Unit = "km") => ({
  hills: courseHills(elevations),
  rows: rows(unit),
  unit,
});

const cards = (c: HTMLElement) =>
  [...c.querySelectorAll("h3")].map((h) => h.closest<HTMLElement>(".rounded-xl")!);
const scrollerOf = (c: HTMLElement) =>
  c.querySelector<HTMLElement>("[aria-label='Climbs on this course']")!;

/**
 * jsdom lays nothing out, so every scroller reads as zero wide and never
 * overflows. Give one real numbers, and a scrollBy to spy on (jsdom has none).
 */
function layout(el: HTMLElement, m: { scrollWidth: number; clientWidth: number; scrollLeft: number }) {
  Object.defineProperty(el, "scrollWidth", { configurable: true, value: m.scrollWidth });
  Object.defineProperty(el, "clientWidth", { configurable: true, value: m.clientWidth });
  Object.defineProperty(el, "scrollLeft", { configurable: true, writable: true, value: m.scrollLeft });
  const scrollBy = vi.fn();
  el.scrollBy = scrollBy as unknown as typeof el.scrollBy;
  return scrollBy;
}

afterEach(() => vi.restoreAllMocks());

describe("HillPanel", () => {
  it("renders one card per climb", () => {
    const p = props();
    const { container } = render(<HillPanel {...p} />);
    expect(p.hills.length).toBeGreaterThan(0);
    expect(cards(container)).toHaveLength(p.hills.length);
  });

  it("writes each card as a short stack of lines, not a table", () => {
    const { container } = render(<HillPanel {...props()} />);
    const text = cards(container)[0].textContent!;
    expect(text).toContain("7.0 km length");
    expect(text).toContain("96 ft elevation gain");
    expect(text).toContain("0.4% avg grade");
    expect(text).toMatch(/\d:\d{2} \/km avg pace/);
  });

  it("says elevation gain, not rise, and drops the vs flat line", () => {
    const { container } = render(<HillPanel {...props(bigSur)} />);
    const text = container.textContent!;
    expect(text).toContain("elevation gain");
    expect(text).not.toMatch(/\brise\b/i);
    expect(text).not.toContain("vs flat");
    expect(text).not.toContain("costs");
  });

  it("gives every position a decimal, whole kilometres included", () => {
    const { container } = render(<HillPanel {...props()} />);
    expect(container.querySelector("h3")!.textContent).toBe("Km 27.0 to 34.0");

    const miles = render(<HillPanel {...props(boston, "miles")} />);
    // Miles were already fractional; they must stay one decimal, never "5".
    expect(miles.container.querySelector("h3")!.textContent).toMatch(
      /^Mile \d+\.\d to \d+\.\d$/,
    );
  });

  it("writes a climb that reaches the line as ending at 42.2", () => {
    const flatThenRamp = new Array(44).fill(50);
    flatThenRamp[43] = 90;
    const hills = courseHills(flatThenRamp);
    expect(hills[0].endDistanceKm).toBe(MARATHON_KM);
    const { container } = render(
      <HillPanel hills={hills} rows={rows("km")} unit="km" />,
    );
    expect(container.querySelector("h3")!.textContent).toMatch(/ to 42\.2$/);
  });

  it("numbers the climbs in course order, from 1", () => {
    const p = props(bigSur);
    const { container } = render(<HillPanel {...p} />);
    const badges = cards(container).map((card) =>
      card.querySelector("span.rounded-full")!.textContent,
    );
    // "Climb " is screen-reader text inside the badge; the digit is what shows.
    expect(badges).toEqual(p.hills.map((_, i) => `Climb ${i + 1}`));
    expect(p.hills.length).toBeGreaterThan(1);
    // Course order: the first card is the earliest on the road.
    const starts = cards(container).map((c) => c.querySelector("h3")!.textContent);
    expect(starts[0]).toMatch(/Km 8\.0/);
  });

  it("does not colour the number: it names a card, it does not grade one", () => {
    const { container } = render(<HillPanel {...props(bigSur)} />);
    for (const card of cards(container)) {
      const badge = card.querySelector("span.rounded-full")!;
      expect(badge.className).not.toMatch(/red|green|orange|gold|lime/);
    }
  });

  it("prints the average pace over the climb, not a fastest-to-slowest span", () => {
    const p = props();
    const { container } = render(<HillPanel {...p} />);
    const hill = p.hills[0];
    // Rows 27..33 at 277..283 s/km over exactly 7 km: their mean is 280.
    expect(hill.startSegmentIndex).toBe(27);
    expect(hill.endSegmentIndex).toBe(33);
    const shown = cards(container)[0].textContent!;
    expect(shown).toContain(`${formatPace(280, "km")} avg pace`);
    // One figure: no "to" between two paces.
    expect(shown).not.toMatch(/\/km to \d/);
  });

  it("agrees with the splits table: average is elapsed time over distance", () => {
    for (const unit of ["km", "miles"] as const) {
      const p = props(bigSur, unit);
      const { container, unmount } = render(<HillPanel {...p} />);
      const paceLines = [...container.querySelectorAll("p")]
        .map((el) => el.textContent!)
        .filter((t) => t.endsWith("avg pace"));
      expect(paceLines).toHaveLength(p.hills.length);
      for (const line of paceLines) {
        // Any average must sit inside the paces it averages.
        const [m, s] = line.split(" ")[0].split(":").map(Number);
        const seconds = m * 60 + s;
        const all = p.rows.map((r) => r.adjustedPaceSecPerUnit);
        expect(seconds).toBeGreaterThanOrEqual(Math.min(...all) - 1);
        expect(seconds).toBeLessThanOrEqual(Math.max(...all) + 1);
      }
      unmount();
    }
  });

  it("carries no summary strip and no explanatory note", () => {
    const { container } = render(<HillPanel {...props(bigSur)} />);
    const text = container.textContent!;
    // Removed on purpose: the strip (low, high, gain, loss, climbs) and the
    // paragraph explaining cost. Neither may come back by accident.
    expect(text).not.toMatch(/\b(Low|High|Loss|Climbs)\b/);
    expect(text).not.toMatch(/\bGain\b/);
    expect(text).not.toContain("Cost is what");
    expect(text).not.toContain("one kilometre at a time");
  });

  it("renders nothing on a course with no climb worth planning around", () => {
    const { container } = render(<HillPanel {...props(chicago)} />);
    expect(courseHills(chicago)).toEqual([]);
    expect(container.textContent).toBe("");
    expect(cards(container)).toHaveLength(0);
    expect(container.querySelector("button")).toBeNull();
  });

  it("is not collapsible, on a course with climbs or without", () => {
    for (const elevations of [boston, chicago]) {
      const { container, unmount } = render(<HillPanel {...props(elevations)} />);
      expect(container.querySelector("[aria-expanded]")).toBeNull();
      expect(container.querySelector("[hidden]")).toBeNull();
      unmount();
    }
  });

  it("carries no per-kilometre chart, which is Race splits' job", () => {
    const { container } = render(<HillPanel {...props()} />);
    expect(container.querySelector("svg[role='img']")).toBeNull();
  });

  it("changes the ranges but not the climbs when the unit flips", () => {
    const km = render(<HillPanel {...props(boston, "km")} />);
    const miles = render(<HillPanel {...props(boston, "miles")} />);

    expect(cards(km.container)).toHaveLength(cards(miles.container).length);
    expect(km.container.querySelector("h3")!.textContent).toMatch(/^Km /);
    expect(miles.container.querySelector("h3")!.textContent).toMatch(/^Mile /);
    expect(km.container.querySelector("h3")!.textContent).not.toBe(
      miles.container.querySelector("h3")!.textContent,
    );
  });
});

describe("HillPanel carousel", () => {
  it("keeps a lone card its own width rather than stretching it across the section", () => {
    const { container } = render(<HillPanel {...props()} />);
    const [card] = cards(container);
    expect(cards(container)).toHaveLength(1);
    expect(card.className).toContain("w-60");
    expect(card.className).toContain("shrink-0");
    expect(card.className).not.toContain("w-full");
  });

  it("scrolls sideways and snaps, so a finger can flip through the cards", () => {
    const { container } = render(<HillPanel {...props(bigSur)} />);
    const scroller = scrollerOf(container);
    expect(scroller.className).toContain("overflow-x-auto");
    expect(scroller.className).toContain("snap-x");
    // Focusable, so the arrow keys work from the keyboard as well.
    expect(scroller.getAttribute("tabindex")).toBe("0");
    expect(cards(container).length).toBeGreaterThan(1);
  });

  it("shows no arrows when every card already fits", () => {
    const { container } = render(<HillPanel {...props(bigSur)} />);
    layout(scrollerOf(container), { scrollWidth: 500, clientWidth: 500, scrollLeft: 0 });
    fireEvent.scroll(scrollerOf(container));
    expect(container.querySelector("button")).toBeNull();
  });

  it("shows arrows once the cards overflow, and disables the end you are at", () => {
    const { container } = render(<HillPanel {...props(bigSur)} />);
    const scroller = scrollerOf(container);
    const scrollBy = layout(scroller, { scrollWidth: 1000, clientWidth: 400, scrollLeft: 0 });
    fireEvent.scroll(scroller);

    const previous = container.querySelector<HTMLButtonElement>("[aria-label='Previous climb']")!;
    const next = container.querySelector<HTMLButtonElement>("[aria-label='Next climb']")!;
    expect(previous.disabled).toBe(true);
    expect(next.disabled).toBe(false);

    fireEvent.click(next);
    expect(scrollBy).toHaveBeenCalledTimes(1);
    expect(scrollBy.mock.calls[0][0].left).toBeGreaterThan(0);

    // Scrolled to the far end: the roles swap.
    (scroller as unknown as { scrollLeft: number }).scrollLeft = 600;
    fireEvent.scroll(scroller);
    expect(previous.disabled).toBe(false);
    expect(next.disabled).toBe(true);

    fireEvent.click(previous);
    expect(scrollBy.mock.calls[1][0].left).toBeLessThan(0);
  });

  it("opens a new course at its first climb, not where the last one was left", () => {
    const { container, rerender } = render(<HillPanel {...props(bigSur)} />);
    const before = scrollerOf(container);
    (before as unknown as { scrollLeft: number }).scrollLeft = 300;

    // A different course with climbs of its own: the row must start over.
    rerender(<HillPanel {...props(boston)} />);
    const after = scrollerOf(container);
    expect(after).not.toBe(before);
    expect(after.scrollLeft).toBe(0);
  });

  it("keeps the runner's place when only the unit changes", () => {
    const { container, rerender } = render(<HillPanel {...props(bigSur, "km")} />);
    const before = scrollerOf(container);

    // Same course, same climbs, different words for the same distances.
    rerender(<HillPanel {...props(bigSur, "miles")} />);
    expect(scrollerOf(container)).toBe(before);
  });

  it("gives the arrows names a screen reader can use", () => {
    const { container } = render(<HillPanel {...props(bigSur)} />);
    layout(scrollerOf(container), { scrollWidth: 1000, clientWidth: 400, scrollLeft: 0 });
    fireEvent.scroll(scrollerOf(container));
    expect(container.querySelector("[aria-label='Previous climb']")).not.toBeNull();
    expect(container.querySelector("[aria-label='Next climb']")).not.toBeNull();
  });
});
