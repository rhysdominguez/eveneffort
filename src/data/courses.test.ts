import { describe, it, expect } from "vitest";
import {
  FIXTURE_COURSES,
  fixtureCourse,
  allCourseSlugsOnDisk,
  loadGeometry,
} from "./courses.fixture";
import { CITY_SEED } from "@/db/seed/cities";
import { SERIES_SEED } from "@/db/seed/series";
import { buildEditionSeed, nthWeekdayOfMonth } from "@/db/seed/editions";
import {
  PUBLISHED_COURSE_SLUGS,
  COURSE_SLUG_PATTERN,
} from "@/db/seed/slug-ledger";

// Guards the seed definitions themselves — the files a human edits when adding
// a marathon. Deliberately asserts no fixed course COUNT: adding course #8
// should extend the catalogue, not break the suite.
describe("course seed definitions", () => {
  it("gives every series a city that exists", () => {
    const citySlugs = new Set(CITY_SEED.map((c) => c.slug));
    for (const s of SERIES_SEED) {
      expect(citySlugs, `series "${s.slug}"`).toContain(s.citySlug);
    }
  });

  it("has unique slugs for cities, series and courses", () => {
    const unique = (xs: string[]) => new Set(xs).size === xs.length;
    expect(unique(CITY_SEED.map((c) => c.slug))).toBe(true);
    expect(unique(SERIES_SEED.map((s) => s.slug))).toBe(true);
    expect(unique(SERIES_SEED.map((s) => s.courseSlug))).toBe(true);
  });

  it("keeps the pre-database course slugs, so shared results URLs still resolve", () => {
    // These are printed on pacebands people have paid for. Renaming one
    // silently breaks their link — it must be a deliberate, visible change.
    const slugs = SERIES_SEED.map((s) => s.courseSlug);
    for (const legacy of [
      "berlin",
      "chicago",
      "london",
      "tokyo",
      "sydney",
      "newyork",
      "boston",
    ]) {
      expect(slugs).toContain(legacy);
    }
  });

  it("resolves geometry for every seeded series", () => {
    // Not a count comparison against SERIES_SEED: FIXTURE_COURSES is pinned to
    // the seven core courses so component tests keep a stable world, while
    // SERIES_SEED grows with every import batch. What must hold is that every
    // seeded series has its three files on disk — otherwise `npm run db:seed`
    // dies on an ENOENT partway through.
    const onDisk = new Set(allCourseSlugsOnDisk());
    for (const s of SERIES_SEED) {
      expect(onDisk, `series "${s.slug}"`).toContain(s.courseSlug);
      expect(loadGeometry(s.courseSlug).elevations).toHaveLength(44);
    }
  });

  it("has no orphaned geometry on disk", () => {
    // Catches a GPX that got parsed but whose seed entry was never written —
    // otherwise the files sit there looking imported and never reach the app.
    const seeded = new Set(SERIES_SEED.map((s) => s.courseSlug));
    const orphans = allCourseSlugsOnDisk().filter((slug) => !seeded.has(slug));
    expect(orphans, "geometry with no series in SERIES_SEED").toEqual([]);
  });

  it("derives each core fixture's start line from coords[0]", () => {
    // The seed denormalises coords[0] into course.start_lat/start_lon.
    for (const c of FIXTURE_COURSES) {
      expect(c.start.lat, c.id).toBe(c.coords[0][0]);
      expect(c.start.lon, c.id).toBe(c.coords[0][1]);
    }
  });

  it("gives every city a valid ISO country code and IANA timezone", () => {
    for (const c of CITY_SEED) {
      expect(c.countryCode, c.slug).toMatch(/^[A-Z]{2}$/);
      // Throws on an unknown zone, which is the assertion.
      expect(() =>
        new Intl.DateTimeFormat("en-US", { timeZone: c.timezone }).format(
          new Date(),
        ),
      ).not.toThrow();
    }
  });

  it("puts every city's map pin at plausible coordinates", () => {
    for (const c of CITY_SEED) {
      expect(Math.abs(c.latitude), c.slug).toBeLessThanOrEqual(90);
      expect(Math.abs(c.longitude), c.slug).toBeLessThanOrEqual(180);
      expect(c.latitude === 0 && c.longitude === 0).toBe(false);
    }
  });

  // Rule 8, mechanised. See src/db/seed/slug-ledger.ts for why.
  describe("published course slug ledger", () => {
    it("has a ledger entry for every seeded course", () => {
      const ledger = new Set(PUBLISHED_COURSE_SLUGS);
      const unsigned = SERIES_SEED.map((s) => s.courseSlug).filter(
        (slug) => !ledger.has(slug),
      );
      expect(
        unsigned,
        "new course slugs are permanent — add them to PUBLISHED_COURSE_SLUGS deliberately",
      ).toEqual([]);
    });

    it("still seeds every slug it has already published", () => {
      // A slug vanishing from SERIES_SEED means a paceband link that used to
      // resolve now 404s. If the removal is genuinely intended, the ledger
      // comment explains what to do — but it must never happen by accident.
      const seeded = new Set(SERIES_SEED.map((s) => s.courseSlug));
      const broken = PUBLISHED_COURSE_SLUGS.filter((slug) => !seeded.has(slug));
      expect(
        broken,
        "these slugs were published and are now unreachable — shared /results links for them are broken",
      ).toEqual([]);
    });

    it("lists each slug once, in the permitted shape", () => {
      expect(new Set(PUBLISHED_COURSE_SLUGS).size).toBe(
        PUBLISHED_COURSE_SLUGS.length,
      );
      for (const slug of PUBLISHED_COURSE_SLUGS) {
        expect(slug, `slug "${slug}"`).toMatch(COURSE_SLUG_PATTERN);
      }
    });
  });

  it("fixtureCourse throws on an unknown slug", () => {
    expect(() => fixtureCourse("paris")).toThrow(
      "Unknown course fixture: paris",
    );
  });
});

