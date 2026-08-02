import { describe, it, expect } from "vitest";
import {
  addMonths,
  daysInMonth,
  formatDateDisplay,
  formatTimeDisplay,
  from24Hour,
  minuteOptions,
  monthGrid,
  ordinalSuffix,
  parseISODate,
  parseTime,
  to24Hour,
  toHHMM,
  toISODate,
  todayISO,
} from "./date";

describe("toISODate / parseISODate", () => {
  it("zero-pads single-digit months and days", () => {
    expect(toISODate(2026, 9, 5)).toBe("2026-09-05");
    expect(toISODate(2026, 12, 31)).toBe("2026-12-31");
  });

  it("round-trips", () => {
    const iso = toISODate(2024, 2, 29); // 2024 is a leap year
    expect(parseISODate(iso)).toEqual({ year: 2024, month: 2, day: 29 });
    expect(parseISODate(toISODate(2026, 7, 27))).toEqual({
      year: 2026,
      month: 7,
      day: 27,
    });
  });

  it("rejects malformed strings", () => {
    for (const bad of ["", "2026-9-5", "26-09-05", "2026/09/05", "nonsense"]) {
      expect(parseISODate(bad)).toBeNull();
    }
  });

  it("rejects impossible calendar dates", () => {
    expect(parseISODate("2026-13-01")).toBeNull();
    expect(parseISODate("2026-00-10")).toBeNull();
    expect(parseISODate("2026-02-30")).toBeNull();
    expect(parseISODate("2025-02-29")).toBeNull(); // 2025 is not a leap year
  });
});

describe("daysInMonth", () => {
  it("handles 30/31-day months and leap Februaries", () => {
    expect(daysInMonth(2026, 1)).toBe(31);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2025, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2000, 2)).toBe(29); // century leap year
    expect(daysInMonth(1900, 2)).toBe(28); // century non-leap year
  });
});

describe("todayISO", () => {
  it("returns a well-formed local date that parses back", () => {
    const iso = todayISO();
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const parsed = parseISODate(iso);
    expect(parsed).not.toBeNull();
    // Must match the LOCAL calendar day, not the UTC one.
    const now = new Date();
    expect(parsed).toEqual({
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate(),
    });
  });
});

describe("ordinalSuffix", () => {
  it("uses st/nd/rd for 1/2/3 and their compounds", () => {
    expect(ordinalSuffix(1)).toBe("st");
    expect(ordinalSuffix(2)).toBe("nd");
    expect(ordinalSuffix(3)).toBe("rd");
    expect(ordinalSuffix(21)).toBe("st");
    expect(ordinalSuffix(22)).toBe("nd");
    expect(ordinalSuffix(23)).toBe("rd");
    expect(ordinalSuffix(31)).toBe("st");
  });

  it("uses th for the 11/12/13 exceptions", () => {
    expect(ordinalSuffix(11)).toBe("th");
    expect(ordinalSuffix(12)).toBe("th");
    expect(ordinalSuffix(13)).toBe("th");
  });

  it("returns a valid suffix for every day of a month", () => {
    for (let day = 1; day <= 31; day++) {
      expect(["st", "nd", "rd", "th"]).toContain(ordinalSuffix(day));
    }
  });
});

describe("formatDateDisplay", () => {
  it("renders a deterministic, locale-independent label", () => {
    expect(formatDateDisplay("2026-09-24")).toBe("September 24th, 2026");
    expect(formatDateDisplay("2026-07-27")).toBe("July 27th, 2026");
    expect(formatDateDisplay("2026-01-01")).toBe("January 1st, 2026");
    expect(formatDateDisplay("2026-03-02")).toBe("March 2nd, 2026");
    expect(formatDateDisplay("2026-05-23")).toBe("May 23rd, 2026");
    expect(formatDateDisplay("2026-11-11")).toBe("November 11th, 2026");
  });

  it("returns an empty string for unset or malformed input", () => {
    expect(formatDateDisplay("")).toBe("");
    expect(formatDateDisplay("2026-02-30")).toBe("");
  });
});

