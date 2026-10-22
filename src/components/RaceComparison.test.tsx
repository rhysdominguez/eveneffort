import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { RaceComparison, goalTimeError, sharedGapPace } from "./RaceComparison";
import { FIXTURE_CATALOG } from "@/data/courses.fixture";
import { gapPaceFromGoalTime } from "@/lib/pacing/effort";
import { MILE_IN_KM } from "@/lib/pacing/segments";
import type { CompareSelection } from "@/lib/compareParams";

// 3:20:00. Boston is the fastest of the seven fixture courses (total cost
// 0.99379). Berlin (1.00311) is not quite the slowest since ROADMAP #12 put
// the courses on the cost curve — Sydney is, at 1.00745 — but Boston → Berlin
// stays the pair here so the literals below have one reason to move, not two.
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
    expect(text).toContain("3:21:53"); // Boston 3:20 is 3:21:53 of Berlin
    expect(text).toContain("+1:53");
    expect(text).toContain("Boston Marathon");
    expect(text).toContain("Berlin Marathon");
  });

  it("colours the difference red when slower and green when faster", () => {
    const slower = page();
    expect(result(slower.container)!.innerHTML).toContain("--color-red-primary");

    // The same pair the other way round: Berlin → Boston must be faster.
    //
    // −1:52, not −1:53. The conversion is a RATIO, so the two directions are
    // not additively symmetric: +113 s is 113 s of a 12000 s Boston base, while
    // the return trip takes its percentage off a 12113 s Berlin one. The
    // round trip still lands exactly back on 3:20:00 — effort.test.ts pins
    // that — it is only the rounded differences that don't mirror.
    const faster = page({ fromId: "berlin", toId: "boston" });
    const text = result(faster.container)!.textContent!;
    expect(text).toContain("−1:52");
    expect(result(faster.container)!.innerHTML).toContain(
      "--color-green-primary",
    );
  });

  it("renders no difference at all when both courses are the same", () => {
    const { container } = page({ toId: "boston" });
    // An em dash, not "+0:00" — the two times are the same time.
    expect(result(container)!.textContent).toContain("—");
  });

  it("never touches the address bar, however much the form changes", () => {
    // This page used to rewrite the URL on every edit. It no longer does:
    // picking races and typing a time leaves the address bar exactly where the
    // runner arrived, and Copy link below is how a comparison gets shared.
    const { container } = page();
    const spy = vi.spyOn(window.history, "replaceState");
    const push = vi.spyOn(window.history, "pushState");
    fireEvent.change(container.querySelector('[aria-label="minutes"]')!, {
      target: { value: "" },
    });
    fireEvent.change(container.querySelector('[aria-label="minutes"]')!, {
      target: { value: "45" },
    });
    fireEvent.click(container.querySelector('[aria-label="Swap the two races"]')!);
    expect(spy).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    spy.mockRestore();
    push.mockRestore();
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
    expect(text).toContain("−1:52");
  });

  it("changes the pace unit without moving the converted time", () => {
    // The property the whole km-canonical decision exists to protect.
    const { container } = page();
    const before = result(container)!.textContent!;
    expect(before).toContain("3:21:53");
    expect(before).toContain("/km");

    fireEvent.click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "mi",
      )!,
    );
    const after = result(container)!.textContent!;
    expect(after).toContain("3:21:53");
    expect(after).toContain("/mi");
    expect(after).not.toContain("/km");
  });
});

describe("sharedGapPace", () => {
  const boston = FIXTURE_CATALOG.find((c) => c.id === "boston")!;

  it("is the km figure converted, NOT the mile segmentation recomputed", () => {
    const perKm = sharedGapPace(T, boston, "km");
    expect(sharedGapPace(T, boston, "miles")).toBeCloseTo(
      perKm * MILE_IN_KM,
      9,
    );
  });

  it("differs from the mile-segmented cost, which is why it is a function", () => {
    // If these were equal the helper would be pointless. They are not, and
    // using the mile figure would make the page's "the same on both" a lie.
    const naive =
      (T / (boston.cost.miles * boston.altitude.multiplier)) as number;
    expect(sharedGapPace(T, boston, "miles")).not.toBeCloseTo(naive, 3);
  });

  it("is the pace the ENGINE would quote, and deliberately is not", () => {
    // The page prints an equal-effort pace, not the pacing engine's
    // grade-adjusted pace. They read alike and are different quantities; see
    // equalEffortPace in src/lib/pacing/effort.ts.
    const engine = gapPaceFromGoalTime(T, boston.effort, "km");
    expect(sharedGapPace(T, boston, "km")).not.toBeCloseTo(engine, 3);
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
