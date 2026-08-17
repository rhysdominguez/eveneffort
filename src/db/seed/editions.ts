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
  // Imported from goandrace.com — batch 2026-08-08. Each rule is derived
  // from one observed date, not from the organizer's own statement.
  "asheville-marathon": {
    month: 3,
    weekday: 6,
    nth: 3,
    note: "Derived from the 2026-03-21 edition; not verified against the organizer",
  },
  "austin-marathon": {
    month: 2,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2026-02-15 edition; not verified against the organizer",
  },
  "barcelona-marathon": {
    month: 3,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2026-03-15 edition; not verified against the organizer",
  },
  "barletta-marathon": {
    month: 2,
    weekday: 0,
    nth: 2,
    note: "Derived from the 2026-02-08 edition; not verified against the organizer",
  },
  // Imported from goandrace.com — batch 2026-08-08. Each rule is derived
  // from one observed date, not from the organizer's own statement.
  "calgary-marathon": {
    month: 5,
    weekday: 0,
    nth: -1,
    note: "Last Sunday of May. The organizer's own save-the-date for 2027 is May 29-30, a two-day race weekend with the marathon on the Sunday; goandrace's 2026-05-23 is that weekend's Saturday start, not race day.",
  },
  "cape-town-marathon": {
    month: 10,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2025-10-19 edition; not verified against the organizer",
  },
  "vancouver-marathon": {
    month: 5,
    weekday: 0,
    nth: 1,
    note: "Derived from the 2025-05-04 edition; not verified against the organizer",
  },
  // Imported from goandrace.com — batch 2026-08-08. Each rule is derived
  // from one observed date, not from the organizer's own statement.
  "alamo-marathon": {
    month: 3,
    weekday: 0,
    nth: 1,
    note: "Derived from the 2025-03-02 edition; not verified against the organizer",
  },
  "cowtown-marathon": {
    month: 2,
    weekday: 0,
    nth: -1,
    note: "Derived from the 2024-02-25 edition; not verified against the organizer",
  },
  "denver-colfax-marathon": {
    month: 5,
    weekday: 6,
    nth: 3,
    note: "Derived from the 2026-05-16 edition; not verified against the organizer",
  },
  "houston-marathon": {
    month: 1,
    weekday: 0,
    nth: 2,
    note: "Derived from the 2026-01-11 edition; not verified against the organizer",
  },
  "kentucky-derby-festival-marathon": {
    month: 4,
    weekday: 6,
    nth: -1,
    note: "Derived from the 2024-04-27 edition; not verified against the organizer",
  },
  "los-angeles-marathon": {
    month: 3,
    weekday: 0,
    nth: 2,
    note: "Derived from the 2026-03-08 edition; not verified against the organizer",
  },
  "oklahoma-city-memorial-marathon": {
    month: 4,
    weekday: 0,
    nth: -1,
    note: "Derived from the 2026-04-26 edition; not verified against the organizer",
  },
  "philadelphia-marathon": {
    month: 11,
    weekday: 0,
    nth: -1,
    note: "Derived from the 2024-11-24 edition; not verified against the organizer",
  },
  "revel-mt-charleston-marathon": {
    month: 3,
    weekday: 6,
    nth: -1,
    note: "Derived from the 2026-03-28 edition; not verified against the organizer",
  },
  "rock-n-roll-san-diego-marathon": {
    month: 5,
    weekday: 6,
    nth: -1,
    note: "Derived from the 2026-05-30 edition; not verified against the organizer",
  },
  "san-francisco-marathon": {
    month: 7,
    weekday: 0,
    nth: -1,
    note: "Derived from the 2026-07-26 edition; not verified against the organizer",
  },
  "seattle-marathon": {
    month: 12,
    weekday: 0,
    nth: 1,
    note: "Derived from the 2024-12-01 edition; not verified against the organizer",
  },
  // Imported from goandrace.com — batch 2026-08-08. Each rule is derived
  // from one observed date, not from the organizer's own statement.
  "atlanta-marathon": {
    month: 3,
    weekday: 0,
    nth: 1,
    note: "Derived from the 2025-03-02 edition; not verified against the organizer",
  },
  "brew-city-marathon": {
    month: 4,
    weekday: 6,
    nth: 3,
    note: "Derived from the 2026-04-18 edition; not verified against the organizer",
  },
  "california-international-marathon": {
    month: 12,
    weekday: 0,
    nth: 2,
    note: "Derived from the 2024-12-08 edition; not verified against the organizer",
  },
  "honolulu-marathon": {
    month: 12,
    weekday: 0,
    nth: 2,
    note: "Derived from the 2024-12-08 edition; not verified against the organizer",
  },
  "mesa-marathon": {
    month: 2,
    weekday: 6,
    nth: 2,
    note: "Derived from the 2025-02-08 edition; not verified against the organizer",
  },
  "miami-marathon": {
    month: 1,
    weekday: 0,
    nth: -1,
    note: "Derived from the 2026-01-25 edition; not verified against the organizer",
  },
  "milwaukee-marathon": {
    month: 4,
    weekday: 6,
    nth: 2,
    note: "Derived from the 2026-04-11 edition; not verified against the organizer",
  },
  "oakland-marathon": {
    month: 3,
    weekday: 0,
    nth: 4,
    note: "Derived from the 2026-03-22 edition; not verified against the organizer",
  },
  // Imported from goandrace.com — batch 2026-08-08. Each rule is derived
  // from one observed date, not from the organizer's own statement.
  "anchorage-mayors-marathon": {
    month: 6,
    weekday: 6,
    nth: 3,
    note: "Derived from the 2025-06-21 edition; not verified against the organizer",
  },
  "cincinnati-flying-pig-marathon": {
    month: 5,
    weekday: 0,
    nth: 1,
    note: "Derived from the 2025-05-04 edition; not verified against the organizer",
  },
  "lincoln-marathon": {
    month: 5,
    weekday: 0,
    nth: 1,
    note: "Derived from the 2024-05-05 edition; not verified against the organizer",
  },
  "st-louis-marathon": {
    month: 4,
    weekday: 6,
    nth: 2,
    note: "Derived from the 2026-04-11 edition; not verified against the organizer",
  },
  "twin-cities-marathon": {
    month: 9,
    weekday: 6,
    nth: -1,
    note: "Derived from the 2023-09-30 edition; not verified against the organizer",
  },
  // Imported from goandrace.com — batch 2026-08-08. Each rule is derived
  // from one observed date, not from the organizer's own statement.
  "budapest-marathon": {
    month: 10,
    weekday: 0,
    nth: 2,
    note: "Derived from the 2025-10-12 edition; not verified against the organizer",
  },
  "cologne-marathon": {
    month: 10,
    weekday: 0,
    nth: 1,
    note: "Derived from the 2024-10-06 edition; not verified against the organizer",
  },
  "irving-marathon": {
    month: 3,
    weekday: 0,
    nth: -1,
    note: "Derived from the 2025-03-30 edition; not verified against the organizer",
  },
  "istanbul-marathon": {
    month: 11,
    weekday: 0,
    nth: 1,
    note: "Derived from the 2025-11-02 edition; not verified against the organizer",
  },
  "milan-marathon": {
    month: 4,
    weekday: 0,
    nth: 2,
    note: "Derived from the 2026-04-12 edition; not verified against the organizer",
  },
  "munich-marathon": {
    month: 10,
    weekday: 0,
    nth: 2,
    note: "Derived from the 2025-10-12 edition; not verified against the organizer",
  },
  "neapolis-marathon": {
    month: 10,
    weekday: 0,
    nth: 2,
    note: "Derived from the 2024-10-13 edition; not verified against the organizer",
  },
  "paris-marathon": {
    month: 4,
    weekday: 0,
    nth: 2,
    note: "Derived from the 2026-04-12 edition; not verified against the organizer",
  },
  "prague-marathon": {
    month: 5,
    weekday: 0,
    nth: 1,
    note: "Derived from the 2025-05-04 edition; not verified against the organizer",
  },
  "rome-marathon": {
    month: 3,
    weekday: 0,
    nth: 4,
    note: "Derived from the 2026-03-22 edition; not verified against the organizer",
  },
  "stockholm-marathon": {
    month: 5,
    weekday: 6,
    nth: -1,
    note: "Derived from the 2026-05-30 edition; not verified against the organizer",
  },
  "vienna-city-marathon": {
    month: 4,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2026-04-19 edition; not verified against the organizer",
  },
  "windermere-marathon": {
    month: 5,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2024-05-19 edition; not verified against the organizer",
  },
  // Imported from goandrace.com — batch 2026-08-08. Each rule is derived
  // from one observed date, not from the organizer's own statement.
  "athens-marathon": {
    month: 11,
    weekday: 0,
    nth: 2,
    note: "Derived from the 2023-11-12 edition; not verified against the organizer",
  },
  "frankfurt-marathon": {
    month: 10,
    weekday: 0,
    nth: -1,
    note: "Derived from the 2023-10-29 edition; not verified against the organizer",
  },
  "hamburg-marathon": {
    month: 4,
    weekday: 0,
    nth: -1,
    note: "Derived from the 2026-04-26 edition; not verified against the organizer",
  },
  "helsinki-city-run": {
    month: 5,
    weekday: 6,
    nth: 2,
    note: "Derived from the 2024-05-11 edition; not verified against the organizer",
  },
  "helsinki-marathon": {
    month: 8,
    weekday: 6,
    nth: 4,
    note: "Derived from the 2024-08-24 edition; not verified against the organizer",
  },
  "lisbon-eco-marathon": {
    month: 4,
    weekday: 0,
    nth: 2,
    note: "Derived from the 2026-04-12 edition; not verified against the organizer",
  },
  "palermo-marathon": {
    month: 11,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2024-11-17 edition; not verified against the organizer",
  },
  "seville-marathon": {
    month: 2,
    weekday: 0,
    nth: -1,
    note: "Derived from the 2025-02-23 edition; not verified against the organizer",
  },
  "turin-marathon": {
    month: 11,
    weekday: 0,
    nth: 1,
    note: "Derived from the 2023-11-05 edition; not verified against the organizer",
  },
  "valencia-marathon": {
    month: 12,
    weekday: 0,
    nth: 1,
    note: "Derived from the 2025-12-07 edition; not verified against the organizer",
  },
  // Imported from goandrace.com — batch 2026-08-09. Each rule is derived
  // from one observed date, not from the organizer's own statement.
  "alexander-the-great-marathon": {
    month: 4,
    weekday: 0,
    nth: 1,
    note: "Derived from the 2025-04-06 edition; not verified against the organizer",
  },
  "antwerp-marathon": {
    month: 10,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2025-10-19 edition; not verified against the organizer",
  },
  "bologna-marathon": {
    month: 3,
    weekday: 0,
    nth: 1,
    note: "Derived from the 2025-03-02 edition; not verified against the organizer",
  },
  "bonn-marathon": {
    month: 4,
    weekday: 0,
    nth: 2,
    note: "Derived from the 2024-04-14 edition; not verified against the organizer",
  },
  "bratislava-marathon": {
    month: 4,
    weekday: 0,
    nth: 2,
    note: "Derived from the 2026-04-12 edition; not verified against the organizer",
  },
  "bremen-marathon": {
    month: 10,
    weekday: 0,
    nth: 1,
    note: "Derived from the 2024-10-06 edition; not verified against the organizer",
  },
  "florence-marathon": {
    month: 11,
    weekday: 0,
    nth: -1,
    note: "Derived from the 2024-11-24 edition; not verified against the organizer",
  },
  "gothenburg-marathon": {
    month: 9,
    weekday: 0,
    nth: 1,
    note: "Derived from the 2023-09-03 edition; not verified against the organizer",
  },
  "hannover-marathon": {
    month: 4,
    weekday: 0,
    nth: 2,
    note: "Derived from the 2026-04-12 edition; not verified against the organizer",
  },
  "malaga-marathon": {
    month: 12,
    weekday: 0,
    nth: 2,
    note: "Derived from the 2025-12-14 edition; not verified against the organizer",
  },
  "nantes-marathon": {
    month: 4,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2024-04-21 edition; not verified against the organizer",
  },
  "rotterdam-marathon": {
    month: 4,
    weekday: 0,
    nth: 2,
    note: "Derived from the 2024-04-14 edition; not verified against the organizer",
  },
  // Imported from goandrace.com — batch 2026-08-09. Each rule is derived
  // from one observed date, not from the organizer's own statement.
  "belfast-marathon": {
    month: 5,
    weekday: 0,
    nth: 1,
    note: "Derived from the 2024-05-05 edition; not verified against the organizer",
  },
  "bilbao-night-marathon": {
    month: 10,
    weekday: 6,
    nth: 3,
    note: "Derived from the 2024-10-19 edition; not verified against the organizer",
  },
  "edinburgh-marathon": {
    month: 5,
    weekday: 0,
    nth: 4,
    note: "Derived from the 2026-05-24 edition; not verified against the organizer",
  },
  "lyon-marathon": {
    month: 10,
    weekday: 0,
    nth: 1,
    note: "Derived from the 2025-10-05 edition; not verified against the organizer",
  },
  "manchester-marathon": {
    month: 4,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2026-04-19 edition; not verified against the organizer",
  },
  "montpellier-marathon": {
    month: 4,
    weekday: 6,
    nth: 3,
    note: "Derived from the 2026-04-18 edition; not verified against the organizer",
  },
  "nice-cannes-marathon": {
    month: 11,
    weekday: 0,
    nth: 1,
    note: "Derived from the 2024-11-03 edition; not verified against the organizer",
  },
  "tallinn-marathon": {
    month: 9,
    weekday: 0,
    nth: 2,
    note: "Derived from the 2024-09-08 edition; not verified against the organizer",
  },
  // Imported from goandrace.com — batch 2026-08-09. Each rule is derived
  // from one observed date, not from the organizer's own statement.
  "verona-marathon": {
    month: 11,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2025-11-16 edition; not verified against the organizer",
  },
  // Imported from goandrace.com — batch 2026-08-09. Each rule is derived
  // from one observed date, not from the organizer's own statement.
  "brasilia-marathon": {
    month: 11,
    weekday: 0,
    nth: 4,
    note: "Derived from the 2025-11-23 edition; not verified against the organizer",
  },
  "buenos-aires-marathon": {
    month: 9,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2025-09-21 edition; not verified against the organizer",
  },
  "caracas-marathon": {
    month: 2,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2025-02-16 edition; not verified against the organizer",
  },
  "lima-marathon": {
    month: 5,
    weekday: 0,
    nth: 4,
    note: "Derived from the 2026-05-24 edition; not verified against the organizer",
  },
  "mendoza-marathon": {
    month: 5,
    weekday: 0,
    nth: 1,
    note: "Derived from the 2025-05-04 edition; not verified against the organizer",
  },
  "rio-de-janeiro-marathon": {
    month: 6,
    weekday: 0,
    nth: 1,
    note: "Derived from the 2026-06-07 edition; not verified against the organizer",
  },
  "santiago-marathon": {
    month: 4,
    weekday: 0,
    nth: -1,
    note: "Derived from the 2024-04-28 edition; not verified against the organizer",
  },
  // Imported from goandrace.com — batch 2026-08-09. Each rule is derived
  // from one observed date, not from the organizer's own statement.
  "albany-marathon": {
    month: 3,
    weekday: 6,
    nth: 1,
    note: "Derived from the 2025-03-01 edition; not verified against the organizer",
  },
  "appletree-marathon": {
    month: 9,
    weekday: 6,
    nth: 1,
    note: "Derived from the 2025-09-06 edition; not verified against the organizer",
  },
  "aspen-valley-marathon": {
    month: 7,
    weekday: 6,
    nth: 3,
    note: "Derived from the 2025-07-19 edition; not verified against the organizer",
  },
  "bayshore-marathon": {
    month: 5,
    weekday: 6,
    nth: -1,
    note: "Derived from the 2024-05-25 edition; not verified against the organizer",
  },
  "bcs-marathon": {
    month: 12,
    weekday: 0,
    nth: 2,
    note: "Derived from the 2023-12-10 edition; not verified against the organizer",
  },
  "bear-lake-trifecta": {
    month: 6,
    weekday: 6,
    nth: 1,
    note: "Derived from the 2026-06-06 edition; not verified against the organizer",
  },
  "big-sur-marathon": {
    month: 4,
    weekday: 0,
    nth: -1,
    note: "Derived from the 2026-04-26 edition; not verified against the organizer",
  },
  "boulderthon": {
    month: 9,
    weekday: 0,
    nth: -1,
    note: "Derived from the 2024-09-29 edition; not verified against the organizer",
  },
  "capital-city-marathon": {
    month: 5,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2024-05-19 edition; not verified against the organizer",
  },
  "carlsbad-marathon": {
    month: 1,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2026-01-18 edition; not verified against the organizer",
  },
  "carmel-marathon": {
    month: 4,
    weekday: 6,
    nth: 3,
    note: "Derived from the 2026-04-18 edition; not verified against the organizer",
  },
  "casper-marathon": {
    month: 6,
    weekday: 0,
    nth: 1,
    note: "Derived from the 2024-06-02 edition; not verified against the organizer",
  },
  "chicagoland-spring-marathon": {
    month: 5,
    weekday: 0,
    nth: 1,
    note: "Derived from the 2026-05-03 edition; not verified against the organizer",
  },
  "cleveland-marathon": {
    month: 5,
    weekday: 6,
    nth: 3,
    note: "Derived from the 2026-05-16 edition; not verified against the organizer",
  },
  "coastal-delaware-marathon": {
    month: 4,
    weekday: 0,
    nth: 2,
    note: "Derived from the 2026-04-12 edition; not verified against the organizer",
  },
  "coeur-d-alene-marathon": {
    month: 5,
    weekday: 6,
    nth: 4,
    note: "Derived from the 2026-05-23 edition; not verified against the organizer",
  },
  "colorado-marathon": {
    month: 5,
    weekday: 0,
    nth: 1,
    note: "Derived from the 2026-05-03 edition; not verified against the organizer",
  },
  "cummins-falls-marathon": {
    month: 2,
    weekday: 6,
    nth: -1,
    note: "Derived from the 2025-02-22 edition; not verified against the organizer",
  },
  "delaware-marathon": {
    month: 4,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2024-04-21 edition; not verified against the organizer",
  },
  "deseret-news-marathon": {
    month: 7,
    weekday: 5,
    nth: 4,
    note: "Derived from the 2026-07-24 edition; not verified against the organizer",
  },
  "detroit-free-press-marathon": {
    month: 10,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2023-10-15 edition; not verified against the organizer",
  },
  "eisenhower-marathon": {
    month: 4,
    weekday: 6,
    nth: -1,
    note: "Derived from the 2023-04-29 edition; not verified against the organizer",
  },
  "estes-park-marathon": {
    month: 6,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2024-06-16 edition; not verified against the organizer",
  },
  "foot-traffic-flat-marathon": {
    month: 7,
    weekday: 5,
    nth: 1,
    note: "Derived from the 2025-07-04 edition; not verified against the organizer",
  },
  "galveston-marathon": {
    month: 2,
    weekday: 0,
    nth: -1,
    note: "Derived from the 2024-02-25 edition; not verified against the organizer",
  },
  "grandmas-marathon": {
    month: 6,
    weekday: 6,
    nth: 4,
    note: "Derived from the 2024-06-22 edition; not verified against the organizer",
  },
  "jack-and-jills-downhill-marathon": {
    month: 7,
    weekday: 6,
    nth: -1,
    note: "Derived from the 2026-07-25 edition; not verified against the organizer",
  },
  "jacksonville-marathon": {
    month: 12,
    weekday: 0,
    nth: 2,
    note: "Derived from the 2023-12-10 edition; not verified against the organizer",
  },
  "kauai-marathon": {
    month: 9,
    weekday: 0,
    nth: 1,
    note: "Derived from the 2023-09-03 edition; not verified against the organizer",
  },
  "leadville-trail-marathon": {
    month: 6,
    weekday: 6,
    nth: -1,
    note: "Derived from the 2024-06-29 edition; not verified against the organizer",
  },
  "little-rock-marathon": {
    month: 3,
    weekday: 0,
    nth: 1,
    note: "Derived from the 2025-03-02 edition; not verified against the organizer",
  },
  "long-beach-marathon": {
    month: 10,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2023-10-15 edition; not verified against the organizer",
  },
  "lost-dutchman-marathon": {
    month: 2,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2024-02-18 edition; not verified against the organizer",
  },
  "marine-corps-marathon": {
    month: 10,
    weekday: 0,
    nth: -1,
    note: "Derived from the 2023-10-29 edition; not verified against the organizer",
  },
  "maui-oceanfront-marathon": {
    month: 1,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2025-01-19 edition; not verified against the organizer",
  },
  "minocqua-northwoods-escape-marathon": {
    month: 5,
    weekday: 0,
    nth: -1,
    note: "Derived from the 2023-05-28 edition; not verified against the organizer",
  },
  "mississippi-blues-marathon": {
    month: 2,
    weekday: 6,
    nth: -1,
    note: "Derived from the 2025-02-22 edition; not verified against the organizer",
  },
  "missoula-marathon": {
    month: 6,
    weekday: 6,
    nth: -1,
    note: "Derived from the 2026-06-27 edition; not verified against the organizer",
  },
  "myrtle-beach-marathon": {
    month: 3,
    weekday: 6,
    nth: 1,
    note: "Derived from the 2024-03-02 edition; not verified against the organizer",
  },
  "new-hampshire-marathon": {
    month: 9,
    weekday: 6,
    nth: -1,
    note: "Derived from the 2023-09-30 edition; not verified against the organizer",
  },
  "newport-marathon": {
    month: 4,
    weekday: 6,
    nth: 3,
    note: "Derived from the 2026-04-18 edition; not verified against the organizer",
  },
  "north-olympic-discovery-marathon": {
    month: 6,
    weekday: 0,
    nth: 1,
    note: "Derived from the 2024-06-02 edition; not verified against the organizer",
  },
  "ogden-marathon": {
    month: 5,
    weekday: 6,
    nth: 3,
    note: "Derived from the 2026-05-16 edition; not verified against the organizer",
  },
  "one-city-marathon": {
    month: 3,
    weekday: 0,
    nth: 1,
    note: "Derived from the 2025-03-02 edition; not verified against the organizer",
  },
  "orange-county-marathon": {
    month: 5,
    weekday: 0,
    nth: 1,
    note: "Derived from the 2024-05-05 edition; not verified against the organizer",
  },
  "pittsburgh-marathon": {
    month: 5,
    weekday: 0,
    nth: 2,
    note: "Derived from the 2023-05-14 edition; not verified against the organizer",
  },
  "richmond-marathon": {
    month: 11,
    weekday: 6,
    nth: 3,
    note: "Derived from the 2025-11-15 edition; not verified against the organizer",
  },
  "sugarloaf-marathon": {
    month: 5,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2026-05-17 edition; not verified against the organizer",
  },
  "utah-valley-marathon": {
    month: 6,
    weekday: 5,
    nth: 1,
    note: "Derived from the 2026-06-05 edition; not verified against the organizer",
  },
  "vermont-city-marathon": {
    month: 5,
    weekday: 0,
    nth: 4,
    note: "Derived from the 2026-05-24 edition; not verified against the organizer",
  },
  "wilmington-marathon": {
    month: 2,
    weekday: 6,
    nth: -1,
    note: "Derived from the 2025-02-22 edition; not verified against the organizer",
  },
  // Imported from goandrace.com — batch 2026-08-09. Each rule is derived
  // from one observed date, not from the organizer's own statement.
  "gold-coast-marathon": {
    month: 7,
    weekday: 5,
    nth: 1,
    note: "Derived from the 2026-07-03 edition; not verified against the organizer",
  },
  "auckland-marathon": {
    month: 11,
    weekday: 6,
    nth: 1,
    note: "Derived from the 2025-11-01 edition; not verified against the organizer",
  },
  "loch-ness-marathon": {
    month: 9,
    weekday: 0,
    nth: -1,
    note: "Derived from the 2025-09-28 edition; not verified against the organizer",
  },
  "mississauga-marathon": {
    month: 4,
    weekday: 0,
    nth: -1,
    note: "Derived from the 2024-04-28 edition; not verified against the organizer",
  },
  "bermuda-triangle-challenge": {
    month: 1,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2025-01-19 edition; not verified against the organizer",
  },
  "dublin-marathon": {
    month: 10,
    weekday: 0,
    nth: -1,
    note: "Derived from the 2023-10-29 edition; not verified against the organizer",
  },
  "reykjavik-marathon": {
    month: 8,
    weekday: 6,
    nth: 3,
    note: "Derived from the 2023-08-19 edition; not verified against the organizer",
  },
  "aruba-marathon": {
    month: 6,
    weekday: 0,
    nth: 1,
    note: "Derived from the 2024-06-02 edition; not verified against the organizer",
  },
  "manitoba-marathon": {
    month: 6,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2024-06-16 edition; not verified against the organizer",
  },
  "marathon-baie-des-chaleurs": {
    month: 6,
    weekday: 0,
    nth: 1,
    note: "Derived from the 2024-06-02 edition; not verified against the organizer",
  },
  "niagara-falls-international-marathon": {
    month: 10,
    weekday: 0,
    nth: 4,
    note: "Derived from the 2023-10-22 edition; not verified against the organizer",
  },
  "pikes-peak-marathon": {
    month: 9,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2025-09-21 edition; not verified against the organizer",
  },
  "prince-of-wales-island-marathon": {
    month: 5,
    weekday: 6,
    nth: 4,
    note: "Derived from the 2025-05-24 edition; not verified against the organizer",
  },
  "fort-lauderdale-a1a-marathon": {
    month: 2,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2025-02-16 edition; not verified against the organizer",
  },
  "salt-lake-city-marathon": {
    month: 4,
    weekday: 6,
    nth: -1,
    note: "Derived from the 2025-04-26 edition; not verified against the organizer",
  },
  "santa-rosa-marathon": {
    month: 8,
    weekday: 6,
    nth: 4,
    note: "Derived from the 2025-08-23 edition; not verified against the organizer",
  },
  "saskatchewan-marathon": {
    month: 5,
    weekday: 0,
    nth: -1,
    note: "Derived from the 2026-05-31 edition; not verified against the organizer",
  },
  "seoul-marathon": {
    month: 3,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2025-03-16 edition; not verified against the organizer",
  },
  "sioux-falls-marathon": {
    month: 9,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2025-09-21 edition; not verified against the organizer",
  },
  "st-george-marathon": {
    month: 10,
    weekday: 6,
    nth: 1,
    note: "Derived from the 2025-10-04 edition; not verified against the organizer",
  },
  "suffolk-county-marathon": {
    month: 10,
    weekday: 6,
    nth: 3,
    note: "Derived from the 2025-10-18 edition; not verified against the organizer",
  },
  "ottawa-marathon": {
    month: 5,
    weekday: 0,
    nth: -1,
    note: "Derived from the 2025-05-25 edition; not verified against the organizer",
  },
  "toronto-waterfront-marathon": {
    month: 10,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2025-10-19 edition; not verified against the organizer",
  },
  "the-woodlands-marathon": {
    month: 3,
    weekday: 6,
    nth: 1,
    note: "Derived from the 2025-03-01 edition; not verified against the organizer",
  },
  "toronto-marathon": {
    month: 5,
    weekday: 0,
    nth: 1,
    note: "Derived from the 2025-05-04 edition; not verified against the organizer",
  },
  "celebration-marathon": {
    month: 1,
    weekday: 0,
    nth: -1,
    note: "Derived from the 2026-01-25 edition; not verified against the organizer",
  },
  "tobacco-road-marathon": {
    month: 3,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2026-03-15 edition; not verified against the organizer",
  },
  "walt-disney-world-marathon": {
    month: 1,
    weekday: 0,
    nth: 2,
    note: "Derived from the 2025-01-12 edition; not verified against the organizer",
  },
  "wisconsin-marathon": {
    month: 5,
    weekday: 6,
    nth: 1,
    note: "Derived from the 2025-05-03 edition; not verified against the organizer",
  },
  // Imported from goandrace.com — batch 2026-08-09. Each rule is derived
  // from one observed date, not from the organizer's own statement.
  "buffalo-marathon": {
    month: 5,
    weekday: 6,
    nth: 4,
    note: "Derived from the 2026-05-23 edition; not verified against the organizer",
  },
  "copenhagen-marathon": {
    month: 5,
    weekday: 0,
    nth: 1,
    note: "Derived from the 2024-05-05 edition; not verified against the organizer",
  },
  "cork-city-marathon": {
    month: 6,
    weekday: 0,
    nth: 1,
    note: "Derived from the 2024-06-02 edition; not verified against the organizer",
  },
  "chattanooga-marathon": {
    month: 3,
    weekday: 0,
    nth: -1,
    note: "Derived from the 2026-03-29 edition; not verified against the organizer",
  },
  "fargo-marathon": {
    month: 5,
    weekday: 5,
    nth: -1,
    note: "Derived from the 2026-05-29 edition; not verified against the organizer",
  },
  "blue-ridge-marathon": {
    month: 4,
    weekday: 6,
    nth: 3,
    note: "Derived from the 2026-04-18 edition; not verified against the organizer",
  },
  "kansas-city-marathon": {
    month: 10,
    weekday: 6,
    nth: 3,
    note: "Derived from the 2025-10-18 edition; not verified against the organizer",
  },
  "hyannis-marathon": {
    month: 3,
    weekday: 0,
    nth: 1,
    note: "Derived from the 2025-03-02 edition; not verified against the organizer",
  },
  "long-island-marathon": {
    month: 5,
    weekday: 0,
    nth: 1,
    note: "Derived from the 2024-05-05 edition; not verified against the organizer",
  },
  "zydeco-marathon": {
    month: 3,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2025-03-16 edition; not verified against the organizer",
  },
  "route-66-marathon": {
    month: 11,
    weekday: 0,
    nth: 4,
    note: "Derived from the 2025-11-23 edition; not verified against the organizer",
  },
  // Imported from goandrace.com — batch 2026-08-09. Each rule is derived
  // from one observed date, not from the organizer's own statement.
  "oslo-marathon": {
    month: 9,
    weekday: 6,
    nth: 3,
    note: "Derived from the 2025-09-20 edition; not verified against the organizer",
  },
  "lisbon-marathon": {
    month: 10,
    weekday: 6,
    nth: -1,
    note: "Derived from the 2025-10-25 edition; not verified against the organizer",
  },
  "enschede-marathon": {
    month: 4,
    weekday: 0,
    nth: 2,
    note: "Derived from the 2026-04-12 edition; not verified against the organizer",
  },
  "marathon-de-la-liberte": {
    month: 6,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2025-06-15 edition; not verified against the organizer",
  },
  "marburger-nachtmarathon": {
    month: 7,
    weekday: 5,
    nth: 1,
    note: "Derived from the 2026-07-03 edition; not verified against the organizer",
  },
  "pisa-marathon": {
    month: 12,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2025-12-21 edition; not verified against the organizer",
  },
  "midnight-sun-marathon": {
    month: 6,
    weekday: 6,
    nth: 3,
    note: "Derived from the 2025-06-21 edition; not verified against the organizer",
  },
  "limassol-marathon": {
    month: 3,
    weekday: 0,
    nth: 4,
    note: "Derived from the 2025-03-23 edition; not verified against the organizer",
  },
  "venice-marathon": {
    month: 10,
    weekday: 0,
    nth: -1,
    note: "Derived from the 2025-10-26 edition; not verified against the organizer",
  },
  // Imported from goandrace.com — batch 2026-08-09. Each rule is derived
  // from one observed date, not from the organizer's own statement.
  "lagos-city-marathon": {
    month: 2,
    weekday: 6,
    nth: 3,
    note: "Derived from the 2025-02-15 edition; not verified against the organizer",
  },
  "xiamen-marathon": {
    month: 1,
    weekday: 0,
    nth: 1,
    note: "Derived from the 2025-01-05 edition; not verified against the organizer",
  },
  "dubai-marathon": {
    month: 1,
    weekday: 0,
    nth: 1,
    note: "Derived from the 2024-01-07 edition; not verified against the organizer",
  },
  "huairou-great-wall-marathon": {
    month: 9,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2025-09-21 edition; not verified against the organizer",
  },
  "marrakech-marathon": {
    month: 1,
    weekday: 0,
    nth: -1,
    note: "Derived from the 2025-01-26 edition; not verified against the organizer",
  },
  "kilimanjaro-international-marathon": {
    month: 2,
    weekday: 0,
    nth: -1,
    note: "Derived from the 2024-02-25 edition; not verified against the organizer",
  },
  "osaka-marathon": {
    month: 2,
    weekday: 1,
    nth: -1,
    note: "Derived from the 2025-02-24 edition; not verified against the organizer",
  },
  "osaka-women-s-marathon": {
    month: 1,
    weekday: 0,
    nth: -1,
    note: "Derived from the 2025-01-26 edition; not verified against the organizer",
  },
  "vilnius-marathon": {
    month: 9,
    weekday: 0,
    nth: 2,
    note: "Derived from the 2025-09-14 edition; not verified against the organizer",
  },
  "hong-kong-marathon": {
    month: 2,
    weekday: 0,
    nth: 2,
    note: "Derived from the 2025-02-09 edition; not verified against the organizer",
  },
  "mumbai-marathon": {
    month: 1,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2025-01-19 edition; not verified against the organizer",
  },
  "tel-aviv-marathon": {
    month: 2,
    weekday: 5,
    nth: -1,
    note: "Derived from the 2025-02-28 edition; not verified against the organizer",
  },
  "township-marathon": {
    month: 2,
    weekday: 0,
    nth: -1,
    note: "Derived from the 2025-02-23 edition; not verified against the organizer",
  },
  "victoria-falls-marathon": {
    month: 7,
    weekday: 0,
    nth: 1,
    note: "Derived from the 2026-07-05 edition; not verified against the organizer",
  },
  "zurich-marathon": {
    month: 4,
    weekday: 0,
    nth: 2,
    note: "Derived from the 2025-04-13 edition; not verified against the organizer",
  },
  // Imported from goandrace.com — batch 2026-08-09. Each rule is derived
  // from one observed date, not from the organizer's own statement.
  "pokhara-international-marathon": {
    month: 2,
    weekday: 6,
    nth: 3,
    note: "Derived from the 2025-02-15 edition; not verified against the organizer",
  },
  "polar-night-marathon": {
    month: 1,
    weekday: 6,
    nth: 1,
    note: "Derived from the 2026-01-03 edition; not verified against the organizer",
  },
  "portsmouth-coastal-waterside-marathon": {
    month: 12,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2025-12-21 edition; not verified against the organizer",
  },
  "pretoria-marathon": {
    month: 2,
    weekday: 0,
    nth: -1,
    note: "Derived from the 2025-02-23 edition; not verified against the organizer",
  },
  "rimini-marathon": {
    month: 4,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2026-04-19 edition; not verified against the organizer",
  },
  "rota-marathon": {
    month: 1,
    weekday: 5,
    nth: 3,
    note: "Derived from the 2025-01-17 edition; not verified against the organizer",
  },
  "saipan-marathon": {
    month: 3,
    weekday: 5,
    nth: 1,
    note: "Derived from the 2025-03-07 edition; not verified against the organizer",
  },
  "salzburg-marathon": {
    month: 5,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2025-05-18 edition; not verified against the organizer",
  },
  "santa-eularia-ibiza-marathon": {
    month: 4,
    weekday: 6,
    nth: 3,
    note: "Derived from the 2026-04-18 edition; not verified against the organizer",
  },
  "santo-domingo-marathon": {
    month: 10,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2025-10-19 edition; not verified against the organizer",
  },
  "score-marathon": {
    month: 7,
    weekday: 0,
    nth: 2,
    note: "Derived from the 2025-07-13 edition; not verified against the organizer",
  },
  "sea-of-galilee-marathon": {
    month: 1,
    weekday: 5,
    nth: 1,
    note: "Derived from the 2025-01-03 edition; not verified against the organizer",
  },
  "stanley-marathon": {
    month: 3,
    weekday: 0,
    nth: 2,
    note: "Derived from the 2025-03-09 edition; not verified against the organizer",
  },
  "taipei-charity-marathon": {
    month: 1,
    weekday: 0,
    nth: 2,
    note: "Derived from the 2025-01-12 edition; not verified against the organizer",
  },
  "ston-wall-marathon": {
    month: 9,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2025-09-21 edition; not verified against the organizer",
  },
  "thimphu-marathon": {
    month: 9,
    weekday: 6,
    nth: -1,
    note: "Derived from the 2025-09-27 edition; not verified against the organizer",
  },
  "three-bridges-run": {
    month: 9,
    weekday: 0,
    nth: -1,
    note: "Derived from the 2025-09-28 edition; not verified against the organizer",
  },
  "n4-elands-marathon": {
    month: 3,
    weekday: 6,
    nth: 1,
    note: "Derived from the 2025-03-01 edition; not verified against the organizer",
  },
  "uppsala-marathon": {
    month: 10,
    weekday: 6,
    nth: 3,
    note: "Derived from the 2025-10-18 edition; not verified against the organizer",
  },
  "verdi-marathon": {
    month: 2,
    weekday: 0,
    nth: -1,
    note: "Derived from the 2025-02-23 edition; not verified against the organizer",
  },
  "white-marble-marathon": {
    month: 2,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2025-02-16 edition; not verified against the organizer",
  },
  "wurzburg-marathon": {
    month: 5,
    weekday: 0,
    nth: -1,
    note: "Derived from the 2025-05-25 edition; not verified against the organizer",
  },
  // Imported from goandrace.com — batch 2026-08-09. Each rule is derived
  // from one observed date, not from the organizer's own statement.
  "almaty-marathon": {
    month: 9,
    weekday: 0,
    nth: -1,
    note: "Derived from the 2025-09-28 edition; not verified against the organizer",
  },
  "ho-chi-minh-city-marathon": {
    month: 1,
    weekday: 0,
    nth: 2,
    note: "Derived from the 2026-01-11 edition; not verified against the organizer",
  },
  "la-paz-marathon": {
    month: 3,
    weekday: 0,
    nth: 2,
    note: "Derived from the 2025-03-09 edition; not verified against the organizer",
  },
  // Imported from goandrace.com — batch 2026-08-09. Each rule is derived
  // from one observed date, not from the organizer's own statement.
  "marsala-marathon": {
    month: 4,
    weekday: 0,
    nth: -1,
    note: "Derived from the 2026-04-26 edition; not verified against the organizer",
  },
  "bastad-marathon": {
    month: 7,
    weekday: 6,
    nth: 1,
    note: "Derived from the 2026-07-04 edition; not verified against the organizer",
  },
  "clare-burren-marathon-challenge": {
    month: 5,
    weekday: 6,
    nth: 4,
    note: "Derived from the 2026-05-23 edition; not verified against the organizer",
  },
  "collemar-athon": {
    month: 5,
    weekday: 0,
    nth: 1,
    note: "Derived from the 2026-05-03 edition; not verified against the organizer",
  },
  "knysna-forest-marathon": {
    month: 7,
    weekday: 6,
    nth: 1,
    note: "Derived from the 2026-07-04 edition; not verified against the organizer",
  },
  "la-transleonarde": {
    month: 6,
    weekday: 0,
    nth: -1,
    note: "Derived from the 2026-06-28 edition; not verified against the organizer",
  },
  "maastricht-marathon": {
    month: 5,
    weekday: 0,
    nth: 4,
    note: "Derived from the 2026-05-24 edition; not verified against the organizer",
  },
  "mekong-delta-marathon-hau-giang": {
    month: 7,
    weekday: 0,
    nth: 1,
    note: "Derived from the 2026-07-05 edition; not verified against the organizer",
  },
  "paavo-nurmi-marathon": {
    month: 8,
    weekday: 5,
    nth: 2,
    note: "Derived from the 2026-08-14 edition; not verified against the organizer",
  },
  "santa-cruz-marathon": {
    month: 7,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2026-07-19 edition; not verified against the organizer",
  },
  "samoa-international-marathon": {
    month: 7,
    weekday: 5,
    nth: 1,
    note: "Derived from the 2026-07-03 edition; not verified against the organizer",
  },
  "metropolmarathon": {
    month: 6,
    weekday: 0,
    nth: 2,
    note: "Derived from the 2026-06-14 edition; not verified against the organizer",
  },
  "terwa-marathon": {
    month: 5,
    weekday: 6,
    nth: 4,
    note: "Derived from the 2026-05-23 edition; not verified against the organizer",
  },
  // Imported from goandrace.com — batch 2026-08-09. Each rule is derived
  // from one observed date, not from the organizer's own statement.
  "baloise-namur-marathon": {
    month: 4,
    weekday: 0,
    nth: 2,
    note: "Derived from the 2026-04-12 edition; not verified against the organizer",
  },
  "brescia-art-marathon": {
    month: 3,
    weekday: 0,
    nth: 2,
    note: "Derived from the 2026-03-08 edition; not verified against the organizer",
  },
  "brighton-marathon": {
    month: 4,
    weekday: 0,
    nth: 2,
    note: "Derived from the 2026-04-12 edition; not verified against the organizer",
  },
  "cadbury-marathon": {
    month: 1,
    weekday: 6,
    nth: 2,
    note: "Derived from the 2026-01-10 edition; not verified against the organizer",
  },
  "great-welsh-marathon": {
    month: 3,
    weekday: 0,
    nth: 2,
    note: "Derived from the 2026-03-08 edition; not verified against the organizer",
  },
  "hobart-airport-marathon-festival": {
    month: 4,
    weekday: 6,
    nth: 2,
    note: "Derived from the 2026-04-11 edition; not verified against the organizer",
  },
  "hogeye-marathon": {
    month: 4,
    weekday: 6,
    nth: 2,
    note: "Derived from the 2026-04-11 edition; not verified against the organizer",
  },
  "jerusalem-marathon": {
    month: 4,
    weekday: 5,
    nth: 3,
    note: "Derived from the 2026-04-17 edition; not verified against the organizer",
  },
  "lake-garda-42k": {
    month: 4,
    weekday: 0,
    nth: 2,
    note: "Derived from the 2026-04-12 edition; not verified against the organizer",
  },
  "marathon-de-montauban": {
    month: 3,
    weekday: 0,
    nth: -1,
    note: "Derived from the 2026-03-29 edition; not verified against the organizer",
  },
  "marathon-du-golfe-de-saint-tropez": {
    month: 3,
    weekday: 0,
    nth: -1,
    note: "Derived from the 2026-03-29 edition; not verified against the organizer",
  },
  "marathon-zeeuws-vlaanderen": {
    month: 4,
    weekday: 6,
    nth: 2,
    note: "Derived from the 2026-04-11 edition; not verified against the organizer",
  },
  // Imported from goandrace.com — batch 2026-08-10. Each rule is derived
  // from one observed date, not from the organizer's own statement.
  "abingdon-marathon": {
    month: 10,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2025-10-19 edition; not verified against the organizer",
  },
  "adelaide-marathon-festival": {
    month: 5,
    weekday: 6,
    nth: 1,
    note: "Derived from the 2025-05-03 edition; not verified against the organizer",
  },
  "bacolod-city-marathon": {
    month: 6,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2025-06-15 edition; not verified against the organizer",
  },
  "bhutan-international-marathon": {
    month: 3,
    weekday: 6,
    nth: 1,
    note: "Derived from the 2025-03-01 edition; not verified against the organizer",
  },
  "bodh-gaya-marathon": {
    month: 2,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2025-02-16 edition; not verified against the organizer",
  },
  "borneo-international-marathon": {
    month: 5,
    weekday: 0,
    nth: 2,
    note: "Derived from the 2025-05-11 edition; not verified against the organizer",
  },
  "buller-gorge-marathon": {
    month: 2,
    weekday: 5,
    nth: 1,
    note: "Derived from the 2025-02-07 edition; not verified against the organizer",
  },
  "buriram-marathon": {
    month: 1,
    weekday: 6,
    nth: -1,
    note: "Derived from the 2025-01-25 edition; not verified against the organizer",
  },
  "busselton-marathon": {
    month: 2,
    weekday: 5,
    nth: 1,
    note: "Derived from the 2025-02-07 edition; not verified against the organizer",
  },
  "cambridge-boundary-run": {
    month: 3,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2025-03-16 edition; not verified against the organizer",
  },
  "cape-gate-vaal-marathon": {
    month: 2,
    weekday: 0,
    nth: -1,
    note: "Derived from the 2025-02-23 edition; not verified against the organizer",
  },
  "chelmsford-marathon": {
    month: 10,
    weekday: 0,
    nth: 2,
    note: "Derived from the 2025-10-12 edition; not verified against the organizer",
  },
  "china-coast-marathon": {
    month: 1,
    weekday: 0,
    nth: 2,
    note: "Derived from the 2025-01-12 edition; not verified against the organizer",
  },
  "illinois-marathon": {
    month: 4,
    weekday: 6,
    nth: -1,
    note: "Derived from the 2025-04-26 edition; not verified against the organizer",
  },
  "daegu-marathon": {
    month: 2,
    weekday: 0,
    nth: -1,
    note: "Derived from the 2025-02-23 edition; not verified against the organizer",
  },
  "danang-international-marathon": {
    month: 3,
    weekday: 0,
    nth: 4,
    note: "Derived from the 2025-03-23 edition; not verified against the organizer",
  },
  "edenvale-marathon": {
    month: 3,
    weekday: 0,
    nth: 2,
    note: "Derived from the 2025-03-09 edition; not verified against the organizer",
  },
  // Imported from goandrace.com — batch 2026-08-10. Each rule is derived
  // from one observed date, not from the organizer's own statement.
  "ehime-marathon": {
    month: 2,
    weekday: 0,
    nth: 2,
    note: "Derived from the 2025-02-09 edition; not verified against the organizer",
  },
  "eva-air-brisbane-marathon": {
    month: 5,
    weekday: 6,
    nth: -1,
    note: "Derived from the 2025-05-31 edition; not verified against the organizer",
  },
  "finlandia-marathon": {
    month: 9,
    weekday: 5,
    nth: 1,
    note: "Derived from the 2025-09-05 edition; not verified against the organizer",
  },
  "glendalough-lap-of-the-gap-marathon": {
    month: 5,
    weekday: 6,
    nth: 4,
    note: "Derived from the 2025-05-24 edition; not verified against the organizer",
  },
  "gyeongju-marathon": {
    month: 10,
    weekday: 6,
    nth: 3,
    note: "Derived from the 2025-10-18 edition; not verified against the organizer",
  },
  "heuvelland-marathon": {
    month: 3,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2025-03-16 edition; not verified against the organizer",
  },
  "ing-night-marathon-luxembourg": {
    month: 5,
    weekday: 6,
    nth: -1,
    note: "Derived from the 2025-05-31 edition; not verified against the organizer",
  },
  "koenig-ludwig-marathon": {
    month: 7,
    weekday: 6,
    nth: -1,
    note: "Derived from the 2025-07-26 edition; not verified against the organizer",
  },
  "kitakyushu-marathon": {
    month: 2,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2025-02-16 edition; not verified against the organizer",
  },
  "kyoto-marathon": {
    month: 2,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2025-02-16 edition; not verified against the organizer",
  },
  "la-valette-marathon": {
    month: 3,
    weekday: 0,
    nth: 4,
    note: "Derived from the 2025-03-23 edition; not verified against the organizer",
  },
  "langdale-marathon": {
    month: 9,
    weekday: 6,
    nth: 2,
    note: "Derived from the 2025-09-13 edition; not verified against the organizer",
  },
  "logicom-cyprus-marathon": {
    month: 3,
    weekday: 0,
    nth: 2,
    note: "Derived from the 2025-03-09 edition; not verified against the organizer",
  },
  "malta-marathon": {
    month: 2,
    weekday: 0,
    nth: -1,
    note: "Derived from the 2025-02-23 edition; not verified against the organizer",
  },
  "marathon-des-grands-crus": {
    month: 10,
    weekday: 0,
    nth: 2,
    note: "Derived from the 2025-10-12 edition; not verified against the organizer",
  },
  "castello-marathon": {
    month: 2,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2025-02-16 edition; not verified against the organizer",
  },
  "maraton-lala": {
    month: 3,
    weekday: 0,
    nth: 1,
    note: "Derived from the 2025-03-02 edition; not verified against the organizer",
  },
  // Imported from goandrace.com — batch 2026-08-10. Each rule is derived
  // from one observed date, not from the organizer's own statement.
  "nagano-marathon": {
    month: 4,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2025-04-20 edition; not verified against the organizer",
  },
  "newcastle-marathon": {
    month: 4,
    weekday: 5,
    nth: 3,
    note: "Derived from the 2025-04-18 edition; not verified against the organizer",
  },
  "portofino-marathon": {
    month: 2,
    weekday: 0,
    nth: 1,
    note: "Derived from the 2025-02-02 edition; not verified against the organizer",
  },
  "amsterdam-marathon": {
    month: 10,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2025-10-19 edition; not verified against the organizer",
  },
  // Imported from goandrace.com — batch 2026-08-10. Each rule is derived
  // from one observed date, not from the organizer's own statement.
  "riyadh-marathon": {
    month: 2,
    weekday: 6,
    nth: 2,
    note: "Derived from the 2025-02-08 edition; not verified against the organizer",
  },
  "palma-marathon": {
    month: 10,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2025-10-19 edition; not verified against the organizer",
  },
  // Imported from goandrace.com — batch 2026-08-10. Each rule is derived
  // from one observed date, not from the organizer's own statement.
  "split-marathon": {
    month: 2,
    weekday: 0,
    nth: 3,
    note: "Mid-February Sunday. 2026 ran 15 Feb (3rd Sun), 2027 confirmed 14 Feb (2nd Sun) — nth is not stable year to year",
  },
  "taipei-marathon": {
    month: 12,
    weekday: 0,
    nth: 3,
    note: "Third Sunday of December, per the organizer; 2026 confirmed 20 Dec",
  },
  // Imported from goandrace.com — batch 2026-08-11. Each rule is derived
  // from one observed date, not from the organizer's own statement.
  "prosecco-marathon": {
    month: 12,
    weekday: 0,
    nth: 1,
    note: "Derived from the 2023-12-03 edition; not verified against the organizer",
  },
  "eker-i-run-marathon": {
    month: 10,
    weekday: 0,
    nth: 1,
    note: "Derived from the 2024-10-06 edition; not verified against the organizer",
  },
  "maratona-di-san-valentino": {
    month: 2,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2024-02-18 edition; not verified against the organizer",
  },
  // Imported from goandrace.com — batch 2026-08-11. Each rule is derived
  // from one observed date, not from the organizer's own statement.
  "treviso-marathon": {
    month: 3,
    weekday: 0,
    nth: -1,
    note: "Derived from the 2022-03-27 edition; not verified against the organizer",
  },
  "padova-marathon": {
    month: 4,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2024-04-21 edition; not verified against the organizer",
  },
  "reggio-emilia-marathon": {
    month: 12,
    weekday: 0,
    nth: 2,
    note: "Derived from the 2023-12-10 edition; not verified against the organizer",
  },
  "catania-marathon": {
    month: 12,
    weekday: 0,
    nth: 2,
    note: "Derived from the 2021-12-12 edition; not verified against the organizer",
  },
  "belgrade-marathon": {
    month: 4,
    weekday: 0,
    nth: -1,
    note: "Derived from the 2024-04-28 edition; not verified against the organizer",
  },
  "medoc-marathon": {
    month: 9,
    weekday: 6,
    nth: 1,
    note: "Derived from the 2024-09-07 edition; not verified against the organizer",
  },
  "grecia-salentina-marathon": {
    month: 10,
    weekday: 0,
    nth: -1,
    note: "Derived from the 2023-10-29 edition; not verified against the organizer",
  },
  "mugello-marathon": {
    month: 10,
    weekday: 0,
    nth: 1,
    note: "Derived from the 2023-10-01 edition; not verified against the organizer",
  },
  "salzkammergut-marathon": {
    month: 10,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2023-10-15 edition; not verified against the organizer",
  },
  "parma-marathon": {
    month: 10,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2023-10-15 edition; not verified against the organizer",
  },
  "elba-marathon": {
    month: 5,
    weekday: 0,
    nth: 1,
    note: "Derived from the 2024-05-05 edition; not verified against the organizer",
  },
  "aabenraa-mountain-marathon": {
    month: 6,
    weekday: 6,
    nth: 4,
    note: "Derived from the 2024-06-22 edition; not verified against the organizer",
  },
  "beirut-marathon": {
    month: 11,
    weekday: 0,
    nth: 2,
    note: "Derived from the 2022-11-13 edition; not verified against the organizer",
  },
  "blackpool-festival-of-running": {
    month: 4,
    weekday: 0,
    nth: 3,
    note: "Derived from the 2024-04-21 edition; not verified against the organizer",
  },
  // Imported from goandrace.com — batch 2026-08-17. Each rule is derived
  // from one observed date, not from the organizer's own statement.
  "buckeye-marathon": {
    month: 1,
    weekday: 6,
    nth: 2,
    note: "Confirmed 12th annual edition runs Jan 10, 2026 (2nd Saturday), matching the derived pattern. Timezone corrected from the longitude-banded guess (America/Denver) to America/Phoenix — Arizona does not observe DST.",
  },
  "can-tho-heritage-marathon": {
    month: 12,
    weekday: 0,
    nth: 3,
    note: "Confirmed still runs: 2025 edition held Dec 21, 2025 (8 months before this import). Weekday corrected from Saturday (2024's date) to Sunday (2025's date) — the race appears to hold its \"3rd weekend of December\" slot without a fixed weekday, so this is an approximation, not a confirmed rule.",
  },
  "cayman-islands-marathon": {
    month: 12,
    weekday: 0,
    nth: 1,
    note: "Confirmed still runs: caymanislandsmarathon.com states \"first Sunday in December every year\" and lists 2026 registration open for Dec 6, 2026 — matches the derived pattern exactly. Organizer left blank: the site names no producing club, only a business contact (Kelly Holding Ltd) that is not clearly the race organizer.",
  },
  "dingle-marathon": {
    month: 9,
    weekday: 6,
    nth: 1,
    note: "Confirmed still runs: dinglemarathon.ie lists Sept 5, 2026 (1st Saturday), matching the derived pattern (sold out, which is evidence of activity, not defunctness). Slug simplified from \"dingle-full-and-half-marathon\" to \"dingle-marathon\" per convention — measured 41.65 km confirms this GPX is the full-marathon course, not the half.",
  },
  "funchal-marathon": {
    month: 1,
    weekday: 0,
    nth: -1,
    note: "Corrected from the 2022 scrape's nth=4: madeiramarathon.com confirms Jan 31, 2027, the LAST Sunday of January (2022's 4th Sunday happened to not be the last that year). Recurrence re-derived from the current source per the still-runs check.",
  },
  "maratona-di-ravenna": {
    month: 11,
    weekday: 0,
    nth: 2,
    note: "Confirmed against maratonadiravenna.com: 2026 edition is Nov 8, 2026 (2nd Sunday), matching the derived pattern.",
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
  // Imported from goandrace.com — batch 2026-08-08. Dates as published by
  // the event listing; startTimeLocal is deliberately left unset.
  { seriesSlug: "asheville-marathon", year: 2026, raceDate: "2026-03-21" },
  { seriesSlug: "austin-marathon", year: 2026, raceDate: "2026-02-15" },
  { seriesSlug: "barcelona-marathon", year: 2026, raceDate: "2026-03-15" },
  { seriesSlug: "barletta-marathon", year: 2026, raceDate: "2026-02-08" },
  // Imported from goandrace.com — batch 2026-08-08. Dates as published by
  // the event listing; startTimeLocal is deliberately left unset.
  { seriesSlug: "calgary-marathon", year: 2026, raceDate: "2026-05-23" },
  { seriesSlug: "cape-town-marathon", year: 2025, raceDate: "2025-10-19" },
  { seriesSlug: "vancouver-marathon", year: 2025, raceDate: "2025-05-04" },
  // Imported from goandrace.com — batch 2026-08-08. Dates as published by
  // the event listing; startTimeLocal is deliberately left unset.
  { seriesSlug: "alamo-marathon", year: 2025, raceDate: "2025-03-02" },
  { seriesSlug: "cowtown-marathon", year: 2024, raceDate: "2024-02-25" },
  { seriesSlug: "denver-colfax-marathon", year: 2026, raceDate: "2026-05-16" },
  { seriesSlug: "houston-marathon", year: 2026, raceDate: "2026-01-11" },
  { seriesSlug: "kentucky-derby-festival-marathon", year: 2024, raceDate: "2024-04-27" },
  { seriesSlug: "los-angeles-marathon", year: 2026, raceDate: "2026-03-08" },
  { seriesSlug: "oklahoma-city-memorial-marathon", year: 2026, raceDate: "2026-04-26" },
  { seriesSlug: "philadelphia-marathon", year: 2024, raceDate: "2024-11-24" },
  { seriesSlug: "revel-mt-charleston-marathon", year: 2026, raceDate: "2026-03-28" },
  { seriesSlug: "rock-n-roll-san-diego-marathon", year: 2026, raceDate: "2026-05-30" },
  { seriesSlug: "san-francisco-marathon", year: 2026, raceDate: "2026-07-26" },
  { seriesSlug: "seattle-marathon", year: 2024, raceDate: "2024-12-01" },
  // Imported from goandrace.com — batch 2026-08-08. Dates as published by
  // the event listing; startTimeLocal is deliberately left unset.
  { seriesSlug: "atlanta-marathon", year: 2025, raceDate: "2025-03-02" },
  { seriesSlug: "brew-city-marathon", year: 2026, raceDate: "2026-04-18" },
  { seriesSlug: "california-international-marathon", year: 2024, raceDate: "2024-12-08" },
  { seriesSlug: "honolulu-marathon", year: 2024, raceDate: "2024-12-08" },
  { seriesSlug: "mesa-marathon", year: 2025, raceDate: "2025-02-08" },
  { seriesSlug: "miami-marathon", year: 2026, raceDate: "2026-01-25" },
  { seriesSlug: "milwaukee-marathon", year: 2026, raceDate: "2026-04-11" },
  { seriesSlug: "oakland-marathon", year: 2026, raceDate: "2026-03-22" },
  // Imported from goandrace.com — batch 2026-08-08. Dates as published by
  // the event listing; startTimeLocal is deliberately left unset.
  { seriesSlug: "anchorage-mayors-marathon", year: 2025, raceDate: "2025-06-21" },
  { seriesSlug: "cincinnati-flying-pig-marathon", year: 2025, raceDate: "2025-05-04" },
  { seriesSlug: "lincoln-marathon", year: 2024, raceDate: "2024-05-05" },
  { seriesSlug: "st-louis-marathon", year: 2026, raceDate: "2026-04-11" },
  { seriesSlug: "twin-cities-marathon", year: 2023, raceDate: "2023-09-30" },
  // Imported from goandrace.com — batch 2026-08-08. Dates as published by
  // the event listing; startTimeLocal is deliberately left unset.
  { seriesSlug: "budapest-marathon", year: 2025, raceDate: "2025-10-12" },
  { seriesSlug: "cologne-marathon", year: 2024, raceDate: "2024-10-06" },
  { seriesSlug: "irving-marathon", year: 2025, raceDate: "2025-03-30" },
  { seriesSlug: "istanbul-marathon", year: 2025, raceDate: "2025-11-02" },
  { seriesSlug: "milan-marathon", year: 2026, raceDate: "2026-04-12" },
  { seriesSlug: "munich-marathon", year: 2025, raceDate: "2025-10-12" },
  { seriesSlug: "neapolis-marathon", year: 2024, raceDate: "2024-10-13" },
  { seriesSlug: "paris-marathon", year: 2026, raceDate: "2026-04-12" },
  { seriesSlug: "prague-marathon", year: 2025, raceDate: "2025-05-04" },
  { seriesSlug: "rome-marathon", year: 2026, raceDate: "2026-03-22" },
  { seriesSlug: "stockholm-marathon", year: 2026, raceDate: "2026-05-30" },
  { seriesSlug: "vienna-city-marathon", year: 2026, raceDate: "2026-04-19" },
  { seriesSlug: "windermere-marathon", year: 2024, raceDate: "2024-05-19" },
  // Imported from goandrace.com — batch 2026-08-08. Dates as published by
  // the event listing; startTimeLocal is deliberately left unset.
  { seriesSlug: "athens-marathon", year: 2023, raceDate: "2023-11-12" },
  { seriesSlug: "frankfurt-marathon", year: 2023, raceDate: "2023-10-29" },
  { seriesSlug: "hamburg-marathon", year: 2026, raceDate: "2026-04-26" },
  { seriesSlug: "helsinki-city-run", year: 2024, raceDate: "2024-05-11" },
  { seriesSlug: "helsinki-marathon", year: 2024, raceDate: "2024-08-24" },
  { seriesSlug: "lisbon-eco-marathon", year: 2026, raceDate: "2026-04-12" },
  { seriesSlug: "palermo-marathon", year: 2024, raceDate: "2024-11-17" },
  { seriesSlug: "seville-marathon", year: 2025, raceDate: "2025-02-23" },
  { seriesSlug: "turin-marathon", year: 2023, raceDate: "2023-11-05" },
  { seriesSlug: "valencia-marathon", year: 2025, raceDate: "2025-12-07" },
  // Imported from goandrace.com — batch 2026-08-09. Dates as published by
  // the event listing; startTimeLocal is deliberately left unset.
  { seriesSlug: "alexander-the-great-marathon", year: 2025, raceDate: "2025-04-06" },
  { seriesSlug: "antwerp-marathon", year: 2025, raceDate: "2025-10-19" },
  { seriesSlug: "bologna-marathon", year: 2025, raceDate: "2025-03-02" },
  { seriesSlug: "bonn-marathon", year: 2024, raceDate: "2024-04-14" },
  { seriesSlug: "bratislava-marathon", year: 2026, raceDate: "2026-04-12" },
  { seriesSlug: "bremen-marathon", year: 2024, raceDate: "2024-10-06" },
  { seriesSlug: "florence-marathon", year: 2024, raceDate: "2024-11-24" },
  { seriesSlug: "gothenburg-marathon", year: 2023, raceDate: "2023-09-03" },
  { seriesSlug: "hannover-marathon", year: 2026, raceDate: "2026-04-12" },
  { seriesSlug: "malaga-marathon", year: 2025, raceDate: "2025-12-14" },
  { seriesSlug: "nantes-marathon", year: 2024, raceDate: "2024-04-21" },
  { seriesSlug: "rotterdam-marathon", year: 2024, raceDate: "2024-04-14" },
  // Imported from goandrace.com — batch 2026-08-09. Dates as published by
  // the event listing; startTimeLocal is deliberately left unset.
  { seriesSlug: "belfast-marathon", year: 2024, raceDate: "2024-05-05" },
  { seriesSlug: "bilbao-night-marathon", year: 2024, raceDate: "2024-10-19" },
  { seriesSlug: "edinburgh-marathon", year: 2026, raceDate: "2026-05-24" },
  { seriesSlug: "lyon-marathon", year: 2025, raceDate: "2025-10-05" },
  { seriesSlug: "manchester-marathon", year: 2026, raceDate: "2026-04-19" },
  { seriesSlug: "montpellier-marathon", year: 2026, raceDate: "2026-04-18" },
  { seriesSlug: "nice-cannes-marathon", year: 2024, raceDate: "2024-11-03" },
  { seriesSlug: "tallinn-marathon", year: 2024, raceDate: "2024-09-08" },
  // Imported from goandrace.com — batch 2026-08-09. Dates as published by
  // the event listing; startTimeLocal is deliberately left unset.
  { seriesSlug: "verona-marathon", year: 2025, raceDate: "2025-11-16" },
  // Imported from goandrace.com — batch 2026-08-09. Dates as published by
  // the event listing; startTimeLocal is deliberately left unset.
  { seriesSlug: "brasilia-marathon", year: 2025, raceDate: "2025-11-23" },
  { seriesSlug: "buenos-aires-marathon", year: 2025, raceDate: "2025-09-21" },
  { seriesSlug: "caracas-marathon", year: 2025, raceDate: "2025-02-16" },
  { seriesSlug: "lima-marathon", year: 2026, raceDate: "2026-05-24" },
  { seriesSlug: "mendoza-marathon", year: 2025, raceDate: "2025-05-04" },
  { seriesSlug: "rio-de-janeiro-marathon", year: 2026, raceDate: "2026-06-07" },
  { seriesSlug: "santiago-marathon", year: 2024, raceDate: "2024-04-28" },
  // Imported from goandrace.com — batch 2026-08-09. Dates as published by
  // the event listing; startTimeLocal is deliberately left unset.
  { seriesSlug: "albany-marathon", year: 2025, raceDate: "2025-03-01" },
  { seriesSlug: "appletree-marathon", year: 2025, raceDate: "2025-09-06" },
  { seriesSlug: "aspen-valley-marathon", year: 2025, raceDate: "2025-07-19" },
  { seriesSlug: "bayshore-marathon", year: 2024, raceDate: "2024-05-25" },
  { seriesSlug: "bcs-marathon", year: 2023, raceDate: "2023-12-10" },
  { seriesSlug: "bear-lake-trifecta", year: 2026, raceDate: "2026-06-06" },
  { seriesSlug: "big-sur-marathon", year: 2026, raceDate: "2026-04-26" },
  { seriesSlug: "boulderthon", year: 2024, raceDate: "2024-09-29" },
  { seriesSlug: "capital-city-marathon", year: 2024, raceDate: "2024-05-19" },
  { seriesSlug: "carlsbad-marathon", year: 2026, raceDate: "2026-01-18" },
  { seriesSlug: "carmel-marathon", year: 2026, raceDate: "2026-04-18" },
  { seriesSlug: "casper-marathon", year: 2024, raceDate: "2024-06-02" },
  { seriesSlug: "chicagoland-spring-marathon", year: 2026, raceDate: "2026-05-03" },
  { seriesSlug: "cleveland-marathon", year: 2026, raceDate: "2026-05-16" },
  { seriesSlug: "coastal-delaware-marathon", year: 2026, raceDate: "2026-04-12" },
  { seriesSlug: "coeur-d-alene-marathon", year: 2026, raceDate: "2026-05-23" },
  { seriesSlug: "colorado-marathon", year: 2026, raceDate: "2026-05-03" },
  { seriesSlug: "cummins-falls-marathon", year: 2025, raceDate: "2025-02-22" },
  { seriesSlug: "delaware-marathon", year: 2024, raceDate: "2024-04-21" },
  { seriesSlug: "deseret-news-marathon", year: 2026, raceDate: "2026-07-24" },
  { seriesSlug: "detroit-free-press-marathon", year: 2023, raceDate: "2023-10-15" },
  { seriesSlug: "eisenhower-marathon", year: 2023, raceDate: "2023-04-29" },
  { seriesSlug: "estes-park-marathon", year: 2024, raceDate: "2024-06-16" },
  { seriesSlug: "foot-traffic-flat-marathon", year: 2025, raceDate: "2025-07-04" },
  { seriesSlug: "galveston-marathon", year: 2024, raceDate: "2024-02-25" },
  { seriesSlug: "grandmas-marathon", year: 2024, raceDate: "2024-06-22" },
  { seriesSlug: "jack-and-jills-downhill-marathon", year: 2026, raceDate: "2026-07-25" },
  { seriesSlug: "jacksonville-marathon", year: 2023, raceDate: "2023-12-10" },
  { seriesSlug: "kauai-marathon", year: 2023, raceDate: "2023-09-03" },
  { seriesSlug: "leadville-trail-marathon", year: 2024, raceDate: "2024-06-29" },
  { seriesSlug: "little-rock-marathon", year: 2025, raceDate: "2025-03-02" },
  { seriesSlug: "long-beach-marathon", year: 2023, raceDate: "2023-10-15" },
  { seriesSlug: "lost-dutchman-marathon", year: 2024, raceDate: "2024-02-18" },
  { seriesSlug: "marine-corps-marathon", year: 2023, raceDate: "2023-10-29" },
  { seriesSlug: "maui-oceanfront-marathon", year: 2025, raceDate: "2025-01-19" },
  { seriesSlug: "minocqua-northwoods-escape-marathon", year: 2023, raceDate: "2023-05-28" },
  { seriesSlug: "mississippi-blues-marathon", year: 2025, raceDate: "2025-02-22" },
  { seriesSlug: "missoula-marathon", year: 2026, raceDate: "2026-06-27" },
  { seriesSlug: "myrtle-beach-marathon", year: 2024, raceDate: "2024-03-02" },
  { seriesSlug: "new-hampshire-marathon", year: 2023, raceDate: "2023-09-30" },
  { seriesSlug: "newport-marathon", year: 2026, raceDate: "2026-04-18" },
  { seriesSlug: "north-olympic-discovery-marathon", year: 2024, raceDate: "2024-06-02" },
  { seriesSlug: "ogden-marathon", year: 2026, raceDate: "2026-05-16" },
  { seriesSlug: "one-city-marathon", year: 2025, raceDate: "2025-03-02" },
  { seriesSlug: "orange-county-marathon", year: 2024, raceDate: "2024-05-05" },
  { seriesSlug: "pittsburgh-marathon", year: 2023, raceDate: "2023-05-14" },
  { seriesSlug: "richmond-marathon", year: 2025, raceDate: "2025-11-15" },
  { seriesSlug: "sugarloaf-marathon", year: 2026, raceDate: "2026-05-17" },
  { seriesSlug: "utah-valley-marathon", year: 2026, raceDate: "2026-06-05" },
  { seriesSlug: "vermont-city-marathon", year: 2026, raceDate: "2026-05-24" },
  { seriesSlug: "wilmington-marathon", year: 2025, raceDate: "2025-02-22" },
  // Imported from goandrace.com — batch 2026-08-09. Dates as published by
  // the event listing; startTimeLocal is deliberately left unset.
  { seriesSlug: "gold-coast-marathon", year: 2026, raceDate: "2026-07-03" },
  { seriesSlug: "auckland-marathon", year: 2025, raceDate: "2025-11-01" },
  { seriesSlug: "loch-ness-marathon", year: 2025, raceDate: "2025-09-28" },
  { seriesSlug: "mississauga-marathon", year: 2024, raceDate: "2024-04-28" },
  { seriesSlug: "bermuda-triangle-challenge", year: 2025, raceDate: "2025-01-19" },
  { seriesSlug: "dublin-marathon", year: 2023, raceDate: "2023-10-29" },
  { seriesSlug: "reykjavik-marathon", year: 2023, raceDate: "2023-08-19" },
  { seriesSlug: "aruba-marathon", year: 2024, raceDate: "2024-06-02" },
  { seriesSlug: "manitoba-marathon", year: 2024, raceDate: "2024-06-16" },
  { seriesSlug: "marathon-baie-des-chaleurs", year: 2024, raceDate: "2024-06-02" },
  { seriesSlug: "niagara-falls-international-marathon", year: 2023, raceDate: "2023-10-22" },
  { seriesSlug: "pikes-peak-marathon", year: 2025, raceDate: "2025-09-21" },
  { seriesSlug: "prince-of-wales-island-marathon", year: 2025, raceDate: "2025-05-24" },
  { seriesSlug: "fort-lauderdale-a1a-marathon", year: 2025, raceDate: "2025-02-16" },
  { seriesSlug: "salt-lake-city-marathon", year: 2025, raceDate: "2025-04-26" },
  { seriesSlug: "santa-rosa-marathon", year: 2025, raceDate: "2025-08-23" },
  { seriesSlug: "saskatchewan-marathon", year: 2026, raceDate: "2026-05-31" },
  { seriesSlug: "seoul-marathon", year: 2025, raceDate: "2025-03-16" },
  { seriesSlug: "sioux-falls-marathon", year: 2025, raceDate: "2025-09-21" },
  { seriesSlug: "st-george-marathon", year: 2025, raceDate: "2025-10-04" },
  { seriesSlug: "suffolk-county-marathon", year: 2025, raceDate: "2025-10-18" },
  { seriesSlug: "ottawa-marathon", year: 2025, raceDate: "2025-05-25" },
  { seriesSlug: "toronto-waterfront-marathon", year: 2025, raceDate: "2025-10-19" },
  { seriesSlug: "the-woodlands-marathon", year: 2025, raceDate: "2025-03-01" },
  { seriesSlug: "toronto-marathon", year: 2025, raceDate: "2025-05-04" },
  { seriesSlug: "celebration-marathon", year: 2026, raceDate: "2026-01-25" },
  { seriesSlug: "tobacco-road-marathon", year: 2026, raceDate: "2026-03-15" },
  { seriesSlug: "walt-disney-world-marathon", year: 2025, raceDate: "2025-01-12" },
  { seriesSlug: "wisconsin-marathon", year: 2025, raceDate: "2025-05-03" },
  // Imported from goandrace.com — batch 2026-08-09. Dates as published by
  // the event listing; startTimeLocal is deliberately left unset.
  { seriesSlug: "buffalo-marathon", year: 2026, raceDate: "2026-05-23" },
  { seriesSlug: "copenhagen-marathon", year: 2024, raceDate: "2024-05-05" },
  { seriesSlug: "cork-city-marathon", year: 2024, raceDate: "2024-06-02" },
  { seriesSlug: "chattanooga-marathon", year: 2026, raceDate: "2026-03-29" },
  { seriesSlug: "fargo-marathon", year: 2026, raceDate: "2026-05-29" },
  { seriesSlug: "blue-ridge-marathon", year: 2026, raceDate: "2026-04-18" },
  { seriesSlug: "kansas-city-marathon", year: 2025, raceDate: "2025-10-18" },
  { seriesSlug: "hyannis-marathon", year: 2025, raceDate: "2025-03-02" },
  { seriesSlug: "long-island-marathon", year: 2024, raceDate: "2024-05-05" },
  { seriesSlug: "zydeco-marathon", year: 2025, raceDate: "2025-03-16" },
  { seriesSlug: "route-66-marathon", year: 2025, raceDate: "2025-11-23" },
  // Imported from goandrace.com — batch 2026-08-09. Dates as published by
  // the event listing; startTimeLocal is deliberately left unset.
  { seriesSlug: "oslo-marathon", year: 2025, raceDate: "2025-09-20" },
  { seriesSlug: "lisbon-marathon", year: 2025, raceDate: "2025-10-25" },
  { seriesSlug: "enschede-marathon", year: 2026, raceDate: "2026-04-12" },
  { seriesSlug: "marathon-de-la-liberte", year: 2025, raceDate: "2025-06-15" },
  { seriesSlug: "marburger-nachtmarathon", year: 2026, raceDate: "2026-07-03" },
  { seriesSlug: "pisa-marathon", year: 2025, raceDate: "2025-12-21" },
  { seriesSlug: "midnight-sun-marathon", year: 2025, raceDate: "2025-06-21" },
  { seriesSlug: "limassol-marathon", year: 2025, raceDate: "2025-03-23" },
  { seriesSlug: "venice-marathon", year: 2025, raceDate: "2025-10-26" },
  // Imported from goandrace.com — batch 2026-08-09. Dates as published by
  // the event listing; startTimeLocal is deliberately left unset.
  { seriesSlug: "lagos-city-marathon", year: 2025, raceDate: "2025-02-15" },
  { seriesSlug: "xiamen-marathon", year: 2025, raceDate: "2025-01-05" },
  { seriesSlug: "dubai-marathon", year: 2024, raceDate: "2024-01-07" },
  { seriesSlug: "huairou-great-wall-marathon", year: 2025, raceDate: "2025-09-21" },
  { seriesSlug: "marrakech-marathon", year: 2025, raceDate: "2025-01-26" },
  { seriesSlug: "kilimanjaro-international-marathon", year: 2024, raceDate: "2024-02-25" },
  { seriesSlug: "osaka-marathon", year: 2025, raceDate: "2025-02-24" },
  { seriesSlug: "osaka-women-s-marathon", year: 2025, raceDate: "2025-01-26" },
  { seriesSlug: "vilnius-marathon", year: 2025, raceDate: "2025-09-14" },
  { seriesSlug: "hong-kong-marathon", year: 2025, raceDate: "2025-02-09" },
  { seriesSlug: "mumbai-marathon", year: 2025, raceDate: "2025-01-19" },
  { seriesSlug: "tel-aviv-marathon", year: 2025, raceDate: "2025-02-28" },
  { seriesSlug: "township-marathon", year: 2025, raceDate: "2025-02-23" },
  { seriesSlug: "victoria-falls-marathon", year: 2026, raceDate: "2026-07-05" },
  { seriesSlug: "zurich-marathon", year: 2025, raceDate: "2025-04-13" },
  // Imported from goandrace.com — batch 2026-08-09. Dates as published by
  // the event listing; startTimeLocal is deliberately left unset.
  { seriesSlug: "pokhara-international-marathon", year: 2025, raceDate: "2025-02-15" },
  { seriesSlug: "polar-night-marathon", year: 2026, raceDate: "2026-01-03" },
  { seriesSlug: "portsmouth-coastal-waterside-marathon", year: 2025, raceDate: "2025-12-21" },
  { seriesSlug: "pretoria-marathon", year: 2025, raceDate: "2025-02-23" },
  { seriesSlug: "rimini-marathon", year: 2026, raceDate: "2026-04-19" },
  { seriesSlug: "rota-marathon", year: 2025, raceDate: "2025-01-17" },
  { seriesSlug: "saipan-marathon", year: 2025, raceDate: "2025-03-07" },
  { seriesSlug: "salzburg-marathon", year: 2025, raceDate: "2025-05-18" },
  { seriesSlug: "santa-eularia-ibiza-marathon", year: 2026, raceDate: "2026-04-18" },
  { seriesSlug: "santo-domingo-marathon", year: 2025, raceDate: "2025-10-19" },
  { seriesSlug: "score-marathon", year: 2025, raceDate: "2025-07-13" },
  { seriesSlug: "sea-of-galilee-marathon", year: 2025, raceDate: "2025-01-03" },
  { seriesSlug: "stanley-marathon", year: 2025, raceDate: "2025-03-09" },
  { seriesSlug: "taipei-charity-marathon", year: 2025, raceDate: "2025-01-12" },
  { seriesSlug: "ston-wall-marathon", year: 2025, raceDate: "2025-09-21" },
  { seriesSlug: "thimphu-marathon", year: 2025, raceDate: "2025-09-27" },
  { seriesSlug: "three-bridges-run", year: 2025, raceDate: "2025-09-28" },
  { seriesSlug: "n4-elands-marathon", year: 2025, raceDate: "2025-03-01" },
  { seriesSlug: "uppsala-marathon", year: 2025, raceDate: "2025-10-18" },
  { seriesSlug: "verdi-marathon", year: 2025, raceDate: "2025-02-23" },
  { seriesSlug: "white-marble-marathon", year: 2025, raceDate: "2025-02-16" },
  { seriesSlug: "wurzburg-marathon", year: 2025, raceDate: "2025-05-25" },
  // Imported from goandrace.com — batch 2026-08-09. Dates as published by
  // the event listing; startTimeLocal is deliberately left unset.
  { seriesSlug: "almaty-marathon", year: 2025, raceDate: "2025-09-28" },
  { seriesSlug: "ho-chi-minh-city-marathon", year: 2026, raceDate: "2026-01-11" },
  { seriesSlug: "la-paz-marathon", year: 2025, raceDate: "2025-03-09" },
  // Imported from goandrace.com — batch 2026-08-09. Dates as published by
  // the event listing; startTimeLocal is deliberately left unset.
  { seriesSlug: "marsala-marathon", year: 2026, raceDate: "2026-04-26" },
  { seriesSlug: "bastad-marathon", year: 2026, raceDate: "2026-07-04" },
  { seriesSlug: "clare-burren-marathon-challenge", year: 2026, raceDate: "2026-05-23" },
  { seriesSlug: "collemar-athon", year: 2026, raceDate: "2026-05-03" },
  { seriesSlug: "knysna-forest-marathon", year: 2026, raceDate: "2026-07-04" },
  { seriesSlug: "la-transleonarde", year: 2026, raceDate: "2026-06-28" },
  { seriesSlug: "maastricht-marathon", year: 2026, raceDate: "2026-05-24" },
  { seriesSlug: "mekong-delta-marathon-hau-giang", year: 2026, raceDate: "2026-07-05" },
  { seriesSlug: "paavo-nurmi-marathon", year: 2026, raceDate: "2026-08-14" },
  { seriesSlug: "santa-cruz-marathon", year: 2026, raceDate: "2026-07-19" },
  { seriesSlug: "samoa-international-marathon", year: 2026, raceDate: "2026-07-03" },
  { seriesSlug: "metropolmarathon", year: 2026, raceDate: "2026-06-14" },
  { seriesSlug: "terwa-marathon", year: 2026, raceDate: "2026-05-23" },
  // Imported from goandrace.com — batch 2026-08-09. Dates as published by
  // the event listing; startTimeLocal is deliberately left unset.
  { seriesSlug: "baloise-namur-marathon", year: 2026, raceDate: "2026-04-12" },
  { seriesSlug: "brescia-art-marathon", year: 2026, raceDate: "2026-03-08" },
  { seriesSlug: "brighton-marathon", year: 2026, raceDate: "2026-04-12" },
  { seriesSlug: "cadbury-marathon", year: 2026, raceDate: "2026-01-10" },
  { seriesSlug: "great-welsh-marathon", year: 2026, raceDate: "2026-03-08" },
  { seriesSlug: "hobart-airport-marathon-festival", year: 2026, raceDate: "2026-04-11" },
  { seriesSlug: "hogeye-marathon", year: 2026, raceDate: "2026-04-11" },
  { seriesSlug: "jerusalem-marathon", year: 2026, raceDate: "2026-04-17" },
  { seriesSlug: "lake-garda-42k", year: 2026, raceDate: "2026-04-12" },
  { seriesSlug: "marathon-de-montauban", year: 2026, raceDate: "2026-03-29" },
  { seriesSlug: "marathon-du-golfe-de-saint-tropez", year: 2026, raceDate: "2026-03-29" },
  { seriesSlug: "marathon-zeeuws-vlaanderen", year: 2026, raceDate: "2026-04-11" },
  // Imported from goandrace.com — batch 2026-08-10. Dates as published by
  // the event listing; startTimeLocal is deliberately left unset.
  { seriesSlug: "abingdon-marathon", year: 2025, raceDate: "2025-10-19" },
  { seriesSlug: "adelaide-marathon-festival", year: 2025, raceDate: "2025-05-03" },
  { seriesSlug: "bacolod-city-marathon", year: 2025, raceDate: "2025-06-15" },
  { seriesSlug: "bhutan-international-marathon", year: 2025, raceDate: "2025-03-01" },
  { seriesSlug: "bodh-gaya-marathon", year: 2025, raceDate: "2025-02-16" },
  { seriesSlug: "borneo-international-marathon", year: 2025, raceDate: "2025-05-11" },
  { seriesSlug: "buller-gorge-marathon", year: 2025, raceDate: "2025-02-07" },
  { seriesSlug: "buriram-marathon", year: 2025, raceDate: "2025-01-25" },
  { seriesSlug: "busselton-marathon", year: 2025, raceDate: "2025-02-07" },
  { seriesSlug: "cambridge-boundary-run", year: 2025, raceDate: "2025-03-16" },
  { seriesSlug: "cape-gate-vaal-marathon", year: 2025, raceDate: "2025-02-23" },
  { seriesSlug: "chelmsford-marathon", year: 2025, raceDate: "2025-10-12" },
  { seriesSlug: "china-coast-marathon", year: 2025, raceDate: "2025-01-12" },
  { seriesSlug: "illinois-marathon", year: 2025, raceDate: "2025-04-26" },
  { seriesSlug: "daegu-marathon", year: 2025, raceDate: "2025-02-23" },
  { seriesSlug: "danang-international-marathon", year: 2025, raceDate: "2025-03-23" },
  { seriesSlug: "edenvale-marathon", year: 2025, raceDate: "2025-03-09" },
  // Imported from goandrace.com — batch 2026-08-10. Dates as published by
  // the event listing; startTimeLocal is deliberately left unset.
  { seriesSlug: "ehime-marathon", year: 2025, raceDate: "2025-02-09" },
  { seriesSlug: "eva-air-brisbane-marathon", year: 2025, raceDate: "2025-05-31" },
  { seriesSlug: "finlandia-marathon", year: 2025, raceDate: "2025-09-05" },
  { seriesSlug: "glendalough-lap-of-the-gap-marathon", year: 2025, raceDate: "2025-05-24" },
  { seriesSlug: "gyeongju-marathon", year: 2025, raceDate: "2025-10-18" },
  { seriesSlug: "heuvelland-marathon", year: 2025, raceDate: "2025-03-16" },
  { seriesSlug: "ing-night-marathon-luxembourg", year: 2025, raceDate: "2025-05-31" },
  { seriesSlug: "koenig-ludwig-marathon", year: 2025, raceDate: "2025-07-26" },
  { seriesSlug: "kitakyushu-marathon", year: 2025, raceDate: "2025-02-16" },
  { seriesSlug: "kyoto-marathon", year: 2025, raceDate: "2025-02-16" },
  { seriesSlug: "la-valette-marathon", year: 2025, raceDate: "2025-03-23" },
  { seriesSlug: "langdale-marathon", year: 2025, raceDate: "2025-09-13" },
  { seriesSlug: "logicom-cyprus-marathon", year: 2025, raceDate: "2025-03-09" },
  { seriesSlug: "malta-marathon", year: 2025, raceDate: "2025-02-23" },
  { seriesSlug: "marathon-des-grands-crus", year: 2025, raceDate: "2025-10-12" },
  { seriesSlug: "castello-marathon", year: 2025, raceDate: "2025-02-16" },
  { seriesSlug: "maraton-lala", year: 2025, raceDate: "2025-03-02" },
  // Imported from goandrace.com — batch 2026-08-10. Dates as published by
  // the event listing; startTimeLocal is deliberately left unset.
  { seriesSlug: "nagano-marathon", year: 2025, raceDate: "2025-04-20" },
  { seriesSlug: "newcastle-marathon", year: 2025, raceDate: "2025-04-18" },
  { seriesSlug: "portofino-marathon", year: 2025, raceDate: "2025-02-02" },
  { seriesSlug: "amsterdam-marathon", year: 2025, raceDate: "2025-10-19" },
  // Imported from goandrace.com — batch 2026-08-10. Dates as published by
  // the event listing; startTimeLocal is deliberately left unset.
  { seriesSlug: "riyadh-marathon", year: 2025, raceDate: "2025-02-08" },
  { seriesSlug: "palma-marathon", year: 2025, raceDate: "2025-10-19" },
  // Imported from goandrace.com — batch 2026-08-10. Dates as published by
  // the event listing; startTimeLocal is deliberately left unset.
  { seriesSlug: "split-marathon", year: 2027, raceDate: "2027-02-14", startTimeLocal: "09:00" },
  { seriesSlug: "taipei-marathon", year: 2026, raceDate: "2026-12-20" },
  // Imported from goandrace.com — batch 2026-08-11. Dates as published by
  // the event listing, or verified against the organizer during review.
  // startTimeLocal appears only where a real one was read off the
  // organizer's page — never guessed, since a wrong hour silently keys
  // the weather forecast to it.
  { seriesSlug: "prosecco-marathon", year: 2026, raceDate: "2026-12-06" },
  { seriesSlug: "eker-i-run-marathon", year: 2026, raceDate: "2026-10-04" },
  { seriesSlug: "maratona-di-san-valentino", year: 2027, raceDate: "2027-02-21" },
  // Imported from goandrace.com — batch 2026-08-11. Dates as published by
  // the event listing, or verified against the organizer during review.
  // startTimeLocal appears only where a real one was read off the
  // organizer's page — never guessed, since a wrong hour silently keys
  // the weather forecast to it.
  { seriesSlug: "treviso-marathon", year: 2022, raceDate: "2022-03-27" },
  { seriesSlug: "padova-marathon", year: 2024, raceDate: "2024-04-21" },
  { seriesSlug: "reggio-emilia-marathon", year: 2023, raceDate: "2023-12-10" },
  { seriesSlug: "catania-marathon", year: 2021, raceDate: "2021-12-12" },
  { seriesSlug: "belgrade-marathon", year: 2024, raceDate: "2024-04-28" },
  { seriesSlug: "medoc-marathon", year: 2024, raceDate: "2024-09-07" },
  { seriesSlug: "grecia-salentina-marathon", year: 2023, raceDate: "2023-10-29" },
  { seriesSlug: "mugello-marathon", year: 2023, raceDate: "2023-10-01" },
  { seriesSlug: "salzkammergut-marathon", year: 2023, raceDate: "2023-10-15" },
  { seriesSlug: "parma-marathon", year: 2023, raceDate: "2023-10-15" },
  { seriesSlug: "elba-marathon", year: 2024, raceDate: "2024-05-05" },
  { seriesSlug: "aabenraa-mountain-marathon", year: 2024, raceDate: "2024-06-22" },
  { seriesSlug: "beirut-marathon", year: 2022, raceDate: "2022-11-13" },
  { seriesSlug: "blackpool-festival-of-running", year: 2024, raceDate: "2024-04-21" },
  // Imported from goandrace.com — batch 2026-08-17. Dates as published by
  // the event listing, or verified against the organizer during review.
  // startTimeLocal appears only where a real one was read off the
  // organizer's page — never guessed, since a wrong hour silently keys
  // the weather forecast to it.
  { seriesSlug: "buckeye-marathon", year: 2022, raceDate: "2022-01-08" },
  { seriesSlug: "can-tho-heritage-marathon", year: 2024, raceDate: "2024-12-21" },
  { seriesSlug: "cayman-islands-marathon", year: 2021, raceDate: "2021-12-05" },
  { seriesSlug: "dingle-marathon", year: 2024, raceDate: "2024-09-07" },
  { seriesSlug: "funchal-marathon", year: 2022, raceDate: "2022-01-23" },
  { seriesSlug: "maratona-di-ravenna", year: 2024, raceDate: "2024-11-10" },
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
