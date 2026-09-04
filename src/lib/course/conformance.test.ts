// THE PROOF THAT THE TYPESCRIPT RESAMPLER IS THE PYTHON ONE.
//
// resample.ts is a hand port of scripts/gpx_parser/parse_gpx.py, kept because
// the upload route (ROADMAP #10) cannot shell out to Python on Vercel while the
// seeded catalog is still built by the script. Two implementations of one
// algorithm drift unless something forces them not to; this is that something.
//
// Each case re-derives a real committed course from its committed source GPX
// and asserts the three arrays are BYTE-IDENTICAL to the JSON the Python wrote.
// Not "close" — identical, including the 1/4/6 dp rounding, which is why
// roundHalfEven exists at all.
//
// A failure here means the port is wrong. Fix resample.ts. Never edit the
// committed course data and never loosen an assertion to make this pass: the
// JSON is what 326 seeded courses actually serve, and the source GPX is what
// produced it.
//
// Offline by construction (CLAUDE.md Rule 9) — everything read is in the repo.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { parseRouteFile } from "./routeFile.ts";
import { resampleCourse } from "./resample.ts";

const GPX_DIR = join(process.cwd(), "data", "gpx_sources");
const COURSE_DIR = join(process.cwd(), "src", "data", "courses");

/**
 * Chosen for coverage of the failure modes, not for being representative.
 * Each one is here because it can break a different part of the port.
 */
const CASES: { slug: string; why: string }[] = [
  { slug: "berlin", why: "the reference flat city course" },
  { slug: "boston", why: "net downhill with real climbing — the rolling case" },
  { slug: "london", why: "dense urban track" },
  { slug: "tokyo", why: "a second dense urban track, different exporter" },
  { slug: "sydney", why: "a large max_step (653 m) that must still pass" },
  { slug: "newyork", why: "bridges — the biggest elevation discontinuities" },
  { slug: "chicago", why: "the largest legitimate max_step in the catalog (1602 m)" },
  { slug: "gothenburg-marathon", why: "4193 points — the 4 dp profile collision" },
  { slug: "palma-marathon", why: "43.521 km — hard against the distance ceiling" },
  { slug: "riyadh-marathon", why: "43.519 km — the other course 43.6 exists for" },
  { slug: "revel-mt-charleston-marathon", why: "-1549 m, the extreme descent" },
  { slug: "pikes-peak-marathon", why: "+2350 m, the extreme climb" },
];

function readJson(name: string): unknown {
  return JSON.parse(readFileSync(join(COURSE_DIR, name), "utf8"));
}

describe("resampleCourse reproduces parse_gpx.py exactly", () => {
  for (const { slug, why } of CASES) {
    it(`${slug} — ${why}`, () => {
      const route = parseRouteFile(readFileSync(join(GPX_DIR, `${slug}.gpx`)), `${slug}.gpx`);
      const got = resampleCourse(route.points);

      expect(got.elevations).toEqual(readJson(`${slug}.json`));
      expect(got.coords).toEqual(readJson(`${slug}.coords.json`));
      expect(got.profile).toEqual(readJson(`${slug}.profile.json`));
    });
  }
});
