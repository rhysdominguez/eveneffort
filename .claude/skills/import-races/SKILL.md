---
name: import-races
description: Import marathon courses from goandrace.com into the Neon database — GPX, geometry, city, series, edition and slug ledger — matching the original seven majors exactly. Covers the archive sweep (goandrace lists ~1,086 events back to 2015; the default 2026-27 window is exhausted) and confirming an archived race still runs before seeding it. Use when the user asks to "import races", "add N marathons", "get more marathons we don't have", "add the marathon for <city>", or gives goandrace.com event or course-map URLs.
---

# import-races — bulk-import marathons into the database

Runs the full pipeline: discover events on goandrace.com, download their GPX, derive geometry, propose seed rows, apply them, and seed Neon. The end state is rows indistinguishable from the seven majors — same 44-point grid, same four tables, same column set.

**Do the work. Do not hand the user commands to type.** Run every step yourself and report the outcome.

## Two modes

**Bulk** — "add 25 marathons", "import 50 races", or no argument at all:
```bash
npm run import:fetch -- --limit <n> --batch <batch>
```
Skips anything already imported — by slug, by GPX already on disk, *and* by name+city match against every already-seeded series (catches a recurring race re-discovered under next year's goandrace URL, which has a different slug and a different event URL from the one already shipped). Repeat runs bring in genuinely new events, not the same ones under a fresh year.

**Targeted** — "add the marathon for Valencia", or a goandrace.com URL:
```bash
npm run import:fetch -- --city "Valencia,Hamburg,Calgary" --batch <batch>
npm run import:fetch -- --url "<url>,<url>,<url>" --batch <batch>
```
Both flags take comma-separated lists, so one run covers many cities or URLs — discovery pages the calendar once instead of once per city. `--url` accepts course-map pages (`/en/map/...`) as well as event pages; a map URL is followed back to its event page automatically.
If `--city` matches nothing, the city may be listed under a different spelling — search the calendar or ask the user for the event URL and use `--url`.

Use `<batch>` = `import-YYYY-MM-DD` (add `-b`, `-c` for repeat runs the same day). **Never reuse a batch name** — the raw crawl file is overwritten, and courses from the earlier run silently vanish from QA.

## Batch size

**Default to 25.** Not because the tooling struggles, but because step 4 costs one website lookup per course and Neon writes geometry 5 rows at a time. 50 is the sensible ceiling. If the user asks for more than 50, do 50 and tell them to run it again.

## What is actually left in the catalogue

`--year-start` / `--year-end` default to **2026–2027, and that window is fully exhausted** — a bulk run against it now returns zero new events. So is the wider **2025–2029** window (378 events). Running either again just re-confirms what is already seeded. Any request to "get N more marathons" has to reach further back, because of one fact worth internalising:

**A course's geometry does not expire.** goandrace publishes a separate event page per year, each with its own GPX, and a 2019 page traces the same route the race runs today unless the course actually changed. That is how Hogeye and Illinois were recovered after their recent pages measured wrong, and it is why the archive is worth crawling at all.

Total catalogue by window, measured from their calendar API (`totalEvents`):

| Window | Events |
|---|---|
| 2026–2027 (the default) | 129 |
| 2025–2029 | 378 |
| 2015–2024 | 708 |
| **2015–2035 (everything)** | **1,086** |

As of 2026-08-10, **426 event pages in the 2015–2024 window had never been crawled.** By URL-slug heuristic roughly 116 are older editions of already-seeded races (the name+city matcher catches those automatically) and ~310 are possibly new — but discount that number hard before promising anything. The sample skews heavily to small Italian regional races, and `maratonina` is Italian for *half* marathon, not a small marathon. Realistic yield is more like 30–80 genuine courses.

**The highest-value subset — start here.** Nine races previously written off as "no course map anywhere" turn out to have an older event page that may carry one. This is minutes of targeted `--url` work rather than an hour of sweeping, and it includes two prestige-wishlist targets:

| Race | Newest archived page | Note |
|---|---|---|
| Taipei Freeway Marathon | 2024 | distinct from the seeded Taipei Charity Marathon |
| Split Marathon (Croatia) | 2024 | |
| Muscat Marathon (Oman) | 2022 | wishlist target; `al-mouj-muscat-marathon-2022` |
| Egyptian Marathon (Luxor) | 2022 | wishlist target |
| Ravenna Marathon (Italy) | 2022 | |
| Sanremo Marathon (Italy) | 2022 | |
| Maratona sulla Sabbia (Italy) | 2022 | 3 pages available |
| Texas Marathon / Texas Triple | 2022 | |
| Maratona dell'Isola d'Elba | 2020 | oldest — verify hardest |

All nine are old enough to need the still-runs check below. Count them as candidates, not as nine courses: some will still have no usable map, and any that measures wrong or proves defunct drops out.

To reach the archive:
```bash
npm run import:fetch -- --year-start 2015 --year-end 2024 --limit 50 --batch <batch>
```

**Pace a broad archive sweep.** 426 pages at ~3 requests each is ~1,300 requests against a small site. The pipeline already sleeps 1s between requests and sends an honest User-Agent, but run it in batches of 50 rather than one blast, and prefer targeted `--url` runs when you know what you are after.

## Confirm an archived race still runs — required before seeding one

A course discovered only in the archive may belong to a race that no longer exists. Seeding it puts a dead event in the race calendar and the pacing dropdown as though someone could enter it, which is worse than not having it. This check is **not** needed for a race whose newest goandrace listing is within about a year of today — that is evidence enough on its own.

When the newest listing for a race is older than that:

1. **WebFetch `series.websiteUrl`.** A live site advertising a future date or open registration settles it. A dead domain, a parked page, or a site whose newest news post is years old is strong evidence against.
2. **If the site is inconclusive, WebSearch** for the race name plus the coming year (`"Sanremo Marathon 2027"`). Look for a current entry on a race calendar, a registration platform, or recent results.
3. **Decide, and record why.** If it still runs, ship it and note in the commit which year's page the geometry came from. If you cannot find evidence it still runs, mark it `rejected` with that as the stated reason — the same as a rejected distance. Never seed on the assumption that silence means it survived.

**Also re-derive the recurrence.** `qa.ts` builds `recurrence` (month, weekday, nth) from the *edition date on the page it scraped*. Seeded from a 2018 page, that rule encodes 2018's calendar slot, and a race that has since moved months will now generate wrong estimated dates for every future year. Check the month against whatever current source you just used to confirm the race is alive, and correct `recurrence` in `decisions.json` if it moved. The seed output flags how many editions are estimated rather than confirmed; a wrong recurrence quietly pollutes that set.

## Steps

### 1. Fetch
As above. Note how many were queued vs skipped.

### 2. Parse geometry
```bash
npm run import:parse -- --only <comma-separated-slugs> --report data/import/reports/<batch>.qa.json
```
The fetch command prints this line for you. `parse_gpx.py` is **never modified** — its validation is the first gate. It rejects multi-segment tracks, missing elevation, gaps over 5 km, and anything outside 41.5–43.6 km. Failures here are the filter working, not a bug.

### 3. QA
```bash
npm run import:qa -- --batch <batch>
```
Writes `data/import/decisions.json`. Everything lands as `review` — that is expected, not a failure.

### 4. Enrich — the part that makes this match the majors

Edit `data/import/decisions.json` yourself. For each course:

**`courseSlug` and `series.name`** — the race's *actual* name:
- Drop sponsor prefixes: `ascension-seton-austin-marathon` → `austin-marathon`, `haspa-marathon-hamburg` → `hamburg-marathon`. Matches how `SERIES_SEED` already spells London rather than TCS London.
- Drop half-marathon suffixes on combined events, but **only after confirming `stats.totalKm` is ~42**: `asheville-marathon-and-half` → `asheville-marathon`.
- Strip leading ordinals and digits — a slug must not start with a number (`2-marsala-marathon` → `marsala-marathon`).
- Keep `series.slug` and `series.courseSlug` in sync, plus `recurrence.seriesSlug` and `edition.seriesSlug`.
- **If you rename a slug, rename its files too**: `data/gpx_sources/<slug>.gpx` and all three of `src/data/courses/<slug>{,.coords,.profile}.json`. A mismatch fails the test suite.

**`city.regionCode` / `regionName`** — never published by the source. Fill ISO 3166-2 from the locality (`US-TX` / `Texas`). Then update `city.slug`, `citySlug` and `series.citySlug` together to the `austin-tx-us` shape. US, CA and AU carry the subdivision; elsewhere null is correct and the slug is `barcelona-es`.

**`series.organizer`** — never published; only the organizer's URL is. WebFetch `series.websiteUrl` and look for a "produced by" line, footer copyright, or About section. **If you cannot find it, leave it empty** — the column is nullable and nothing reads it. Never invent one.

**`city.timezone`** — already derived. Confirm it against the city; a wrong zone shifts a start time by hours. Correct it if wrong.

**`isMajor`** — leave `false` unless it is genuinely a World Marathon Major.

Then set each `verdict` to `"ready"`, or `"rejected"` for anything that should not ship.

### 5. Promote
```bash
npm run import:promote -- --dry-run
npm run import:promote
```
Appends to `cities.ts`, `series.ts`, `editions.ts` and `slug-ledger.ts`. Refuses to run while anything is still `review`.

### 6. Verify, seed, and clear the build cache
```bash
npm run test          # must pass
npm run build         # must pass
npm run db:seed
rm -rf .next          # REQUIRED — see below
```

**`rm -rf .next` is not optional.** `npm run build` prerenders the homepage as a static page holding the course catalog. Running it before `db:seed` bakes in the pre-seed catalog, and the dev server keeps serving that stale page — the new courses appear in the race calendar but never in the pacing dropdown. Clearing `.next` is the only reliable fix; restarting the dev server and deleting `.next/cache` both fail to help.

If a dev server is running, restart it afterwards.

### 7. Confirm the data actually landed
Query Neon directly and compare the new rows against the majors — do not trust the seed's own summary:

```bash
node --env-file-if-exists=.env.local --input-type=module -e '
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`
  select c.slug course, ci.slug city, ci.timezone, ci.region_code, c.distance_m,
         jsonb_array_length(c.elevations) elev, jsonb_array_length(c.coords) crd,
         jsonb_array_length(c.profile) prof,
         (c.checksum is not null and c.gpx_source_path is not null) complete,
         s.organizer, s.is_major
  from course c join event_series s on s.id=c.series_id join city ci on ci.id=s.city_id
  order by c.slug`;
console.table(rows);'
```

Every row must show `elev` 44, `crd` 44, `distance_m` 42195 and `complete` true. Anything else is a defect — investigate before reporting success.

### 8. Commit

Commit automatically once step 7 reports zero defects — do not ask first. A batch is the natural unit of a commit, and committing between batches is what makes a bad import one `git revert` away instead of a manual untangle.

**Never commit if step 6 or 7 failed.** A red suite or a defective row gets reported and fixed, not committed.

Two commits, in this order:

1. **Tooling**, only if you changed anything under `scripts/import/`. Separate because it is green on its own and belongs to the pipeline, not the data.
2. **The courses** — `src/db/seed/`, `src/data/courses/`, `data/gpx_sources/`, `data/import/decisions.json` in **one commit**. The ledger tests are set-equality in both directions, so splitting the ledger from the seed files leaves the tree red in between.

Stage by explicit path. Never `git add -A` — `data/import/raw/` and `reports/` are gitignored, but a blanket add invites accidents.

Write the message the way this repo does: what changed and *why*, in prose. Say which slugs shipped, which were rejected and for what measured reason, any timezone or city-name correction and what caused it, and any field deliberately left null. A future reader should be able to reconstruct the judgment calls without re-running anything. End with:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

Do **not** push. Pushing is the user's call — say the branch is ahead and offer.

### 9. Report
Give the user a table: course slug, display name, city, race date, distance, organizer. Call out anything left blank or rejected, and say plainly how many of the requested count actually landed. Name the commits you made.

## Hard rules

- **Never touch the original seven.** Anything already in `PUBLISHED_COURSE_SLUGS` is skipped automatically; do not force it.
- **A course slug is permanent.** It rides in `/results?courseId=…` links and on printed pacebands (Rule 8). Get it right at step 4 — it cannot be renamed later.
- **One pin per city.** If a city slug already exists, QA emits no city row. Do not add one; `scripts/seed.ts` upserts latitude and would silently move the existing pin.
- **Never invent data.** Blank beats wrong for organizer and region.
- **42.6–43.5 km is normal.** Not GPS drift so much as a digitized or GPS-built course line running long against the officially certified shortest-possible-route distance — Berlin has measured 42.76 since it was added. The ceiling went 43.0 → 43.5 on 2026-08-09 and 43.5 → **43.6** on 2026-08-10, each time after a Douglas-Peucker simplification test (up to 20 m tolerance) confirmed the excess on courses like Cleveland, Cork City, Riyadh and Palma is real path length through corners rather than noise to smooth away.
- **`data/import/decisions.json` is committed**; raw crawls, reports and quarantine are gitignored. Quarantine is worth knowing about: `promote.ts` moves a rejected course's files there rather than deleting them, so recovering one later (after a ceiling change, say) means copying the GPX back out and re-parsing — never re-fetching.
- **Confirm a suspected duplicate by GPS start line, not by name.** When two courses might be the same race, compare `coords[0]` in their `.coords.json` files. Identical-to-6-decimals means the same start line and the same race, whatever the names say — that is how Asheville, Buffalo, Florence/Firenze and Cologne/Köln were each caught before shipping a second copy. This is the tiebreaker whenever `findNameMatch` declines to match but the names look suspicious, which it does deliberately for anything separated by a distance or format word.
- **A race published in its local language is still a duplicate.** `findNameMatch` folds a small exonym table (`firenze`→`florence`, `koln`→`cologne`, `roma`→`rome`, and others in `MATCH_ALIASES`), but it is not exhaustive and Italian-language listings in particular still slip through — `maratona` and `di` are not stop words, and `berlino`/`atene` are not aliased. Treat a scraped name in a language other than the seeded one as suspicious and check the start line. Add the alias when you find a new one.
- **A duplicate can survive a slug check.** goandrace pages a fresh event URL every year, so a recurring race already in `SERIES_SEED` reappears at a bulk `--limit` discovery under a new URL and often a differently-worded name ("Flying Pig Marathon 2026" vs. the seeded "Cincinnati Flying Pig Marathon"). `fetch.ts` now checks every scraped event's name+city against `SERIES_SEED` (`findNameMatch` in `shared.ts`) before downloading its map or GPX, and skips it with `looks like the already-seeded "…"` if it matches — this runs *after* the page is scraped, since the real name isn't known until then, so a duplicate still costs one page fetch, just not the map+GPX fetches on top. If a false negative ever gets through anyway, cross-check the batch's scraped names/cities against `SERIES_SEED` by hand before parsing, the way this was caught the first time.
- **A `rejected` verdict does not survive a republished GPX.** `decisions.json` accumulates across every batch ever run, and `qa.ts` used to freeze *any* entry whose `courseSlug` it had already seen — so a race rejected once for a bad measurement stayed rejected forever, even after an organizer published a corrected GPX under next year's event page (Hogeye Marathon 2023 measured 41.4 km and was rejected; the 2026 page measures a real 42.56 km, but a bulk run silently kept the stale 2023 rejection instead of reassessing it, because both proposed the identical `hogeye-marathon` slug). `qa.ts` now reassesses automatically when a `rejected` entry's `source.eventUrl` doesn't match the incoming event — nothing about a rejected verdict can be in-progress human review to protect, unlike `ready` or `review`, which are still frozen exactly as before. Watch the QA output for `N stale rejection(s) reassessed`; it means a slug that failed before is getting a second, independent look, not that anything was silently overwritten.

## If something fails

- *"links no course map"* — that race has no geometry published. Expected; report it as skipped.
- *Parser rejects a course* — usually a multi-segment GPX or a half-marathon track. Mark it `rejected`; promote quarantines its files.
- *A scraped event turns out to be a relay, not a solo marathon* — `findNameMatch` only catches name+city duplicates, not format. A "… Relay" event can be a genuinely distinct listing from the solo race in the same city and still not belong here: this app has no way to represent multiple runners splitting one distance. Exclude it from `--only` at the parse step and record why in `decisions.json`'s `reasons`, the same as a rejected distance.
- *Rejected for measuring between 43.0 and 43.6 km* — no longer rejected. The ceiling moved twice for exactly this pattern: to 43.5 on 2026-08-09 (recovering Tulsa 43.06, Kansas City 43.04, Cork City 43.02, Buffalo 43.00 and others) and to 43.6 on 2026-08-10 (recovering Riyadh 43.519 and Palma 43.521), every one a real marathon whose course line runs long through corners. (Cleveland, Long Beach and Pittsburgh show up in older notes about this same pattern — they are not part of either recovery, because a later import already seeded all three under a different, shorter-measuring GPX. Check the ledger before assuming a familiar name is still missing.) If a course now fails, it is genuinely past 43.6 — **report it separately from a course that merely used to fail**: the next rejection is Gornergrat Zermatt at 45.690, and past that the failures stop being long marathons at all (Thelma & Louise 48.713, Marine Corps 50.535, Endurancelife Sussex 52.334, Strasimeno 58.010 — trail ultras and wrong events). **Anything landing between 43.6 and 45.6 is genuinely novel**: that window is empty by design, so investigate the individual course rather than reaching for the constant. Widening again needs what both previous widenings had — a real loss cluster, a DP test showing the excess is path length not noise, and the user's explicit decision, editing `parse_gpx.py` and `courses.profile.integrity.test.ts` together or CI breaks with no bad data involved.
- *Test suite red after promote* — most likely a renamed slug whose files were not renamed, or a course parsed but missing from `SERIES_SEED`.
- *New courses missing from the pacing dropdown* — `.next` was not cleared. Go back to step 6.

## What goandrace genuinely cannot give you

Worth knowing before promising a count, so the answer to "can we get more?" is grounded. Every rejection ever recorded was audited on 2026-08-10 — 145 of them, against 295 seeded courses:

| Why rejected | Count | Recoverable? |
|---|---|---|
| Duplicate of a race already seeded | 82 | No — already have it |
| No course map published at source | 52 | Only via an older page — 9 genuinely-new races have one (table above) |
| Genuine wrong distance (trail ultras, wrong routes) | 7 | No — not marathons |
| Missed the ceiling by ~20 m | 2 | Recovered 2026-08-10 |
| Relay format, dead 404 link | 2 | No |

Two structural limits no amount of crawling fixes:

- **Some races have no route data anywhere on goandrace.** 41 in the forward window publish no course map; 9 of those have an older page worth trying (Muscat and Luxor among them — see the table above), which leaves ~32 with nothing to reach for at any year. Medellín and New Delhi are in that remainder: goandrace lists the race and has never published a route for it.
- **goandrace's coverage is strong in the US and Italy and thin elsewhere.** Repeated wishlist rounds against Asia, Africa, the Middle East and South America landed in the single digits each time. If a request needs meaningfully more of those regions, say plainly that a second geometry source is the lever, rather than running another sweep that will not deliver.

## Background

`scripts/import/README.md` explains the pipeline's design, and CLAUDE.md's "Adding marathons in bulk" section carries the rules. Read either if a step here is ambiguous.
