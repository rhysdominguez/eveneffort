import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { effortSummary, SummaryHeader } from "./SummaryHeader";
import { courseTerrain } from "@/lib/pacing/terrain";
import { courseEffort, effortMultiplier } from "@/lib/pacing/effort";
import { loadGeometry } from "@/data/courses.fixture";
import { bqStatus } from "@/lib/bq/qualify";
import type { PacingResult } from "@/hooks/usePacingChart";
import type { PacingInput } from "@/types";
import { startCheckout } from "@/lib/checkout";

// Opening the modal now fires a beacon and can start a Stripe redirect —
// neither of which jsdom can do. Stub both at the module boundary.
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/checkout", () => ({ startCheckout: vi.fn() }));

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
      <SummaryHeader
        result={resultWith()}
        courseName="Boston Marathon"
        location="Boston, MA, United States"
      />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("Boston, MA, United States");
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

  it("opens the support modal rather than printing straight away", () => {
    // jsdom has no real window.print — assign a spy outright.
    const spy = vi.fn();
    window.print = spy;
    const { getByText, queryByRole, getByRole } = render(
      <SummaryHeader result={resultWith()} courseName="Boston Marathon" />,
    );
    expect(queryByRole("dialog")).toBeNull();
    fireEvent.click(getByText("Print band"));
    expect(getByRole("dialog")).not.toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("prints and closes when the modal's Print button is used", () => {
    const spy = vi.fn();
    window.print = spy;
    const { getByText, getByRole, queryByRole } = render(
      <SummaryHeader result={resultWith()} courseName="Boston Marathon" />,
    );
    fireEvent.click(getByText("Print band"));
    fireEvent.click(getByRole("button", { name: "Print" }));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(queryByRole("dialog")).toBeNull();
  });

  it("hands the modal a results query describing this exact band", () => {
    vi.mocked(startCheckout).mockResolvedValue(undefined);
    const { getByText, getByRole } = render(
      <SummaryHeader result={resultWith()} courseName="Boston Marathon" />,
    );
    fireEvent.click(getByText("Order band"));
    fireEvent.click(getByRole("button", { name: "Order for $9.99" }));

    const query = vi.mocked(startCheckout).mock.calls[0][0];
    const params = new URLSearchParams(query);
    expect(params.get("courseId")).toBe("boston");
    expect(params.get("goalTimeSeconds")).toBe("10800");
    expect(params.get("unit")).toBe("km");
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

describe("SummaryHeader — course difficulty", () => {
  const boston = courseTerrain(loadGeometry("boston").elevations);

  it("shows the terrain badge and what the course costs", () => {
    const { container } = render(
      <SummaryHeader
        result={resultWith()}
        courseName="Boston Marathon"
        terrain={boston}
        effortMultiplier={effortMultiplier(
          courseEffort(loadGeometry("boston").elevations),
        )}
      />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("Rolling");
    expect(text).toContain("315 ft up");
    expect(text).toContain("−436 ft net");
    // The point of showing both: Boston climbs enough to be "rolling" and
    // still runs FASTER than flat, because the net drop more than pays for
    // the Newton hills. One number could not say that.
    expect(text).toContain("Costs 0.6% less than a flat course");
  });

  it("omits the whole block when no terrain is passed", () => {
    const { container } = render(
      <SummaryHeader result={resultWith()} courseName="Boston Marathon" />,
    );
    const text = container.textContent ?? "";
    expect(text).not.toContain("Rolling");
    expect(text).not.toContain("flat course");
  });

  // The BQ verdict rides the same optional-prop path as terrain: Dashboard
  // computes it only when a profile is stored, and the paceband's own render
  // path passes neither.
  it("stays silent about Boston when no profile has been set", () => {
    const { container } = render(
      <SummaryHeader result={resultWith()} courseName="Boston Marathon" />,
    );
    expect(container.textContent ?? "").not.toContain("Boston qualifier");
  });

  it("shows the verdict when a BQ status is supplied", () => {
    const { container } = render(
      <SummaryHeader
        result={resultWith()}
        courseName="Boston Marathon"
        bq={bqStatus({ finishSeconds: 10800, age: 41, division: "men" })}
      />,
    );
    // 3:00:00 against a 3:05:00 standard.
    expect(container.textContent ?? "").toContain("Boston qualifier");
    expect(container.textContent ?? "").toContain("5:00 under");
  });
});

describe("effortSummary", () => {
  it("names the direction and the size of the cost", () => {
    expect(effortSummary(1.071)).toBe("Costs 7.1% more than a flat course");
    expect(effortSummary(0.938)).toBe("Costs 6.2% less than a flat course");
  });

  it("refuses to quote a difference inside the digitization noise", () => {
    expect(effortSummary(1.004)).toBe("Costs about the same as a flat course");
    expect(effortSummary(0.997)).toBe("Costs about the same as a flat course");
  });
});
