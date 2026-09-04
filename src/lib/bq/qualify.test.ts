import { describe, it, expect } from "vitest";
import { bqStatus, cutoffOutlook, RECENT_CUTOFF_COUNT } from "./qualify";
import { BQ_CUTOFFS } from "./standards";
import { M_TO_FT } from "@/lib/units/elevation";
import type { CourseTerrain } from "@/types";

const hms = (h: number, m: number, s = 0) => h * 3600 + m * 60 + s;

const dropped = (dropFt: number): CourseTerrain => ({
  gainM: 0,
  lossM: 0,
  netM: -dropFt / M_TO_FT,
});

const flat: CourseTerrain = { gainM: 40, lossM: 40, netM: 0 };

describe("bqStatus — clearing the standard", () => {
  it("ACCEPTS a time exactly equal to the standard", () => {
    // The B.A.A. takes times at or faster than the standard, so this is `<=`.
    // An off-by-one here tells a runner who ran precisely 3:05:00 that they
    // missed, which is the worst thing this module could get wrong.
    const status = bqStatus({
      finishSeconds: hms(3, 5),
      age: 41,
      division: "men",
    })!;
    expect(status.standardSeconds).toBe(hms(3, 5));
    expect(status.marginSeconds).toBe(0);
    expect(status.clears).toBe(true);
  });

  it("rejects a time one second over", () => {
    const status = bqStatus({
      finishSeconds: hms(3, 5, 1),
      age: 41,
      division: "men",
    })!;
    expect(status.clears).toBe(false);
    expect(status.marginSeconds).toBe(-1);
  });

  it("reports the buffer as a POSITIVE margin when under the standard", () => {
    const status = bqStatus({
      finishSeconds: hms(3, 0),
      age: 41,
      division: "men",
    })!;
    expect(status.marginSeconds).toBe(5 * 60);
    expect(status.clears).toBe(true);
  });

  it("has no verdict for someone under 18", () => {
    expect(bqStatus({ finishSeconds: hms(3, 0), age: 17, division: "men" })).toBeNull();
  });

  it("applies no index when no course is given", () => {
    const status = bqStatus({ finishSeconds: hms(3, 0), age: 30, division: "women" })!;
    expect(status.indexSeconds).toBe(0);
    expect(status.adjustedSeconds).toBe(hms(3, 0));
    expect(status.nearThreshold).toBe(false);
  });
});

describe("bqStatus — the net-downhill index", () => {
  it("adds the index to the RUNNER'S TIME, not to the standard", () => {
    const status = bqStatus({
      finishSeconds: hms(3, 0),
      age: 41,
      division: "men",
      terrain: dropped(2000),
    })!;
    expect(status.standardSeconds).toBe(hms(3, 5)); // unmoved
    expect(status.indexSeconds).toBe(300);
    expect(status.adjustedSeconds).toBe(hms(3, 5));
    expect(status.clears).toBe(true); // exactly on the line, so still in
  });

  it("flips a marginal qualifier to a miss on a downhill course", () => {
    const input = { finishSeconds: hms(3, 1), age: 41, division: "men" as const };
    expect(bqStatus({ ...input, terrain: flat })!.clears).toBe(true);
    expect(bqStatus({ ...input, terrain: dropped(2000) })!.clears).toBe(false);
  });

  it("applies the steeper band's ten minutes", () => {
    const status = bqStatus({
      finishSeconds: hms(2, 50),
      age: 41,
      division: "men",
      terrain: dropped(4000),
    })!;
    expect(status.indexSeconds).toBe(600);
    expect(status.adjustedSeconds).toBe(hms(3, 0));
    expect(status.clears).toBe(true);
  });

  it("never clears on an ineligible course, however fast the time", () => {
    const status = bqStatus({
      finishSeconds: hms(2, 0),
      age: 41,
      division: "men",
      terrain: dropped(7000),
    })!;
    expect(status.eligible).toBe(false);
    expect(status.clears).toBe(false);
  });

  it("carries the near-threshold caveat through from the course", () => {
    expect(
      bqStatus({
        finishSeconds: hms(3, 0),
        age: 41,
        division: "men",
        terrain: dropped(1520),
      })!.nearThreshold,
    ).toBe(true);
  });
});

describe("cutoffOutlook", () => {
  const recent = BQ_CUTOFFS.slice(0, RECENT_CUTOFF_COUNT);

  it("weighs the five most recent years", () => {
    expect(cutoffOutlook(0).considered).toEqual(recent);
    expect(cutoffOutlook(0).toughest.year).toBe(2025); // 6:51, the hardest of them
  });

  it("counts a zero buffer as enough only for the years that took everyone", () => {
    // 2023 and 2022 had no cut-off at all; the other three did.
    expect(cutoffOutlook(0).clearedCount).toBe(2);
    expect(cutoffOutlook(0).clearsToughest).toBe(false);
  });

  it("counts a buffer that beats every recent cut-off", () => {
    const outlook = cutoffOutlook(7 * 60);
    expect(outlook.clearedCount).toBe(RECENT_CUTOFF_COUNT);
    expect(outlook.clearsToughest).toBe(true);
  });

  it("treats a buffer equal to a cut-off as enough for that year", () => {
    expect(cutoffOutlook(411).clearsToughest).toBe(true);
    expect(cutoffOutlook(410).clearsToughest).toBe(false);
  });

  it("counts nothing for a runner who missed the standard outright", () => {
    expect(cutoffOutlook(-60).clearedCount).toBe(0);
  });
});
