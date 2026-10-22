import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { SummaryHeader } from "./SummaryHeader";
import { courseTerrain } from "@/lib/pacing/terrain";
import { loadGeometry } from "@/data/courses.fixture";
import type { PacingResult } from "@/hooks/usePacingChart";
import type { PacingInput } from "@/types";
import { startCheckout } from "@/lib/checkout";
import { parseResultsParams } from "@/lib/resultsParams";
import { courseHills } from "@/lib/pacing/hills";

// Opening the modal now fires a beacon and can start a Stripe redirect —
// neither of which jsdom can do. Stub both at the module boundary.
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/checkout", () => ({ startCheckout: vi.fn() }));
// maplibre-gl needs a WebGL context jsdom does not have. The overlay has its
// own suite; here only the triggers and the focus handoff matter.
vi.mock("@/components/CourseMapCanvas", () => ({
  CourseMapCanvas: () => <div data-testid="canvas" />,
}));

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
  segmentDurations: [],
  segmentLengthsKm: [],
  heatMultipliers: [],
  dryHeatMultipliers: [],
  windMultipliers: [],
  hourlySeries: [],
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

  it("copies a link that rebuilds this exact band", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    // Deliberately NOT the input the page was loaded with: the whole reason
    // this button exists is that the address bar no longer follows the form,
    // so what it copies has to come from the result on screen.
    const edited: PacingInput = {
      ...input,
      goalTimeSeconds: 12345,
      unit: "miles",
      fueling: { carbsPerHour: 75 },
    };
    const { getByText } = render(
      <SummaryHeader
        result={resultWith({ input: edited })}
        courseName="Boston Marathon"
      />,
    );
    fireEvent.click(getByText("Copy link"));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalled());

    const copied = writeText.mock.calls[0][0] as string;
    expect(copied.startsWith(window.location.origin)).toBe(true);

    // The proof that matters: what got copied is a link /results will accept,
    // describing the edited state rather than the arrival state.
    const parsed = parseResultsParams(
      Object.fromEntries(
        new URLSearchParams(copied.slice(copied.indexOf("?") + 1)),
      ),
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.input.courseId).toBe("boston");
      expect(parsed.input.goalTimeSeconds).toBe(12345);
      expect(parsed.input.unit).toBe("miles");
      expect(parsed.input.fueling?.carbsPerHour).toBe(75);
    }
    await vi.waitFor(() => expect(getByText("Copied")).toBeDefined());
  });

  it("says so rather than lying when the clipboard is unavailable", () => {
    // navigator.clipboard is undefined over plain http, which is every LAN
    // preview of this app.
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });
    const { getByText } = render(
      <SummaryHeader result={resultWith()} courseName="Boston Marathon" />,
    );
    fireEvent.click(getByText("Copy link"));
    return vi.waitFor(() => expect(getByText("Copy failed")).toBeDefined());
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

  it("shows the terrain badge", () => {
    const { container } = render(
      <SummaryHeader
        result={resultWith()}
        courseName="Boston Marathon"
        terrain={boston}
      />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("Downhill");
    expect(text).toContain("−436 ft net");
  });

  // The grey "Costs 0.6% less than a flat course" line was removed on
  // 2026-09-20. The same figure is the "vs flat" column on /courses, and a
  // header that already shows a profile pill does not need it said in prose.
  it("carries no cost-versus-flat sentence", () => {
    const { container } = render(
      <SummaryHeader
        result={resultWith()}
        courseName="Boston Marathon"
        terrain={boston}
      />,
    );
    expect(container.textContent ?? "").not.toMatch(/flat course|Costs/);
  });

  it("omits the whole block when no terrain is passed", () => {
    const { container } = render(
      <SummaryHeader result={resultWith()} courseName="Boston Marathon" />,
    );
    const text = container.textContent ?? "";
    expect(text).not.toContain("Downhill");
  });

  // The Boston verdict row was removed from this header on 2026-09-20. It still
  // exists on /boston-qualifier, which is where a judgement of the RUNNER
  // belongs; this header describes a race and a plan for it.
  it("passes no judgement on the runner's Boston standard", () => {
    const { container } = render(
      <SummaryHeader
        result={resultWith()}
        courseName="Boston Marathon"
        terrain={boston}
      />,
    );
    expect(container.textContent ?? "").not.toMatch(
      /qualifier|Misses|standard|downhill index/,
    );
  });

  // The interactive course map (ROADMAP #22). Two entry points open one
  // dialog, because the silhouette they expand is hidden under `sm` and a
  // phone would otherwise have none. The overlay itself is stubbed: its own
  // suite covers what it renders, and it pulls in maplibre-gl, which jsdom
  // cannot construct.
  describe("course map entry points", () => {
    const geometry = loadGeometry("boston");
    const mapProps = {
      outline: geometry.outline,
      elevations: geometry.elevations,
      hills: courseHills(geometry.elevations),
    };

    it("offers no map when the geometry for one is missing", () => {
      const { queryByRole } = render(
        <SummaryHeader
          result={resultWith()}
          courseName="Boston Marathon"
          outline={geometry.outline}
        />,
      );
      expect(queryByRole("button", { name: "Course map" })).toBeNull();
      expect(
        queryByRole("button", { name: "Open the full course map" }),
      ).toBeNull();
    });

    it("offers both triggers once the geometry is there", () => {
      const { getByRole } = render(
        <SummaryHeader
          result={resultWith()}
          courseName="Boston Marathon"
          {...mapProps}
        />,
      );
      for (const name of ["Course map", "Open the full course map"]) {
        const trigger = getByRole("button", { name });
        expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
        expect(trigger.getAttribute("aria-expanded")).toBe("false");
      }
    });

    it("opens the dialog from the icon button and closes it again", () => {
      const { getByRole, queryByRole } = render(
        <SummaryHeader
          result={resultWith()}
          courseName="Boston Marathon"
          {...mapProps}
        />,
      );
      expect(queryByRole("dialog")).toBeNull();
      const trigger = getByRole("button", { name: "Course map" });
      fireEvent.click(trigger);
      expect(getByRole("dialog")).not.toBeNull();
      expect(trigger.getAttribute("aria-expanded")).toBe("true");
      fireEvent.click(getByRole("button", { name: "Close map" }));
      expect(queryByRole("dialog")).toBeNull();
    });

    it("opens the same dialog from the silhouette", () => {
      const { getByRole } = render(
        <SummaryHeader
          result={resultWith()}
          courseName="Boston Marathon"
          {...mapProps}
        />,
      );
      fireEvent.click(getByRole("button", { name: "Open the full course map" }));
      expect(getByRole("dialog")).not.toBeNull();
    });

    it("returns focus to whichever trigger opened it", () => {
      const { getByRole } = render(
        <SummaryHeader
          result={resultWith()}
          courseName="Boston Marathon"
          {...mapProps}
        />,
      );
      const outline = getByRole("button", { name: "Open the full course map" });
      fireEvent.click(outline);
      fireEvent.click(getByRole("button", { name: "Close map" }));
      expect(document.activeElement).toBe(outline);

      const icon = getByRole("button", { name: "Course map" });
      fireEvent.click(icon);
      fireEvent.click(getByRole("button", { name: "Close map" }));
      expect(document.activeElement).toBe(icon);
    });
  });
});
