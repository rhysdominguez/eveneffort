import { describe, expect, it } from "vitest";
import {
  buildRouteMap,
  cumulativeKm,
  MARKER_INTERVAL,
  MIN_INTENSITY,
  neutralThresholdPct,
  outlineBounds,
  pointAtKm,
  rampIntensity,
  sliceBetween,
  legendPosition,
  windStrengthWord,
  windVerdict,
  type RouteSegmentProperties,
} from "@/lib/course/routeMap";
import type { Outline } from "@/lib/course/outline";
import { buildSegments, MARATHON_KM } from "@/lib/pacing/segments";
import { courseHills } from "@/lib/pacing/hills";
import { loadGeometry } from "@/data/courses.fixture";
import { haversineKm } from "@/lib/geo/haversine";
import type { PaceChartRow } from "@/types";

// Real committed geometry, not a hand-built stub: the failure this module is
// most likely to have is a mis-scaled or mis-sliced outline, and only a genuine
// 500-point course shows that.
const boston = loadGeometry("boston");
const BOSTON_OUTLINE = boston.outline as Outline;

const rowsFor = (count: number): PaceChartRow[] =>
  Array.from({ length: count }, (_, i) => ({
    segmentLabel: String(i + 1),
    elevationDeltaM: 0,
    adjustedPaceSecPerUnit: 270,
    adjustedPaceLabel: "4:30 /km",
    cumulativeSplitSeconds: 270 * (i + 1),
    cumulativeSplitLabel: "0:00:00",
  }));

const GOAL = 3 * 3600; // 3:00:00, so ~4:16/km flat

function buildBoston(overrides: Partial<Parameters<typeof buildRouteMap>[0]> = {}) {
  const unit = overrides.unit ?? "km";
  const segments = buildSegments(boston.elevations, unit);
  return buildRouteMap({
    outline: BOSTON_OUTLINE,
    elevations: boston.elevations,
    unit,
    windMultipliers: segments.map(() => 1),
    hills: courseHills(boston.elevations),
    rows: rowsFor(segments.length),
    goalTimeSeconds: GOAL,
    ...overrides,
  });
}

describe("cumulativeKm", () => {
  it("normalises the outline so the last vertex is exactly the marathon", () => {
    const cumulative = cumulativeKm(BOSTON_OUTLINE)!;
    expect(cumulative).toHaveLength(BOSTON_OUTLINE.length);
    expect(cumulative[0]).toBe(0);
    expect(cumulative[cumulative.length - 1]).toBeCloseTo(MARATHON_KM, 9);
  });

  it("is monotonically non-decreasing", () => {
    const cumulative = cumulativeKm(BOSTON_OUTLINE)!;
    for (let i = 1; i < cumulative.length; i++) {
      expect(cumulative[i]).toBeGreaterThanOrEqual(cumulative[i - 1]);
    }
  });

  it("normalises an outline that does not walk 42.195 km on its own", () => {
    // The guard against the drift described in the module header. The raw
    // walked length lands either side of the certified distance — corner
    // cutting pulls it short, a GPS-recorded source line pulls it long — so
    // this asserts the band the normalisation is meant to absorb, not a
    // direction. Outside it, something other than simplification is wrong.
    let raw = 0;
    for (let i = 1; i < BOSTON_OUTLINE.length; i++) {
      raw += haversineKm(
        BOSTON_OUTLINE[i - 1][0],
        BOSTON_OUTLINE[i - 1][1],
        BOSTON_OUTLINE[i][0],
        BOSTON_OUTLINE[i][1],
      );
    }
    expect(raw).toBeLessThan(MARATHON_KM * 1.04);
    expect(raw).toBeGreaterThan(MARATHON_KM * 0.95);
    // And the scaling still lands the last vertex exactly on the distance,
    // whichever side it started.
    const cumulative = cumulativeKm(BOSTON_OUTLINE)!;
    expect(cumulative[cumulative.length - 1]).toBeCloseTo(MARATHON_KM, 9);
  });

  it("returns null for geometry with no measurable length", () => {
    expect(cumulativeKm([])).toBeNull();
    expect(cumulativeKm([[42, -71]])).toBeNull();
    expect(
      cumulativeKm([
        [42, -71],
        [42, -71],
      ]),
    ).toBeNull();
  });
});

