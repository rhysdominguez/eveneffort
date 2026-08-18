---
name: adopt-races
description: Add marathon courses that goandrace.com does not list, by finding a course file on the organizer's own site and running it through scripts/import/adopt.ts. Sources candidate races from data/import/findmymarathon-tracker.csv (546 rows marked not-on-source as of 2026-08-17) — findmymarathon.com is a discovery roster only, never a geometry source: its elevation charts are rendered JPEGs with no coordinates. Use when the user asks to "adopt races", "add marathons not on goandrace", "find marathons from findmymarathon", "add races we're missing", or names a specific race already known to be absent from goandrace's calendar.
---

# adopt-races — add marathons goandrace.com does not have

Runs the second front door onto the same pipeline `import-races` uses: instead
of discovering events on goandrace's calendar, a human (or WebSearch/WebFetch,
standing in for one) finds a course file on the race's own site, and
`scripts/import/adopt.ts` carries it through parse → qa → promote unchanged.
End state is identical rows to a goandrace import — same 44-point grid, same
four tables — with `source.site` and `source.elevation` in `decisions.json`
recording where this one actually came from.

**Do the work. Do not hand the user commands to type.** Run every step
yourself and report the outcome.

## Why this exists, and what it is not

goandrace's coverage is strong in the US and Italy and thin everywhere else.
findmymarathon.com's own tracker — `data/import/findmymarathon-tracker.csv`,
kept current by `npm run import:reconcile` — has **546 rows with no goandrace
listing in any crawl**, overwhelmingly US regional. No amount of re-sweeping
goandrace reaches them, because they were never there.

**findmymarathon.com itself is not a geometry source.** Its elevation charts
are rendered JPEGs (`elevation/<Name>_e.jpg`) with no coordinate data behind
them, and `/gpx/` is a soft-404 catch-all — a real filename and an invented
one both return the identical homepage. Confirmed by sampling 30 of its
`not-on-source` races: 17 had an elevation image, zero exposed a GPX. **Use it
only as the worklist** — the CSV tells you which races exist and where, not
where their route lives. The route almost always lives on the race's own
website instead.

## Selecting candidates

```bash
npm run import:reconcile -- --adoptable
```

Lists every `not-on-source` row grouped by state/country, soonest-agnostic.
Pick a batch by whatever the user asked for — a region, a count, a specific
race. If the user just says "find some more marathons," default to **5**:
each race here costs a real web search and a still-runs check, not a shared
calendar crawl, so this does not scale the way a goandrace `--limit 50` does.
Prefer races with a date in the next 12 months — recent evidence they still
run, and no still-runs check needed (see below).

## Per-race research

For each candidate, in order:

1. **Find the course file, organizer site first.** WebFetch the race's own
   site (search `"<race name>" marathon course map` if the CSV has no URL).
   Look for a course-info / route page; organizers commonly link a `.gpx`
   directly (Bend Marathon's `course-info.html` is the pattern — a plain
   `href="…course.gpx"`). A `filetype:gpx` WebSearch sometimes lands on it
   faster than browsing the site.
2. **If the organizer publishes nothing, try a route host** (RunGo,
   plotaroute, Strava routes) as a fallback, not a first choice — see Rights,
   below, before using anything found there.
3. **Confirm the race still runs**, same bar as an archived goandrace listing:
   a live site advertising a future date or open registration settles it.
   Skip this only when the race's own listed date is within about a year.
4. **Get the exact next race date** off the organizer's site — this is what
   `startDate` and the derived `recurrence` are built from.
5. If nothing turns up after a genuine search, leave the row alone in the
   tracker and move to the next candidate. Not every race clears this bar;
   say so in the report rather than forcing a weak source.

## Steps

### 1. Add to the worklist

Edit `data/import/adoptions.json` — committed, and the sign-off record for
each permanent slug (Rule 8) and where its geometry came from. One entry per
race:

```jsonc
{
  "courseSlug": "bend-marathon",        // permanent — same naming rules as any slug
  "name": "Bend Marathon",
  "routeUrl": "https://…/course.gpx",   // direct file; organizer's own site preferred
  "routeSource": "organizer",           // organizer | route-host | manual
  "routeNote": "Linked from the race's own course-info.html, retrieved <date>. Still runs — <evidence>.",
  "startDate": "2027-04-11",
  "locality": "Bend", "region": "OR", "countryCode": "US",
  "websiteUrl": "https://…", "organizer": null
}
```

Append — do not remove entries that have already been promoted. `adopt.ts`
skips anything already in `PUBLISHED_COURSE_SLUGS` automatically, and the
file is the durable record of every race ever proposed, same as
`decisions.json`.

### 2. Adopt

```bash
npm run import:adopt -- --batch adopt-YYYY-MM-DD --dry-run
npm run import:adopt -- --batch adopt-YYYY-MM-DD
```

Never reuse a batch name — same rule as `import:fetch`. This normalizes
whatever format the file is (`<rte>` exports, KML/KMZ, GeoJSON all become a
single track — see `scripts/import/route.ts`), applies the same
name+city duplicate guard `fetch.ts` uses against `SERIES_SEED`, and fills
elevation from a terrain model when the file has none. Prints the exact
`import:parse` command for what it wrote.

### 3. Parse, QA — identical to import-races

```bash
npm run import:parse -- --only <slugs> --report data/import/reports/<batch>.qa.json
npm run import:qa    -- --batch <batch>
```

