---
name: import-races
description: Import marathon courses from goandrace.com into the Neon database — GPX, geometry, city, series, edition and slug ledger — matching the original seven majors exactly. Use when the user asks to "import races", "add N marathons", "add the marathon for <city>", or gives a goandrace.com event URL.
---

# import-races — bulk-import marathons into the database

Runs the full pipeline: discover events on goandrace.com, download their GPX, derive geometry, propose seed rows, apply them, and seed Neon. The end state is rows indistinguishable from the seven majors — same 44-point grid, same four tables, same column set.

**Do the work. Do not hand the user commands to type.** Run every step yourself and report the outcome.

## Two modes

**Bulk** — "add 25 marathons", "import 50 races", or no argument at all:
```bash
npm run import:fetch -- --limit <n> --batch <batch>
```
Skips anything already imported, so repeat runs always bring in genuinely new events.

**Targeted** — "add the marathon for Valencia", or a goandrace.com URL:
```bash
npm run import:fetch -- --city "Valencia" --batch <batch>
npm run import:fetch -- --url "https://www.goandrace.com/en/running-events/..." --batch <batch>
```
If `--city` matches nothing, the city may be listed under a different spelling — search the calendar or ask the user for the event URL and use `--url`.

Use `<batch>` = `import-YYYY-MM-DD` (add `-b`, `-c` for repeat runs the same day). **Never reuse a batch name** — the raw crawl file is overwritten, and courses from the earlier run silently vanish from QA.

## Batch size

**Default to 25.** Not because the tooling struggles, but because step 4 costs one website lookup per course and Neon writes geometry 5 rows at a time. 50 is the sensible ceiling. If the user asks for more than 50, do 50 and tell them to run it again.

The 2026–27 pool is ~128 marathons. Not all have course maps; expect real losses at step 2.

## Steps

### 1. Fetch
As above. Note how many were queued vs skipped.

### 2. Parse geometry
```bash
npm run import:parse -- --only <comma-separated-slugs> --report data/import/reports/<batch>.qa.json
```
The fetch command prints this line for you. `parse_gpx.py` is **never modified** — its validation is the first gate. It rejects multi-segment tracks, missing elevation, gaps over 5 km, and anything outside 41.5–43.0 km. Failures here are the filter working, not a bug.

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

### 8. Report
Give the user a table: course slug, display name, city, race date, distance, organizer. Call out anything left blank or rejected, and say plainly how many of the requested count actually landed.

Do **not** commit unless asked. If asked, the ledger and seed edits must go in **one commit** — the ledger tests are set-equality in both directions, so the tree is red in between.

## Hard rules

- **Never touch the original seven.** Anything already in `PUBLISHED_COURSE_SLUGS` is skipped automatically; do not force it.
- **A course slug is permanent.** It rides in `/results?courseId=…` links and on printed pacebands (Rule 8). Get it right at step 4 — it cannot be renamed later.
- **One pin per city.** If a city slug already exists, QA emits no city row. Do not add one; `scripts/seed.ts` upserts latitude and would silently move the existing pin.
- **Never invent data.** Blank beats wrong for organizer and region.
- **42.6–42.8 km is normal.** Raw GPS drift, not a wrong route — Berlin has measured 42.76 since it was added.
- **`data/import/decisions.json` is committed**; raw crawls, reports and quarantine are gitignored.

## If something fails

- *"links no course map"* — that race has no geometry published. Expected; report it as skipped.
- *Parser rejects a course* — usually a multi-segment GPX or a half-marathon track. Mark it `rejected`; promote quarantines its files.
- *Test suite red after promote* — most likely a renamed slug whose files were not renamed, or a course parsed but missing from `SERIES_SEED`.
- *New courses missing from the pacing dropdown* — `.next` was not cleared. Go back to step 6.

## Background

`scripts/import/README.md` explains the pipeline's design, and CLAUDE.md's "Adding marathons in bulk" section carries the rules. Read either if a step here is ambiguous.