describe("pointAtKm", () => {
  const straight: Outline = [
    [0, 0],
    [0, 1],
  ];
  const cumulative = cumulativeKm(straight)!;

  it("returns lng first, matching GeoJSON", () => {
    const [lng, lat] = pointAtKm(straight, cumulative, 0);
    expect(lng).toBe(0);
    expect(lat).toBe(0);
  });

  it("interpolates the midpoint rather than snapping to a vertex", () => {
    const [lng] = pointAtKm(straight, cumulative, MARATHON_KM / 2);
    expect(lng).toBeCloseTo(0.5, 6);
  });

  it("clamps outside the course", () => {
    expect(pointAtKm(straight, cumulative, -5)).toEqual([0, 0]);
    expect(pointAtKm(straight, cumulative, 999)[0]).toBeCloseTo(1, 9);
  });
});

describe("sliceBetween", () => {
  it("interpolates both endpoints so adjacent slices join exactly", () => {
    const cumulative = cumulativeKm(BOSTON_OUTLINE)!;
    const first = sliceBetween(BOSTON_OUTLINE, cumulative, 0, 1);
    const second = sliceBetween(BOSTON_OUTLINE, cumulative, 1, 2);
    expect(first[first.length - 1]).toEqual(second[0]);
  });

  it("keeps every intermediate vertex, so the line still follows the streets", () => {
    // Boston is a near-straight point-to-point and simplifies hard, so ten of
    // its kilometres carry about ten vertices. A twisty city loop is where a
    // slice that dropped its interior would actually show, so it is asserted
    // against London rather than against Boston.
    const london = loadGeometry("london").outline as Outline;
    const cumulative = cumulativeKm(london)!;
    const slice = sliceBetween(london, cumulative, 10, 20);
    expect(slice.length).toBeGreaterThan(20);
  });
});

describe("outlineBounds", () => {
  it("boxes the whole course, west/south then east/north", () => {
    const [[west, south], [east, north]] = outlineBounds(BOSTON_OUTLINE);
    expect(west).toBeLessThan(east);
    expect(south).toBeLessThan(north);
    for (const [lat, lon] of BOSTON_OUTLINE) {
      expect(lon).toBeGreaterThanOrEqual(west);
      expect(lon).toBeLessThanOrEqual(east);
      expect(lat).toBeGreaterThanOrEqual(south);
      expect(lat).toBeLessThanOrEqual(north);
    }
  });
});

describe("neutralThresholdPct", () => {
  it("is one second out of the split's own duration", () => {
    expect(neutralThresholdPct(270)).toBeCloseTo(0.3704, 4);
    expect(neutralThresholdPct(434)).toBeCloseTo(0.2304, 4);
  });

  it("tightens for a longer split, because it has more seconds to move", () => {
    expect(neutralThresholdPct(434)).toBeLessThan(neutralThresholdPct(270));
  });

  it("never colours anything when the split has no duration", () => {
    expect(neutralThresholdPct(0)).toBe(Infinity);
  });
});

describe("rampIntensity", () => {
  it("is zero below the threshold, so a trivial wind stays grey", () => {
    expect(rampIntensity(0.2, 0.37, 3)).toBe(0);
    expect(rampIntensity(-0.2, 0.37, 3)).toBe(0);
  });

  it("starts at MIN_INTENSITY the moment it clears the threshold", () => {
    expect(rampIntensity(0.37, 0.37, 3)).toBeCloseTo(MIN_INTENSITY, 9);
  });

  it("reaches full strength only at the worst split on the course", () => {
    expect(rampIntensity(3, 0.37, 3)).toBeCloseTo(1, 9);
  });

  it("is monotonic in magnitude and symmetric in sign", () => {
    let previous = -1;
    for (const pct of [0.4, 0.8, 1.2, 2, 3]) {
      const intensity = rampIntensity(pct, 0.37, 3);
      expect(intensity).toBeGreaterThan(previous);
      expect(rampIntensity(-pct, 0.37, 3)).toBeCloseTo(intensity, 9);
      previous = intensity;
    }
  });

  it("does not let a near-calm day saturate the ramp", () => {
    // Worst split 0.5%, threshold 0.37%: a span of 0.13 points. Without the
    // floor this would be full-strength red for a wind worth half a second.
    expect(rampIntensity(0.5, 0.37, 0.5)).toBeLessThan(0.5);
  });
});

