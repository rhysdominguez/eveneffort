@AGENTS.md

# CLAUDE.md — Working Agreement for AI-Assisted Sessions

This file is read by Claude Code, Cursor, and other AI coding agents when working in this repo. It sets the rules.

## Project

**eveneffort** — a client-side React/Next.js web app that produces elevation-adjusted marathon pacing charts using the Minetti (2002) energy cost model.

## Architecture (Phase 1 MVP)

- **Framework:** Next.js 16 (App Router) + TypeScript + Tailwind CSS v4.
- **Pacing math is client-side.** The Minetti computation runs in the browser; the server only supplies data.
- **Database:** Neon Postgres + Drizzle, holding cities, event series, editions and course geometry. Server-side reads only (`src/db/queries.ts`) — the client never talks to it. `src/data/courses/*.json` remains the version-controlled source of truth that the seed script loads.
- **Deployment target:** Vercel (free tier).
- **Package manager:** npm.

## Repository layout

```
src/
  app/              Next.js App Router pages + global CSS
  components/       React UI components
  data/             GPX-derived JSON: elevations, coords, profile, outline (+ a test-only fixture)
  db/
    schema.ts       Drizzle tables: city, event_series, event_edition, course
    client.ts       Neon HTTP client (lazy — importing it never throws)
    queries.ts      Server-only reads: catalog (light) vs geometry (heavy)
    seed/           City / series / edition definitions you edit by hand
      slug-ledger.ts  Append-only list of published course slugs (Rule 8)
  hooks/            Custom React hooks
  lib/
    pacing/         Minetti algorithm (PURE — do not modify without explicit approval)
    units/          Time, distance, pace formatting helpers
  types/            Shared TypeScript types
scripts/
  gpx_parser/       Python build pipeline for adding new marathon courses
  import/           Bulk course importer (goandrace.com / adopted files -> seed files)
  seed.ts           Upserts the seed definitions + course JSON into Postgres
drizzle/            Generated SQL migrations (committed)
data/
  gpx_sources/      Raw GPX files (one per marathon)
  import/
    decisions.json  COMMITTED — the human sign-off record for imported slugs
    raw/ reports/ quarantine/   disposable, gitignored
```

## Data model

Three levels plus geometry. The split is deliberate:

- **`city`** owns the place name and the country/region ISO codes the calendar filters on. Its coordinate is seeded from a host race's actual GPX start line for precision, not a guessed centroid, and a second race added to an already-seeded city does not repoint it. That makes it a *city locator*, not a race location: in a city with two races it is the first-seeded race's start line and can sit 16 km from the second's. **The map pins each race at its own `course.startLat/startLon`**, never here — see the header of `src/components/home/courseMapData.ts` for the bug that rule was written from.
- **`event_series`** is the marathon as a recurring brand — "Boston Marathon", one row forever.
- **`event_edition`** is one running of it, `unique (series_id, race_date)`. Boston 2026 and Boston 2027 are two editions of one series. Deliberately not unique per year: a series can run twice in one year (London 2027 splits elite/mass across April 24 and 25) — two rows, same series and year, different dates.
- **`course`** is GPX-derived geometry hanging off the **series**, not the edition — one geometry row serves every year until the route actually changes, at which point you add a row with `effective_from_year` and repoint later editions.

Race dates are stored as `date` + `time`, never `timestamptz`: a start is a wall-clock fact, and `zonedWallClockToUTC` resolves it against the city's IANA zone at read time.

## Rules

