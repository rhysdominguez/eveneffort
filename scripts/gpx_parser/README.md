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

## Algorithm

- Parse track points via gpxpy.
- Compute cumulative route distance using the Haversine formula.
- Smooth elevations with a 200m centered moving average to suppress
  GPS noise (typically ±3m on consumer devices).
- Linearly interpolate smoothed elevations at exactly
  `[0, 1, 2, …, 42, 42.195]` km. Output: 44 values per course.

## Adding a new marathon

1. Drop the GPX file in `data/gpx_sources/<courseId>.gpx`.
2. Add the courseId to `src/types/index.ts` (CourseId union).
3. Add the course entry to `src/data/courses.ts`.
4. Run the parser.
5. Commit both the GPX source and the generated JSON.

## Tests

Stdlib-only sanity tests (no pytest needed, gpxpy not required):

```bash
python3 scripts/gpx_parser/test_parse_gpx.py
```
