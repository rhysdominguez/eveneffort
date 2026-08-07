import { describe, it, expect } from "vitest";
import {
  CALENDAR_DEFAULT_GOAL_SECONDS,
  canStep,
  editionHref,
  editionLinkLabel,
  editionsInMonth,
  groupEditionsByDate,
  initialMonth,
  isPastDate,
  monthBounds,
  monthKey,
  monthKeyOf,
  monthLabel,
  stepMonth,
} from "@/components/home/calendarData";
import { parseResultsParams } from "@/lib/resultsParams";
import { DEFAULT_FUELING } from "@/types";
import { FIXTURE_EDITIONS, FIXTURE_TODAY } from "@/data/editions.fixture";

const sydney = FIXTURE_EDITIONS.find((e) => e.courseId === "sydney")!;
const chicago = FIXTURE_EDITIONS.find((e) => e.courseId === "chicago")!;

describe("monthKeyOf / monthKey", () => {
  it("reduces an ISO date to its year-month", () => {
    expect(monthKeyOf("2026-09-27")).toBe("2026-09");
  });

  it("zero-pads a view state so keys compare lexicographically", () => {
    expect(monthKey({ year: 2026, month: 9 })).toBe("2026-09");
    // Without the pad this would be "2026-9", which sorts AFTER "2026-10"
    // and would silently break every bounds comparison.
    expect(monthKey({ year: 2026, month: 10 })).toBe("2026-10");
    expect(monthKey({ year: 2026, month: 9 }) < monthKey({ year: 2026, month: 10 })).toBe(true);
  });
});

describe("groupEditionsByDate", () => {
  it("collects every edition sharing a date into one cell", () => {
    const byDate = groupEditionsByDate(FIXTURE_EDITIONS);
    expect(byDate.get("2026-10-11")).toHaveLength(2);
    expect(byDate.get("2026-08-30")).toHaveLength(1);
    expect(byDate.get("2026-08-29")).toBeUndefined();
  });
});

describe("editionsInMonth", () => {
  it("returns only that month's races, in date order", () => {
    const october = editionsInMonth(FIXTURE_EDITIONS, { year: 2026, month: 10 });
    expect(october.map((e) => e.courseId)).toEqual(["chicago", "london"]);
  });

  it("returns nothing for a month with no races", () => {
    expect(editionsInMonth(FIXTURE_EDITIONS, { year: 2026, month: 12 })).toEqual(
      [],
    );
  });
});

describe("isPastDate", () => {
  it("treats today itself as not past — a race is runnable on its own day", () => {
    expect(isPastDate(FIXTURE_TODAY, FIXTURE_TODAY)).toBe(false);
    expect(isPastDate("2026-08-03", FIXTURE_TODAY)).toBe(true);
    expect(isPastDate("2026-08-05", FIXTURE_TODAY)).toBe(false);
  });
});

describe("initialMonth", () => {
  it("opens on the month holding the soonest race still to come", () => {
    // Boston 2026-04-20 is behind us; Sydney 2026-08-30 is the next one.
    expect(initialMonth(FIXTURE_EDITIONS, FIXTURE_TODAY)).toEqual({
      year: 2026,
      month: 8,
    });
  });

  it("falls back to the current month once every race is behind us", () => {
    expect(initialMonth(FIXTURE_EDITIONS, "2030-06-15")).toEqual({
      year: 2030,
      month: 6,
    });
  });

  it("falls back to the current month for an empty list", () => {
    expect(initialMonth([], FIXTURE_TODAY)).toEqual({ year: 2026, month: 8 });
  });
});

describe("monthBounds", () => {
  it("spans the seeded editions", () => {
    expect(monthBounds(FIXTURE_EDITIONS, FIXTURE_TODAY)).toEqual({
      min: { year: 2026, month: 4 },
      max: { year: 2027, month: 3 },
    });
  });

  it("always widens to include the current month", () => {
    // Today sits outside the edition range at both ends in turn.
    expect(monthBounds(FIXTURE_EDITIONS, "2025-01-09")?.min).toEqual({
      year: 2025,
      month: 1,
    });
    expect(monthBounds(FIXTURE_EDITIONS, "2028-11-02")?.max).toEqual({
      year: 2028,
      month: 11,
    });
  });

  it("has no bounds without editions — there is no calendar to bound", () => {
    expect(monthBounds([], FIXTURE_TODAY)).toBeNull();
  });
});