describe("edition recurrence", () => {
  it("resolves the nth weekday of a month", () => {
    // Patriots' Day 2026 — third Monday of April.
    expect(nthWeekdayOfMonth(2026, 4, 1, 3)).toBe("2026-04-20");
    // Last Sunday of September 2026.
    expect(nthWeekdayOfMonth(2026, 9, 0, -1)).toBe("2026-09-27");
    // First Sunday of November 2026.
    expect(nthWeekdayOfMonth(2026, 11, 0, 1)).toBe("2026-11-01");
  });

  it("builds at least one edition per series per year, with a unique slug", () => {
    // Not exactly slugs.length * years.length: a series can have more than
    // one confirmed edition in a year (London 2027's two-day event), which
    // is exactly what the schema's unique(seriesId, raceDate) constraint —
    // relaxed from unique(seriesId, year) — exists to allow.
    const slugs = SERIES_SEED.map((s) => s.slug);
    const editions = buildEditionSeed(slugs, [2026, 2027]);
    expect(editions.length).toBeGreaterThanOrEqual(slugs.length * 2);
    expect(new Set(editions.map((e) => e.slug)).size).toBe(editions.length);
  });

  it("gives london-marathon two confirmed 2027 editions, on different dates", () => {
    const editions = buildEditionSeed(["london-marathon"], [2027]);
    const london2027 = editions.filter((e) => e.year === 2027);
    expect(london2027).toHaveLength(2);
    expect(london2027.every((e) => e.dateConfidence === "confirmed")).toBe(
      true,
    );
    expect(new Set(london2027.map((e) => e.raceDate)).size).toBe(2);
    // Both rows share a series + year but differ on the column the unique
    // constraint now keys on.
    expect(new Set(london2027.map((e) => e.seriesSlug)).size).toBe(1);
  });

  it("emits ISO dates whose year matches the edition year", () => {
    for (const e of buildEditionSeed(SERIES_SEED.map((s) => s.slug))) {
      expect(e.raceDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(e.raceDate.slice(0, 4)).toBe(String(e.year));
    }
  });

  it("marks unconfirmed dates as estimated rather than passing them off as fact", () => {
    for (const e of buildEditionSeed(SERIES_SEED.map((s) => s.slug))) {
      expect(["confirmed", "estimated", "tbd"]).toContain(e.dateConfidence);
    }
  });

  it("throws for a series with no recurrence rule", () => {
    expect(() => buildEditionSeed(["nonexistent-marathon"])).toThrow(
      /No recurrence rule/,
    );
  });
});