1. **The pacing algorithm is locked.** Any change to `src/lib/pacing/` requires explicit sign-off and must include updated unit tests. The math is verified against the Minetti (2002) polynomial; do not "improve" it.
2. **All visual styling pulls from `globals.css` tokens.** No hardcoded hex values, no Tailwind `zinc-*`/`gray-*`/`red-*`/`lime-*`/`yellow-*` named utilities, and no hardcoded `bg-white`/`text-black` in components. There are two themes, light (the default) and dark (opt-in via the nav toggle), and both live **entirely at the token layer**: every colour token has a light value in `@theme` and a dark value under `:root[data-theme="dark"]`. Never add a `dark:` variant, per-component theme logic, or a `prefers-color-scheme` rule: the site is white until a reader presses the toggle and never follows the system. Red has two tokens because it has two roles: `--color-red-primary` for text and data marks (lightens in dark) and `--color-red-fill` for a fill under white text (identical in both themes). **Green now splits the same way, and only the same way:** `--color-green-primary` for text and data marks, `--color-green-fill` for a quiet tint under `--color-text-primary` (the calendar's forecast-available chip, and nothing else). The green fill is NOT red's pattern rotated: it carries dark text, not white, and it differs per theme. A marked chip is tinted only, keeping the neutral `--color-border` and neutral text; a green border reads as selection and a green name reads as a link state. `globals.tokens.test.ts` fences it from both sides, with a ΔE floor so it cannot vanish and a saturation cap so it cannot creep louder. A new token needs a dark value or `globals.tokens.test.ts` fails; `src/theme.guard.test.ts` fails on a `dark:` utility. **The palette is red, white, black and grayscale, plus three closed exceptions:** the reserved semantic green (in its two roles above), the six-stop course-profile ramp on `DifficultyBadge` (one color per profile, green → maroon), and `--color-blue-primary`, which colours the falling strokes of the weather timeline's precipitation glyph and nothing else. That ramp is not a licence for a second one, and it is not to be re-collapsed into "green and red" — two profiles sharing a color is the bug it was built to fix, and `src/app/globals.tokens.test.ts` fails if the stops stop being distinct or stop clearing WCAG AA. See `DESIGN.md` for the system and the argument.
3. **Tests are non-negotiable.** Every change must leave `npm run test` and `npm run build` passing. Pacing-module changes require new unit tests proving correctness.
4. **Course data integrity.** Every file in `src/data/courses/*.json` must be exactly 44 finite numbers. `courses.integrity.test.ts` enforces this against the repo files, offline — a corrupt elevation array must fail in CI before it can ever reach a database.
5. **No new dependencies without justification.** Adding a library requires a clear reason in the PR. Current stack: Next.js, React, Tailwind, Vitest, Stripe, Drizzle + Neon.
6. **No authentication.** There is no login, no session, and no user-*owned* data. Leave Neon Auth and any similar auth add-on **disabled** when configuring Vercel/Neon integrations. This isn't "Phase 3, later" — it's not a planned feature at all right now; revisit only if a real need for accounts shows up. **One bounded exception:** `user_course` holds courses runners upload (ROADMAP #10). Those rows are still not owned by anyone — there is no identity attached and nothing to log in to; they are reachable by whoever holds an unguessable `u-…` link, the way an unlisted document is. They are size-capped, rate-limited, geometry-only, and expire after 90 days unless a paceband order makes one permanent. Every *seeded* row (cities, series, editions, courses) remains public read-only. Read `docs/UPLOADED-COURSES.md` before extending this — the argument for why it does not reopen accounts is there, and a second exception needs the same standard of proof.
7. **GPX parser is the only Python.** All app code is TypeScript. Python lives in `scripts/gpx_parser/` and is a build-time tool, not runtime. The 44-point resampler now *also* exists in TypeScript (`src/lib/course/resample.ts`), because the upload route needs it at runtime and cannot shell out to Python on Vercel. The two are bound by `src/lib/course/conformance.test.ts`, which re-derives real committed courses from their source GPX and asserts byte-identical output. **Change one and you change both, or that test fails — which is the point.** Note Python's `round()` is half-to-even where JS `toFixed` is half-away-from-zero; `roundHalfEven()` exists for that and is not optional.
8. **Never rename a `courseSlug`.** They are the pre-database course ids and they appear in shared `/results?courseId=…` links, including on pacebands people have paid for. Renaming one silently breaks their link. `src/db/seed/slug-ledger.ts` is the append-only record of every published slug; `courses.test.ts` fails the build if a seeded course is missing from it, or if a ledger entry stops being seeded. A retired slug stays in the ledger and is never reused. The `u-` prefix is **reserved** for uploaded courses and must never be used by a seeded slug — `getCourseBySlug` routes it to a different table, so a seeded `u-…` slug would be shadowed and stop resolving. `courses.test.ts` enforces this.
9. **The build and test suite must pass with no database reachable.** `src/db/client.ts` is lazy and the catalog degrades to empty, so CI never needs a connection string. Keep it that way — DB-touching tests belong behind their own script, not in `npm run test`.
10. **`ROADMAP.md` is updated in the same commit as the work it describes.** It is the tracker for the feature programme, ordered by technical ease. When you finish a roadmap project, flip its status board row and its section heading to `Done`, dated, tick **both** of its checkboxes (`[ ]` → `[x]`, one on the board row and one on the heading), and add a one-line note on anything that turned out differently from the plan. When you discover a new gap or a project turns out to be blocked, record it there — including in the "Explicitly deferred" section, so it isn't rediscovered from scratch. A roadmap that lags the code is worse than none. `ROADMAP.md` holds every project, 1 onward, in one file, so a number cited in a code comment resolves in one place. Numbers are permanent and are never reused: a retired or reverted project keeps its number and its write-up rather than being deleted.
11. **No em dashes in anything the site renders.** They read as AI-assisted writing, and this is a product runners are asked to trust and pay for. This covers every string a visitor can reach: JSX text, `metadata` titles and descriptions, `SITE_DESCRIPTION`, product copy in `src/lib/orders.ts`, `aria-label`s and `sr-only` text, and the error strings the upload route returns verbatim (`RouteError`, `CourseParseError`). Rewrite the sentence so it says the same thing — split it in two, or use a comma, colon, semicolon or brackets — rather than swapping in an en dash or a hyphen, which is the same tic wearing a disguise. `src/copy.emdash.test.ts` enforces this: it strips comments, then fails on any em dash left in code. The one sanctioned exception is a **lone em dash standing in for a missing value** (an empty table cell, an input placeholder); it is a typographic mark, not prose, and its files are listed in `PLACEHOLDER_GLYPH_ALLOWED` in that test. Code comments are exempt and deliberately so, as are `src/db/seed/` `note` fields (operator annotations that are not in the schema and never rendered) and these repo docs.

## Adding a new marathon

1. Add a properly named `.gpx` file to `data/gpx_sources/<courseSlug>.gpx`.
2. Run `python3 scripts/gpx_parser/parse_gpx.py` from repo root; verify the generated JSON has 44 finite numbers.
3. Run `npm run build:outlines` to write `<courseSlug>.outline.json`, the fourth geometry file (the course silhouette, ROADMAP #21). It is TypeScript rather than Python on purpose: the upload route needs the same function at runtime, so `src/lib/course/outline.ts` is the single implementation and `parse_gpx.py` never learned about outlines. `courses.outline.integrity.test.ts` fails until every seeded course has one.
4. Add the host city to `CITY_SEED` in `src/db/seed/cities.ts` if it isn't there yet — coordinates should be `coords[0]` from the course's own `.coords.json` (the GPX start line), not a guessed centroid. If the city is already seeded (a second race in an existing city), leave its coordinates as-is.
5. Add the series to `SERIES_SEED` in `src/db/seed/series.ts`, pointing at that `citySlug` and the `courseSlug` from step 1.
6. Add a recurrence rule to `RECURRENCE` in `src/db/seed/editions.ts`, and a confirmed date to `CONFIRMED_EDITIONS` once you have one (multiple entries for the same series+year are fine — see the `variant` field for two-day events).
7. Add the `courseSlug` to `PUBLISHED_COURSE_SLUGS` in `src/db/seed/slug-ledger.ts`. This is your signature on a permanent public identifier — read the file header first. The test suite fails until you do.
8. Run `npm run test`, then `npm run db:seed`.
9. Commit the source GPX, the generated JSON (including the outline), and the seed edits.

No `CourseId` union to update and no registry to edit — courses are rows, and the seed files are the only hand-maintained list. There is nothing to add to `src/data/courses.fixture.ts` either: it reads `src/data/courses/` off disk, so the integrity tests pick up a new course automatically.

## Adding marathons in bulk

**Which races are we missing?** `data/import/findmymarathon-tracker.csv` answers that for every marathon on findmymarathon.com's full calendar (771 on 2026-09-25): date, name, place, `inSystem` (yes only with a complete 44-point elevation profile), the matching `courseSlug`, the organizer's website, field size and a `nextStep`. Refresh it with `npm run import:findmymarathon && npm run import:reconcile`. **The `/fill-marathon-gaps` skill works that gap**, largest field first, down the ladder goandrace → the organizer's own course file → tracing the published map, with DEM elevation when a file has none.

`scripts/import/` automates the nine steps above for many courses at once, sourcing from goandrace.com — where all but one of this repo's GPX files came from. **Prefer the `/import-races` skill**, which drives the whole pipeline including the enrichment and verification steps; `scripts/import/README.md` explains the design.

Discovery pages `/it/api_calendario.php`, the JSON endpoint behind the calendar's "load more" button — the calendar page itself only renders its first 28 results, so scraping the HTML silently caps a batch. The `--year-start`/`--year-end` default of 2026-27 (129 marathons) **is exhausted**, as is 2025-2029 (378); the full catalogue runs to ~1,086 events back to 2015, and a course's geometry does not expire, so reaching further back is how you find anything new. An archived race must be confirmed to still run before it is seeded — see the skill. Targeted modes: `--city "<name>"` and `--url "<event-page>"`.

```
npm run import:roster                        # world discovery: Wikipedia's 6 continent lists
npm run import:backlog                       # merge the 3 worklists, rank by reach
npm run import:backlog -- --top 20           # the next twenty races worth working
npm run import:fetch   -- --limit 25          # or --city "<name>" / --url "<event>"
npm run import:parse   -- --only <slugs> --report data/import/reports/<batch>.qa.json
npm run import:qa      -- --batch <batch>
#   review data/import/decisions.json — see below
npm run import:promote -- --dry-run
npm run import:promote
npm run build:outlines   # REQUIRED — the new courses have no silhouette until this runs
npm run test && npm run build && npm run db:seed
rm -rf .next   # REQUIRED after seeding — see below
```

**When goandrace does not list the race at all**, use `npm run import:adopt` instead of `import:fetch`; steps 2-4 are identical. It reads `data/import/adoptions.json` (committed — it is the sign-off record for the slug and for where the geometry came from) and ingests a course file a human found, preferring the race organizer's own site. `scripts/import/route.ts` normalizes `<rte>` exports, KML/KMZ and GeoJSON into the single-track GPX the parser demands, and `scripts/import/elevate.ts` fills elevation from a terrain model when the file carries none — recorded as `dem:<dataset>`, never confused with surveyed elevation, and flagged for review. This matters because 558 of the 766 rows in the findmymarathon tracker have no goandrace listing in any crawl.

**findmymarathon.com is not a geometry source** — its elevation charts are rendered JPEGs and it publishes no route data. Don't re-investigate it; `scripts/import/README.md` records the evidence.

**When nobody published a route file at all**, and the race publishes its course as a JPG or a PDF (Porto, Fukuoka and Montreal all do), `npm run import:trace` draws it: a person places waypoints from the published map, the script snaps them to the road network and the result is labelled `traced:<method>` through `decisions.json` and the seed-file comment, exactly as `dem:` elevation is. **Roughly one waypoint per kilometre; packing them tighter makes the result far worse, not better.** Calibration tables in `docs/COURSE-RIGHTS.md` §4.

`import:parse` is `scripts/gpx_parser/parse_gpx.py` unchanged — the importer feeds it, never modifies it.

**The review step is not optional.** `import:qa` marks every course `review` and `import:promote` refuses to run until a human has cleared them (`--force` overrides; use it only if you have read each one). What needs a person:

- **`courseSlug`** — permanent the moment it ships (Rule 8). Convention: the race's actual name, sponsor prefix dropped, no half-marathon suffix — `austin-marathon`, not `ascension-seton-austin-marathon`. Matches how `SERIES_SEED` already spells London rather than TCS London.
- **`regionCode` / `regionName`** — never published by the source. US/CA/AU city slugs carry the subdivision (`chicago-il-us`), so the city slug usually needs fixing too. Null is fine elsewhere.
- **`organizer`** — never published; only the organizer's URL is. Nullable, and read nowhere in the app today. Leave it null rather than guessing.
- **`timezone`** — derived from the country, or from a longitude band in multi-zone countries (US, CA, AU, BR, MX, ID, CL). A banded guess always asks to be confirmed; a wrong zone shifts a start time by hours.
- **`isMajor`** — always proposed `false`.

`data/import/decisions.json` is committed because it *is* the record of which permanent identifiers a person approved. Raw crawls, parser reports and quarantine are disposable and gitignored.

Things that will bite you:

- **Event-page coordinates are unreliable** — one listing puts a Wisconsin race at coordinates in New York State. Pins come from GPX `coords[0]`, never from the page.
- **One pin per city.** `scripts/seed.ts` upserts `latitude` from the excluded row, so emitting a city entry for an already-seeded slug would silently move an existing pin. `qa.ts` emits no city row when the slug exists; keep it that way.
- **The ledger and the seed files must land in one commit** — the ledger tests are set-equality in both directions, so the tree is red in between.
- **A measured length of 42.6–43.5 km is normal**, not a wrong route. Berlin has measured 42.76 since it was added; a digitized or GPS-built course line runs long against the officially certified shortest-possible-route distance, sometimes by several hundred meters on a course with many turns. The parser rejects anything outside [41.5, 43.6] and warns outside [42.0, 42.4]. (Widened 43.0 → 43.5 on 2026-08-09 and 43.5 → 43.6 on 2026-08-10 — see the comment above the check in `parse_gpx.py` for the loss clusters that justified each, and note that `courses.profile.integrity.test.ts` carries the same number and must move with it.)
- **`npm run build` before `npm run db:seed` bakes a stale catalog into `.next`.** The homepage prerenders statically, so the new courses show up in the race calendar but never in the pacing dropdown, and neither restarting the dev server nor clearing `.next/cache` fixes it. `rm -rf .next` does.
- **Rights: see `docs/COURSE-RIGHTS.md`** (settled 2026-09-25, ROADMAP #23). New courses come from the organizer's own site or from geometry we derive and label ourselves; **route hosts (Strava routes, plotaroute, RunGo) are not admissible** and `adopt.ts` refuses `routeSource: "route-host"` without `--allow-route-host`. That doc also records, per source, what was actually checked: **AIMS must not be crawled** (its `robots.txt` disallows `/events` and `/members`), and **course-certification packets are raster PDFs with no coordinates** — authoritative for validating a course's net drop, useless as geometry.
- **goandrace's own pages are double-encoded UTF-8** — they serve `charset=UTF-8` containing the bytes for `ZÃ¼rich`. `repairMojibake()` in `shared.ts` fixes it on ingest. Without it the duplicate check loses its city evidence on every accented European city.
- **The 44-point grid retains a median 55% of a course's real climbing**, and re-sourcing does not fix it (ROADMAP #23, amending #12). Do not chase a course's understated gain by hunting for a better GPX; the loss is the resample.

## Database workflow

```
npm run db:generate   # after editing src/db/schema.ts — writes drizzle/*.sql
npm run db:migrate    # apply migrations (use a Neon BRANCH, not main)
npm run db:seed       # idempotent upsert; skips geometry whose checksum is unchanged
npm run db:studio     # browse the data
```

Views are not managed by drizzle-kit. `event_calendar` is hand-written in `drizzle/0001_event_calendar_view.sql` and declared `.existing()` in the schema; edit both together.

## Known limitations (Phase 1)

- No weather adjustment (Phase 2).
- ~~No GPX uploads~~ — shipped 2026-09-04 at `/upload`; see `docs/UPLOADED-COURSES.md`.
- No user accounts. Not a near-term phase item — see Rule 6. Revisit only if a real need shows up.
- No smartwatch export (Phase 3).
- Pace label rounding can cause ±1s drift between displayed splits and total (underlying math is exact).

## When in doubt

Ask. Do not silently change algorithm constants, data files, or design tokens. Surface decisions that affect math correctness, user-facing behavior, or the design system.
