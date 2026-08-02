import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { SummaryHeader } from "./SummaryHeader";
import type { PacingResult } from "@/hooks/usePacingChart";
import type { PacingInput } from "@/types";

// The results column is client-rendered, so this is the only way to assert the
// adjusted-finish stat actually appears (and only when weather is applied).
const input: PacingInput = {
  courseId: "boston",
  goalTimeSeconds: 10800, // 3:00:00
  unit: "km",
};

const resultWith = (
  overrides: Partial<PacingResult> = {},
): PacingResult => ({
  rows: [],
  input,
  adjustedFinishSeconds: 10800,
  weatherApplied: false,
  ...overrides,
});

describe("SummaryHeader", () => {
  it("shows three stats and no adjusted finish when weather is off", () => {
    const { container } = render(
      <SummaryHeader result={resultWith()} courseName="Boston Marathon" />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("Goal time");
    expect(text).toContain("3:00:00");
    expect(text).toContain("Average pace");
    expect(text).toContain("Distance");
    expect(text).not.toContain("Adj. finish");
    expect(container.querySelector(".grid-cols-3")).not.toBeNull();
  });

  it("adds the adjusted finish with a red slower-than-goal delta", () => {
    const { container } = render(
      <SummaryHeader
        result={resultWith({
          weatherApplied: true,
          adjustedFinishSeconds: 10919, // +1:59
        })}
        courseName="Boston Marathon"
      />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("Adj. finish");
    expect(text).toContain("3:01:59");
    expect(text).toContain("+0:01:59 vs goal");
    expect(container.innerHTML).toContain("--color-red-primary");
    expect(container.querySelector(".sm\\:grid-cols-4")).not.toBeNull();
  });

  it("uses the green token when weather makes the finish faster", () => {
    const { container } = render(
      <SummaryHeader
        result={resultWith({
          weatherApplied: true,
          adjustedFinishSeconds: 10448, // −5:52, e.g. a strong tailwind
        })}
        courseName="Boston Marathon"
      />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("2:54:08");
    expect(text).toContain("−0:05:52 vs goal");
    expect(container.innerHTML).toContain("--color-green-primary");
  });

  it("reports ideal conditions when weather is on but changes nothing", () => {
    const { container } = render(
      <SummaryHeader
        result={resultWith({
          weatherApplied: true,
          adjustedFinishSeconds: 10800,
        })}
        courseName="Boston Marathon"
      />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("Adj. finish");
    expect(text).toContain("Ideal conditions");
    expect(text).not.toContain("vs goal");
  });

  it("offers a Print band button that opens the browser print dialog", () => {
    // jsdom has no real window.print — assign a spy outright.
    const spy = vi.fn();
    window.print = spy;
    const { getByText } = render(
      <SummaryHeader result={resultWith()} courseName="Boston Marathon" />,
    );
    fireEvent.click(getByText("Print band"));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("switches distance and pace units with the imperial toggle", () => {
    const { container } = render(
      <SummaryHeader
        result={resultWith({ input: { ...input, unit: "miles" } })}
        courseName="Boston Marathon"
      />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("26.22 mi");
    expect(text).toContain("/mi");
  });
});
