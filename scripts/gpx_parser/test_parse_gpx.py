#!/usr/bin/env python3
"""Stdlib-only sanity tests for parse_gpx. Run: python3 test_parse_gpx.py

No pytest, no third-party deps. gpxpy is stubbed in sys.modules so this runs
even before `pip install -r requirements.txt`, since these tests exercise the
pure-math helpers only.
"""

from __future__ import annotations

import sys
import types

# Stub gpxpy so importing parse_gpx doesn't require the real dependency.
if "gpxpy" not in sys.modules:
    sys.modules["gpxpy"] = types.ModuleType("gpxpy")

from parse_gpx import (
    MAX_STEP_M,
    check_track_structure,
    haversine,
    max_step,
    sample_at_distances,
    sample_latlon,
    smooth_elevations,
)

PASSED = 0
FAILED = 0


def check(name: str, condition: bool, detail: str = "") -> None:
    global PASSED, FAILED
    if condition:
        PASSED += 1
        print(f"PASS  {name}")
    else:
        FAILED += 1
        print(f"FAIL  {name}  {detail}")


def test_haversine() -> None:
    # ~0.0089932 deg of latitude ≈ 1000 m. Expect within 5%.
    d = haversine(0.0, 0.0, 0.0089932, 0.0)
    check(
        "haversine ~1km",
        abs(d - 1000.0) / 1000.0 < 0.05,
        f"got {d:.2f} m",
    )


def test_smoothing() -> None:
    # Spike [0,0,0,100,0,0,0] at 50 m spacing -> 200 m window must damp it.
    points = [(float(i * 50), e) for i, e in enumerate([0, 0, 0, 100, 0, 0, 0])]
    smoothed = smooth_elevations(points, window_m=200.0)
    check(
        "smoothing damps spike",
        smoothed[3] < 50.0,
        f"smoothed[3]={smoothed[3]:.2f}",
    )


def test_sampling() -> None:
    # Linear ramp 0 m -> 422 m over 42200 m; elev = cum / 100.
    points = [(float(i * 100), float(i)) for i in range(423)]
    smoothed = [e for _, e in points]
    result = sample_at_distances(points, smoothed, [21000.0])
    check(
        "sampling midpoint ~210 m",
        abs(result[0] - 210.0) < 1.0,
        f"got {result[0]}",
    )


def test_sample_latlon() -> None:
    # Straight eastbound line: lon increases 0.001 deg per 100 m step.
    points = [(float(i * 100), 0.0) for i in range(423)]
    latlon = [(0.0, float(i) * 0.001) for i in range(423)]
    result = sample_latlon(points, latlon, [0.0, 21000.0, 99_999.0])
    check("latlon start exact", result[0] == [0.0, 0.0], f"got {result[0]}")
    check(
        "latlon midpoint interpolated",
        abs(result[1][1] - 0.21) < 1e-6,
        f"got {result[1]}",
    )
    check(
        "latlon past end clamps to last",
        result[2] == [0.0, round(422 * 0.001, 6)],
        f"got {result[2]}",
    )


def test_check_track_structure() -> None:
    # One track, one segment: the only shape the flattening loop is correct for.
    ok = True
    try:
        check_track_structure([1])
    except ValueError:
        ok = False
    check("single track/segment accepted", ok)

    def rejects(lengths: list[int]) -> bool:
        try:
            check_track_structure(lengths)
            return False
        except ValueError:
            return True

    check("two tracks rejected", rejects([1, 1]))
    check("two segments in one track rejected", rejects([2]))
    check("no tracks rejected", rejects([]))

    # The escape hatch, for a file whose join really is the route.
    allowed = True
    try:
        check_track_structure([1, 1], allow_multi_track=True)
    except ValueError:
        allowed = False
    check("--allow-multi-track overrides", allowed)


def test_max_step() -> None:
    idx, gap = max_step([0.0, 100.0, 250.0, 260.0])
    check("max_step finds the widest gap", gap == 150.0, f"got {gap}")
    check("max_step reports the ending index", idx == 2, f"got {idx}")

    idx, gap = max_step([42.0])
    check("max_step handles a single point", idx == -1 and gap == 0.0)

    # Real published courses top out at 1602 m (chicago); the ceiling must sit
    # above that or it measures sampling density instead of discontinuity.
    check(
        "ceiling clears the worst legitimate gap",
        MAX_STEP_M > 1602.0,
        f"MAX_STEP_M={MAX_STEP_M}",
    )


def main() -> int:
    test_haversine()
    test_smoothing()
    test_sampling()
    test_sample_latlon()
    test_check_track_structure()
    test_max_step()
    print(f"\n{PASSED} passed, {FAILED} failed")
    return 1 if FAILED else 0


if __name__ == "__main__":
    sys.exit(main())