describe("addMonths", () => {
  it("rolls forward and backward across year boundaries", () => {
    expect(addMonths(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(addMonths(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(addMonths(2026, 6, 0)).toEqual({ year: 2026, month: 6 });
    expect(addMonths(2026, 3, 24)).toEqual({ year: 2028, month: 3 });
    expect(addMonths(2026, 3, -24)).toEqual({ year: 2024, month: 3 });
  });
});

describe("monthGrid", () => {
  it("always returns 42 cells starting on a Sunday", () => {
    for (const [y, m] of [
      [2026, 7],
      [2026, 2],
      [2024, 2],
      [2026, 11],
    ] as const) {
      const grid = monthGrid(y, m);
      expect(grid).toHaveLength(42);
      const first = parseISODate(grid[0])!;
      expect(new Date(first.year, first.month - 1, first.day).getDay()).toBe(0);
    }
  });

  it("contains every day of the target month exactly once", () => {
    const grid = monthGrid(2026, 7);
    const inMonth = grid.filter((iso) => iso.startsWith("2026-07-"));
    expect(inMonth).toHaveLength(31);
    expect(new Set(inMonth).size).toBe(31);
    expect(inMonth[0]).toBe("2026-07-01");
    expect(inMonth[30]).toBe("2026-07-31");
  });

  it("is contiguous — each cell is one day after the previous", () => {
    const grid = monthGrid(2026, 3); // spans a DST transition in many zones
    for (let i = 1; i < grid.length; i++) {
      const prev = parseISODate(grid[i - 1])!;
      const curr = parseISODate(grid[i])!;
      const prevDate = new Date(prev.year, prev.month - 1, prev.day);
      const currDate = new Date(curr.year, curr.month - 1, curr.day);
      const dayGap = Math.round(
        (currDate.getTime() - prevDate.getTime()) / 86_400_000,
      );
      expect(dayGap).toBe(1);
    }
  });

  it("includes spill-over days when a month starts mid-week", () => {
    // 1 July 2026 is a Wednesday, so the grid opens on 28 June.
    expect(monthGrid(2026, 7)[0]).toBe("2026-06-28");
  });

  it("handles a month that starts exactly on Sunday with no leading spill", () => {
    // 1 February 2026 is a Sunday.
    expect(monthGrid(2026, 2)[0]).toBe("2026-02-01");
  });
});

describe("parseTime / toHHMM", () => {
  it("zero-pads both components", () => {
    expect(toHHMM(8, 0)).toBe("08:00");
    expect(toHHMM(0, 5)).toBe("00:05");
    expect(toHHMM(23, 59)).toBe("23:59");
  });

  it("round-trips", () => {
    expect(parseTime("08:00")).toEqual({ hour24: 8, minute: 0 });
    expect(parseTime("23:59")).toEqual({ hour24: 23, minute: 59 });
  });

  it("rejects malformed or out-of-range values", () => {
    for (const bad of ["", "8:00", "08:0", "24:00", "08:60", "0800"]) {
      expect(parseTime(bad)).toBeNull();
    }
  });
});

describe("12/24-hour conversion", () => {
  it("handles the midnight and noon edge cases", () => {
    expect(from24Hour(0)).toEqual({ hour12: 12, meridiem: "AM" });
    expect(from24Hour(12)).toEqual({ hour12: 12, meridiem: "PM" });
    expect(to24Hour(12, "AM")).toBe(0);
    expect(to24Hour(12, "PM")).toBe(12);
  });

  it("round-trips every hour of the day", () => {
    for (let h = 0; h < 24; h++) {
      const { hour12, meridiem } = from24Hour(h);
      expect(hour12).toBeGreaterThanOrEqual(1);
      expect(hour12).toBeLessThanOrEqual(12);
      expect(to24Hour(hour12, meridiem)).toBe(h);
    }
  });
});

describe("formatTimeDisplay", () => {
  it("renders 12-hour time with a padded minute", () => {
    expect(formatTimeDisplay("00:00")).toBe("12:00 AM");
    expect(formatTimeDisplay("12:00")).toBe("12:00 PM");
    expect(formatTimeDisplay("09:05")).toBe("9:05 AM");
    expect(formatTimeDisplay("13:05")).toBe("1:05 PM");
    expect(formatTimeDisplay("23:59")).toBe("11:59 PM");
  });

  it("returns an empty string for unset or malformed input", () => {
    expect(formatTimeDisplay("")).toBe("");
    expect(formatTimeDisplay("8:00")).toBe("");
  });
});

describe("minuteOptions", () => {
  it("offers 5-minute steps by default", () => {
    const opts = minuteOptions();
    expect(opts).toHaveLength(12);
    expect(opts[0]).toBe(0);
    expect(opts[11]).toBe(55);
  });

  it("splices in an off-step current value, in order", () => {
    const opts = minuteOptions(7);
    expect(opts).toContain(7);
    expect(opts).toHaveLength(13);
    expect([...opts].sort((a, b) => a - b)).toEqual(opts);
  });

  it("does not duplicate an on-step current value", () => {
    expect(minuteOptions(15)).toHaveLength(12);
  });
});
