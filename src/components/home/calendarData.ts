// The DOM-free half of the race calendar — same split CourseMap/courseMapData
// uses. Everything here is a pure function of an edition list plus an explicit
// "today", so the whole month-navigation contract is unit-testable and no test
// depends on the wall clock.
//
// All date arithmetic delegates to src/lib/units/date.ts, which already owns
// the two rules that matter: never derive a calendar date through
// `toISOString()`, and never format one through `Intl`. ISO date strings sort
// lexicographically, so comparisons here are plain string comparisons — no
// Date objects, no timezone to get wrong.
import type { EditionSummary } from "@/types";
import { DEFAULT_FUELING } from "@/types";
import { buildResultsHref } from "@/lib/resultsParams";
import { MONTH_NAMES, addMonths, formatDateDisplay } from "@/lib/units/date";

/** A 1-based year/month pair — the calendar's view state. */
export interface YearMonth {
  year: number;
  month: number; // 1-12
}

/**
 * The goal time a calendar click lands on. Matches InputForm's fresh default
 * (4:00:00) deliberately: picking a race from the calendar should produce
 * exactly what typing that race into the form and hitting Calculate produces.
 */
export const CALENDAR_DEFAULT_GOAL_SECONDS = 14400;

/** "2026-09-27" -> "2026-09". The key both grouping and bounds are built on. */
export function monthKeyOf(iso: string): string {
  return iso.slice(0, 7);
}

/** "2026-09" for a view state — the prefix an in-month cell's ISO starts with. */
export function monthKey({ year, month }: YearMonth): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

/** Editions keyed by their ISO race date. A date can hold more than one. */
export function groupEditionsByDate(
  editions: EditionSummary[],
): Map<string, EditionSummary[]> {
  const byDate = new Map<string, EditionSummary[]>();
  for (const edition of editions) {
    const existing = byDate.get(edition.raceDateISO);
    if (existing) existing.push(edition);
    else byDate.set(edition.raceDateISO, [edition]);
  }
  return byDate;
}

/** Every edition falling inside a month, in date order. */
export function editionsInMonth(
  editions: EditionSummary[],
  view: YearMonth,
): EditionSummary[] {
  const key = monthKey(view);
  return editions
    .filter((e) => monthKeyOf(e.raceDateISO) === key)
    .sort((a, b) => a.raceDateISO.localeCompare(b.raceDateISO));
}

/** Is this date strictly before today? Today itself is not past. */
export function isPastDate(iso: string, todayISO: string): boolean {
  return iso < todayISO;
}

/**
 * How far the arrows may travel: the span of the seeded editions, always
 * widened to include the current month.
 *
 * Without this the arrows would step forever into empty years — the seed only
 * covers two, so beyond them there is nothing to find and nothing to say.
 * Returns null for an empty list, where there is no calendar to bound.
 */
export function monthBounds(
  editions: EditionSummary[],
  todayISO: string,
): { min: YearMonth; max: YearMonth } | null {
  if (editions.length === 0) return null;

  const keys = editions.map((e) => monthKeyOf(e.raceDateISO));
  keys.push(monthKeyOf(todayISO));
  let minKey = keys[0];
  let maxKey = keys[0];
  for (const key of keys) {
    if (key < minKey) minKey = key;
    if (key > maxKey) maxKey = key;
  }
  return { min: parseMonthKey(minKey), max: parseMonthKey(maxKey) };
}

/**
 * Where the calendar opens: the month holding the soonest race still to come,
 * falling back to the current month when every seeded race is behind us.
 *
 * Opening on the current month would strand the visitor on an empty grid for
 * most of the year, which is the whole reason this isn't just `today`.
 */
export function initialMonth(
  editions: EditionSummary[],
  todayISO: string,
): YearMonth {
  const upcoming = editions
    .filter((e) => !isPastDate(e.raceDateISO, todayISO))
    .sort((a, b) => a.raceDateISO.localeCompare(b.raceDateISO));
  const target = upcoming[0]?.raceDateISO ?? todayISO;
  return parseMonthKey(monthKeyOf(target));
}

/** Step a view by whole months, clamped to `bounds` (no-op past either end). */
export function stepMonth(
  view: YearMonth,
  delta: number,
  bounds: { min: YearMonth; max: YearMonth } | null,
): YearMonth {
  const next = addMonths(view.year, view.month, delta);
  if (!bounds) return next;
  const key = monthKey(next);
  if (key < monthKey(bounds.min)) return view;
  if (key > monthKey(bounds.max)) return view;
  return next;
}

/** Would stepping by `delta` actually move? Drives the arrows' disabled state. */
export function canStep(
  view: YearMonth,
  delta: number,
  bounds: { min: YearMonth; max: YearMonth } | null,
): boolean {
  const next = stepMonth(view, delta, bounds);
  return next.year !== view.year || next.month !== view.month;
}

/** "September 2026" — the calendar's own heading, never via Intl. */
export function monthLabel({ year, month }: YearMonth): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/**
 * Where clicking a race goes: straight to the results page, that course
 * selected, with the form's own defaults applied.
 *
 * The bar this has to clear is that arriving here from the calendar looks
 * identical to picking the same race in the hero form and pressing Calculate.
 * That means matching InputForm's fresh state field for field — including
 * `fueling`, whose ABSENCE from the query is the "off" signal, so omitting it
 * would quietly land people on a plan with no gel cues.
 *
 * Built through `buildResultsHref` rather than by hand so the calendar can
 * never drift from what /results parses.
 */
export function editionHref(edition: EditionSummary): string {
  return buildResultsHref({
    courseId: edition.courseId,
    unit: "km", // InputForm's fresh default
    goalTimeSeconds: CALENDAR_DEFAULT_GOAL_SECONDS,
    fueling: DEFAULT_FUELING, // InputForm starts with fueling on at 60 g/hr
    raceDateISO: edition.raceDateISO,
    // Passed only when the organizer has announced one, so the weather panel
    // is live on arrival for confirmed races and stays honestly off otherwise.
    ...(edition.startTimeLocal
      ? { raceStartTime: edition.startTimeLocal }
      : {}),
  });
}

/**
 * The link's accessible name. The visible chip is a truncated race name in a
 * grid cell; a screen reader gets the date and the destination spelled out.
 */
export function editionLinkLabel(edition: EditionSummary): string {
  const date = formatDateDisplay(edition.raceDateISO);
  const confidence =
    edition.dateConfidence === "confirmed" ? "" : " (estimated date)";
  return `${edition.displayName}, ${edition.city} — ${date}${confidence}. Build a pacing plan.`;
}

function parseMonthKey(key: string): YearMonth {
  return { year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) };
}
