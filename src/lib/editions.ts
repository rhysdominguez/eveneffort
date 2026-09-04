// Which edition of a series the form is pointed at, and where its weather can
// honestly come from. Pure — no React, no network, no Date.now() — so every
// rule below is testable by handing it a `todayISO`.
//
// This module exists because the race date used to be a free-form string with
// no link back to the edition it came from. Nothing advanced it when it passed,
// so a stale sessionStorage snapshot or a stale prefill would quietly pace a
// race that had already been run.
import type { EditionOption } from "@/types";

/** Is this date strictly before today? Today itself is not past. */
export function isPastISO(iso: string, todayISO: string): boolean {
  return iso < todayISO;
}

/**
 * The soonest edition on or after today.
 *
 * Falls back to the LAST edition once the whole seeded range is behind us,
 * rather than returning null. The seed has a finite horizon and will eventually
 * be overtaken; when that happens the picker should still open on something
 * real, and the most recent running is the least wrong answer available.
 * Returns null only for a series with no editions at all.
 */
export function nextEdition(
  editions: EditionOption[],
  todayISO: string,
): EditionOption | null {
  if (editions.length === 0) return null;
  const sorted = sortByDate(editions);
  return sorted.find((e) => !isPastISO(e.raceDateISO, todayISO)) ?? sorted[sorted.length - 1];
}

/**
 * The edition for a given year. Where a series runs twice in one year (London
 * 2027 splits elite and mass across two days) this returns the earlier one —
 * the year picker lists both separately, so this is only the "just give me that
 * year" path.
 */
export function editionForYear(
  editions: EditionOption[],
  year: number,
): EditionOption | null {
  return sortByDate(editions).find((e) => e.year === year) ?? null;
}

/** The edition falling on an exact date, or null if none does. */
export function editionForDate(
  editions: EditionOption[],
  iso: string,
): EditionOption | null {
  return editions.find((e) => e.raceDateISO === iso) ?? null;
}

export interface ResolveRaceDateArgs {
  editions: EditionOption[];
  /** `?date=` from a shared /results link. Authoritative when present. */
  urlDate?: string;
  /** A date read back out of sessionStorage from an earlier visit. */
  restoredDate?: string;
  todayISO: string;
}

/**
 * Which date the form should start on.
 *
 * The precedence is the whole feature, so it is spelled out rather than
 * inlined into a `??` chain:
 *
 *  1. `urlDate` ALWAYS wins, past or not. A shared link to a race that has
 *     since been run must still reproduce that exact chart — pacing a past
 *     edition is a supported destination now, not a mistake to correct. Silently
 *     advancing it would change what someone else opened.
 *  2. `restoredDate` wins only while it is still in the future. This is the
 *     "the date should automatically update" case: a snapshot left in session
 *     storage from a previous visit rolls forward to the next edition instead
 *     of pacing a race that has happened in the meantime.
 *  3. Otherwise the series' next edition.
 *
 * Returns "" when there is nothing to offer, matching the form's empty state.
 */
export function resolveRaceDate({
  editions,
  urlDate,
  restoredDate,
  todayISO,
}: ResolveRaceDateArgs): string {
  if (urlDate) return urlDate;
  if (restoredDate && !isPastISO(restoredDate, todayISO)) return restoredDate;
  return nextEdition(editions, todayISO)?.raceDateISO ?? "";
}

/**
 * The start time to show when the runner hasn't set one.
 *
 * The seed deliberately leaves `startTimeLocal` null where the organizer hasn't
 * announced an hour, because a guessed time keys the weather to the wrong
 * conditions. That is still true — but leaving the field empty meant the
 * weather panel stayed dark for most races, which is worse. So: use the real
 * time whenever we have it, and otherwise assume a 7:30 local start, which is
 * typical for a road marathon and is a starting point the runner can correct.
 */
export const ASSUMED_START_TIME = "07:30";

export function defaultStartTime(edition: EditionOption | null): string {
  return edition?.startTimeLocal ?? ASSUMED_START_TIME;
}

/** True when the displayed start time is our assumption, not a published one. */
export function startTimeIsAssumed(
  edition: EditionOption | null,
  startTime: string,
): boolean {
  return !edition?.startTimeLocal && startTime === ASSUMED_START_TIME;
}

/**
 * Which of the three weather sources a date can honestly claim, before the
 * server has looked at how far out it actually is.
 *
 * The subtle case is an ESTIMATED past date. SEED_YEARS reaches back to 2022,
 * but only the years covered by CONFIRMED_EDITIONS have a real date — the rest
 * are derived from the series' recurrence rule and can miss the true race day
 * by a week. Fetching "the weather recorded on race day" for the wrong day and
 * presenting it as fact is worse than admitting uncertainty, so an estimated
 * past date is routed to climatology and described as typical, not actual.
 *
 * `"forecast"` here means only "in the future" — whether it is close enough for
 * a real forecast is the API route's call, since only it knows the horizon.
 */
export type WeatherSourceHint = "historical" | "typical" | "forecast";

export function weatherSourceFor(
  edition: EditionOption | null,
  raceDateISO: string,
  todayISO: string,
): WeatherSourceHint {
  if (!isPastISO(raceDateISO, todayISO)) return "forecast";
  // A date the runner typed themselves has no edition behind it, but they chose
  // it deliberately, so it is treated as exact.
  if (edition && edition.dateConfidence !== "confirmed") return "typical";
  return "historical";
}

function sortByDate(editions: EditionOption[]): EditionOption[] {
  return [...editions].sort((a, b) => a.raceDateISO.localeCompare(b.raceDateISO));
}
