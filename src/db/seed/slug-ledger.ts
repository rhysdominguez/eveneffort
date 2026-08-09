// APPEND-ONLY. Read CLAUDE.md Rule 8 before touching this file.
//
// A course slug is a permanent public identifier. It appears in shared
// `/results?courseId=…` links and is printed on pacebands people have paid for,
// so renaming or removing one silently breaks a link somebody already holds —
// including on a piece of paper we can never reach.
//
// Rule 8 used to be a convention enforced by one hardcoded test listing the
// original seven. That does not survive bulk import: the point of the importer
// is to propose slugs by machine, and a machine-proposed slug is permanent the
// moment it ships. This ledger is the human signature on that permanence.
//
// The rules, enforced by src/data/courses.test.ts:
//
//   - Adding a course means adding its slug HERE, deliberately, as its own line.
//   - Removing or renaming a line fails the build. That is the whole point:
//     the failure is the broken-paceband warning, arriving before release
//     rather than as a support email afterwards.
//   - A slug that is retired stays in this list. Delete the series if you must,
//     but the identifier is spent forever — never reuse it for a different
//     course, or an old paceband link will resolve to the wrong race.
export const PUBLISHED_COURSE_SLUGS: string[] = [
  // The original seven, published before this ledger existed.
  "berlin",
  "boston",
  "chicago",
  "london",
  "newyork",
  "sydney",
  "tokyo",
  // Batch 2026-08-08, imported from goandrace.com on 2026-08-08.
  "asheville-marathon",
  "austin-marathon",
  "barcelona-marathon",
  "barletta-marathon",
  // Batch 2026-08-08, imported from goandrace.com on 2026-08-08.
  "calgary-marathon",
  "cape-town-marathon",
  "vancouver-marathon",
  // Batch 2026-08-08, imported from goandrace.com on 2026-08-08.
  "alamo-marathon",
  "cowtown-marathon",
  "denver-colfax-marathon",
  "houston-marathon",
  "kentucky-derby-festival-marathon",
  "los-angeles-marathon",
  "oklahoma-city-memorial-marathon",
  "philadelphia-marathon",
  "revel-mt-charleston-marathon",
  "rock-n-roll-san-diego-marathon",
  "san-francisco-marathon",
  "seattle-marathon",
  // Batch 2026-08-08, imported from goandrace.com on 2026-08-08.
  "atlanta-marathon",
  "brew-city-marathon",
  "california-international-marathon",
  "honolulu-marathon",
  "mesa-marathon",
  "miami-marathon",
  "milwaukee-marathon",
  "oakland-marathon",
  // Batch 2026-08-08, imported from goandrace.com on 2026-08-08.
  "anchorage-mayors-marathon",
  "cincinnati-flying-pig-marathon",
  "lincoln-marathon",
  "st-louis-marathon",
  "twin-cities-marathon",
  // Batch 2026-08-08, imported from goandrace.com on 2026-08-08.
  "budapest-marathon",
  "cologne-marathon",
  "irving-marathon",
  "istanbul-marathon",
  "milan-marathon",
  "munich-marathon",
  "neapolis-marathon",
  "paris-marathon",
  "prague-marathon",
  "rome-marathon",
  "stockholm-marathon",
  "vienna-city-marathon",
  "windermere-marathon",
  // Batch 2026-08-08, imported from goandrace.com on 2026-08-08.
  "athens-marathon",
  "frankfurt-marathon",
  "hamburg-marathon",
  "helsinki-city-run",
  "helsinki-marathon",
  "lisbon-eco-marathon",
  "palermo-marathon",
  "seville-marathon",
  "turin-marathon",
  "valencia-marathon",
  // Batch 2026-08-09, imported from goandrace.com on 2026-08-09.
  "alexander-the-great-marathon",
  "antwerp-marathon",
  "bologna-marathon",
  "bonn-marathon",
  "bratislava-marathon",
  "bremen-marathon",
  "florence-marathon",
  "gothenburg-marathon",
  "hannover-marathon",
  "malaga-marathon",
  "nantes-marathon",
  "rotterdam-marathon",
  // Batch 2026-08-09, imported from goandrace.com on 2026-08-09.
  "belfast-marathon",
  "bilbao-night-marathon",
  "edinburgh-marathon",
  "lyon-marathon",
  "manchester-marathon",
  "montpellier-marathon",
  "nice-cannes-marathon",
  "tallinn-marathon",
  // Batch 2026-08-09, imported from goandrace.com on 2026-08-09.
  "verona-marathon",
];

/** The shape every course slug must take: lowercase, digits, single hyphens. */
export const COURSE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