describe("stepMonth / canStep", () => {
  const bounds = monthBounds(FIXTURE_EDITIONS, FIXTURE_TODAY);

  it("moves exactly one month, rolling the year over", () => {
    expect(stepMonth({ year: 2026, month: 12 }, 1, bounds)).toEqual({
      year: 2027,
      month: 1,
    });
    expect(stepMonth({ year: 2027, month: 1 }, -1, bounds)).toEqual({
      year: 2026,
      month: 12,
    });
  });

  it("refuses to step past either end of the range", () => {
    const min = { year: 2026, month: 4 };
    const max = { year: 2027, month: 3 };
    expect(stepMonth(min, -1, bounds)).toEqual(min);
    expect(stepMonth(max, 1, bounds)).toEqual(max);
    expect(canStep(min, -1, bounds)).toBe(false);
    expect(canStep(min, 1, bounds)).toBe(true);
    expect(canStep(max, 1, bounds)).toBe(false);
    expect(canStep(max, -1, bounds)).toBe(true);
  });

  it("steps a strictly empty month rather than skipping it", () => {
    // December 2026 holds no races. The arrow still lands there — the empty
    // state is the message, not something to navigate around.
    expect(stepMonth({ year: 2026, month: 11 }, 1, bounds)).toEqual({
      year: 2026,
      month: 12,
    });
  });
});

describe("monthLabel", () => {
  it("names the month without Intl, so output never varies by host locale", () => {
    expect(monthLabel({ year: 2026, month: 9 })).toBe("September 2026");
  });
});

describe("editionHref", () => {
  it("carries the course, the form's defaults and the race date", () => {
    const url = new URL(editionHref(chicago), "https://example.com");
    expect(url.pathname).toBe("/results");
    expect(url.searchParams.get("courseId")).toBe("chicago");
    expect(url.searchParams.get("unit")).toBe("km");
    expect(url.searchParams.get("goalTimeSeconds")).toBe(
      String(CALENDAR_DEFAULT_GOAL_SECONDS),
    );
    expect(CALENDAR_DEFAULT_GOAL_SECONDS).toBe(4 * 3600);
    expect(url.searchParams.get("date")).toBe("2026-10-11");
    expect(url.searchParams.get("start")).toBe("07:30");
    // Fueling is signalled by PRESENCE, so leaving `carbs` out would land the
    // visitor on a plan with no gel cues — unlike pressing Calculate on the
    // fresh form, which this link is supposed to be indistinguishable from.
    expect(url.searchParams.get("carbs")).toBe(
      String(DEFAULT_FUELING.carbsPerHour),
    );
  });

  it("omits `start` when the organizer hasn't announced one", () => {
    // A guessed start hour would silently key the forecast to the wrong
    // conditions, so a null must stay absent rather than become a default.
    const url = new URL(editionHref(sydney), "https://example.com");
    expect(url.searchParams.has("start")).toBe(false);
    expect(url.searchParams.get("date")).toBe("2026-08-30");
  });

  it("emits a URL that /results actually accepts", () => {
    // The calendar and the results route must not drift: round-trip the href
    // through the same parser the page uses.
    const url = new URL(editionHref(chicago), "https://example.com");
    const params = Object.fromEntries(url.searchParams.entries());
    const parsed = parseResultsParams(params);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.input.courseId).toBe("chicago");
    expect(parsed.input.goalTimeSeconds).toBe(CALENDAR_DEFAULT_GOAL_SECONDS);
    expect(parsed.input.raceDateISO).toBe("2026-10-11");
    expect(parsed.input.raceStartTime).toBe("07:30");
    expect(parsed.input.fueling).toEqual(DEFAULT_FUELING);
  });
});

describe("editionLinkLabel", () => {
  it("spells out the date the visible chip only implies by position", () => {
    expect(editionLinkLabel(sydney)).toBe(
      "Sydney Marathon, Sydney — August 30th, 2026. Build a pacing plan.",
    );
  });

  it("says so when the date is only inferred from a recurrence rule", () => {
    expect(editionLinkLabel(chicago)).toContain("(estimated date)");
  });
});
