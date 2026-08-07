# GPX Parser

Converts raw GPX files into the 44-point elevation arrays consumed by the app.

## When to run

Run this whenever a GPX file is added or updated in `data/gpx_sources/`.
The output JSON is committed to git; it is NOT regenerated on build.

## Setup (one time)

```bash
cd scripts/gpx_parser
pip3 install -r requirements.txt
```

## Usage

From the repo root:

```bash
python3 scripts/gpx_parser/parse_gpx.py
```

This processes every `.gpx` file in `data/gpx_sources/` and writes the
corresponding JSON to `src/data/courses/<courseId>.json`.

Useful flags (`-h` for the full list):

```bash
--only berlin,tokyo      # just these slugs, instead of everything
--report PATH            # machine-readable per-course stats; '-' for stdout
--skip-existing          # skip courses whose source GPX is unchanged
--out-dir DIR            # write elsewhere (handy for diffing before committing)
--allow-multi-track      # permit a GPX with several tracks/segments
```

The `--report` JSON is what the bulk-import QA gate reads
(`scripts/import/qa.ts`); each entry carries `total_km`, `gain_m`, `start`,
`gpx_sha256`, `creator`, `tracks`, `segments` and `max_step_m`.

## Algorithm

- Parse track points via gpxpy.
- Compute cumulative route distance using the Haversine formula.
- Smooth elevations with a 200m centered moving average to suppress
  GPS noise (typically ±3m on consumer devices).
- Linearly interpolate smoothed elevations at exactly
  `[0, 1, 2, …, 42, 42.195]` km. Output: 44 values per course.

## Validation

A file is rejected outright if it has more than one track or segment (the
parser flattens them, which silently invents a route across the join), fewer
than 100 points, any point missing elevation, a gap over `MAX_STEP_M` between
consecutive points, or a total length outside `[41.5, 43.0]` km. Lengths
outside `[42.0, 42.4]` km warn but proceed.

`MAX_STEP_M` is 5 km, calibrated against the published courses — their largest
legitimate gaps run up to 1602 m, because sparse sampling along a straight road
is normal. Smaller-but-unusual gaps are not ignored: `max_step_m` goes into the
report so the import QA gate can flag outliers for review.

## Adding a new marathon

See the canonical 8-step checklist in `CLAUDE.md` ("Adding a new marathon") —
it covers the seed files and the slug ledger, which is where a new course
actually gets registered. In short: drop the GPX in `data/gpx_sources/`, run
the parser, then edit `src/db/seed/{cities,series,editions}.ts` and add the
slug to `src/db/seed/slug-ledger.ts`.

Course slugs are permanent (CLAUDE.md Rule 8) — they appear in shared
`/results?courseId=…` links and on printed pacebands. The GPX filename stem
becomes the slug, so name the file deliberately.

## Tests

Stdlib-only sanity tests (no pytest needed, gpxpy not required):

```bash
python3 scripts/gpx_parser/test_parse_gpx.py
```
