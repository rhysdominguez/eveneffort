#!/usr/bin/env python3
"""GPX -> 44-point elevation array converter for eveneffort.

Build pipeline. Reads .gpx files from data/gpx_sources/, computes a
cumulative-distance / smoothed-elevation profile, samples it at
[0, 1, 2, ..., 42, 42.195] km, and writes src/data/courses/<courseId>.json.

It also writes <courseId>.coords.json: the 44 [lat, lon] pairs sampled at the
same km marks (Phase 2 — drives per-segment wind bearings and the start-line
weather lookup). coords[0] is the start line.

Usage:
    python3 scripts/gpx_parser/parse_gpx.py                    # all courses
    python3 scripts/gpx_parser/parse_gpx.py --only berlin,tokyo
    python3 scripts/gpx_parser/parse_gpx.py --report out.json  # machine-readable

The --report output is what the bulk-import QA gate consumes; see
scripts/import/qa.ts. Run with -h for the full flag list.

No external dependencies beyond gpxpy and the Python stdlib. Python 3.10+.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import gpxpy

# Target sample distances in meters: 0,1000,...,42000 km marks plus the finish.
TARGETS_M: list[float] = [float(km * 1000) for km in range(43)] + [42195.0]

EARTH_RADIUS_M = 6_371_000.0

# Hard ceiling on the gap between consecutive track points, meant to catch a
# file stitched from several recordings or a lap track that teleports back to
# the start — cases where cumulative distance downstream is fiction.
#
# Calibrated against the seven published courses, whose largest legitimate gaps
# are: chicago 1602 m, newyork 814 m, berlin 671 m, sydney 653 m, boston 368 m,
# london 231 m, tokyo 111 m. Sparse sampling along a straight road is normal and
# harmless, so a tight threshold measures point density rather than correctness
# — 500 m rejected four of the seven. 5 km leaves ~3x headroom over the worst
# real gap while still catching a jump between neighbourhoods.
#
# Gaps below this but still unusual are not silently accepted: max_step_m goes
# into the JSON report, and the import QA gate flags outliers for review.
MAX_STEP_M = 5000.0


def find_repo_root() -> Path:
    """Walk up from this script's location until a directory with package.json."""
    current = Path(__file__).resolve().parent
    for candidate in [current, *current.parents]:
        if (candidate / "package.json").is_file():
            return candidate
    raise RuntimeError("Could not locate repo root (no package.json found above this script)")


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two lat/lon points, in meters."""
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = (
        math.sin(dphi / 2.0) ** 2
        + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2.0) ** 2
    )
    return 2.0 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


def check_track_structure(
    track_lengths: list[int], allow_multi_track: bool = False
) -> None:
    """Reject a GPX whose points come from more than one track or segment.

    ``track_lengths[i]`` is the segment count of track i.

    Flattening every track and segment into one ordered list — which is what
    this script does — is only correct when there is exactly one of each.
    Given two tracks it silently concatenates them, and the join produces a
    course that looks fine in the output table but is not the real route.
    Hand-curated files were always single-track; scraped ones are not
    reliably so, hence the guard.
    """
    if allow_multi_track:
        return
    n_tracks = len(track_lengths)
    n_segments = sum(track_lengths)
    if n_tracks != 1 or n_segments != 1:
        raise ValueError(
            f"GPX has {n_tracks} track(s) and {n_segments} segment(s) — "
            f"refusing to concatenate them into one course "
            f"(pass --allow-multi-track if the join really is the route)"
        )


def max_step(distances: list[float]) -> tuple[int, float]:
    """Largest gap between consecutive cumulative distances.

    Returns ``(index, gap_m)`` where ``index`` is the point the gap ends at,
    or ``(-1, 0.0)`` for a list too short to have a gap.
    """
    worst_idx = -1
    worst = 0.0
    for i in range(1, len(distances)):
        gap = distances[i] - distances[i - 1]
        if gap > worst:
            worst = gap
            worst_idx = i
    return worst_idx, worst


def parse_gpx(
    path: Path, allow_multi_track: bool = False
) -> tuple[list[tuple[float, float]], list[tuple[float, float]], dict[str, object]]:
    """Parse a GPX file into ordered, index-aligned profile + coordinate lists.

    Returns ``(points, latlon, meta)`` where ``points[i]`` is
    ``(cumulative_distance_m, elevation_m)``, ``latlon[i]`` is
    ``(latitude, longitude)`` for the same track point, and ``meta`` carries
    provenance for the QA report (creator, track/segment counts, max step).

    Raises ValueError with a clear message if the file fails validation:
      - more than one track or segment (unless allow_multi_track)
      - fewer than 100 track points
      - any point missing elevation
      - a jump over MAX_STEP_M between consecutive points
      - total route length outside [41.5, 43.0] km
    Prints a warning (but continues) if length is outside [42.0, 42.4] km.
    """
    with path.open("r", encoding="utf-8") as fh:
        gpx = gpxpy.parse(fh)

    check_track_structure(
        [len(track.segments) for track in gpx.tracks], allow_multi_track
    )

    raw: list[tuple[float, float, float | None]] = []
    for track in gpx.tracks:
        for segment in track.segments:
            for pt in segment.points:
                raw.append((pt.latitude, pt.longitude, pt.elevation))

    if len(raw) < 100:
        raise ValueError(f"only {len(raw)} track points (need >= 100)")

    for idx, (_, _, elev) in enumerate(raw):
        if elev is None:
            raise ValueError(f"track point {idx} is missing elevation")

    points: list[tuple[float, float]] = [(0.0, float(raw[0][2]))]
    latlon: list[tuple[float, float]] = [(float(raw[0][0]), float(raw[0][1]))]
    cum = 0.0
    for i in range(1, len(raw)):
        lat1, lon1, _ = raw[i - 1]
        lat2, lon2, elev2 = raw[i]
        cum += haversine(lat1, lon1, lat2, lon2)
        points.append((cum, float(elev2)))
        latlon.append((float(lat2), float(lon2)))

    step_idx, step_m = max_step([d for d, _ in points])
    if step_m > MAX_STEP_M:
        raise ValueError(
            f"{step_m:.0f} m jump between track points {step_idx - 1} and "
            f"{step_idx} (max {MAX_STEP_M:.0f} m) — the track looks stitched "
            f"or discontinuous"
        )

    total_km = cum / 1000.0
    if not (41.5 <= total_km <= 43.0):
        raise ValueError(
            f"total route length {total_km:.3f} km is outside [41.5, 43.0] km"
        )
    if not (42.0 <= total_km <= 42.4):
        print(
            f"  WARNING: route length {total_km:.3f} km is outside the "
            f"expected [42.0, 42.4] km band (continuing anyway)"
        )

    meta: dict[str, object] = {
        "creator": getattr(gpx, "creator", None),
        "tracks": len(gpx.tracks),
        "segments": sum(len(t.segments) for t in gpx.tracks),
        "max_step_m": round(step_m, 1),
    }
    return points, latlon, meta


def smooth_elevations(
    points: list[tuple[float, float]], window_m: float = 200.0
) -> list[float]:
    """200m centered moving-average of elevation, keyed on cumulative distance.

    Single-pass two-pointer sweep: because cumulative distance is monotonically
    non-decreasing, the [cum_i - half, cum_i + half] window's left and right
    bounds only ever advance forward across iterations. We keep a running sum
    of the elevations currently inside the window, adding as `right` expands
    and subtracting as `left` contracts -- O(n) total, no nested loop. Windows
    shrink naturally at the endpoints (point 0 -> [0, half], last -> [total - half, total]).
    """
    n = len(points)
    half = window_m / 2.0
    smoothed: list[float] = []
    left = 0
    right = 0
    window_sum = 0.0
    for i in range(n):
        center = points[i][0]
        lo = center - half
        hi = center + half
        while right < n and points[right][0] <= hi:
            window_sum += points[right][1]
            right += 1
        while left < n and points[left][0] < lo:
            window_sum -= points[left][1]
            left += 1
        count = right - left
        smoothed.append(window_sum / count)
    return smoothed


def sample_at_distances(
    points: list[tuple[float, float]],
    smoothed: list[float],
    targets: list[float],
) -> list[float]:
    """Linearly interpolate smoothed elevation at each target distance (meters).

    - target == 0          -> smoothed elevation at the first point
    - target  > total len  -> smoothed elevation at the last point (+warning)
    - otherwise            -> linear interpolation between bracketing points
    Targets must be ascending; a single advancing cursor keeps this O(n + m).
    """
    n = len(points)
    total = points[-1][0]
    out: list[float] = []
    cursor = 0
    for d in targets:
        if d <= 0.0:
            out.append(round(smoothed[0], 1))
            continue
        if d > total:
            print(
                f"  WARNING: target {d:.0f} m exceeds route length "
                f"{total:.1f} m -- clamping to last point (GPX is short)"
            )
            out.append(round(smoothed[-1], 1))
            continue
        while cursor < n - 1 and points[cursor + 1][0] < d:
            cursor += 1
        lo_dist, _ = points[cursor]
        hi_dist, _ = points[cursor + 1]
        span = hi_dist - lo_dist
        if span <= 0.0:
            value = smoothed[cursor]
        else:
            frac = (d - lo_dist) / span
            value = smoothed[cursor] + frac * (smoothed[cursor + 1] - smoothed[cursor])
        out.append(round(value, 1))
    return out


def sample_latlon(
    points: list[tuple[float, float]],
    latlon: list[tuple[float, float]],
    targets: list[float],
) -> list[list[float]]:
    """Linearly interpolate [lat, lon] at each target distance (meters).

    Mirrors sample_at_distances but interpolates the coordinate pair instead of
    elevation. ``points`` provides the distance axis; ``latlon`` the values.
    Returns [lat, lon] pairs rounded to 6 dp (~0.1 m). Targets must be ascending.
    """
    n = len(points)
    total = points[-1][0]
    out: list[list[float]] = []
    cursor = 0
    for d in targets:
        if d <= 0.0:
            out.append([round(latlon[0][0], 6), round(latlon[0][1], 6)])
            continue
        if d > total:
            out.append([round(latlon[-1][0], 6), round(latlon[-1][1], 6)])
            continue
        while cursor < n - 1 and points[cursor + 1][0] < d:
            cursor += 1
        lo_dist = points[cursor][0]
        hi_dist = points[cursor + 1][0]
        span = hi_dist - lo_dist
        if span <= 0.0:
            lat, lon = latlon[cursor]
        else:
            frac = (d - lo_dist) / span
            lat = latlon[cursor][0] + frac * (latlon[cursor + 1][0] - latlon[cursor][0])
            lon = latlon[cursor][1] + frac * (latlon[cursor + 1][1] - latlon[cursor][1])
        out.append([round(lat, 6), round(lon, 6)])
    return out


def build_profile(points: list[tuple[float, float]]) -> list[list[float]]:
    """Raw, unsmoothed [distanceKm, elevationM] pairs for the chart only.

    No resampling — every GPX trackpoint is kept. Distance is strictly
    ascending: zero-length (duplicate-coordinate) steps are dropped so the
    chart's X axis is monotonic. distanceKm rounded to 4 dp, elevation to 1.
    This profile is presentational and never feeds the pacing engine.
    """
    profile: list[list[float]] = []
    last_dist = -1.0
    for dist_m, elev_m in points:
        dist_km = dist_m / 1000.0
        if dist_km <= last_dist:
            continue
        profile.append([round(dist_km, 4), round(elev_m, 1)])
        last_dist = dist_km

    if len(profile) < 100:
        raise ValueError(
            f"profile has only {len(profile)} points (need >= 100)"
        )
    total_km = profile[-1][0]
    if not (41.5 <= total_km <= 43.0):
        raise ValueError(
            f"profile length {total_km:.3f} km is outside [41.5, 43.0] km"
        )
    return profile


def sha256_file(path: Path) -> str:
    """Content hash of the source GPX, recorded for provenance."""
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def process_course(
    gpx_path: Path, output_path: Path, allow_multi_track: bool = False
) -> dict[str, object]:
    """Parse one GPX file and write its 44-point + profile JSON.

    Returns summary stats. The 44-point pipeline is unchanged; the profile
    file is an additional, presentational-only artifact for the chart.
    """
    points, latlon, meta = parse_gpx(gpx_path, allow_multi_track)
    smoothed = smooth_elevations(points)
    sampled = sample_at_distances(points, smoothed, TARGETS_M)

    if len(sampled) != 44:
        raise ValueError(f"expected 44 samples, produced {len(sampled)}")

    coords = sample_latlon(points, latlon, TARGETS_M)
    if len(coords) != 44:
        raise ValueError(f"expected 44 coords, produced {len(coords)}")

    profile = build_profile(points)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as fh:
        json.dump(sampled, fh)
        fh.write("\n")

    profile_path = output_path.with_name(f"{output_path.stem}.profile.json")
    with profile_path.open("w", encoding="utf-8") as fh:
        json.dump(profile, fh)
        fh.write("\n")

    coords_path = output_path.with_name(f"{output_path.stem}.coords.json")
    with coords_path.open("w", encoding="utf-8") as fh:
        json.dump(coords, fh)
        fh.write("\n")

    gain = sum(
        max(0.0, sampled[i] - sampled[i - 1]) for i in range(1, len(sampled))
    )
    return {
        "points": len(points),
        "total_km": points[-1][0] / 1000.0,
        "elev_min": min(sampled),
        "elev_max": max(sampled),
        "gain_m": gain,
        "start": coords[0],
        "gpx_sha256": sha256_file(gpx_path),
        **meta,
    }


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Convert marathon GPX files into eveneffort course JSON.",
    )
    parser.add_argument(
        "--only",
        metavar="SLUG[,SLUG...]",
        help="process just these course slugs instead of every GPX found",
    )
    parser.add_argument(
        "--input-dir",
        type=Path,
        help="directory of .gpx files (default: data/gpx_sources)",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        help="directory for generated JSON (default: src/data/courses)",
    )
    parser.add_argument(
        "--report",
        metavar="PATH",
        help="write a JSON report of per-course stats and failures; '-' for stdout",
    )
    parser.add_argument(
        "--fail-fast",
        action="store_true",
        help="stop at the first failure instead of processing the rest",
    )
    parser.add_argument(
        "--allow-multi-track",
        action="store_true",
        help="permit GPX files with several tracks/segments (they get concatenated)",
    )
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="skip courses whose output already exists and whose source GPX is unchanged",
    )
    return parser


def is_unchanged(gpx_path: Path, out_path: Path) -> bool:
    """True when out_path was generated from exactly this GPX content.

    Compares the recorded source hash in the sidecar written by --skip-existing
    runs. Cheap enough to make re-running over hundreds of courses a no-op.
    """
    stamp = out_path.with_name(f"{out_path.stem}.source.sha256")
    if not (out_path.is_file() and stamp.is_file()):
        return False
    return stamp.read_text(encoding="utf-8").strip() == sha256_file(gpx_path)


def main(argv: list[str] | None = None) -> int:
    args = build_arg_parser().parse_args(argv)
    repo_root = find_repo_root()
    src_dir = args.input_dir or repo_root / "data" / "gpx_sources"
    out_dir = args.out_dir or repo_root / "src" / "data" / "courses"

    if not src_dir.is_dir():
        print(f"ERROR: {src_dir} does not exist", file=sys.stderr)
        return 1

    gpx_files = sorted(src_dir.glob("*.gpx"))
    if args.only:
        wanted = {s.strip() for s in args.only.split(",") if s.strip()}
        gpx_files = [p for p in gpx_files if p.stem in wanted]
        missing = sorted(wanted - {p.stem for p in gpx_files})
        if missing:
            print(
                f"ERROR: no GPX in {src_dir} for: {', '.join(missing)}",
                file=sys.stderr,
            )
            return 1
    if not gpx_files:
        print(f"No .gpx files found in {src_dir}. Nothing to do.")
        return 0

    rows: list[tuple[str, str, str, str, str, str, str]] = []
    report: list[dict[str, object]] = []
    any_failed = False

    for gpx_path in gpx_files:
        course_id = gpx_path.stem
        out_path = out_dir / f"{course_id}.json"

        if args.skip_existing and is_unchanged(gpx_path, out_path):
            print(f"Skipping {gpx_path.name} (unchanged)")
            report.append({"slug": course_id, "status": "skipped"})
            rows.append((course_id, "-", "-", "-", "-", "-", "- unchanged"))
            continue

        try:
            shown = out_path.relative_to(repo_root)
        except ValueError:
            shown = out_path  # --out-dir can point outside the repo
        print(f"Processing {gpx_path.name} -> {shown}")
        try:
            stats = process_course(gpx_path, out_path, args.allow_multi_track)
            out_path.with_name(f"{out_path.stem}.source.sha256").write_text(
                f"{stats['gpx_sha256']}\n", encoding="utf-8"
            )
            report.append({"slug": course_id, "status": "ok", **stats})
            rows.append(
                (
                    course_id,
                    str(stats["points"]),
                    f"{stats['total_km']:.2f}",
                    f"{stats['elev_min']:.1f}",
                    f"{stats['elev_max']:.1f}",
                    f"{stats['gain_m']:.1f}",
                    "✓ written",
                )
            )
        except (ValueError, OSError) as err:
            any_failed = True
            print(f"  ERROR: {err} -- skipping {course_id}")
            report.append(
                {"slug": course_id, "status": "failed", "error": str(err)}
            )
            rows.append((course_id, "-", "-", "-", "-", "-", f"✗ {err}"))
            if args.fail_fast:
                break

    header = ("COURSE", "POINTS", "TOTAL_KM", "ELEV_MIN", "ELEV_MAX", "GAIN_M", "STATUS")
    print()
    print(
        f"{header[0]:<10}{header[1]:<8}{header[2]:<10}{header[3]:<10}"
        f"{header[4]:<10}{header[5]:<9}{header[6]}"
    )
    for r in rows:
        print(
            f"{r[0]:<10}{r[1]:<8}{r[2]:<10}{r[3]:<10}{r[4]:<10}{r[5]:<9}{r[6]}"
        )

    if args.report:
        payload = json.dumps({"courses": report}, indent=2)
        if args.report == "-":
            print()
            print(payload)
        else:
            report_path = Path(args.report)
            report_path.parent.mkdir(parents=True, exist_ok=True)
            report_path.write_text(payload + "\n", encoding="utf-8")
            print(f"\nReport written to {report_path}")

    return 1 if any_failed else 0


if __name__ == "__main__":
    sys.exit(main())
