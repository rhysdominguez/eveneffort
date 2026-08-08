# Bulk course import from goandrace.com

Adds marathon courses in batches instead of one at a time. Produces exactly the
same artifacts the hand-written seven have — same 44-point grid, same three JSON
files, same seed-file shape — so nothing downstream can tell an imported course
from a hand-added one.

Every GPX in this repo already came from goandrace.com. This automates the path
from their calendar to our seed files; it does not change what we store or how.

## The four steps

```
npm run import:fetch   -- --year-start 2026 --year-end 2027 --limit 50
npm run import:parse   -- --only <slugs> --report data/import/reports/<batch>.qa.json
npm run import:qa      -- --batch <batch>
# ---- read data/import/decisions.json, resolve every "review" entry ----
npm run import:promote -- --dry-run
npm run import:promote
npm run test && npm run build && npm run db:seed
```

`import:parse` is `scripts/gpx_parser/parse_gpx.py`, unchanged. It was already
written for bulk use; this pipeline just feeds it.

### 1. fetch — discover and download

Queries the calendar's own search form with `ok_marath` **and `ok_course_map`**.
That second filter is the only reliable predictor that geometry exists: plenty
of well-known races have an event page and no map at all (Berlin 2026, at the
time of writing). For 2026–27 it returns 28 marathons.

Per event it reads the schema.org `SportsEvent` JSON-LD, follows the
`/en/map/<year>/…-course-map-N.php` link, and pulls the `.gpx` href off it into
`data/gpx_sources/<slug>.gpx`.

Sequential, ~1s between requests, honest `User-Agent`. Skips anything already
downloaded, so a re-run resumes.

### 2. parse — geometry

Standard parser run. Its validation is the first real gate: it rejects GPX with
more than one track or segment, fewer than 100 points, any point missing
elevation, a gap over 5 km, or a total outside [41.5, 43.0] km. Expect losses —
community-uploaded tracks are uneven, and that filter working is the point.

### 3. qa — propose rows, flag what needs a human

Cross-checks the crawl against the parser report and writes
`data/import/decisions.json`, proposing a city / series / recurrence / edition
row per course with a verdict of `ready`, `review` or `rejected`.

**`review` is the normal outcome, not a failure.** The site does not publish
region codes or organizer names, and any timezone in a multi-zone country is a
longitude guess. Those all need a person.

Re-running qa **never overwrites an entry that already exists** — your edits are
safe. To re-assess a course, delete its entry first.

### 4. promote — apply

Reads `decisions.json` and appends every `ready` entry to `cities.ts`,
`series.ts`, `editions.ts` and `slug-ledger.ts`. Refuses to run while anything
is still `review` (`--force` overrides; `rejected` never promotes).

Everything it writes is an **append** — no existing line is rewritten or
reordered. Entries already in the ledger are skipped, so re-running is a no-op.

Rejected courses have their GPX and geometry moved to
`data/import/quarantine/`. That is required: `src/data/courses.test.ts` fails on
any parsed course with no `SERIES_SEED` entry, so a half-applied batch would
turn the suite red.

## What a human actually has to decide

| Field | Why it needs you |
|---|---|
| **`courseSlug`** | Permanent. It ships in `/results?courseId=…` links and on printed pacebands. Read every one before promoting — this is what `slug-ledger.ts` calls your signature. |
| `regionCode` / `regionName` | Not published. US/CA/AU city slugs carry the subdivision (`chicago-il-us`), so the city slug usually needs fixing too. |
| `organizer` | Not published. Only the organizer's URL is. |
| `timezone` | A longitude-band guess in the US, CA, AU, BR, MX, ID and CL. A wrong zone shifts a start time by hours. |
| `isMajor` | Always proposed `false`. |
| `note` on the recurrence rule | Machine-derived from a single observed date. If you know the real rule ("last Sunday of September"), say so. |

## Things that will bite you

- **Event-page coordinates are unreliable.** One listing puts a race in Hudson,
  Wisconsin at coordinates in New York State. Pins come from GPX `coords[0]`,
  never from the page — same rule CLAUDE.md step 3 already sets.
- **One pin per city.** `scripts/seed.ts` upserts `latitude` from the excluded
  row, so emitting a city entry for an already-seeded slug would silently move
  an existing pin. qa emits no city row when the slug already exists; keep it
  that way.
- **The ledger and the seed files must land in one commit.** The ledger tests are
  set-equality in both directions, so the tree is red in between.
- **A slug is spent forever.** Retired courses stay in the ledger and are never
  reused. See Rule 8.

## Provenance

`data/import/decisions.json` is committed — it is the record of which permanent
identifiers a person approved, and losing it means re-reviewing everything. The
raw crawl output, parser reports and quarantine are disposable and gitignored.

## Rights

goandrace.com's `robots.txt` carries no `Disallow`, and neither their terms nor
their legal note restricts automated access or commercial reuse. But nothing
grants reuse either, and their §5 assigns responsibility for uploaded GPX to the
user who submitted it — meaning they may not hold the rights to license a track
onward. Pacebands are paid product. Worth settling before a large batch ships.
