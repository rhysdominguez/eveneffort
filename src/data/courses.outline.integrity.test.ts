// Offline integrity check for src/data/courses/*.outline.json, the fourth
// geometry file (ROADMAP #21). Same contract as its three siblings: a corrupt
// outline has to fail in CI, with no database and no network, before it can
// reach a row.
//
// What an outline is allowed to be is looser than the 44-point array, because
// its length is genuinely course-dependent: a straight point-to-point
// simplifies to a handful of points and a twisty city loop to several hundred.
// So the assertions are about wellformedness and about COST, which is the risk
// this file actually guards: an outline that quietly grew to 200 KB would ship
// on every single-course geometry read.
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { allCourseSlugsOnDisk } from "./courses.fixture";
import { renderOutline, type Outline } from "@/lib/course/outline";

const COURSE_DIR = join(process.cwd(), "src", "data", "courses");

/**
 * Generous by design: the largest outline at the tuned tolerance is ~12 KB
 * (newcastle-marathon, one of the twistiest courses seeded). A course arriving
 * at four times that has not been simplified, and would be shipped on every
 * read of it.
 */
const MAX_BYTES = 48 * 1024;

const slugs = allCourseSlugsOnDisk();

describe("course outlines", () => {
  it("covers every course with geometry on disk", () => {
    const missing = slugs.filter(
      (slug) => !existsSync(join(COURSE_DIR, `${slug}.outline.json`)),
    );
    // Null outlines are tolerated everywhere downstream, but a SEEDED course
    // silently losing its shape is a regression, not a state to live in:
    // run `npm run build:outlines`.
    expect(missing).toEqual([]);
  });

  it.each(slugs)("%s is a wellformed, renderable outline", (slug) => {
    const path = join(COURSE_DIR, `${slug}.outline.json`);
    const raw = readFileSync(path, "utf8");
    expect(raw.length).toBeLessThan(MAX_BYTES);

    const outline = JSON.parse(raw) as Outline;
    expect(Array.isArray(outline)).toBe(true);
    // Two points is a straight line, which is a legitimate if unlikely course.
    expect(outline.length).toBeGreaterThanOrEqual(2);

    for (const point of outline) {
      expect(point).toHaveLength(2);
      const [lat, lon] = point;
      expect(Number.isFinite(lat)).toBe(true);
      expect(Number.isFinite(lon)).toBe(true);
      expect(Math.abs(lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(lon)).toBeLessThanOrEqual(180);
    }

    const rendered = renderOutline(outline, { size: 200, padding: 14 });
    expect(rendered).not.toBeNull();
    expect(rendered!.d).not.toContain("NaN");
  });

  it("starts where the 44-point coords array starts", () => {
    // The outline and coords come from the same GPX by different paths (this
    // repo's TypeScript reader and the Python parser), so a pair that starts
    // in two different places means one of the files belongs to another race.
    // 200 m of slack covers 5dp rounding and the resampler's interpolation to
    // the 0 km mark; it does not cover a wrong file.
    const drifted = slugs
      .map((slug) => {
        const outline = JSON.parse(
          readFileSync(join(COURSE_DIR, `${slug}.outline.json`), "utf8"),
        ) as Outline;
        const coords = JSON.parse(
          readFileSync(join(COURSE_DIR, `${slug}.coords.json`), "utf8"),
        ) as [number, number][];

        const [aLat, aLon] = outline[0];
        const [bLat, bLon] = coords[0];
        const metres = Math.hypot(
          (aLat - bLat) * 111_320,
          (aLon - bLon) * 111_320 * Math.cos((aLat * Math.PI) / 180),
        );
        return { slug, metres: Math.round(metres) };
      })
      .filter((r) => r.metres >= 200);

    expect(drifted).toEqual([]);
  });
});
