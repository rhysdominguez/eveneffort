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
  data/             GPX-derived JSON elevation arrays (+ a test-only fixture)
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
  seed.ts           Upserts the seed definitions + course JSON into Postgres
drizzle/            Generated SQL migrations (committed)
data/
  gpx_sources/      Raw GPX files (one per marathon)
```

## Data model

Three levels plus geometry. The split is deliberate:

- **`city`** owns the map pin — seeded from a host race's actual GPX start line for precision, not a guessed centroid — and the country/region ISO codes the calendar filters on. Every event in a city shares this one row, so two marathons in one city still render as a single pin; a second race added to an already-seeded city does not repoint it.
- **`event_series`** is the marathon as a recurring brand — "Boston Marathon", one row forever.
- **`event_edition`** is one running of it, `unique (series_id, race_date)`. Boston 2026 and Boston 2027 are two editions of one series. Deliberately not unique per year: a series can run twice in one year (London 2027 splits elite/mass across April 24 and 25) — two rows, same series and year, different dates.
- **`course`** is GPX-derived geometry hanging off the **series**, not the edition — one geometry row serves every year until the route actually changes, at which point you add a row with `effective_from_year` and repoint later editions.

Race dates are stored as `date` + `time`, never `timestamptz`: a start is a wall-clock fact, and `zonedWallClockToUTC` resolves it against the city's IANA zone at read time.

## Rules

1. **The pacing algorithm is locked.** Any change to `src/lib/pacing/` requires explicit sign-off and must include updated unit tests. The math is verified against the Minetti (2002) polynomial; do not "improve" it.
2. **All visual styling pulls from `globals.css` tokens.** No hardcoded hex values, no Tailwind `zinc-*`/`gray-*`/`red-*` named utilities, and no hardcoded `bg-white`/`text-black` in components. The app is light mode only — never add `dark:` variants, a `prefers-color-scheme` block, or per-component theme logic. See `DESIGN.md` for the system.
3. **Tests are non-negotiable.** Every change must leave `npm run test` and `npm run build` passing. Pacing-module changes require new unit tests proving correctness.
4. **Course data integrity.** Every file in `src/data/courses/*.json` must be exactly 44 finite numbers. `courses.integrity.test.ts` enforces this against the repo files, offline — a corrupt elevation array must fail in CI before it can ever reach a database.
5. **No new dependencies without justification.** Adding a library requires a clear reason in the PR. Current stack: Next.js, React, Tailwind, Vitest, Stripe, Drizzle + Neon.
6. **No authentication.** There is no login, no session, and no user-owned data — every row in the database (cities, series, editions, courses) is public read-only. Leave Neon Auth and any similar auth add-on **disabled** when configuring Vercel/Neon integrations. This isn't "Phase 3, later" — it's not a planned feature at all right now; revisit only if a real need for accounts shows up.
7. **GPX parser is the only Python.** All app code is TypeScript. Python lives in `scripts/gpx_parser/` and is a build-time tool, not runtime.
8. **Never rename a `courseSlug`.** They are the pre-database course ids and they appear in shared `/results?courseId=…` links, including on pacebands people have paid for. Renaming one silently breaks their link. `src/db/seed/slug-ledger.ts` is the append-only record of every published slug; `courses.test.ts` fails the build if a seeded course is missing from it, or if a ledger entry stops being seeded. A retired slug stays in the ledger and is never reused.
9. **The build and test suite must pass with no database reachable.** `src/db/client.ts` is lazy and the catalog degrades to empty, so CI never needs a connection string. Keep it that way — DB-touching tests belong behind their own script, not in `npm run test`.

## Adding a new marathon

1. Add a properly named `.gpx` file to `data/gpx_sources/<courseSlug>.gpx`.
2. Run `python3 scripts/gpx_parser/parse_gpx.py` from repo root; verify the generated JSON has 44 finite numbers.
3. Add the host city to `CITY_SEED` in `src/db/seed/cities.ts` if it isn't there yet — coordinates should be `coords[0]` from the course's own `.coords.json` (the GPX start line), not a guessed centroid. If the city is already seeded (a second race in an existing city), leave its coordinates as-is.
4. Add the series to `SERIES_SEED` in `src/db/seed/series.ts`, pointing at that `citySlug` and the `courseSlug` from step 1.
5. Add a recurrence rule to `RECURRENCE` in `src/db/seed/editions.ts`, and a confirmed date to `CONFIRMED_EDITIONS` once you have one (multiple entries for the same series+year are fine — see the `variant` field for two-day events).
6. Add the `courseSlug` to `PUBLISHED_COURSE_SLUGS` in `src/db/seed/slug-ledger.ts`. This is your signature on a permanent public identifier — read the file header first. The test suite fails until you do.
7. Run `npm run test`, then `npm run db:seed`.
8. Commit the source GPX, the generated JSON, and the seed edits.

No `CourseId` union to update and no registry to edit — courses are rows, and the seed files are the only hand-maintained list. There is nothing to add to `src/data/courses.fixture.ts` either: it reads `src/data/courses/` off disk, so the integrity tests pick up a new course automatically.

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
- No GPX uploads (Phase 2).
- No user accounts. Not a near-term phase item — see Rule 6. Revisit only if a real need shows up.
- No smartwatch export (Phase 3).
- Pace label rounding can cause ±1s drift between displayed splits and total (underlying math is exact).

## When in doubt

Ask. Do not silently change algorithm constants, data files, or design tokens. Surface decisions that affect math correctness, user-facing behavior, or the design system.
