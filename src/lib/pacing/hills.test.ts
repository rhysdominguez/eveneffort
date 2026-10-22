import { describe, it, expect } from "vitest";
import {
  costProfile,
  courseHills,
  hillCostSeconds,
  HILL_MIN_RISE_M,
  HILL_REFERENCE_PACE_SEC_PER_KM,
} from "./hills";
import { courseTerrain, terrainLabel } from "./terrain";
import { MARATHON_KM } from "./segments";
import { rowRangeForDistanceRange } from "@/lib/chart/geometry";
import { allCourseSlugsOnDisk, loadGeometry } from "@/data/courses.fixture";

/**
 * A 44-point array from a per-kilometre delta list (43 deltas).
 *
 * Fixtures below are built from PLATEAUS two or three kilometres wide, never a
 * single spiked kilometre: `buildSegments` smooths the array before deriving
 * grades (0.25/0.5/0.25), so a one-kilometre dip comes out half the depth it
 * was written as and a test written against the raw numbers would be testing
 * the smoother rather than the detector.
 */
const fromDeltas = (deltas: number[], start = 0): number[] => {
  const out = [start];
  for (const d of deltas) out.push(out[out.length - 1] + d);
  return out;
};
const pad = (deltas: number[]) => [
  ...deltas,
  ...new Array(43 - deltas.length).fill(0),
];
const flat44 = () => new Array(44).fill(50);

describe("courseHills", () => {
  it("finds nothing on a flat course rather than manufacturing three", () => {
    expect(courseHills(flat44())).toEqual([]);
  });

  it("finds nothing on a monotone descent", () => {
    expect(courseHills(fromDeltas(new Array(43).fill(-10), 500))).toEqual([]);
  });

  it("reads a monotone climb as one hill covering the whole course", () => {
    const hills = courseHills(fromDeltas(new Array(43).fill(10), 0));
    expect(hills).toHaveLength(1);
    expect(hills[0].startDistanceKm).toBe(0);
    expect(hills[0].endDistanceKm).toBe(MARATHON_KM);
    expect(hills[0].riseM).toBeCloseTo(430, 6);
    expect(hills[0].excessKm).toBeGreaterThan(0);
  });

  it("merges two climbs across a dip it tolerates", () => {
    // 50 m up, 4 m down over two kilometres, 50 m up. The dip is under 10 m and
    // under half the rise so far, and lasts two segments.
    const hills = courseHills(
      fromDeltas(pad([...new Array(5).fill(10), -2, -2, ...new Array(5).fill(10)])),
    );
    expect(hills).toHaveLength(1);
    expect(hills[0].startDistanceKm).toBe(0);
    // Past km 12 by one: the smoother carries a quarter of the last riser into
    // the kilometre after it, which is the array the detector reads.
    expect(hills[0].endDistanceKm).toBe(13);
    expect(hills[0].riseM).toBeCloseTo(96, 6);
  });

  it("splits on a dip past tolerance, and returns the two in course order", () => {
    const hills = courseHills(
      fromDeltas(
        pad([...new Array(5).fill(10), -15, -15, ...new Array(5).fill(10)]),
      ),
    );
    expect(hills).toHaveLength(2);
    expect(hills[0].endSegmentIndex).toBeLessThan(hills[1].startSegmentIndex);
    expect(hills[0].startDistanceKm).toBeLessThan(hills[1].startDistanceKm);
  });

  it("scales the dip tolerance with the rise so far", () => {
    // The same 8 m dip against two different climbs below it. Against a 12 m
    // rise the tolerance is half of 12, so this splits and the small first run
    // fails the rise floor: one hill, starting at the dip.
    const small = courseHills(
      fromDeltas(pad([4, 4, 4, -4, -4, ...new Array(6).fill(6)])),
    );
    expect(small).toHaveLength(1);
    expect(small[0].startDistanceKm).toBeGreaterThan(0);

    // Against a 60 m rise the tolerance is the 10 m cap, so the same dip is
    // absorbed and the whole thing is one hill from the gun.
    const large = courseHills(
      fromDeltas(pad([...new Array(6).fill(10), -4, -4, ...new Array(6).fill(6)])),
    );
    expect(large).toHaveLength(1);
    expect(large[0].startDistanceKm).toBe(0);
  });

  it("splits on a long shallow dip, however little it drops", () => {
    // 2 m per kilometre for four kilometres: 8 m total, inside the depth
    // tolerance, but four segments is past the two-segment cap. This is the
    // case koenig-ludwig-marathon lost a real climb to before the cap existed.
    const hills = courseHills(
      fromDeltas(
        pad([
          ...new Array(6).fill(10),
          -2,
          -2,
          -2,
          -2,
          ...new Array(6).fill(10),
        ]),
      ),
    );
    expect(hills).toHaveLength(2);
  });

  it("drops a run that trims away entirely, with no NaN behind it", () => {
    // A half-metre rise over two kilometres: both segments cost under the trim
    // floor, so nothing is left to divide a gradient by.
    const hills = courseHills(fromDeltas(pad([0.25, 0.25]), 50));
    expect(hills).toEqual([]);
  });

  it("treats the 0.195 km finish stub as the real segment it is", () => {
    // Gradient is amplified ~5x over that span, so a small bump at the line is
    // steep but cheap, and stays under the floors.
    const small = flat44();
    small[43] = 60;
    expect(courseHills(small)).toEqual([]);

    // A real finish-line ramp is a hill, and it reaches the finish.
    const big = flat44();
    big[43] = 90;
    const hills = courseHills(big);
    expect(hills).toHaveLength(1);
    expect(hills[0].endDistanceKm).toBe(MARATHON_KM);
    expect(hills[0].riseM).toBeCloseTo(40, 6);
  });

  it("rejects anything that isn't 44 finite numbers", () => {
    expect(() => courseHills(new Array(43).fill(0))).toThrow();
    const bad = flat44();
    bad[7] = Number.NaN;
    expect(() => courseHills(bad)).toThrow();
  });
});

