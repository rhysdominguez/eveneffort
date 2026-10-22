# Bulk course import

Adds marathon courses in batches instead of one at a time. Produces exactly the
same artifacts the hand-written seven have — same 44-point grid, same three JSON
files, same seed-file shape — so nothing downstream can tell an imported course
from a hand-added one.

There are two front doors onto the same pipeline:

- **`fetch`** — goandrace.com's calendar, where all but one of this repo's GPX
  files came from. Bulk, automatic, and the default.
- **`adopt`** — one race at a time, from a course file a human found and vouched
  for, for the many races goandrace does not list at all. See
  [Adopting a course goandrace does not have](#adopting-a-course-goandrace-does-not-have).

Both write the same `RawBatch`, so parse → qa → promote run afterwards
identically. That seam is the design.

Driven end to end by the `/import-races` skill
(`.claude/skills/import-races/SKILL.md`); the steps below are what it runs.

## The four steps

```
npm run import:fetch   -- --limit 25            # bulk
npm run import:fetch   -- --city "Valencia"     # one city
npm run import:fetch   -- --url "<event-page>"  # one event
npm run import:parse   -- --only <slugs> --report data/import/reports/<batch>.qa.json
npm run import:qa      -- --batch <batch>
# ---- read data/import/decisions.json, resolve every "review" entry ----
npm run import:promote -- --dry-run
npm run import:promote
npm run build:outlines
npm run test && npm run build && npm run db:seed
```

`import:parse` is `scripts/gpx_parser/parse_gpx.py`, unchanged. It was already
written for bulk use; this pipeline just feeds it.

### 1. fetch — discover and download

Discovery pages `/it/api_calendario.php`, the JSON endpoint the calendar's own
"load more" button calls. This matters: the calendar **page** only ever renders
its first 28 results, so scraping the HTML caps you at 28 while the endpoint
reports the real total and pages through all of it, 28 at a time.

`--year-start`/`--year-end` decide how much of the catalogue you see, and the
default window is spent: 2026–27 is 129 marathons, all imported, and 2025–2029
is 378, likewise. The full catalogue is ~1,086 events back to 2015. Since a
course's geometry does not expire — a 2019 page traces the route the race still
runs — widening the year range is where new courses now come from. An archived
race has to be confirmed as still running before it is seeded; the skill spells
out that check.

Not every event has geometry. Those fail later with "links no course map",
which is cheap and honest — plenty of well-known races have an event page and
no map at all (Berlin 2026, at the time of writing).

Two targeted modes bypass discovery: `--city "<name>"` filters by the city the
calendar lists each event under, and `--url "<event-page>"` takes one event
directly.

Per event it reads the schema.org `SportsEvent` JSON-LD, follows the
`/en/map/<year>/…-course-map-N.php` link, and pulls the `.gpx` href off it into
`data/gpx_sources/<slug>.gpx`.

Sequential, ~1s between requests, honest `User-Agent`. Skips anything already
downloaded, so a re-run resumes.

It also skips anything that scrapes to the same real-world race as an
already-seeded series, even under a brand new event URL and slug — goandrace
pages a fresh URL for every year of a recurring race, so a slug/URL check
alone would re-download a race already shipped. `findNameMatch` in
`shared.ts` compares the scraped name and city against `SERIES_SEED` for
this; see the import-races skill's hard rules for how it's wired in.

### 2. parse — geometry

Standard parser run. Its validation is the first real gate: it rejects GPX with
more than one track or segment, fewer than 100 points, any point missing
elevation, a gap over 5 km, or a total outside [41.5, 43.6] km. Expect losses —
community-uploaded tracks are uneven, and that filter working is the point.

### 3. qa — propose rows, flag what needs a human

Cross-checks the crawl against the parser report and writes
`data/import/decisions.json`, proposing a city / series / recurrence / edition
row per course with a verdict of `ready`, `review` or `rejected`.

**`review` is the normal outcome, not a failure.** The site does not publish
region codes or organizer names, and any timezone in a multi-zone country is a
longitude guess. Those all need a person.

Re-running qa **never overwrites an entry that already exists** — your edits are
safe. To re-assess a course, delete its entry first — except a `rejected`
entry from a different `eventUrl`, which is reassessed automatically. A
`rejected` verdict is a settled negative about *one event page*, not the
slug forever: an organizer can republish a better GPX next year under a new
URL that still proposes the same courseSlug (Hogeye Marathon 2023 measured
41.4 km and was rejected; 2026 measures a real 42.56 km). Nothing about a
rejected entry can be in-progress human review to protect, unlike `ready` or
`review`, so there's nothing to lose by letting a fresh page reassess it.

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
- **`npm run build:outlines` is a step of its own.** `npm run build:outlines` writes the course silhouette (`<slug>.outline.json`, ROADMAP #21). It is a separate step because the outline is generated by TypeScript, not by `parse_gpx.py` — the upload route needs the same function at runtime. `courses.outline.integrity.test.ts` fails on a seeded course without one, so skipping it turns the suite red.
- **`npm run build` before `npm run db:seed` bakes a stale catalog into `.next`.**
  The homepage prerenders statically, so new courses appear in the race calendar
  but never in the pacing dropdown. Restarting the dev server does not fix it,
  and neither does clearing `.next/cache` — only `rm -rf .next` does.
- **Never reuse a batch name.** The raw crawl file is overwritten, and every
  course from the earlier run silently disappears from QA.

## Adopting a course goandrace does not have

goandrace's catalogue is ~1,089 events and its coverage is strong in the US and
Italy and thin elsewhere. **~550 of the 771 rows in the findmymarathon tracker
have no goandrace listing in any crawl** — no amount of re-sweeping reaches
them, because they were never there. Their organisers, however, often publish a
course file on their own site.

```
# 1. add the race to data/import/adoptions.json (committed — see below)
npm run import:adopt -- --batch adopt-2026-08-17 --dry-run
npm run import:adopt -- --batch adopt-2026-08-17
# 2..4 identical to a goandrace batch:
npm run import:parse -- --only <slugs> --report data/import/reports/<batch>.qa.json
npm run import:qa    -- --batch <batch>
npm run import:promote
```

`adoptions.json` is committed for the same reason `decisions.json` is: each
entry claims a permanent course slug (Rule 8) and records where that course's
geometry came from and who vouched for it. `routeSource` is one of:

| value | meaning |
|---|---|
| `organizer` | The race's own site published the file. **Prefer this.** |
| `route-host` | User-uploaded geometry on a route-sharing site. Check the rights again before it ships. |
| `manual` | A person downloaded the file by hand; `routeUrl` is a repo-relative path. |

`adopt.ts` normalises whatever it is given (`route.ts`) into the single-track,
elevation-bearing GPX `parse_gpx.py` requires — `<rte>` route exports, KML/KMZ
from a Google My Maps page and GeoJSON all become tracks — and fills elevation
from a terrain model when the file has none (`elevate.ts`). It applies the same
duplicate guard `fetch.ts` does, since a race can sit on both sources under
different names.

### Modelled elevation

`parse_gpx.py` rejects any point with no `<ele>`, and plenty of organiser files
are coordinate-only. `elevate.ts` samples OpenTopoData's SRTM 30 m model to fill
them, and records `dem:<dataset>` rather than `gpx` so a modelled course is
never mistaken for a surveyed one. qa.ts flags every one for review.

`npm run import:calibrate-dem` is the gate on that, and should be re-run if the
provider ever changes. It strips the elevation from courses we already have
surveyed, refills it from the model, pushes the result through the real parser
and diffs. Measured 2026-08-17 across six courses from dead-flat to 2350 m of
gain, against a 4:00 paceband:

| | rise MAE | max split drift |
|---|---|---|
| gold-coast, berlin, boston, blue-ridge, pikes-peak | 1.9–3.3 m | **≤ 5.7 s** over the whole race |
| newyork | 7.9 m | **17.4 s** |

Two things to take from that. First, goal normalisation absorbs symmetric model
noise: gold-coast's *gain* comes out 9 m → 62 m, a sevenfold error, and still
costs only 5.4 s. Judge a DEM profile by split drift, not by total gain.
Second, newyork is the shape to watch — a terrain model reads the water under a
bridge, not the deck. `elevate.ts` warns when adjacent points jump ≥ 25 m, which
is the bridge signature.

### findmymarathon.com is not a source — do not re-investigate

It lists many races we lack and shows an elevation chart for them, which makes
it look like an obvious second source. It is not:

- **The chart is a rendered JPEG** (`elevation/<Name>_e.jpg`). No chart library,
  no coordinate array, no per-point series — the only numbers on the page are
  min and max. With no lat/lon there is no `coords.json`, no map pin and no
  valid 44-point sample, so it cannot satisfy the data model at all.
- **They publish no geometry.** `/gpx/` is a soft-404 catch-all — a real
  filename and an invented one both return the identical 64,663-byte homepage.
  A 30-race sample of `not-on-source` entries found 17 with an elevation image
  and **0** exposing a GPX filename.
- They sell pace bands, so they are a direct competitor. Their Mod_Security
  rejects some generic agents (curl's default gets a 406), but serves this
  pipeline's honest `USER_AGENT` normally, and `robots.txt` does not disallow the
  calendar or detail pages (checked 2026-09-25).

It is still the best **roster** of US marathons there is. `findmymarathon.ts`
snapshots the whole calendar and every detail page into
`findmymarathon-calendar.csv`, and `reconcile-csv.ts` turns that into
`findmymarathon-tracker.csv`: every race, whether we have it, and the next step.
Two fields from the detail page earn their keep in the pipeline: `website` (where
the organizer's course file usually is) and the finish-line coordinate, which the
reconciler uses to tell same-named races apart by distance. Everything else is
kept for reference. **None of it is ever rendered on the site**: the
descriptions are their copy, and PR/course score are their metrics.

## Provenance

`data/import/decisions.json` and `data/import/adoptions.json` are committed —
between them they are the record of which permanent identifiers a person
approved and where each course's geometry came from. Losing them means
re-reviewing everything. Raw crawl output, parser reports and quarantine are
disposable and gitignored.

Each staged course carries `source.site`, `source.elevation` and `source.note`,
and `promote.ts` writes the real host into the seed-file comments rather than
assuming goandrace. Entries written before a second source existed have no
`site` and fall back to `goandrace.com`.

## Rights

**Settled 2026-09-25 — the policy and the evidence now live in
`docs/COURSE-RIGHTS.md`.** Read that before adding a source class. In short: new
courses come from the organizer's own site, from a public agency, or from
geometry we derive and label ourselves. **Route-sharing hosts are not
admissible** and `adopt.ts` refuses `routeSource: "route-host"` unless a human
passes `--allow-route-host` and writes the reason into `routeNote`.

Three findings from that audit that save re-investigation:

- **AIMS must not be crawled.** `aims-worldrunning.org/robots.txt` carries
  `Disallow: /events` and `Disallow: /members` under `User-agent: *`, which is
  exactly its calendar and member list. A person may read the site; no script
  here may fetch those paths.
- **Course-certification packets are not geometry.** USATF's database at
  `certifiedroadraces.com` serves a two-page PDF of raster images per certified
  course: no text layer, no coordinates. It is excellent for *validation* — the
  result table publishes certified distance, net drop in m/km and start-finish
  separation, all surveyed — and useless as a source.
- **goandrace's terms** are unchanged from what this file always said: no
  `Disallow`, no restriction on automated access or commercial reuse, nothing
  granting reuse either, and a §5 that assigns responsibility for uploaded GPX
  to the submitting user. That question stands for the courses already shipped
  from it.

## Discovery: three worklists, one ranked backlog

Added with ROADMAP #23. Before it, the races we did not have were recorded in
three places, in three shapes, none of them ranked.

```
npm run import:roster               # Wikipedia's 6 continent lists -> world-roster.csv
npm run import:backlog              # merge all three feeders -> backlog.csv, ranked
npm run import:backlog -- --top 20  # the next twenty worth working
npm run import:backlog -- --stats   # per-source-class hit rates
```

- **`roster.ts`** is the international source this repo never had. goandrace is
  strong in the US and Italy, findmymarathon is almost entirely US, and neither
  can see a marathon in Chile or Latvia. Wikipedia's six per-continent "List of
  marathon races" pages, read through the MediaWiki API, give **391 races across
  96 countries** — and they encode the World Athletics label tier as each row's
  background colour, so the roster and the reach ranking arrive in one parse.
- **`backlog.ts`** merges the roster, the findmymarathon tracker's
  `not-on-source` rows, and the one feeder nobody had looked at: **the races
  goandrace listed and that were rejected only for "event page links no course
  map"**. Those are the cheapest rows in the backlog. Output is
  `data/import/backlog.csv`, committed, because it carries the columns a person
  fills in as they work (`sourceClass`, `sourceAttempts`, `note`).
- **`rank.ts`** scores each row 0-100 from label tier, host-city population
  (GeoNames, trimmed into `data/import/reach/`), a coverage-deficit bonus read
  from `SERIES_SEED` so the ranking corrects the catalog's US/Italy skew, date
  proximity and longevity. `reachBasis` says why each row scored what it did, and
  setting `reachBasis` to `manual` makes a hand-set score survive regeneration.

**The goandrace archive is not exhausted.** CLAUDE.md long recorded 2025-2029 as
done; nobody had swept back to 2015. One sweep of 2015-2024 returned 337 events,
**67 with a course map and not already seeded**, and fourteen of #23's eighteen
shipped courses came out of it.

## Tracing a course from its published map

```
npm run import:trace -- --waypoints data/import/traces/<slug>.json
```

For the large share of races that publish their course as a JPG or a PDF and no
route file at all — Porto, Fukuoka and Montreal among them. A person places
waypoints reading the published map; the script snaps them to the road network
and fills elevation from the DEM. The output is labelled `traced:<method>`
through `RawEvent.geometrySource` -> `decisions.json`'s `source.geometry` -> the
seed-file comment, and `qa.ts` raises a review flag on every traced course, so
it reaches a human by construction. Same treatment `dem:` elevation has had
since it shipped, for the same reason.

**Two numbers worth knowing before using it** (calibrated against Berlin, whose
surveyed line and elevation we hold; full tables in `docs/COURSE-RIGHTS.md` §4):

- **The line costs less than the elevation model already does.** Modelling
  elevation along Berlin's real line drifts a 4:00 paceband by 3.2 s; re-drawing
  the line as well takes it to 5.8 s.
- **Place about one waypoint per kilometre and no more.** 23 waypoints produced
  41.57 km (the router cuts corners); 48 produced 42.43 km; **94 produced
  47.03 km**, because each waypoint snaps to its own nearest way and the router
  detours between them. `trace.ts` refuses anything outside the parser's own
  [41.5, 43.6] band rather than widening it.

## Two duplicate-detection bugs, and why the obvious fix was wrong

Both found by the 2015-2024 archive sweep on 2026-09-25.

**goandrace's pages are double-encoded UTF-8.** They declare and serve
`charset=UTF-8` while containing the bytes for `ZÃ¼rich` where `Zürich` belongs.
Since `findNameMatch` weighs a scraped locality against the seeded `citySlug`,
the duplicate check silently lost its city evidence on every accented city in
Europe. `repairMojibake()` in `shared.ts` reverses it (cp1252 as well as
Latin-1, so smart quotes are covered) and `fetch.ts` applies it to every scraped
schema.org string.

**A sponsor that is also a city was matching as a duplicate.** Zurich Insurance
sponsors marathons across Spain, and "Zurich Rock 'n' Roll Running Series
Madrid" scored a perfect 1.00 against the seeded "Zürich Marathon" because
`{zurich}` is a subset of its tokens. Madrid, Sevilla and San Sebastián were all
being dropped.

The obvious fix — "a different city vetoes a match" — was implemented, measured
against all 1,086 crawled events, and **reverted: it would have let 52 genuine
duplicates through.** Most of those are races whose city legitimately differs
from the seeded one, either a point-to-point start town (California
International starts in Folsom, is seeded under Sacramento) or a city named in
another language ("Lisboa", "Parigi", "Pafos", "Istambul"). What shipped instead
is `SPONSOR_CITY_WORDS`, which fires only when a *single* shared token carries
the whole match, that token is a known sponsor-and-city, and the localities
disagree. Add a word to it only after seeing it cause a wrong skip.

**And one bug in the other direction:** goandrace lists "Tokio Marathon", which
shares no token at all with the seeded "Tokyo Marathon" and was about to be
imported as a second, duplicate Tokyo course. Fixed with a `tokio -> tokyo`
entry in `MATCH_ALIASES`. When a source spells a city in its own language, that
is where the fix goes.
