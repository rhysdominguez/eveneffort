// Event editions — normally one row per series per year, but a series can
// have more than one in the same year (see London 2027 below).
//
// ============================================================================
// A DATE IS `estimated` UNLESS IT APPEARS IN CONFIRMED_EDITIONS BELOW.
// ============================================================================
// Rather than hardcode date literals that would look authoritative by
// default, each series declares its well-known recurrence RULE (e.g. Boston
// is Patriots' Day, the third Monday of April) and unconfirmed years derive
// their date from it. That keeps the guess auditable: you can see exactly
// what was assumed and correct the rule rather than reverse-engineering a
// magic date.
//
// `startTimeLocal` is deliberately left null where unknown. A null start time
// simply means the weather panel stays off until the runner enters one; a
// guessed start time would silently key the forecast to the wrong hour.

/** Years to generate editions for. */
export const SEED_YEARS = [2026, 2027] as const;

type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday

interface RecurrenceRule {
  /** 1-12 */
  month: number;
  weekday: Weekday;
  /** 1-4 for "nth", or -1 for "last". */
  nth: 1 | 2 | 3 | 4 | -1;
  /** Why we believe this rule — kept so the guess can be argued with. */
  note: string;
}

/** How each series recurs. Slugs match SERIES_SEED. */
export const RECURRENCE: Record<string, RecurrenceRule> = {
  "berlin-marathon": {
    month: 9,
    weekday: 0,
    nth: -1,
    note: "Last Sunday of September",
  },
  "chicago-marathon": {
    month: 10,
    weekday: 0,
    nth: 2,
    note: "Second Sunday of October",
  },
  "london-marathon": {
    month: 4,
    weekday: 0,
    nth: 3,
    note: "A Sunday in late April; exact week varies year to year",
  },
  "tokyo-marathon": {
    month: 3,
    weekday: 0,
    nth: 1,
    note: "First Sunday of March",
  },
  "sydney-marathon": {
    month: 8,
    weekday: 0,
    nth: -1,
    note: "Last Sunday of August",
  },
  "new-york-city-marathon": {
    month: 11,
    weekday: 0,
    nth: 1,
    note: "First Sunday of November",
  },
  "boston-marathon": {
    month: 4,
    weekday: 1,
    nth: 3,
    note: "Patriots' Day, the third Monday of April",
  },
};

export interface ConfirmedEdition {
  seriesSlug: string;
  year: number;
  raceDate: string;
  startTimeLocal?: string;
  /**
   * Disambiguates a second edition of the same series in the same year —
   * appended to the slug as `-<variant>`. Required whenever a series has
   * more than one CONFIRMED_EDITIONS entry for one year (e.g. London 2027's
   * two-day event); omit it for the ordinary one-edition case.
   */
  variant?: string;
}

/**
 * Dates verified against each organizer's own announcement, overriding the
 * recurrence rule above. Anything listed here is seeded with confidence
 * 'confirmed'. A series/year with no entry here falls back to its rule and is
 * seeded 'estimated'.
 */
export const CONFIRMED_EDITIONS: ConfirmedEdition[] = [
  { seriesSlug: "tokyo-marathon", year: 2027, raceDate: "2027-03-07" },
  { seriesSlug: "boston-marathon", year: 2027, raceDate: "2027-04-19" },
  // London 2027 is a two-day event: mass participation runs the 25th, with
  // part of the event on the 24th. Two rows, same series and year, disting-
  // uished by `variant` — this is exactly the case the schema's unique
  // constraint moved to (seriesId, raceDate) to allow.
  {
    seriesSlug: "london-marathon",
    year: 2027,
    raceDate: "2027-04-24",
    variant: "apr24",
  },
  {
    seriesSlug: "london-marathon",
    year: 2027,
    raceDate: "2027-04-25",
    variant: "apr25",
  },
  { seriesSlug: "sydney-marathon", year: 2026, raceDate: "2026-08-30" },
  { seriesSlug: "berlin-marathon", year: 2026, raceDate: "2026-09-27" },
  { seriesSlug: "chicago-marathon", year: 2026, raceDate: "2026-10-11" },
  {
    seriesSlug: "new-york-city-marathon",
    year: 2026,
    raceDate: "2026-11-01",
  },
];

/**
 * Resolve the nth (or last) given weekday of a month, as an ISO date string.
 * Uses UTC throughout so the result never shifts with the machine's timezone —
 * this is a calendar date, not an instant.
 */
export function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: Weekday,
  nth: 1 | 2 | 3 | 4 | -1,
): string {
  if (nth === -1) {
    // Walk back from the last day of the month to the first matching weekday.
    const last = new Date(Date.UTC(year, month, 0));
    const shift = (last.getUTCDay() - weekday + 7) % 7;
    last.setUTCDate(last.getUTCDate() - shift);
    return toISODate(last);
  }
  const first = new Date(Date.UTC(year, month - 1, 1));
  const shift = (weekday - first.getUTCDay() + 7) % 7;
  const day = 1 + shift + (nth - 1) * 7;
  return toISODate(new Date(Date.UTC(year, month - 1, day)));
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface EditionSeed {
  slug: string;
  seriesSlug: string;
  year: number;
  raceDate: string;
  startTimeLocal: string | null;
  dateConfidence: "confirmed" | "estimated" | "tbd";
  status: "scheduled" | "completed" | "cancelled";
}

/** Build every edition row for the configured years. */
export function buildEditionSeed(
  seriesSlugs: string[],
  years: readonly number[] = SEED_YEARS,
): EditionSeed[] {
  const rows: EditionSeed[] = [];
  for (const seriesSlug of seriesSlugs) {
    const rule = RECURRENCE[seriesSlug];
    if (!rule) {
      throw new Error(`No recurrence rule for series "${seriesSlug}"`);
    }
    for (const year of years) {
      const confirmed = CONFIRMED_EDITIONS.filter(
        (e) => e.seriesSlug === seriesSlug && e.year === year,
      );

      if (confirmed.length === 0) {
        rows.push({
          slug: `${seriesSlug}-${year}`,
          seriesSlug,
          year,
          raceDate: nthWeekdayOfMonth(year, rule.month, rule.weekday, rule.nth),
          startTimeLocal: null,
          dateConfidence: "estimated",
          status: "scheduled",
        });
        continue;
      }

      for (const c of confirmed) {
        rows.push({
          slug: c.variant
            ? `${seriesSlug}-${year}-${c.variant}`
            : `${seriesSlug}-${year}`,
          seriesSlug,
          year,
          raceDate: c.raceDate,
          startTimeLocal: c.startTimeLocal ?? null,
          dateConfidence: "confirmed",
          status: "scheduled",
        });
      }
    }
  }
  return rows;
}