describe("buildRouteMap", () => {
  it("emits one feature per segment, aligned with the splits table", () => {
    const map = buildBoston()!;
    expect(map.route.features).toHaveLength(43);
    map.route.features.forEach((f, i) => {
      expect(f.id).toBe(i);
      expect(f.properties.index).toBe(i);
      expect(f.properties.label).toBe(String(i + 1));
    });
  });

  it("segments the course in miles when the runner reads miles", () => {
    const map = buildBoston({ unit: "miles" })!;
    expect(map.route.features).toHaveLength(27);
    expect(map.route.features[0].properties.distanceLabel).toBe("1 mi");
  });

  it("covers the whole course with no gaps between slices", () => {
    const map = buildBoston()!;
    const features = map.route.features;
    expect(features[0].properties.startKm).toBe(0);
    expect(features[features.length - 1].properties.endKm).toBeCloseTo(
      MARATHON_KM,
      9,
    );
    for (let i = 1; i < features.length; i++) {
      expect(features[i].properties.startKm).toBeCloseTo(
        features[i - 1].properties.endKm,
        9,
      );
      const previous = features[i - 1].geometry.coordinates;
      expect(features[i].geometry.coordinates[0]).toEqual(
        previous[previous.length - 1],
      );
    }
  });

  it("reads each segment's own multiplier, not a positional guess", () => {
    const segments = buildSegments(boston.elevations, "km");
    const windMultipliers = segments.map((_, i) => (i === 7 ? 1.05 : 1));
    const map = buildBoston({ windMultipliers })!;
    expect(map.route.features[7].properties.windPct).toBeCloseTo(5, 9);
    expect(map.route.features[7].properties.tone).toBe("head");
    expect(map.route.features[6].properties.tone).toBe("neutral");
  });

  it("calls a helping wind a tailwind", () => {
    const segments = buildSegments(boston.elevations, "km");
    const map = buildBoston({
      windMultipliers: segments.map(() => 0.97),
    })!;
    expect(map.route.features[0].properties.tone).toBe("tail");
    expect(map.route.features[0].properties.windPct).toBeCloseTo(-3, 9);
  });

  it("leaves the whole course neutral when there is no weather", () => {
    const map = buildBoston()!;
    expect(map.hasWind).toBe(false);
    expect(map.maxWindPct).toBe(0);
    for (const f of map.route.features) {
      expect(f.properties.tone).toBe("neutral");
      expect(f.properties.intensity).toBe(0);
    }
  });

  it("stays neutral for a wind too small to move a printed split", () => {
    const segments = buildSegments(boston.elevations, "km");
    // 0.1% of a ~4:16 kilometre is a quarter of a second.
    const map = buildBoston({ windMultipliers: segments.map(() => 1.001) })!;
    expect(map.hasWind).toBe(false);
    expect(map.route.features.every((f) => f.properties.tone === "neutral")).toBe(
      true,
    );
  });

  it("marks the start, the finish and every fifth split", () => {
    const map = buildBoston()!;
    const kinds = map.markers.features.map((f) => f.properties.kind);
    expect(kinds[0]).toBe("start");
    expect(kinds[kinds.length - 1]).toBe("finish");
    const labels = map.markers.features
      .filter((f) => f.properties.kind === "distance")
      .map((f) => f.properties.label);
    expect(labels).toEqual(["5", "10", "15", "20", "25", "30", "35", "40"]);
    expect(MARKER_INTERVAL).toBe(5);
  });

  it("puts every marker on the route line itself", () => {
    const map = buildBoston()!;
    const onLine = new Set(
      map.route.features.flatMap((f) =>
        f.geometry.coordinates.map(([lng, lat]) => `${lng},${lat}`),
      ),
    );
    for (const marker of map.markers.features) {
      const [lng, lat] = marker.geometry.coordinates;
      expect(onLine.has(`${lng},${lat}`)).toBe(true);
    }
  });

  it("numbers the splits by the climb they sit in, in course order", () => {
    const hills = courseHills(boston.elevations);
    const map = buildBoston({ hills })!;
    expect(hills.length).toBeGreaterThan(0);
    expect(map.hills.features).toHaveLength(hills.length);
    const flagged = map.route.features.filter(
      (f) => f.properties.hillIndex !== null,
    );
    expect(flagged.length).toBeGreaterThan(0);
    hills.forEach((hill, i) => {
      expect(
        map.route.features[hill.startSegmentIndex].properties.hillIndex,
      ).toBe(i + 1);
    });
    // Numbered from 1 and never out of order along the route: the number is the
    // climb's place in the race, which is what the Hill segments badge says.
    const seen = flagged.map((f) => f.properties.hillIndex!);
    expect(Math.min(...seen)).toBe(1);
    expect([...seen].sort((a, b) => a - b)).toEqual(seen);
  });

  it("puts a mile split in the climb it is actually on", () => {
    // The unit trap: courseHills always works in kilometre segments, so mile
    // segment 16 is nowhere near kilometre segment 16. Matching on distance is
    // what keeps a runner in miles out of the wrong climb.
    const hills = courseHills(boston.elevations);
    const map = buildBoston({ unit: "miles", hills })!;
    const hill = hills[0];
    const inside = map.route.features.filter(
      (f) =>
        f.properties.startKm < hill.endDistanceKm &&
        f.properties.endKm > hill.startDistanceKm,
    );
    expect(inside.length).toBeGreaterThan(0);
    for (const feature of inside) {
      expect(feature.properties.hillIndex).toBe(1);
    }
  });

  it("returns null rather than throwing on undrawable geometry", () => {
    expect(buildBoston({ outline: [] })).toBeNull();
    expect(
      buildBoston({
        outline: [
          [42, -71],
          [42, -71],
        ],
      }),
    ).toBeNull();
    expect(buildBoston({ elevations: [1, 2, 3] })).toBeNull();
  });

  it("builds for every core course, not just Boston", () => {
    for (const slug of ["berlin", "chicago", "london", "tokyo", "sydney"]) {
      const geo = loadGeometry(slug);
      const segments = buildSegments(geo.elevations, "km");
      const map = buildRouteMap({
        outline: geo.outline as Outline,
        elevations: geo.elevations,
        unit: "km",
        windMultipliers: segments.map(() => 1),
        hills: courseHills(geo.elevations),
        rows: rowsFor(segments.length),
        goalTimeSeconds: GOAL,
      });
      expect(map, slug).not.toBeNull();
      expect(map!.route.features, slug).toHaveLength(43);
    }
  });
});

