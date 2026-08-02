// External-reference regression pin for the damped-Minetti pacing engine.
//
// Reference: FindMyMarathon.com's Boston Marathon pace band for a 3:00:00 goal
// with "Evenly Paced Start" + "Even Effort" strategy (transcribed from a
// screenshot of their band, July 2026). Their band is built from a completely
// independent method — Townshend et al. (2010) field observations plus
// regression over thousands of real mile-by-mile race splits — yet agrees with
// this engine's damped-Minetti output to within ±11 s cumulative at every
// checkpoint. That convergence was verified by hand and is pinned here so any
// silent drift in MINETTI_DAMPING (0.35), the guardrail caps, the elevation
// smoothing, or the Boston course data fails CI instead of shipping.
//
// Tolerance is ±15 s per cumulative checkpoint: comfortably above today's max
// observed diff (11 s, km 4–10, where FMM eases the crowded Hopkinton descent
// more than pure grade response predicts) and far below any change that would
// alter a runner's band by a meaningful amount.
import { describe, it, expect } from "vitest";
import { computePaceChart } from "./index";
import { getCourse } from "@/data/courses";
import type { PacingInput } from "@/types";

const GOAL_SECONDS = 3 * 3600; // 3:00:00

// FindMyMarathon cumulative elapsed times (seconds) at each km checkpoint
// their band lists. Source: FMM Boston 3:00:00 band screenshot, July 2026.
const FMM_ELAPSED: ReadonlyArray<[km: number, hms: string]> = [
  [2, "0:08:24"],
  [4, "0:16:57"],
  [5, "0:21:07"],
  [6, "0:25:20"],
  [8, "0:33:54"],
  [10, "0:42:25"],
  [12, "0:50:57"],
  [14, "0:59:30"],
  [15, "1:03:46"],
  [16, "1:08:04"],
  [18, "1:16:41"],
  [20, "1:25:10"],
  [22, "1:33:42"],
  [24, "1:42:16"],
  [25, "1:46:31"],
  [26, "1:50:42"],
  [28, "1:59:20"],
  [30, "2:07:57"],
  [32, "2:16:33"],
  [34, "2:25:14"],
  [35, "2:29:24"],
  [36, "2:33:38"],
  [38, "2:42:09"],
  [40, "2:50:36"],
  [42, "2:59:09"],
];

const FMM_HALF = "1:29:50"; // at 21.0975 km

const TOLERANCE_SECONDS = 15;

const toSeconds = (hms: string): number => {
  const [h, m, s] = hms.split(":").map(Number);
  return h * 3600 + m * 60 + s;
};

describe("Boston 3:00:00 vs FindMyMarathon reference band", () => {
  const input: PacingInput = {
    courseId: "boston",
    goalTimeSeconds: GOAL_SECONDS,
    unit: "km",
  };
  const rows = computePaceChart(input, getCourse("boston"));

  it("matches every FMM cumulative checkpoint within ±15 s", () => {
    for (const [km, hms] of FMM_ELAPSED) {
      // Row i covers km i+1, so the cumulative split at "km" is row km-1.
      const ours = rows[km - 1].cumulativeSplitSeconds;
      const theirs = toSeconds(hms);
      expect(
        Math.abs(ours - theirs),
        `km ${km}: ours ${ours.toFixed(1)}s vs FMM ${theirs}s`,
      ).toBeLessThanOrEqual(TOLERANCE_SECONDS);
    }
  });

  it("matches the FMM half-marathon split within ±15 s", () => {
    // Interpolate our elapsed time at 21.0975 km inside the km-22 row.
    const HALF_KM = 21.0975;
    const idx = Math.floor(HALF_KM); // 21 → row index 21 covers km 22
    const paceSecPerKm = rows[idx].adjustedPaceSecPerUnit;
    const ours =
      rows[idx - 1].cumulativeSplitSeconds + (HALF_KM - idx) * paceSecPerKm;
    expect(
      Math.abs(ours - toSeconds(FMM_HALF)),
      `half: ours ${ours.toFixed(1)}s vs FMM ${FMM_HALF}`,
    ).toBeLessThanOrEqual(TOLERANCE_SECONDS);
  });

  it("still lands exactly on the 3:00:00 goal (normalization invariant)", () => {
    expect(rows[rows.length - 1].cumulativeSplitSeconds).toBeCloseTo(
      GOAL_SECONDS,
      6,
    );
  });
});
