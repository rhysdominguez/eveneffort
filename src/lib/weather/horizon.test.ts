import { describe, expect, it } from "vitest";
import {
  FORECAST_HORIZON_DAYS,
  daysUntilISO,
  hasLiveForecast,
} from "./horizon";

const TODAY = "2026-09-21";

describe("daysUntilISO", () => {
  it("is 0 for today and counts whole days forward", () => {
    expect(daysUntilISO("2026-09-21", TODAY)).toBe(0);
    expect(daysUntilISO("2026-09-26", TODAY)).toBe(5);
  });

  it("is negative for a past date", () => {
    expect(daysUntilISO("2026-09-20", TODAY)).toBe(-1);
  });

  it("crosses a month and a year boundary without drifting", () => {
    expect(daysUntilISO("2026-10-01", TODAY)).toBe(10);
    expect(daysUntilISO("2027-09-21", TODAY)).toBe(365);
  });

  // A date-only value has no timezone, so it must not acquire one. Parsed at
  // local midnight instead of UTC, a DST transition inside the span would make
  // the difference 4.96 or 5.04 days and the boundary test below would flip.
  it("is exact across a DST transition", () => {
    expect(daysUntilISO("2026-11-02", "2026-10-28")).toBe(5);
    expect(daysUntilISO("2026-03-10", "2026-03-05")).toBe(5);
  });

  it("returns NaN for an unparseable date rather than a wrong number", () => {
    expect(daysUntilISO("not-a-date", TODAY)).toBeNaN();
  });
});

describe("hasLiveForecast", () => {
  it("highlights a race inside the horizon", () => {
    expect(hasLiveForecast("2026-09-23", TODAY)).toBe(true);
  });

  it("highlights a race today", () => {
    expect(hasLiveForecast(TODAY, TODAY)).toBe(true);
  });

  // The boundary is decided here, on purpose, rather than falling out of an
  // off-by-one somewhere: day FORECAST_HORIZON_DAYS is IN, day + 1 is OUT.
  it("includes the last day of the horizon and excludes the next", () => {
    const inside = daysUntilISO("2026-09-26", TODAY);
    expect(inside).toBe(FORECAST_HORIZON_DAYS);
    expect(hasLiveForecast("2026-09-26", TODAY)).toBe(true);
    expect(hasLiveForecast("2026-09-27", TODAY)).toBe(false);
  });

  it("does not highlight a race beyond the horizon", () => {
    expect(hasLiveForecast("2026-11-01", TODAY)).toBe(false);
  });

  // A past race has recorded conditions, which is a better answer than a
  // forecast — but it is not a forecast, so it does not wear the badge.
  it("does not highlight a race that has already been run", () => {
    expect(hasLiveForecast("2026-09-20", TODAY)).toBe(false);
  });

  /**
   * `estimated` is the seed's DEFAULT, not its exception, so excluding those
   * dates left the mark on almost nothing — two races five days out, neither
   * marked. It is also what the app really does: `weatherSourceFor` serves a
   * genuine forecast for any FUTURE date whatever its confidence, and only
   * forces climatology for an estimated date in the past. The chip still says
   * "est." beside the mark, so the date's uncertainty is not hidden.
   */
  it("highlights a future race whose date is only estimated", () => {
    expect(hasLiveForecast("2026-09-23", TODAY)).toBe(true);
  });

  it("does not highlight an unparseable date", () => {
    expect(hasLiveForecast("", TODAY)).toBe(false);
  });
});
