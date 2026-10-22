import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { InputForm } from "./InputForm";
import type { PacingInput } from "@/types";
import { FIXTURE_CATALOG } from "@/data/courses.fixture";
import { clearStoredState } from "@/test/storage";
import { writeState } from "@/lib/clientState";
import { GOAL_MODE } from "@/lib/stateKeys";

// The Time / Pace / GAP control is switched OFF in the shipped app
// (GOAL_INPUT_MODES_ENABLED), so this file turns it on. That is the whole
// reason the file exists: a flag whose feature has no tests is a feature that
// has quietly rotted by the time anyone flips it back. Everything here is the
// suite that ran against the live control before it was hidden, unchanged.
//
// `InputForm.test.tsx` covers the other half — that with the flag in its real
// state the dashboard shows no such control and stays on a finish time.
vi.mock("@/lib/featureFlags", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/featureFlags")>()),
  GOAL_INPUT_MODES_ENABLED: true,
}));

// Stored state leaks between tests in one jsdom file, and a stored goal mode
// decides which fields render.
beforeEach(clearStoredState);


// The goal can be stated three ways, and all three collapse to the one
// `goalTimeSeconds` the engine and the URL have always carried. These tests
// are mostly about that collapse being right, and about which value is held
// when something else moves.
describe("InputForm — goal as time, pace or GAP", () => {
  // The form opens on InputForm's own default course (Boston — see
  // src/lib/catalog.ts), a ~140 m net drop. Berlin is the contrast: as near
  // flat as a road marathon gets.
  const boston = FIXTURE_CATALOG.find((c) => c.id === "boston")!;
  const defaultCourse = boston;
  const berlin = FIXTURE_CATALOG.find((c) => c.id === "berlin")!;

  const mounted = (props: Partial<Parameters<typeof InputForm>[0]> = {}) => {
    const seen: PacingInput[] = [];
    const view = render(
      <InputForm
        catalog={FIXTURE_CATALOG}
        onChange={(i) => {
          seen.push(i);
        }}
        {...props}
      />,
    );
    return { view, last: () => seen[seen.length - 1] };
  };

  const setPace = (view: ReturnType<typeof render>, min: number, sec: number) => {
    fireEvent.change(view.getByLabelText("pace minutes"), {
      target: { value: String(min) },
    });
    fireEvent.change(view.getByLabelText("pace seconds"), {
      target: { value: String(sec) },
    });
  };

  it("defaults to a finish time, exactly as before", () => {
    const { view, last } = mounted();
    expect(view.getByText("Goal finish time")).toBeTruthy();
    expect(last().goalTimeSeconds).toBe(4 * 3600);
  });

  it("turns an average pace into the finish time it implies", () => {
    const { view, last } = mounted();
    fireEvent.click(view.getByText("Pace"));
    setPace(view, 5, 0);
    // 5:00/km over 42.195 km.
    expect(last().goalTimeSeconds).toBeCloseTo(300 * 42.195, 6);
  });

  it("turns a GAP into a finish time using the course's own effort", () => {
    const { view, last } = mounted();
    fireEvent.click(view.getByText("GAP"));
    setPace(view, 5, 0);
    expect(last().goalTimeSeconds).toBeCloseTo(
      300 * defaultCourse.effort.km,
      6,
    );
  });

  it("carries the goal across a mode switch instead of resetting it", () => {
    const { view, last } = mounted();
    const before = last().goalTimeSeconds;
    fireEvent.click(view.getByText("Pace"));
    // 4:00:00 over 42.195 km is 5:41/km, which rounds back to within a second
    // per km of where it started.
    expect(last().goalTimeSeconds).toBeCloseTo(before, -1.5);
    expect(view.getByText("Goal average pace")).toBeTruthy();
  });

  it("HOLDS the GAP when the course changes — the point of the mode", () => {
    const { view, last } = mounted();
    fireEvent.click(view.getByText("GAP"));
    setPace(view, 5, 0);
    const bostonGoal = last().goalTimeSeconds;

    // Same combobox interaction the date-prefill tests use.
    const courseInput = view.container.querySelector("#course") as HTMLInputElement;
    fireEvent.focus(courseInput);
    fireEvent.change(courseInput, { target: { value: berlin.displayName } });
    fireEvent.keyDown(courseInput, { key: "Enter" });

    // Same pace held, different course, therefore a different finish — and
    // slower, because flat Berlin costs more effort than Boston's net drop.
    expect((view.getByLabelText("pace minutes") as HTMLInputElement).value).toBe("5");
    expect(last().courseId).toBe("berlin");
    expect(last().goalTimeSeconds).toBeCloseTo(300 * berlin.effort.km, 6);
    expect(last().goalTimeSeconds).toBeGreaterThan(bostonGoal);
  });

  it("holds the physical pace when the distance unit changes", () => {
    const { view, last } = mounted();
    fireEvent.click(view.getByText("Pace"));
    setPace(view, 5, 0);
    const beforeGoal = last().goalTimeSeconds;

    fireEvent.click(view.getByText("mi"));

    // 5:00/km is 8:03.2/mi — the number on screen changes, the race does not.
    // Not exact: the field holds whole seconds, and 0.2 s/mi of rounding is
    // ~5 s over the race. That is the cost of showing a pace people can read.
    expect((view.getByLabelText("pace minutes") as HTMLInputElement).value).toBe("8");
    expect((view.getByLabelText("pace seconds") as HTMLInputElement).value).toBe("3");
    expect(Math.abs(last().goalTimeSeconds - beforeGoal)).toBeLessThan(15);
  });

  // Average goal pace needs no gloss; grade-adjusted pace does.
  it("explains the pace only in GAP mode", () => {
    const { view } = mounted();
    fireEvent.click(view.getByText("Pace"));
    expect(view.container.textContent).not.toContain("average out to this");
    fireEvent.click(view.getByText("GAP"));
    expect(view.container.textContent).toContain("Your goal pace on flat ground");
  });

  it("rejects a pace that implies an absurd race", () => {
    const { view } = mounted();
    fireEvent.click(view.getByText("Pace"));
    setPace(view, 0, 0);
    expect(view.container.textContent).toContain("Pace must be greater than 0");
  });

  // The query string is authoritative for everything it can express. A stored
  // mode preference decides how the goal is DISPLAYED; it must never decide
  // what the goal IS.
  it("shows a shared link's own goal, not a default, in a stored pace mode", () => {
    writeState(GOAL_MODE, "gap");
    const initial: PacingInput = {
      courseId: "boston",
      unit: "km",
      goalTimeSeconds: 3 * 3600, // a 3:00 marathon
    };
    const { view, last } = mounted({ initial });

    // Seeded from the link: 3:00:00 at Boston is 4:17/km grade-adjusted, not
    // the 5:00 the field would otherwise default to.
    expect((view.getByLabelText("pace minutes") as HTMLInputElement).value).toBe("4");
    // And the goal that goes back out is still the one the link carried.
    // Exactly, not approximately: the displayed 4:17 would multiply back to
    // 2:59:42, and a link has to reproduce the chart it was sent for.
    expect(last().goalTimeSeconds).toBe(3 * 3600);
  });

  it("hands the pace back the canonical role as soon as the course changes", () => {
    writeState(GOAL_MODE, "gap");
    const { view, last } = mounted({
      initial: { courseId: "boston", unit: "km", goalTimeSeconds: 3 * 3600 },
    });
    expect(last().goalTimeSeconds).toBe(3 * 3600);

    const courseInput = view.container.querySelector("#course") as HTMLInputElement;
    fireEvent.focus(courseInput);
    fireEvent.change(courseInput, { target: { value: "Berlin Marathon" } });
    fireEvent.keyDown(courseInput, { key: "Enter" });

    // Now the 4:17/km GAP is what is held, and flat Berlin costs more of it
    // than Boston's net drop did.
    expect(last().courseId).toBe("berlin");
    expect(last().goalTimeSeconds).toBeGreaterThan(3 * 3600);
  });

  it("asks the hero for a finish time only, with no mode toggle", () => {
    // The hero form is deliberately minimal — core race setup plus Calculate —
    // so pace and GAP are dashboard-only ways of stating the goal, and with a
    // single mode there is no toggle to show.
    const hero = render(
      <InputForm catalog={FIXTURE_CATALOG} onCalculate={() => {}} />,
    );
    expect(hero.getByText("Goal finish time")).toBeTruthy();
    expect(hero.queryByLabelText("Goal input mode")).toBeNull();
    expect(hero.queryByText("Pace")).toBeNull();
    expect(hero.queryByText("GAP")).toBeNull();

    const dashboard = render(
      <InputForm catalog={FIXTURE_CATALOG} onChange={() => {}} />,
    );
    expect(dashboard.getByLabelText("Goal input mode")).toBeTruthy();
    expect(dashboard.getByText("GAP").hasAttribute("disabled")).toBe(false);
  });

  // Without a toggle, a mode carried over from the dashboard would be a room
  // with no door: the hero has to ignore the stored preference, not honor it.
  it.each(["pace", "gap"] as const)(
    "puts the hero on a finish time when the stored preference is %s",
    (mode) => {
      writeState(GOAL_MODE, mode);
      const hero = render(
        <InputForm catalog={FIXTURE_CATALOG} onCalculate={() => {}} />,
      );
      expect(hero.getByText("Goal finish time")).toBeTruthy();
      expect(hero.queryByLabelText("pace minutes")).toBeNull();
      expect(hero.getByLabelText("hours")).toBeTruthy();
    },
  );

  it("disables GAP rather than guessing when no course effort is known", () => {
    // The no-database degradation: an empty catalog still has to render a
    // usable form (Rule 9).
    const { view } = mounted({ catalog: [] });
    expect((view.getByText("GAP") as HTMLButtonElement).disabled).toBe(true);
    expect((view.getByText("Pace") as HTMLButtonElement).disabled).toBe(false);
  });
});
