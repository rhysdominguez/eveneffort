import { describe, expect, it } from "vitest";
import {
  OUTLINE_EPSILON,
  OUTLINE_MAX_DEVIATION_M,
  OUTLINE_MIN_POINTS,
  renderOutline,
  simplifyOutline,
  type Outline,
} from "./outline";
import { loadGeometry } from "@/data/courses.fixture";
import { CORE_FIXTURE_SLUGS } from "@/data/courses.fixture";

/** A straight run of `n` points from (lat0, lon0) heading east. */
function straight(n: number, lat = 40, lon = -74, stepLon = 0.001) {
  return Array.from({ length: n }, (_, i) => ({ lat, lon: lon + i * stepLon }));
}

describe("simplifyOutline", () => {
  it("collapses a straight line to its two endpoints", () => {
    const outline = simplifyOutline(straight(200));
    expect(outline).toHaveLength(2);
  });

  it("keeps the corner of an L-shaped route", () => {
    const corner = [
      ...straight(50),
      ...Array.from({ length: 50 }, (_, i) => ({
        lat: 40 + i * 0.001,
        lon: -74 + 49 * 0.001,
      })),
    ];
    const outline = simplifyOutline(corner)!;
    expect(outline.length).toBeGreaterThanOrEqual(3);
    expect(outline.length).toBeLessThan(corner.length);
  });

  it("preserves the first and last point exactly", () => {
    const points = straight(120);
    const outline = simplifyOutline(points)!;
    expect(outline[0]).toEqual([40, -74]);
    expect(outline[outline.length - 1]).toEqual([40, round5(-74 + 119 * 0.001)]);
  });

  it("returns null rather than a degenerate shape for too few points", () => {
    expect(simplifyOutline(straight(OUTLINE_MIN_POINTS - 1))).toBeNull();
  });

  it("ignores non-finite coordinates instead of emitting NaN", () => {
    const points = [
      ...straight(40),
      { lat: Number.NaN, lon: 0 },
      { lat: 41, lon: -73 },
    ];
    const outline = simplifyOutline(points)!;
    expect(outline.flat().every(Number.isFinite)).toBe(true);
  });

  it("keeps a turnaround the chord runs straight through", () => {
    // The out-and-back, and the reason the chord is measured as a SEGMENT.
    // A course runs 400 m up a dead end and comes back 70 m short of where it
    // turned in. Every point of that spur lies ON the infinite line through
    // the recursion's two endpoints, just past the far one, so a
    // perpendicular-to-the-line test scores the whole excursion at zero and
    // discards it: the outline flattens to the shorter run and the turnaround
    // disappears. Against the chord as a segment the far point is 70 m away,
    // which is what it is. new-hampshire-marathon lost a real 68 m turnaround
    // at its own finish this way, measured at a 6 m tolerance.
    const out = Array.from({ length: 30 }, (_, i) => ({
      lat: 40 + (i * 0.0036) / 29,
      lon: -74,
    }));
    const back = Array.from({ length: 6 }, (_, i) => ({
      lat: 40.0036 - ((i + 1) * 0.0006) / 6,
      lon: -74,
    }));
    const outline = simplifyOutline([...out, ...back])!;
    const northmost = Math.max(...outline.map(([lat]) => lat));
    expect(northmost).toBeCloseTo(40.0036, 5);
  });

  it("handles a closed loop, whose chord between endpoints has no length", () => {
    // A circle: first and last point coincide, so the top-level RDP chord is
    // degenerate and the perpendicular-distance formula divides by zero.
    const loop = Array.from({ length: 360 }, (_, i) => ({
      lat: 40 + 0.05 * Math.sin((i * Math.PI) / 180),
      lon: -74 + 0.05 * Math.cos((i * Math.PI) / 180),
    }));
    loop.push({ ...loop[0] });
    const outline = simplifyOutline(loop)!;
    expect(outline.length).toBeGreaterThan(8);
    expect(outline[0]).toEqual(outline[outline.length - 1]);
  });

  it("simplifies harder as the tolerance grows", () => {
    const points = syntheticTrack();
    // Infinity disables the metre cap: this asserts the relative tolerance's
    // own behaviour, which the cap would otherwise flatten on a course this
    // long by binding on both calls.
    const fine = simplifyOutline(points, OUTLINE_EPSILON / 4, Infinity)!;
    const coarse = simplifyOutline(points, OUTLINE_EPSILON * 4, Infinity)!;
    expect(coarse.length).toBeLessThan(fine.length);
  });

  // The metre cap (ROADMAP #22). A relative-only tolerance put Boston's line
  // 70 m off its street once the outline was drawn over a real basemap, and
  // the cap is what holds a long point-to-point to something a runner can
  // recognise as the road they will run on.
  it("holds a long course to the metre cap the relative tolerance misses", () => {
    const points = syntheticTrack();
    const uncapped = simplifyOutline(points, OUTLINE_EPSILON, Infinity)!;
    const capped = simplifyOutline(points, OUTLINE_EPSILON)!;
    expect(capped.length).toBeGreaterThan(uncapped.length);
    expect(maxDeviationM(points, capped)).toBeLessThanOrEqual(
      OUTLINE_MAX_DEVIATION_M,
    );
    expect(maxDeviationM(points, uncapped)).toBeGreaterThan(
      OUTLINE_MAX_DEVIATION_M,
    );
  });

  it("leaves a compact course to the relative tolerance", () => {
    // A 3 km box: 0.2% of it is 6 m, so the cap cannot bind and both calls
    // have to agree. This is the half of the pair that keeps the cap from
    // quietly becoming the only rule.
    const compact = syntheticTrack().map(({ lat, lon }) => ({
      lat: 42 + (lat - 42) / 12,
      lon: -71 + (lon + 71) / 12,
    }));
    expect(simplifyOutline(compact)).toEqual(
      simplifyOutline(compact, OUTLINE_EPSILON, Infinity),
    );
  });
});

