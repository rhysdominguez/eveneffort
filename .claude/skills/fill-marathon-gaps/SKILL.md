---
name: fill-marathon-gaps
description: Work through the findmymarathon.com races eveneffort does not have yet and get each one into the system with a real course line and elevation profile, trying goandrace.com first, then the organizer's own course file, then tracing the published course map. Reads and refreshes data/import/findmymarathon-tracker.csv, the committed list of every findmymarathon race and whether we have it. Use when the user asks "which marathons are we missing", "fill the gaps", "add more races from findmymarathon", "work the tracker", "get more events into the system", or asks for the coverage list.
---

# fill-marathon-gaps — close the gap to findmymarathon's calendar

**Do the work. Do not hand the user commands to type.** Run every step and
report outcomes.

## The list

`data/import/findmymarathon-tracker.csv` is the answer to "do we have this
race?" for every marathon on https://findmymarathon.com/calendar-all.php (771
races on 2026-09-25). One row per race, sorted by date. The columns that matter:

| column | meaning |
|---|---|
| `Date` | next (or most recent) running, ISO |
| `Marathon Name`, `City`, `State/Country` | as findmymarathon lists them |
| `inSystem` | `yes` = seeded AND a complete 44-point elevation profile, coords and outline exist |
| `status` | `in-db` · `queued` · `no-course-map` · `parser-rejected` · `not-on-source` · `past-event` · `no-date` |
| `courseSlug`, `matchBasis` | which of our courses answers for it, and why (name score, km between finish lines) |
| `elevationSource` | `gpx` (surveyed), `dem:srtm30m` (terrain model), `+ traced:…` |
| `nextStep` | what to do with this row |
| `website` | the organizer's site as findmymarathon links it: **where the search starts** |
| `latestFinishers` | field size, the priority signal |
| `maxElevation`, `minElevation` | findmymarathon's published extremes: a check on any profile we build |
| `finishLat`, `finishLon` | findmymarathon's finish line: used for matching and as a sanity check on a found route |

Everything else findmymarathon publishes (profile, course type, surface, BQ %
and finishers by year, weather, PR score, description) is in there too. The
raw snapshot is `data/import/findmymarathon-calendar.csv`; the tracker is
derived from it and is the file to point people at.

Status meanings: `queued` means goandrace has a GPX, so the importer can do it
unattended. `no-course-map` and `parser-rejected` mean goandrace lists the race
but gave us nothing usable. `not-on-source` means goandrace has never listed it.
`past-event` means the last date findmymarathon shows is more than a year old,
so the race may have stopped.

## 0. Refresh

```bash
npm run import:findmymarathon      # re-scrape (≈15 min, cached; skip if run this week)
npm run import:reconcile           # rebuild the tracker from the snapshot + repo state
npm run import:backlog             # re-rank backlog.csv (it reads the tracker)
```

`import:findmymarathon` caches pages under `data/import/cache/findmymarathon/`
(gitignored); pass `--refresh` to force a re-fetch. The reconciler is offline.

Read the reconciler's summary. If it prints "one course answering for several
findmymarathon rows", or a row's `note` says "same race under another name?",
settle it in `data/import/findmymarathon-matches.json` before working anything
(see "Matching" below). A wrong `in-db` hides a race we do not have.

## 1. Pick the rows

```bash
npm run import:reconcile -- --summary --missing 25
```

Lists the largest races we lack, by `latestFinishers`, skipping rows already
worked to a dead end. Take the top N for whatever N the user asked; default to
**10** when they just say "more". Big fields first is deliberate: a 5,000-runner
race is worth fifty 40-runner ones to the people who will actually use a paceband.

Do all `queued` rows first, whatever their size: they cost one batch, not research.

## 2. Work each row down the source ladder

Stop at the first rung that yields a usable course. **Every rung must end with
elevation**: a file without `<ele>` is filled from the terrain model
automatically (`elevate.ts`, recorded `dem:srtm30m`). That is acceptable. A
course with no elevation is not.

### Rung 1: goandrace.com (cheapest, best-vetted)

- `queued`: `npm run import:reconcile -- --emit-batch fmm-YYYY-MM-DD`, then
  follow `.claude/skills/import-races/SKILL.md` from "Parse" onward.
- Anything else: goandrace's archive reaches back to 2015 and the crawls in
  `data/import/raw/` do not cover all of it. Try
  `npm run import:fetch -- --city "<City>"` (or `--url "<event page>"` if a
  search turns one up) before the open web. A race's geometry does not expire
  with its edition year.

### Rung 2: the organizer's own course file

