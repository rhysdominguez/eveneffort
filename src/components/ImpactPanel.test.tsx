import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { ImpactPanel } from "./ImpactPanel";
import type { PacingResult } from "@/hooks/usePacingChart";
import type { PacingInput } from "@/types";
import { loadGeometry } from "@/data/courses.fixture";
import { courseCost } from "@/lib/pacing/courseCost";
import { costMultiplier } from "@/lib/pacing/courseCost";

// Guards what the panel PRINTS: four tiles on every course, a clean zero rather
// than a NaN or a hole when nothing is happening, no altitude anywhere, and the
// tiles adding up to the total row.

const BOSTON = loadGeometry("boston").elevations;
const LA_PAZ = loadGeometry("la-paz-marathon").elevations;

const input: PacingInput = {
  courseId: "boston",
  goalTimeSeconds: 10800,
  unit: "km",
};

const SEGMENTS = 43;

const resultWith = (overrides: Partial<PacingResult> = {}): PacingResult => ({
  rows: [],
  input,
  adjustedFinishSeconds: 10800,
  weatherApplied: false,
  segmentDurations: Array.from({ length: SEGMENTS }, () => 251),
  segmentLengthsKm: Array.from({ length: SEGMENTS }, () => 42.195 / SEGMENTS),
  heatMultipliers: Array.from({ length: SEGMENTS }, () => 1),
  dryHeatMultipliers: Array.from({ length: SEGMENTS }, () => 1),
  windMultipliers: Array.from({ length: SEGMENTS }, () => 1),
  hourlySeries: [],
  ...overrides,
});

/**
 * Heat and humidity as the engine carries them: `heatMultipliers` is the
 * combined figure the splits were built from, `dryHeatMultipliers` is the
 * temperature half. The panel reads Humidity off as the ratio, so a test that
 * set only the combined array would land the whole effect on the Humidity tile.
 */
const weather = (dry: number, combined: number) => ({
  weatherApplied: true,
  dryHeatMultipliers: Array.from({ length: SEGMENTS }, () => dry),
  heatMultipliers: Array.from({ length: SEGMENTS }, () => combined),
});

/** Every rendered percentage, in document order: the four tiles, then the total. */
const percents = (container: HTMLElement): string[] =>
  Array.from(container.querySelectorAll("span, p"))
    .map((n) => n.textContent ?? "")
    .filter((t) => /^[+−]?\d+\.\d%$/.test(t));

const parsePercent = (text: string): number =>
  Number(text.replace("−", "-").replace("+", "").replace("%", ""));

