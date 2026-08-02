import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { PaceBand } from "./PaceBand";
import type { PacingResult } from "@/hooks/usePacingChart";
import type { PaceChartRow, PacingInput } from "@/types";

const input: PacingInput = {
  courseId: "berlin",
  goalTimeSeconds: 10800,
  unit: "km",
};

const rowWith = (
  i: number,
  overrides: Partial<PaceChartRow> = {},
): PaceChartRow => ({
  segmentLabel: String(i + 1),
  elevationDeltaM: 0,
  adjustedPaceSecPerUnit: 256,
  adjustedPaceLabel: "4:16 /km",
  cumulativeSplitSeconds: 256 * (i + 1),
  cumulativeSplitLabel: `0:0${i + 4}:16`,
  fueling: null,
  ...overrides,
});

const resultWith = (rows: PaceChartRow[]): PacingResult => ({
  rows,
  input,
  adjustedFinishSeconds: 10800,
  weatherApplied: false,
});

describe("PaceBand", () => {
  it("is hidden on screen and shown only in print", () => {
    const { container } = render(
      <PaceBand result={resultWith([rowWith(0)])} courseName="Berlin Marathon" />,
    );
    const root = container.querySelector("section");
    expect(root?.className).toContain("hidden");
    expect(root?.className).toContain("print:block");
  });

  it("renders the course name and one row per split", () => {
    const rows = [rowWith(0), rowWith(1), rowWith(2)];
    const { container } = render(
      <PaceBand result={resultWith(rows)} courseName="Berlin Marathon" />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("Berlin Marathon");
    expect(container.querySelectorAll(".paceband-row").length).toBe(
      rows.length + 1, // + header row
    );
    expect(text).toContain("0:04:16");
  });

  it("strips the pace unit suffix — the column is already headed by the unit", () => {
    const { container } = render(
      <PaceBand result={resultWith([rowWith(0)])} courseName="Berlin Marathon" />,
    );
    expect(container.textContent).toContain("4:16");
    expect(container.textContent).not.toContain("4:16 /km");
  });

  it("marks only fueled rows with the gel icon", () => {
    const rows = [
      rowWith(0),
      rowWith(1, {
        fueling: { segmentIndex: 1, atSeconds: 512, label: "Take Gel (25g)" },
      }),
      rowWith(2),
    ];
    const { container } = render(
      <PaceBand result={resultWith(rows)} courseName="Berlin Marathon" />,
    );
    expect(container.querySelectorAll(".paceband-gel").length).toBe(1);
    // The empty gel stubs still exist so numbers stay aligned.
    expect(container.querySelectorAll(".paceband-gelcell").length).toBe(3);
    expect(container.textContent).toContain("Take gel");
  });

  it("drops the gel column entirely when fueling is off", () => {
    const { container } = render(
      <PaceBand
        result={resultWith([rowWith(0), rowWith(1)])}
        courseName="Berlin Marathon"
      />,
    );
    expect(container.querySelector(".paceband-gelcell")).toBeNull();
    expect(container.querySelectorAll(".paceband-gel").length).toBe(0);
  });

  it("labels the unit column from the input unit", () => {
    const miles = resultWith([rowWith(0)]);
    miles.input = { ...input, unit: "miles" };
    const { container } = render(
      <PaceBand result={miles} courseName="Boston Marathon" />,
    );
    expect(container.querySelector(".paceband-head")?.textContent).toContain(
      "mi",
    );
  });
});
