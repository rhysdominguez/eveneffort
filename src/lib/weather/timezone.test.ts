import { describe, it, expect } from "vitest";
import { zonedWallClockToUTC } from "./timezone";
import { COURSES } from "@/data/courses";

describe("zonedWallClockToUTC", () => {
  it("resolves a summer (DST) wall clock in Berlin as UTC+2", () => {
    // Berlin Marathon 2026, 09:15 local — CEST, so 07:15Z.
    expect(zonedWallClockToUTC("2026-09-27", "09:15", "Europe/Berlin")).toBe(
      "2026-09-27T07:15:00.000Z",
    );
  });

  it("resolves a winter wall clock in the same zone as UTC+1", () => {
    // Same clock time, standard time — the offset must differ by an hour.
    expect(zonedWallClockToUTC("2026-12-06", "09:15", "Europe/Berlin")).toBe(
      "2026-12-06T08:15:00.000Z",
    );
  });

  it("handles zones ahead of UTC, rolling back to the previous day", () => {
    // Tokyo is UTC+9 year-round: 09:10 on the 1st is 00:10Z the same day.
    expect(zonedWallClockToUTC("2026-03-01", "09:10", "Asia/Tokyo")).toBe(
      "2026-03-01T00:10:00.000Z",
    );
    // An early start crosses back over midnight UTC.
    expect(zonedWallClockToUTC("2026-03-01", "08:00", "Australia/Sydney")).toBe(
      "2026-02-28T21:00:00.000Z",
    );
  });

  it("handles zones behind UTC, rolling into the next UTC day", () => {
    // Boston/NYC in April is EDT (UTC-4): 09:00 local is 13:00Z.
    expect(zonedWallClockToUTC("2026-04-20", "09:00", "America/New_York")).toBe(
      "2026-04-20T13:00:00.000Z",
    );
    // Chicago in October is CDT (UTC-5): a 19:30 start lands next-day UTC.
    expect(zonedWallClockToUTC("2026-10-11", "19:30", "America/Chicago")).toBe(
      "2026-10-12T00:30:00.000Z",
    );
  });

  it("picks the correct side of a DST transition near the boundary", () => {
    // EU clocks go back 03:00→02:00 CEST on 2026-10-25. 09:00 that morning is
    // already CET (UTC+1), unlike 09:00 the day before (CEST, UTC+2).
    expect(zonedWallClockToUTC("2026-10-24", "09:00", "Europe/Berlin")).toBe(
      "2026-10-24T07:00:00.000Z",
    );
    expect(zonedWallClockToUTC("2026-10-25", "09:00", "Europe/Berlin")).toBe(
      "2026-10-25T08:00:00.000Z",
    );
  });

  it("round-trips: the returned instant renders back to the input wall clock", () => {
    const zones = ["Europe/Berlin", "Asia/Tokyo", "America/New_York"];
    for (const timeZone of zones) {
      const iso = zonedWallClockToUTC("2026-07-04", "06:45", timeZone)!;
      const rendered = new Intl.DateTimeFormat("en-GB", {
        timeZone,
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso));
      expect(rendered).toBe("06:45");
    }
  });

  it("rejects malformed dates and times", () => {
    expect(zonedWallClockToUTC("", "09:00", "Europe/Berlin")).toBeNull();
    expect(zonedWallClockToUTC("2026-09-27", "", "Europe/Berlin")).toBeNull();
    expect(
      zonedWallClockToUTC("27/09/2026", "09:00", "Europe/Berlin"),
    ).toBeNull();
    expect(zonedWallClockToUTC("2026-09-27", "25:00", "Europe/Berlin")).toBeNull();
    expect(zonedWallClockToUTC("2026-13-01", "09:00", "Europe/Berlin")).toBeNull();
  });
});

describe("course timezones", () => {
  it("gives every course a resolvable IANA zone", () => {
    for (const course of Object.values(COURSES)) {
      expect(course.timezone).toBeTruthy();
      // Throws RangeError on an unknown zone — the assertion is that it doesn't.
      expect(() =>
        new Intl.DateTimeFormat("en-US", { timeZone: course.timezone }).format(
          new Date(),
        ),
      ).not.toThrow();
    }
  });
});
