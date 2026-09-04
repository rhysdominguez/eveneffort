import { describe, expect, it } from "vitest";
import { TTL_SECONDS, readWindow, roundCoord, writeWindow } from "@/db/weatherCache";

// These run with NO DATABASE — which is the point. CLAUDE.md Rule 9 requires
// the suite to pass with nothing reachable, and this module's whole contract is
// that a missing database is a cache miss rather than a fault.
describe("weather cache — degrades without a database", () => {
  it("reports a miss rather than throwing", async () => {
    await expect(
      readWindow(42.2288, -71.5228, "2026-04-20T13:00:00Z", "historical"),
    ).resolves.toBeNull();
  });

  it("swallows a write it cannot perform", async () => {
    await expect(
      writeWindow(
        42.2288,
        -71.5228,
        "2026-04-20T13:00:00Z",
        "historical",
        [{ tempC: 6, humidity: 60, windSpeed: 3.8, windDirection: 275 }],
        { raceDateISO: "2026-04-20" },
      ),
    ).resolves.toBeUndefined();
  });
});

describe("TTL policy", () => {
  it("keeps recorded past weather permanently", () => {
    // A morning that has happened has one set of conditions and no later fetch
    // can improve them. This null is what turns a metered historical API from a
    // recurring cost into a one-off backfill.
    expect(TTL_SECONDS.historical).toBeNull();
  });

  it("re-checks a climate average about once a year", () => {
    // It only moves when a new year joins the ten-year window.
    expect(TTL_SECONDS.typical).toBe(365 * 24 * 3600);
  });

  it("keeps forecasts short-lived", () => {
    // A forecast is a prediction that moves, and a stale one is worse than
    // none — so this must stay far below the historical/typical horizons.
    expect(TTL_SECONDS.forecast).toBe(900);
    expect(TTL_SECONDS.forecast).toBeLessThan(TTL_SECONDS.typical!);
  });
});

describe("roundCoord", () => {
  it("rounds to 4dp so the same start line is one cache key", () => {
    // Start lines make round trips through numeric columns and query strings,
    // so the same course can present as 42.2288 or 42.228800000000004.
    // Unrounded those are different keys and every lookup misses.
    expect(roundCoord(42.228800000000004)).toBe(42.2288);
    expect(roundCoord(-71.52284999)).toBe(-71.5228);
    expect(roundCoord(42.2288)).toBe(42.2288);
  });

  it("keeps distinct start lines distinct", () => {
    // 4dp is ~11 m — finer than any two real start lines we'd want to merge.
    expect(roundCoord(42.2288)).not.toBe(roundCoord(42.2289));
  });
});