describe("costProfile", () => {
  it("returns one number per split row in each unit", () => {
    expect(costProfile(flat44(), "km")).toHaveLength(43);
    expect(costProfile(flat44(), "miles")).toHaveLength(27);
  });

  it("costs a flat course nothing at all", () => {
    expect(costProfile(flat44(), "km").every((x) => x === 0)).toBe(true);
  });

  // The property that lets the chart and the cards be read as one claim: the
  // bars under a shaded band add up to the cost of the climb that band marks.
  // (The cards no longer print that figure, but `hillCostSeconds` and the
  // detector's own floors are built from it, so it still has to be true.) If
  // this ever drifts, the chart and the detector are telling two different
  // stories about the same climb.
  it("sums over a climb's own segments to exactly that climb's cost", () => {
    for (const slug of allCourseSlugsOnDisk()) {
      const elevations = loadGeometry(slug).elevations;
      const profile = costProfile(elevations, "km");
      for (const hill of courseHills(elevations)) {
        const summed = profile
          .slice(hill.startSegmentIndex, hill.endSegmentIndex + 1)
          .reduce((a, b) => a + b, 0);
        expect(summed, `${slug} ${hill.startDistanceKm}`).toBeCloseTo(
          hill.excessKm,
          9,
        );
      }
    }
  });

  it("rejects anything that isn't 44 finite numbers", () => {
    expect(() => costProfile(new Array(43).fill(0), "km")).toThrow();
  });
});

describe("hillCostSeconds", () => {
  const hill = courseHills(fromDeltas(new Array(43).fill(10), 0))[0];

  it("is linear in the runner's flat pace", () => {
    expect(hillCostSeconds(hill, 600)).toBeCloseTo(
      2 * hillCostSeconds(hill, 300),
      9,
    );
    expect(hillCostSeconds(hill, 0)).toBe(0);
  });

  it("reproduces the threshold arithmetic at the reference pace", () => {
    expect(hillCostSeconds(hill, HILL_REFERENCE_PACE_SEC_PER_KM)).toBeCloseTo(
      hill.excessKm * HILL_REFERENCE_PACE_SEC_PER_KM,
      9,
    );
  });
});