`parse_gpx.py` is unchanged and unmodifiable here too. Everything lands as
`review`, same as a goandrace batch — not a failure.

### 4. Enrich `decisions.json`

Same fields as `import-races` step 4 — `courseSlug`/`series.name`,
`regionCode`/`regionName`, `organizer`, `timezone`, `isMajor` — with two
adoption-specific flags to resolve on top:

- **`elevation is modelled (dem:srtm30m), not surveyed`** — appears whenever
  the source file had no `<ele>`. Calibrated 2026-08-17 across six courses
  (dead-flat to 2350 m of gain) against a 4:00 paceband: **≤6 s** of split
  drift on ordinary terrain, but **17.4 s** on a bridge-heavy course, because
  a terrain model reads the water under a bridge, not the deck. `elevate.ts`
  already flags any single-point jump ≥25 m as the bridge signature — take
  that flag seriously on an urban course with river or highway crossings, and
  eyeball the profile in `<slug>.json` against any published min/max before
  clearing it. Re-run `npm run import:calibrate-dem` if the DEM provider ever
  changes.
- **A merged multi-track warning** — only appears when an entry was given
  `"allowMerge": true` in `adoptions.json`. Confirm the pieces really are one
  continuous course before that flag was set; `route.ts` refuses the merge by
  default because joining unrelated tracks produces a course that looks
  entirely plausible in the output table and is not the real route.

Then set each `verdict` to `"ready"` or `"rejected"`, exactly as
`import-races` does.

### 5. Promote, verify, seed — identical to import-races

```bash
npm run import:promote -- --dry-run
npm run import:promote
npm run test && npm run build && npm run db:seed
rm -rf .next   # REQUIRED — see import-races SKILL.md for why
```

Verify with the same Neon query `import-races` uses (`elev` 44, `crd` 44,
`distance_m` 42195, `complete` true for every new slug).

### 6. Refresh the worklist

```bash
npm run import:reconcile
```

Flips the newly-promoted races from `not-on-source` to `in-db` in
`findmymarathon-tracker.csv`, so the next run of this skill doesn't
re-propose them.

### 7. Commit

Same two-commit shape as `import-races`: tooling separately if
`scripts/import/` changed, then one commit for
`data/import/adoptions.json`, `decisions.json`,
`findmymarathon-tracker.csv`, `data/gpx_sources/`, `src/data/courses/` and
`src/db/seed/` together — the ledger tests are set-equality in both
directions, so splitting that commit leaves the tree red in between. Stage by
explicit path, never `git add -A`. Message states which slugs shipped, where
each course file came from (`routeSource`), which had modelled elevation and
why that was judged acceptable, and any rejected candidate with its reason.
End with:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

Do not push — that is the user's call.

### 8. Report

A table: course slug, display name, city, race date, route source
(organizer/route-host/manual), elevation source (gpx/dem). Call out anything
rejected and why, and anything you searched for but could not clear the
still-runs or source-quality bar.

## Rights

Prefer `routeSource: "organizer"` — the race's own site is the party that
actually owns the route, and it is the cleanest available story (still not a
guarantee of reuse — pacebands are a paid product, same open question
`import-races` records for goandrace). A `route-host` entry is user-uploaded
geometry and wants a second look before it ships. Where a site signals no to
automated access — plotaroute sits behind Cloudflare with explicit
content-signal reservations; RunGo's export needs a logged-in account — the
answer is a person downloading the file under their own account and a
`routeSource: "manual"` entry pointing at a repo-relative path, not a
workaround inside this pipeline.

## Hard rules

Everything `import-races`' "Hard rules" section states applies here
unchanged — slug permanence, one pin per city, never invent organizer/region,
the 41.5–43.6 km band, GPS start-line duplicate checks. Two additions
specific to this path:

- **A course whose elevation is modelled is still a real course**, not a
  lesser one — the calibration numbers above are the evidence. But it is a
  materially different kind of number from a surveyed GPX, which is why it is
  recorded (`source.elevation`) rather than silently blended in.
- **`adopt.ts`'s duplicate guard runs on name+city against `SERIES_SEED`**,
  the same as `fetch.ts` — but a race findable through two different
  discovery paths (say, findmymarathon and an old goandrace archive page) can
  still slip through under different name spellings. If a proposed race looks
  familiar, check `coords[0]` in its `.coords.json` against anything
  similarly named before promoting.

## If something fails

- *No course file found anywhere* — do not force a route-host page with
  unclear rights or a low-confidence hand trace. Leave the row in the tracker
  and report it as "no usable source found," the same honesty
  `import-races` uses for "links no course map."
- *Parser rejects the file* — same causes as any import: multi-segment track,
  a half-marathon distance, points outside 41.5–43.6 km. `route.ts` will have
  already caught a raw multi-track file before it reaches the parser, so a
  rejection here is usually a genuine distance problem.
- *New courses missing from the pacing dropdown* — `.next` was not cleared.
  Go back to step 5.
- *Test suite red after promote* — same causes as `import-races`: a renamed
  slug whose files were not renamed, or a course parsed but missing from
  `SERIES_SEED`.

## Background

`scripts/import/README.md`'s "Adopting a course goandrace does not have"
section explains the pipeline internals — `route.ts`'s format handling,
`elevate.ts`'s DEM policy, the calibration methodology in full. Read it if a
step here is ambiguous. `.claude/skills/import-races/SKILL.md` documents the
goandrace-sourced sibling of this workflow; the two share every step from
"Parse, QA" onward.