/**
 * A ~42 km course with real bends in it, built from Boston's dense profile so
 * the shape is a plausible track rather than a smooth curve RDP finds trivial.
 */
function syntheticTrack() {
  return loadGeometry("boston").profile.map(([km, ele]) => ({
    lat: 42 + ele / 100000,
    lon: -71 + km / 100,
  }));
}

/** Largest distance from any source point to the simplified polyline, in metres. */
function maxDeviationM(
  points: { lat: number; lon: number }[],
  outline: Outline,
): number {
  const k = Math.cos((points[0].lat * Math.PI) / 180);
  const xy = (lat: number, lon: number): [number, number] => [
    lon * k * 111320,
    lat * 110540,
  ];
  const line = outline.map(([lat, lon]) => xy(lat, lon));
  let worst = 0;
  for (const p of points) {
    const [px, py] = xy(p.lat, p.lon);
    let best = Infinity;
    for (let i = 0; i < line.length - 1; i++) {
      const [ax, ay] = line[i];
      const [bx, by] = line[i + 1];
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const t =
        len2 === 0
          ? 0
          : Math.min(
              1,
              Math.max(0, ((px - ax) * dx + (py - ay) * dy) / len2),
            );
      best = Math.min(best, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)));
    }
    worst = Math.max(worst, best);
  }
  return worst;
}

function round5(n: number): number {
  return Math.round(n * 1e5) / 1e5;
}

describe("renderOutline", () => {
  const box = { size: 200, padding: 10 };
  // A rectangle twice as wide as it is tall.
  const rect: Outline = [
    [40, -74],
    [40, -73.98],
    [40.005, -73.98],
    [40.005, -74],
  ];

  it("returns null for an outline with nothing to draw", () => {
    expect(renderOutline([[40, -74]], box)).toBeNull();
  });

  it("fits inside the box, padding included", () => {
    const { d, width, height } = renderOutline(rect, box)!;
    const coords = d
      .slice(1)
      .split(/[ML]/)
      .flatMap((pair) => pair.trim().split(" ").map(Number));
    const xs = coords.filter((_, i) => i % 2 === 0);
    const ys = coords.filter((_, i) => i % 2 === 1);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(box.padding - 0.05);
    expect(Math.max(...xs)).toBeLessThanOrEqual(width - box.padding + 0.05);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(box.padding - 0.05);
    expect(Math.max(...ys)).toBeLessThanOrEqual(height - box.padding + 0.05);
  });

  it("uses one scale for both axes, so the shape is never squashed", () => {
    const { d } = renderOutline(rect, box)!;
    const pts = d
      .slice(1)
      .split(/[ML]/)
      .map((pair) => pair.trim().split(" ").map(Number));
    const drawnW = Math.abs(pts[1][0] - pts[0][0]);
    const drawnH = Math.abs(pts[2][1] - pts[1][1]);
    // The rectangle's ground aspect: 0.02 deg lon at lat 40 vs 0.005 deg lat.
    const groundW = 0.02 * Math.cos((40 * Math.PI) / 180);
    const groundH = 0.005;
    expect(drawnW / drawnH).toBeCloseTo(groundW / groundH, 1);
  });

  it("gives the viewBox the course's own aspect, so nothing is fitted twice", () => {
    // Twice as wide as tall on the ground (0.013 deg of longitude at 40N is
    // ~2x 0.005 deg of latitude), which is inside the clamp.
    const wide: Outline = [
      [40, -74],
      [40, -73.987],
      [40.005, -73.987],
      [40.005, -74],
    ];
    const { width, height } = renderOutline(wide, box)!;
    expect(width).toBe(box.size);
    expect(width / height).toBeCloseTo(
      (0.013 * Math.cos((40 * Math.PI) / 180)) / 0.005,
      1,
    );
  });

  it("clamps a near-straight course rather than emitting a sliver", () => {
    const line: Outline = [
      [40, -74],
      [40.0001, -73.5],
    ];
    const { width, height } = renderOutline(line, box)!;
    expect(width / height).toBeLessThanOrEqual(2.5 + 1e-9);
  });

  it("puts north at the top", () => {
    const northSouth: Outline = [
      [40, -74],
      [41, -74],
    ];
    const { start, finish } = renderOutline(northSouth, box)!;
    expect(finish.y).toBeLessThan(start.y);
  });

  it("flags a loop course so start and finish are not drawn on top of each other", () => {
    const loop: Outline = [...rect, [40, -74]];
    expect(renderOutline(loop, box)!.isLoop).toBe(true);
    expect(renderOutline(rect, box)!.isLoop).toBe(false);
  });
});

describe("real seeded courses", () => {
  // The outline files are generated from GPX by scripts/build-outlines.ts;
  // this asserts the ones on disk are renderable, which is what the UI needs.
  it.each(CORE_FIXTURE_SLUGS)("%s renders to a non-empty path", (slug) => {
    const outline = loadGeometry(slug).outline;
    expect(outline).not.toBeNull();
    const rendered = renderOutline(outline!, { size: 200, padding: 10 })!;
    expect(rendered.d.startsWith("M")).toBe(true);
    expect(rendered.d).not.toContain("NaN");
  });
});