Follow `.claude/skills/adopt-races/SKILL.md` "Per-race research". Start from
the tracker's `website`. If that is a registration platform (runsignup,
raceroster, active.com), look on it for a course page, then search for the
race's own domain. Look for:

- a linked `.gpx`, `.kml`, `.kmz`, `.geojson`, `.tcx` on a course / route /
  race-info page (`filetype:gpx "<race name>"` searches sometimes land on it faster);
- **an interactive map the organizer embedded on their own site**: Google My
  Maps (export: `https://www.google.com/maps/d/kml?mid=<id>&forcekml=1`),
  RideWithGPS, Garmin Connect, MapMyRun, Strava route. This counts as the
  organizer's own publication **only when the organizer's site embeds or links
  it as the official course**. Record the embedding page in `routeNote`. Use
  `routeSource: "organizer"` for My Maps. For a route-sharing host
  (Strava/RideWithGPS/etc.) the policy requires `--allow-route-host` with that
  reason written into `routeNote` (`docs/COURSE-RIGHTS.md` §5). A route some
  runner uploaded, found by searching the host, is **not admissible**.

Never Strava/plotaroute/RunGo search results, never AIMS (robots.txt).
findmymarathon itself has no route data; do not look there.

### Rung 3: trace the published map

When the organizer publishes the course only as an image or PDF, draw it with
`npm run import:trace` (see adopt-races step 2 and `docs/COURSE-RIGHTS.md` §4):
about **one waypoint per kilometre** read off the published map, snapped to the
road network, DEM elevation added. Label: `routeSource: "traced"`.

Checks specific to a trace, before it goes further:

- the traced finish lies within ~1 km of the tracker's `finishLat/finishLon`
  (unless the map clearly shows otherwise);
- the profile's min/max are within ~15 m of the tracker's
  `minElevation`/`maxElevation` when findmymarathon publishes them;
- distance 41.5–43.6 km (the parser enforces this regardless).

A trail or loop course on unmapped paths will not snap well. If the snapped
line departs visibly from the published map, stop and record `none-found`
rather than ship a guess.

### Nothing found

Record it (step 4) and move on. Do not force a weak source.

## 3. Land it

From here it is the existing pipeline, unchanged:
`adoptions.json` entry → `npm run import:adopt` → parse → qa → enrich
`decisions.json` → promote → `npm run build:outlines` → test/build/seed →
`rm -rf .next`. Follow adopt-races steps 1–5 exactly; they carry the hard rules
(permanent slugs, one pin per city, still-runs check, no invented organizer or
region).

Before promoting, compare each new course's `coords[0]`/last point against the
tracker's finish coordinate. A route more than a few km from findmymarathon's
finish line is either the wrong race or the wrong file.

## 4. Record every attempt, hit or miss

In `data/import/backlog.csv`, on the row for the race (`raceSlug` is the
proposed course slug), set:

- `sourceClass`: `organizer` · `gis` · `traced` · `certification` · `none-found`
- `sourceAttempts`: +1
- `lastAttemptedAt`: today
- `status`: `no-source` when nothing usable exists
- `note`: one line: what was checked ("site has JPG map only, trace deferred:
  trail course")

The reconciler reads these back into the tracker's `note`/`nextStep`, so the
next session skips a race that was already searched. A search nobody recorded
gets repeated.

## 5. Refresh and commit

```bash
npm run import:reconcile && npm run import:backlog
```

Then commit per adopt-races step 7. Include `findmymarathon-tracker.csv`,
`backlog.csv` and, if touched, `findmymarathon-matches.json` in the data commit.
Do not push.

## 6. Report

A table of rows worked: race, date, finishers, outcome (shipped as `<slug>` /
none-found / deferred), geometry source (goandrace / organizer / traced),
elevation source (gpx / dem). Then the tracker's new `in the system` count
against the previous one.

## Matching (why a row says in-db or not)

The reconciler calls a findmymarathon race ours only when all of these hold:
same country; for US/CA the same state/province; name similarity ≥ 0.85
(half/trail/relay/ultra must agree); and place agrees: findmymarathon's finish
within 25 km of our course's start or finish, or (without coordinates) the
same city. A same-name race more than 60 km away is never a match. When two
rows claim one course, the closer name keeps it.

That still misses two cases, which `data/import/findmymarathon-matches.json`
settles by hand, keyed `"<Marathon Name>|<State/Country>"`:

```json
{ "matches": {
  "Jack and Jills Downhill Marathon (Saturday)|WA": "jack-and-jills-downhill-marathon",
  "Some Other Marathon|TX": null
} }
```

A slug means "this is ours". `null` means "not the seeded race it looks like".
Add an entry only after checking. A wrong `yes` hides a missing race, and a
wrong `no` sends someone to re-import a course we already ship.
