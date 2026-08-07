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
];

/** The shape every course slug must take: lowercase, digits, single hyphens. */
export const COURSE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
