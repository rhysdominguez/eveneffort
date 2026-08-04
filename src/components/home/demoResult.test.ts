import { describe, it, expect } from "vitest";
import { DEMO_COURSE, DEMO_WEATHER, demoResult } from "./demoResult";

// The home page's feature rows render the real product components against this
// fixture, which is built by calling the pacing engine at module scope. That
// makes the home page silently coupled to the engine's output shape — these
// assertions are the tripwire, so a change there fails here rather than
// shipping a blank marketing section.
describe("demoResult", () => {
  it("builds a full marathon of splits", () => {
    // 26 full miles plus the 0.2 tail.
    expect(demoResult.rows).toHaveLength(27);
    expect(demoResult.rows.every((row) => row.adjustedPaceLabel !== "")).toBe(
      true,
    );
  });

  it("finishes on the goal time when no weather is applied", () => {
    expect(demoResult.weatherApplied).toBe(false);
    // Elevation adjustment is goal-normalized, so the finish is the goal
    // (modulo sub-second float drift).
    expect(demoResult.adjustedFinishSeconds).toBeCloseTo(3 * 3600 + 30 * 60, 3);
  });

  it("varies pace across the course rather than repeating one split", () => {
    const paces = new Set(
      demoResult.rows.map((row) => row.adjustedPaceSecPerUnit),
    );
    expect(paces.size).toBeGreaterThan(1);
  });

  it("carries fueling cues, so the paceband preview has droplets to show", () => {
    expect(demoResult.rows.some((row) => row.fueling)).toBe(true);
  });

  it("exposes a profile for the elevation chart", () => {
    expect(DEMO_COURSE.profile.length).toBeGreaterThan(0);
    expect(DEMO_COURSE.displayName).toBe("Boston Marathon");
  });

  it("prices heat as a real, non-zero cost", () => {
    expect(DEMO_WEATHER.costSeconds).toBeGreaterThan(0);
    expect(DEMO_WEATHER.goalLabel).toBe("3:30:00");
    expect(DEMO_WEATHER.adjustedLabel).not.toBe(DEMO_WEATHER.goalLabel);
  });
});