describe("windVerdict", () => {
  const props = (over: Partial<RouteSegmentProperties>): RouteSegmentProperties =>
    ({
      index: 0,
      startKm: 0,
      endKm: 1,
      label: "1",
      distanceLabel: "1 km",
      paceLabel: "4:30 /km",
      elevationDeltaM: 0,
      tone: "neutral",
      windPct: 0,
      intensity: 0,
      hillIndex: null,
      ...over,
    }) as RouteSegmentProperties;

  it("names the direction and how hard it is blowing, in words", () => {
    expect(
      windVerdict(props({ tone: "head", windPct: 1.24, intensity: 1 })),
    ).toBe("Strong headwind");
    expect(
      windVerdict(props({ tone: "tail", windPct: -0.92, intensity: MIN_INTENSITY })),
    ).toBe("Light tailwind");
  });

  it("never prints a percentage at a runner", () => {
    for (const intensity of [MIN_INTENSITY, 0.5, 0.75, 1]) {
      expect(windVerdict(props({ tone: "head", windPct: 3, intensity }))).not.toMatch(
        /%|\d/,
      );
    }
  });

  it("says so plainly when the wind does not change the plan", () => {
    expect(windVerdict(props({}))).toBe("No meaningful wind");
  });

  it("places the split on the legend, tailwind left and headwind right", () => {
    expect(legendPosition(props({}))).toBe(0.5);
    expect(legendPosition(props({ tone: "head", intensity: 1 }))).toBe(1);
    expect(legendPosition(props({ tone: "tail", intensity: 1 }))).toBe(0);
    expect(
      legendPosition(props({ tone: "head", intensity: MIN_INTENSITY })),
    ).toBeCloseTo(0.65, 9);
    expect(
      legendPosition(props({ tone: "tail", intensity: MIN_INTENSITY })),
    ).toBeCloseTo(0.35, 9);
  });

  it("never places a split outside the bar", () => {
    for (const intensity of [-1, 0, 0.5, 1, 4, NaN]) {
      for (const tone of ["head", "tail"] as const) {
        const position = legendPosition(props({ tone, intensity }));
        expect(position).toBeGreaterThanOrEqual(0);
        expect(position).toBeLessThanOrEqual(1);
      }
    }
  });

  it("reads the word off the same ramp that paints the line", () => {
    // The whole point: the darkest split on the course is the one that reads
    // "Strong", so the sentence can never contradict the shade beside it.
    expect(windStrengthWord(MIN_INTENSITY)).toBe("Light");
    expect(windStrengthWord(1)).toBe("Strong");
    const ordered = [MIN_INTENSITY, 0.5, 0.7, 0.9, 1].map(windStrengthWord);
    const rank = { Light: 0, Moderate: 1, Strong: 2 } as const;
    for (let i = 1; i < ordered.length; i++) {
      expect(rank[ordered[i]]).toBeGreaterThanOrEqual(rank[ordered[i - 1]]);
    }
    expect(new Set(ordered).size).toBe(3);
  });
});
