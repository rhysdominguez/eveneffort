import { describe, it, expect } from "vitest";
import type { PaceChartRow } from "@/types";
import {
  applyFuelingToRows,
  buildFuelingPlan,
  gelIntervalSeconds,
  GEL_INTERVAL_SECONDS,
} from "./fueling";

// 43 evenly-spaced rows summing to a 4-hour finish (cumulative splits only).
const fourHourRows = (): Pick<PaceChartRow, "cumulativeSplitSeconds">[] => {
  const total = 4 * 3600;
  return Array.from({ length: 43 }, (_, i) => ({
    cumulativeSplitSeconds: ((i + 1) / 43) * total,
  }));
};

describe("buildFuelingPlan", () => {
  it("places one gel every 25 minutes, floor(total / 1500) of them", () => {
    const total = 4 * 3600; // 14400 s
    const cues = buildFuelingPlan(total, fourHourRows());
    expect(cues).toHaveLength(Math.floor(total / GEL_INTERVAL_SECONDS)); // 9
    expect(cues[0].atSeconds).toBe(1500);
    expect(cues[1].atSeconds).toBe(3000);
    expect(cues[cues.length - 1].atSeconds).toBe(13500);
    expect(cues[0].label).toBe("Take Gel (25g)");
  });

  it("maps each gel to the first row whose cumulative split reaches it", () => {
    const cues = buildFuelingPlan(4 * 3600, fourHourRows());
    for (const cue of cues) {
      const row = fourHourRows()[cue.segmentIndex];
      expect(row.cumulativeSplitSeconds).toBeGreaterThanOrEqual(cue.atSeconds);
      if (cue.segmentIndex > 0) {
        const prev = fourHourRows()[cue.segmentIndex - 1];
        expect(prev.cumulativeSplitSeconds).toBeLessThan(cue.atSeconds);
      }
    }
  });

  it("returns nothing for an empty chart or a sub-25-minute race", () => {
    expect(buildFuelingPlan(4 * 3600, [])).toEqual([]);
    expect(buildFuelingPlan(1000, fourHourRows())).toEqual([]);
  });

  it("spaces gels by the intake target", () => {
    const total = 4 * 3600;
    // 25 g gels: 30 g/hr ⇒ every 50 min, 100 g/hr ⇒ every 15 min.
    expect(buildFuelingPlan(total, fourHourRows(), 30)).toHaveLength(4);
    expect(buildFuelingPlan(total, fourHourRows(), 60)).toHaveLength(9);
    expect(buildFuelingPlan(total, fourHourRows(), 100)).toHaveLength(16);

    const slow = buildFuelingPlan(total, fourHourRows(), 30);
    expect(slow[0].atSeconds).toBe(3000);
    expect(slow[1].atSeconds).toBe(6000);
  });

  it("keeps fractional intervals from drifting across the race", () => {
    // 35 g/hr ⇒ 2571.43 s, which repeated addition would accumulate error on.
    const interval = gelIntervalSeconds(35);
    const cues = buildFuelingPlan(4 * 3600, fourHourRows(), 35);
    cues.forEach((cue, i) => {
      expect(cue.atSeconds).toBeCloseTo((i + 1) * interval, 9);
    });
  });

  it("ignores a non-positive intake target rather than looping forever", () => {
    expect(buildFuelingPlan(4 * 3600, fourHourRows(), 0)).toEqual([]);
  });
});

describe("gelIntervalSeconds", () => {
  it("is how long one 25 g gel lasts at the given rate", () => {
    expect(gelIntervalSeconds(30)).toBe(3000); // 50 min
    expect(gelIntervalSeconds(60)).toBe(GEL_INTERVAL_SECONDS); // 25 min
    expect(gelIntervalSeconds(100)).toBe(900); // 15 min
  });
});

describe("applyFuelingToRows", () => {
  it("attaches cues to their rows and nulls the rest", () => {
    const rows: PaceChartRow[] = fourHourRows().map((r, i) => ({
      segmentLabel: String(i + 1),
      elevationDeltaM: 0,
      adjustedPaceSecPerUnit: 300,
      adjustedPaceLabel: "5:00 /km",
      cumulativeSplitSeconds: r.cumulativeSplitSeconds,
      cumulativeSplitLabel: "0:00:00",
    }));
    const cues = buildFuelingPlan(4 * 3600, rows);
    const withFuel = applyFuelingToRows(rows, cues);

    const fueled = withFuel.filter((r) => r.fueling);
    expect(fueled).toHaveLength(cues.length);
    for (const cue of cues) {
      expect(withFuel[cue.segmentIndex].fueling).toEqual(cue);
    }
  });
});
