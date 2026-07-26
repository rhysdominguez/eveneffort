@AGENTS.md

# CLAUDE.md — Working Agreement for AI-Assisted Sessions

This file is read by Claude Code, Cursor, and other AI coding agents when working in this repo. It sets the rules.

## Project

**eveneffort** — a client-side React/Next.js web app that produces elevation-adjusted marathon pacing charts using the Minetti (2002) energy cost model.

## Architecture (Phase 1 MVP)

- **Framework:** Next.js 16 (App Router) + TypeScript + Tailwind CSS v4.
- **No backend.** All computation runs client-side.
- **No database.** Course elevation data is hardcoded JSON in `src/data/courses/`.
- **Deployment target:** Vercel (free tier).
- **Package manager:** npm.

## Repository layout

```
src/
  app/              Next.js App Router pages + global CSS
  components/       React UI components
  data/             Course registry + JSON elevation arrays
  hooks/            Custom React hooks
  lib/
    pacing/         Minetti algorithm (PURE — do not modify without explicit approval)
    units/          Time, distance, pace formatting helpers
  types/            Shared TypeScript types
scripts/
  gpx_parser/       Python build pipeline for adding new marathon courses
data/
  gpx_sources/      Raw GPX files (one per marathon)
```

## Rules

1. **The pacing algorithm is locked.** Any change to `src/lib/pacing/` requires explicit sign-off and must include updated unit tests. The math is verified against the Minetti (2002) polynomial; do not "improve" it.
2. **All visual styling pulls from `globals.css` tokens.** No hardcoded hex values, no Tailwind `zinc-*`/`gray-*`/`red-*` named utilities, and no hardcoded `bg-white`/`text-black` in components. The app is light mode only — never add `dark:` variants, a `prefers-color-scheme` block, or per-component theme logic. See `DESIGN.md` for the system.
3. **Tests are non-negotiable.** Every change must leave `npm run test` and `npm run build` passing. Pacing-module changes require new unit tests proving correctness.
4. **Course data integrity.** Every file in `src/data/courses/*.json` must be exactly 44 finite numbers. The integrity test in `courses.integrity.test.ts` enforces this.
5. **No new dependencies without justification.** Phase 1 MVP runs on Next.js, React, Tailwind, and Vitest. Adding a library requires a clear reason in the PR.
6. **GPX parser is the only Python.** All app code is TypeScript. Python lives in `scripts/gpx_parser/` and is a build-time tool, not runtime.

## Adding a new marathon course

1. Add a properly named `.gpx` file to `data/gpx_sources/<courseId>.gpx`.
2. Add the `courseId` to the `CourseId` union in `src/types/index.ts`.
3. Add the course entry to `COURSES` in `src/data/courses.ts`.
4. Run `python3 scripts/gpx_parser/parse_gpx.py` from repo root.
5. Verify the generated JSON has 44 finite numbers.
6. Commit both the source GPX and the generated JSON.

## Known limitations (Phase 1)

- No weather adjustment (Phase 2).
- No GPX uploads (Phase 2).
- No user accounts (Phase 3).
- No smartwatch export (Phase 3).
- Pace label rounding can cause ±1s drift between displayed splits and total (underlying math is exact).

## When in doubt

Ask. Do not silently change algorithm constants, data files, or design tokens. Surface decisions that affect math correctness, user-facing behavior, or the design system.