// Over every course file on disk, offline, the way altitude.test.ts walks the
// repo rather than the seven-course fixture. Derived once and shared: 326
// courses is enough work to matter in a suite that runs on every change.
describe("the catalog", () => {
  const slugs = allCourseSlugsOnDisk();
  const byCourse = slugs.map((slug) => {
    const elevations = loadGeometry(slug).elevations;
    return { slug, hills: courseHills(elevations), elevations };
  });
  const find = (slug: string) => byCourse.find((c) => c.slug === slug);

  // Pins the fitted floors themselves, not one course — the same job
  // terrain.test.ts's band split does. No threshold in hills.ts can move
  // without this failing, which is the point: the floors were fitted over this
  // catalog and are not free to drift afterwards.
  it("shows the number of climbs the fitted floors say it should", () => {
    const counts: Record<number, number> = {};
    for (const { hills } of byCourse) {
      counts[hills.length] = (counts[hills.length] ?? 0) + 1;
    }
    expect(counts).toEqual({ 0: 148, 1: 87, 2: 69, 3: 24, 4: 11, 5: 4, 6: 1 });
  });

  // The strongest check here, because it is INDEPENDENT: terrain's profile
  // bands were fitted against findmymarathon's hand-assigned labels and know
  // nothing about this detector, which reads cost rather than gain. If the two
  // agree in ordering, the detector is finding hills and not artefacts.
  it("finds more climbs the hillier the profile band says a course is", () => {
    const avg: Record<string, number> = {};
    for (const label of [
      "veryFlat",
      "mostlyFlat",
      "rolling",
      "hilly",
      "veryHilly",
    ]) {
      const set = byCourse.filter(
        ({ elevations }) => terrainLabel(courseTerrain(elevations)) === label,
      );
      avg[label] =
        set.reduce((n, { hills }) => n + hills.length, 0) / set.length;
    }
    // Downhill is excluded on purpose: it is an override on net drop, not a
    // rung on the climbing ladder.
    expect(avg.veryFlat).toBe(0);
    expect(avg.mostlyFlat).toBeLessThan(avg.rolling);
    expect(avg.rolling).toBeLessThan(avg.hilly);
    expect(avg.hilly).toBeLessThanOrEqual(avg.veryHilly);
  });

  it("leaves no hilly or very hilly course with nothing to show", () => {
    const empty = byCourse
      .filter(({ elevations, hills }) => {
        const label = terrainLabel(courseTerrain(elevations));
        return (label === "hilly" || label === "veryHilly") && hills.length === 0;
      })
      .map(({ slug }) => slug);
    expect(empty, `hilly courses with no climbs: ${empty.join(", ")}`).toEqual(
      [],
    );
  });

  // The integrity sweep's shape: one scan, one assertion naming the offender.
  it("returns ordered, non-overlapping, finite climbs everywhere", () => {
    const bad = byCourse
      .filter(({ hills }) =>
        hills.some((h, i) => {
          const prev = hills[i - 1];
          return (
            (prev && h.startSegmentIndex <= prev.endSegmentIndex) ||
            (prev && h.startDistanceKm < prev.endDistanceKm) ||
            h.startSegmentIndex > h.endSegmentIndex ||
            h.endDistanceKm > MARATHON_KM ||
            h.riseM < HILL_MIN_RISE_M ||
            h.excessKm <= 0 ||
            ![h.lengthKm, h.riseM, h.gradient, h.excessKm].every(
              Number.isFinite,
            )
          );
        }),
      )
      .map(({ slug }) => slug);
    expect(bad, `courses with unusable climbs: ${bad.join(", ")}`).toEqual([]);
  });

  // The panel reads its paces through this mapping, so it has to reproduce the
  // detector's own segment indices exactly in the unit the detector works in.
  it("maps every climb back to its own km rows", () => {
    const bad: string[] = [];
    for (const { slug, hills } of byCourse) {
      for (const h of hills) {
        const range = rowRangeForDistanceRange(
          h.startDistanceKm,
          h.endDistanceKm,
          "km",
          43,
        );
        if (
          !range ||
          range[0] !== h.startSegmentIndex ||
          range[1] !== h.endSegmentIndex
        ) {
          bad.push(`${slug} ${h.startDistanceKm}-${h.endDistanceKm}`);
        }
      }
    }
    expect(bad, `climbs whose rows do not line up: ${bad.join(", ")}`).toEqual(
      [],
    );
  });

  // Face validity, in the vocabulary a runner would use. Containment and
  // inequalities rather than exact indices, so a reseed that shifts a course by
  // a kilometre does not fail a test about whether Newton exists.
  it("names the climbs a runner would name, and stays quiet on the flat ones", () => {
    const boston = find("boston");
    if (boston) {
      const newton = boston.hills.find(
        (h) => h.startDistanceKm <= 32 && h.endDistanceKm >= 32,
      );
      expect(newton).toBeDefined();
      expect(newton!.riseM).toBeGreaterThan(25);
    }

    const bigSur = find("big-sur-marathon");
    if (bigSur) {
      const worst = bigSur.hills.reduce((a, b) =>
        b.excessKm > a.excessKm ? b : a,
      );
      // Hurricane Point.
      expect(worst.startDistanceKm).toBeLessThanOrEqual(17);
      expect(worst.endDistanceKm).toBeGreaterThanOrEqual(17);
      expect(worst.gradient).toBeGreaterThan(0.03);
    }

    const pikes = find("pikes-peak-marathon");
    if (pikes) {
      expect(pikes.hills).toHaveLength(1);
      expect(pikes.hills[0].startDistanceKm).toBe(0);
      expect(pikes.hills[0].riseM).toBeGreaterThan(2000);
    }

    // Flat and net-downhill courses print nothing rather than three small ones.
    for (const slug of [
      "chicago",
      "berlin",
      "london",
      "tokyo",
      "revel-mt-charleston-marathon",
    ]) {
      const course = find(slug);
      if (!course) continue;
      expect(course.hills, `${slug} should have no named climbs`).toEqual([]);
    }
  });
});