describe("ImpactPanel", () => {
  it("shows all four factors and a total on every course", () => {
    const { container } = render(
      <ImpactPanel elevations={BOSTON} result={resultWith()} />,
    );
    const text = container.textContent ?? "";
    for (const label of ["Elevation", "Heat", "Humidity", "Wind"]) {
      expect(text).toContain(label);
    }
    expect(text).toContain("Total Impact");
    expect(percents(container)).toHaveLength(5);
  });

  it("says nothing about altitude, on any course", () => {
    for (const elevations of [BOSTON, LA_PAZ]) {
      const { container } = render(
        <ImpactPanel elevations={elevations} result={resultWith()} />,
      );
      expect(container.textContent).not.toContain("Altitude");
      expect(container.textContent).not.toContain("altitude");
      expect(container.textContent).not.toContain("splits");
    }
  });

  it("carries no explanatory prose above or below the tiles", () => {
    const { container } = render(
      <ImpactPanel elevations={BOSTON} result={resultWith()} />,
    );
    const text = container.textContent ?? "";
    expect(text).not.toContain("vs flat");
    expect(text).not.toContain("sea-level");
    expect(text).not.toContain("Weather is off");
  });

  it("reads a clean zero for heat and wind when weather is off", () => {
    const { container } = render(
      <ImpactPanel elevations={BOSTON} result={resultWith()} />,
    );
    const values = percents(container);
    // Display order: elevation, heat, humidity, wind, then the total.
    expect(values[1]).toBe("0.0%");
    expect(values[2]).toBe("0.0%");
    expect(values[3]).toBe("0.0%");
    expect(container.textContent).not.toContain("NaN");
  });

  it("makes the four tiles add up to the total row", () => {
    const { container } = render(
      <ImpactPanel
        elevations={LA_PAZ}
        result={resultWith({
          ...weather(1.04, 1.06),
          windMultipliers: Array.from({ length: SEGMENTS }, () => 1.01),
        })}
      />,
    );
    const values = percents(container).map(parsePercent);
    const tiles = values.slice(0, 4).reduce((s, v) => s + v, 0);
    const total = values[4];
    // Each tile is rounded to one decimal, so four of them can drift from the
    // total by up to 0.25 in the worst case. Anything beyond that means the
    // shares are not a decomposition of the total at all.
    expect(Math.abs(tiles - total)).toBeLessThanOrEqual(0.25);
  });

  it("shows the terrain cost the course rankings rank on", () => {
    // The panel no longer totals to "vs flat" on a high course, because that
    // figure folds altitude in and this one does not. What still has to hold is
    // that the ELEVATION tile is the terrain half of it.
    const { container } = render(
      <ImpactPanel elevations={LA_PAZ} result={resultWith()} />,
    );
    const values = percents(container).map(parsePercent);
    const terrain = (costMultiplier(courseCost(LA_PAZ)) - 1) * 100;
    expect(values[0]).toBeCloseTo(Math.round(terrain * 10) / 10, 6);
    // Weather off, so the total IS the elevation tile.
    expect(values[4]).toBeCloseTo(values[0], 6);
  });

  it("colours a cost red and a saving green", () => {
    // Berlin is close to flat; a synthetic tailwind makes the wind tile green.
    const { container } = render(
      <ImpactPanel
        elevations={BOSTON}
        result={resultWith({
          ...weather(1.05, 1.05),
          windMultipliers: Array.from({ length: SEGMENTS }, () => 0.97),
        })}
      />,
    );
    const styled = Array.from(container.querySelectorAll("[style]"))
      .map((n) => n.getAttribute("style") ?? "")
      .filter((s) => s.includes("color"));
    expect(styled.some((s) => s.includes("--color-red-primary"))).toBe(true);
    expect(styled.some((s) => s.includes("--color-green-primary"))).toBe(true);
  });

  it("uses a true minus sign rather than a hyphen for a saving", () => {
    const { container } = render(
      <ImpactPanel
        elevations={BOSTON}
        result={resultWith({
          weatherApplied: true,
          windMultipliers: Array.from({ length: SEGMENTS }, () => 0.95),
        })}
      />,
    );
    const values = percents(container);
    expect(values.some((v) => v.startsWith("−"))).toBe(true);
    expect(values.some((v) => v.startsWith("-"))).toBe(false);
  });

  it("weights heat by duration, so the slow segments count for more", () => {
    const hot = Array.from({ length: SEGMENTS }, (_, i) =>
      i >= SEGMENTS - 10 ? 1.1 : 1.0,
    );
    const evenly = render(
      <ImpactPanel
        elevations={BOSTON}
        result={resultWith({
          weatherApplied: true,
          heatMultipliers: hot,
          dryHeatMultipliers: hot,
        })}
      />,
    );
    const slowLate = render(
      <ImpactPanel
        elevations={BOSTON}
        result={resultWith({
          weatherApplied: true,
          heatMultipliers: hot,
          dryHeatMultipliers: hot,
          // The last ten segments take twice as long.
          segmentDurations: Array.from({ length: SEGMENTS }, (_, i) =>
            i >= SEGMENTS - 10 ? 502 : 251,
          ),
        })}
      />,
    );
    const a = parsePercent(percents(evenly.container)[1]);
    const b = parsePercent(percents(slowLate.container)[1]);
    expect(b).toBeGreaterThan(a);
  });

  it("opens an explanation on the info button and closes it on Escape", () => {
    const { container, getByLabelText } = render(
      <ImpactPanel elevations={BOSTON} result={resultWith()} />,
    );
    const trigger = getByLabelText("What Humidity means");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    // The tooltip has to name the dry-air baseline, or the split is a number
    // the runner has no way to check.
    expect(dialog?.textContent).toContain("dry-air baseline");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("gives every factor its own explanation", () => {
    const { getByLabelText } = render(
      <ImpactPanel elevations={BOSTON} result={resultWith()} />,
    );
    for (const label of ["Elevation", "Heat", "Humidity", "Wind"]) {
      expect(getByLabelText(`What ${label} means`)).toBeTruthy();
    }
  });

  it("gives the total no popover, since it just sums the row above", () => {
    const { container, queryByLabelText } = render(
      <ImpactPanel elevations={BOSTON} result={resultWith()} />,
    );
    expect(queryByLabelText("What Total Impact means")).toBeNull();
    // Four tiles, four info buttons, and nothing on the total row.
    expect(container.querySelectorAll("button")).toHaveLength(4);
  });
});

describe("ImpactPanel pace opportunity", () => {
  const verdict = (c: HTMLElement) =>
    c.querySelector<HTMLElement>('[data-testid="opportunity-verdict"]')
      ?.textContent ?? "";

  it("closes the panel with a verdict on the total it just printed", () => {
    const { container } = render(
      <ImpactPanel elevations={BOSTON} result={resultWith()} />,
    );
    expect(container.textContent).toContain("Performance Impact");
    // Boston, no weather: a net-downhill course on a neutral day.
    expect(verdict(container)).toBe("Favorable");
  });

  it("agrees with its own total row when the day turns bad", () => {
    // Roughly a hot, humid, headwind race: the total row goes well past +10%
    // and the verdict has to follow it rather than staying cheerful.
    const { container } = render(
      <ImpactPanel
        elevations={BOSTON}
        result={resultWith({
          ...weather(1.12, 1.2),
          windMultipliers: Array.from({ length: SEGMENTS }, () => 1.03),
        })}
      />,
    );
    const total = parsePercent(percents(container)[4]);
    expect(total).toBeGreaterThan(10);
    expect(verdict(container)).toBe("Challenging");
  });

  it("does not add a fifth percentage to the panel", () => {
    // The meter reads the total; it must not reprint it. The four-tiles-plus-
    // total count is what the rest of this file's assertions index into.
    const { container } = render(
      <ImpactPanel elevations={LA_PAZ} result={resultWith()} />,
    );
    expect(percents(container)).toHaveLength(5);
  });
});
