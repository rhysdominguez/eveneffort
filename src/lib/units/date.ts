// Date & time helpers for the custom Date/Time pickers.
//
// Two rules govern this module:
//
// 1. NEVER use `toISOString()` to derive a calendar date. It converts to UTC,
//    so for anyone west of Greenwich a local evening renders as the NEXT day.
//    All date strings here are assembled from local components by hand.
// 2. NEVER use `Intl`/`toLocaleDateString` for display. Output would vary by
//    the host's locale and ICU build, making rendering (and tests)
//    non-deterministic. Month/weekday names are fixed arrays below.
//
// The emitted formats are a hard contract: `useWeather` concatenates them as
// `${dateISO}T${startTime}:00` with no validation, so a non-padded "8:00"
// silently yields an invalid Date and the wrong forecast hour.

/** Full month names, January = index 0. */
export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** Single-letter-ish weekday headers, Sunday first (calendar grid order). */
export const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

const pad2 = (n: number): string => String(n).padStart(2, "0");

/**
 * English ordinal suffix for a day of the month: 1st, 2nd, 3rd, 4th…
 * 11/12/13 are the exceptions — they take "th" despite ending in 1/2/3.
 */
export function ordinalSuffix(day: number): string {
  if (day % 100 >= 11 && day % 100 <= 13) return "th";
  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

/** Assemble a `YYYY-MM-DD` string. `month` is 1-based. */
export function toISODate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${pad2(month)}-${pad2(day)}`;
}

/**
 * Parse `YYYY-MM-DD` into its parts, or null when malformed or not a real
 * calendar date (e.g. 2026-02-30). `month` is returned 1-based.
 */
export function parseISODate(
  iso: string,
): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

/** Number of days in a 1-based month. */
export function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this one.
  return new Date(year, month, 0).getDate();
}

/** Today as `YYYY-MM-DD` in the host's local timezone. */
export function todayISO(): string {
  const now = new Date();
  return toISODate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** Human-readable date, e.g. "July 27th, 2026". Empty string when unset. */
export function formatDateDisplay(iso: string): string {
  const parsed = parseISODate(iso);
  if (!parsed) return "";
  const { year, month, day } = parsed;
  return `${MONTH_NAMES[month - 1]} ${day}${ordinalSuffix(day)}, ${year}`;
}

/** Shift a 1-based year/month by `delta` months, rolling the year over. */
export function addMonths(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const zeroBased = year * 12 + (month - 1) + delta;
  return {
    year: Math.floor(zeroBased / 12),
    month: (((zeroBased % 12) + 12) % 12) + 1,
  };
}

/**
 * The 42 ISO date strings (6 weeks × 7 days, Sunday-first) covering a month's
 * calendar grid, including the spill-over days from the adjacent months that
 * fill the first and last rows.
 */
export function monthGrid(year: number, month: number): string[] {
  const firstWeekday = new Date(year, month - 1, 1).getDay(); // 0 = Sunday
  const cells: string[] = [];
  for (let i = 0; i < 42; i++) {
    // Day 1 sits at index `firstWeekday`; the Date constructor normalizes
    // out-of-range day numbers into the neighbouring months for us.
    const d = new Date(year, month - 1, 1 + (i - firstWeekday));
    cells.push(toISODate(d.getFullYear(), d.getMonth() + 1, d.getDate()));
  }
  return cells;
}

/** Parse zero-padded 24-hour `HH:MM`, or null when malformed/out of range. */
export function parseTime(
  hhmm: string,
): { hour24: number; minute: number } | null {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!match) return null;
  const hour24 = Number(match[1]);
  const minute = Number(match[2]);
  if (hour24 > 23 || minute > 59) return null;
  return { hour24, minute };
}

/** Assemble zero-padded 24-hour `HH:MM` — the format the forecast concat needs. */
export function toHHMM(hour24: number, minute: number): string {
  return `${pad2(hour24)}:${pad2(minute)}`;
}

/** Split a 24-hour hour into its 12-hour clock equivalent. */
export function from24Hour(hour24: number): {
  hour12: number;
  meridiem: "AM" | "PM";
} {
  const meridiem: "AM" | "PM" = hour24 < 12 ? "AM" : "PM";
  // Both midnight (0) and noon (12) display as 12.
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return { hour12, meridiem };
}

/** Convert a 12-hour clock reading back to its 0–23 hour. */
export function to24Hour(hour12: number, meridiem: "AM" | "PM"): number {
  const base = hour12 % 12; // 12 → 0
  return meridiem === "PM" ? base + 12 : base;
}

/** Display a `HH:MM` value as "9:05 AM". Empty string when unset/malformed. */
export function formatTimeDisplay(hhmm: string): string {
  const parsed = parseTime(hhmm);
  if (!parsed) return "";
  const { hour12, meridiem } = from24Hour(parsed.hour24);
  return `${hour12}:${pad2(parsed.minute)} ${meridiem}`;
}

/**
 * Minute values offered by the picker: 5-minute steps, plus `current` spliced
 * in when it falls off-step (so a shared URL like `start=08:07` still shows a
 * highlighted selection instead of appearing unselected).
 */
export function minuteOptions(current?: number): number[] {
  const steps: number[] = [];
  for (let m = 0; m < 60; m += 5) steps.push(m);
  if (
    current !== undefined &&
    Number.isInteger(current) &&
    current >= 0 &&
    current < 60 &&
    !steps.includes(current)
  ) {
    steps.push(current);
    steps.sort((a, b) => a - b);
  }
  return steps;
}
