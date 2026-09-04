import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { RaceComparison, goalTimeError, sharedGapPace } from "./RaceComparison";
import { FIXTURE_CATALOG } from "@/data/courses.fixture";
import { parseResultsParams } from "@/lib/resultsParams";
import { gapPaceFromGoalTime } from "@/lib/pacing/effort";
import { MILE_IN_KM } from "@/lib/pacing/segments";
import type { CompareSelection } from "@/lib/compareParams";

// 3:20:00. Boston is the fastest of the seven fixture courses (0.99428) and
// Berlin the slowest (1.00005), so Boston → Berlin is the pair with the
// largest real spread available to a component test.
const T = 12000;

const initial = (over: Partial<CompareSelection> = {}): CompareSelection => ({
  fromId: "boston",
  toId: "berlin",
  goalTimeSeconds: T,
  unit: "km",
  ...over,
});

const page = (over: Partial<CompareSelection> = {}) =>
  render(<RaceComparison catalog={FIXTURE_CATALOG} initial={initial(over)} />);

const result = (c: HTMLElement) =>
  c.querySelector('[aria-label="Comparison result"]');

beforeEach(() => {
  window.history.replaceState(null, "", "/compare");
});

describe("RaceComparison", () => {
  it("gives the two course pickers distinct ids", () => {
    // CourseSearch namespaces its listbox and every option off `id`, so two
    // instances sharing one would collide on aria-activedescendant.
    const { container } = page();
    expect(container.querySelector("#compare-from")).not.toBeNull();
    expect(container.querySelector("#compare-to")).not.toBeNull();
    expect(container.querySelectorAll('[role="combobox"]')).toHaveLength(2);
  });

  it("converts a known pair, and names both courses", () => {
    const { container } = page();
    const text = result(container)!.textContent!;
    expect(text).toContain("3:20:00");
    expect(text).toContain("3:21:10"); // Boston 3:20 is 3:21:10 of Berlin
    expect(text).toContain("+1:10");
    expect(text).toContain("Boston Marathon");
    expect(text).toContain("Berlin Marathon");
  });

  it("colours the difference red when slower and green when faster", () => {
    const slower = page();
    expect(result(slower.container)!.innerHTML).toContain("--color-red-primary");

    // The same pair the other way round: Berlin → Boston must be faster.
    //
    // −1:09, not −1:10. The conversion is a RATIO, so the two directions are
    // not additively symmetric: +70 s is 70 s of a 12000 s Boston base, while
    // the return trip takes its percentage off a 12070 s Berlin one. The
    // round trip still lands exactly back on 3:20:00 — effort.test.ts pins
    // that — it is only the rounded differences that don't mirror.
    const faster = page({ fromId: "berlin", toId: "boston" });
    const text = result(faster.container)!.textContent!;
    expect(text).toContain("−1:09");
    expect(result(faster.container)!.innerHTML).toContain(
      "--color-green-primary",
    );
  });

  it("renders no difference at all when both courses are the same", () => {
    const { container } = page({ toId: "boston" });
    // An em dash, not "+0:00" — the two times are the same time.
    expect(result(container)!.textContent).toContain("—");
  });

  it("hands the converted time to the pacing calculator", () => {
    const { container } = page();
    const cta = Array.from(container.querySelectorAll("a")).find((a) =>
      a.textContent?.includes("Build a pacing chart"),
    )!;
    const href = cta.getAttribute("href")!;
    const parsed = parseResultsParams(
      Object.fromEntries(new URLSearchParams(href.slice(href.indexOf("?") + 1))),
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.input.courseId).toBe("berlin");
      expect(parsed.input.goalTimeSeconds).toBe(12070); // 3:21:10
    }
  });

  it("rewrites the address bar without adding a history entry", () => {
    const spy = vi.spyOn(window.history, "replaceState");
    page();
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls.at(-1)?.[2]).toBe(
      "/compare?from=boston&to=berlin&t=12000",
    );
    spy.mockRestore();
  });

  it("stops rewriting the URL while the time is half-typed", () => {
    const { container } = page();
    const spy = vi.spyOn(window.history, "replaceState");
    fireEvent.change(container.querySelector('[aria-label="minutes"]')!, {
      target: { value: "" },
    });
    // A cleared field is mid-edit, not a new comparison — the URL someone may
    // be about to copy must not be blown away by it.
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("hides the result and explains itself on an invalid time", () => {
    const { container } = page();
    fireEvent.change(container.querySelector('[aria-label="minutes"]')!, {
      target: { value: "75" },
    });
    expect(result(container)).toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Minutes must be 0–59",
    );
  });

  it("swaps the two races", () => {
    const { container } = page();
    fireEvent.click(container.querySelector('[aria-label="Swap the two races"]')!);
    const text = result(container)!.textContent!;
    // Boston is now the target, so the difference flips sign — to −1:09, for
    // the ratio reason spelled out in the colour test above.
    expect(text).toContain("Your time at Berlin Marathon");
    expect(text).toContain("−1:09");
  });

  it("changes the pace unit without moving the converted time", () => {
    // The property the whole km-canonical decision exists to protect.
    const { container } = page();
    const before = result(container)!.textContent!;
    expect(before).toContain("3:21:10");
    expect(before).toContain("/km");

    fireEvent.click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "mi",
      )!,
    );
    const after = result(container)!.textContent!;
    expect(after).toContain("3:21:10");
    expect(after).toContain("/mi");
    expect(after).not.toContain("/km");
  });
});

describe("sharedGapPace", () => {
  const boston = FIXTURE_CATALOG.find((c) => c.id === "boston")!;

  it("is the km figure converted, NOT the mile segmentation recomputed", () => {
    const perKm = sharedGapPace(T, boston.effort, "km");
    expect(sharedGapPace(T, boston.effort, "miles")).toBeCloseTo(
      perKm * MILE_IN_KM,
      9,
    );
  });

  it("differs from the mile-segmented GAP, which is why it is a function", () => {
    // If these were equal the helper would be pointless. They are not, and
    // using the mile figure would make the page's "the same on both" a lie.
    const naive = gapPaceFromGoalTime(T, boston.effort, "miles");
    expect(sharedGapPace(T, boston.effort, "miles")).not.toBeCloseTo(naive, 3);
  });
});

describe("goalTimeError", () => {
  it("accepts an ordinary marathon time", () => {
    expect(goalTimeError({ hours: 3, minutes: 20, seconds: 0 })).toBeNull();
  });

  it("rejects the same bounds InputForm does", () => {
    expect(goalTimeError({ hours: 10, minutes: 0, seconds: 0 })).toContain(
      "Hours",
    );
    expect(goalTimeError({ hours: 3, minutes: 60, seconds: 0 })).toContain(
      "Minutes",
    );
    expect(goalTimeError({ hours: 3, minutes: 0, seconds: 60 })).toContain(
      "Seconds",
    );
    expect(goalTimeError({ hours: 0, minutes: 0, seconds: 0 })).toContain(
      "Enter a finish time",
    );
    expect(goalTimeError({ hours: NaN, minutes: 0, seconds: 0 })).toContain(
      "Hours",
    );
  });
});
