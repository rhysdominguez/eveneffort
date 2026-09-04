import { describe, it, expect } from "vitest";
import {
  BQ_CUTOFFS,
  BQ_DIVISIONS,
  BQ_MIN_AGE,
  BQ_STANDARDS,
  bandLabel,
  bqStandardBand,
  bqStandardSeconds,
} from "./standards";

const hms = (h: number, m: number) => h * 3600 + m * 60;

describe("bqStandardSeconds — the age bands", () => {
  it("has no standard below 18, because the B.A.A. accepts no time from one", () => {
    expect(bqStandardSeconds(17, "men")).toBeNull();
    expect(bqStandardBand(17)).toBeNull();
    expect(bqStandardSeconds(0, "women")).toBeNull();
  });

  it("qualifies at exactly the minimum age", () => {
    expect(bqStandardSeconds(BQ_MIN_AGE, "men")).toBe(hms(2, 55));
  });

  // Every seam is spelled out: a band lookup that is off by one year hands a
  // runner the wrong target, and the 34/35 and 79/80 edges are the two most
  // likely places for that to happen.
  it.each([
    [18, "men", hms(2, 55)],
    [34, "men", hms(2, 55)],
    [35, "men", hms(3, 0)],
    [39, "men", hms(3, 0)],
    [40, "men", hms(3, 5)],
    [44, "men", hms(3, 5)],
    [45, "men", hms(3, 15)],
    [49, "men", hms(3, 15)],
    [50, "men", hms(3, 20)],
    [54, "men", hms(3, 20)],
    [55, "men", hms(3, 30)],
    [59, "men", hms(3, 30)],
    [60, "men", hms(3, 50)],
    [64, "men", hms(3, 50)],
    [65, "men", hms(4, 5)],
    [69, "men", hms(4, 5)],
    [70, "men", hms(4, 20)],
    [74, "men", hms(4, 20)],
    [75, "men", hms(4, 35)],
    [79, "men", hms(4, 35)],
    [80, "men", hms(4, 50)],
    [99, "men", hms(4, 50)],
  ] as const)("men aged %i get %s", (age, division, expected) => {
    expect(bqStandardSeconds(age, division)).toBe(expected);
  });

  it.each([
    [18, hms(3, 25)],
    [34, hms(3, 25)],
    [35, hms(3, 30)],
    [40, hms(3, 35)],
    [45, hms(3, 45)],
    [50, hms(3, 50)],
    [55, hms(4, 0)],
    [60, hms(4, 20)],
    [65, hms(4, 35)],
    [70, hms(4, 50)],
    [75, hms(5, 5)],
    [80, hms(5, 20)],
  ])("women aged %i get %s", (age, expected) => {
    expect(bqStandardSeconds(age, "women")).toBe(expected);
  });

  it("gives the non-binary division the women's standard, as published today", () => {
    for (const band of BQ_STANDARDS) {
      expect(band.nonbinary).toBe(band.women);
    }
  });

  it("is 30 minutes easier for women than men in every band", () => {
    // Not a rule the B.A.A. states, but it holds across the whole published
    // table — so a typo in one cell shows up here rather than in production.
    for (const band of BQ_STANDARDS) {
      expect(band.women - band.men).toBe(30 * 60);
    }
  });
});

describe("BQ_STANDARDS — the table's shape", () => {
  it("covers 11 bands, ordered oldest first so first-match lookup works", () => {
    expect(BQ_STANDARDS).toHaveLength(11);
    const ages = BQ_STANDARDS.map((b) => b.minAge);
    expect(ages).toEqual([...ages].sort((a, b) => b - a));
  });

  it("leaves no gap and no overlap between consecutive bands", () => {
    for (let i = 0; i < BQ_STANDARDS.length - 1; i++) {
      const older = BQ_STANDARDS[i];
      const younger = BQ_STANDARDS[i + 1];
      expect(younger.maxAge).toBe(older.minAge - 1);
    }
    expect(BQ_STANDARDS[0].maxAge).toBeNull();
    expect(BQ_STANDARDS[BQ_STANDARDS.length - 1].minAge).toBe(BQ_MIN_AGE);
  });

  it("never gets harder with age, in any division", () => {
    for (const division of BQ_DIVISIONS) {
      for (let i = 0; i < BQ_STANDARDS.length - 1; i++) {
        // Ordered oldest first, so the older band's standard is the slower one.
        expect(BQ_STANDARDS[i][division]).toBeGreaterThan(
          BQ_STANDARDS[i + 1][division],
        );
      }
    }
  });
});

describe("bandLabel", () => {
  it("renders a closed band as a range and the top band as open-ended", () => {
    expect(bandLabel(BQ_STANDARDS[BQ_STANDARDS.length - 1])).toBe("18–34");
    expect(bandLabel(BQ_STANDARDS[0])).toBe("80+");
  });
});

describe("BQ_CUTOFFS", () => {
  it("runs 2026 back to 2012, newest first", () => {
    expect(BQ_CUTOFFS[0].year).toBe(2026);
    expect(BQ_CUTOFFS[BQ_CUTOFFS.length - 1].year).toBe(2012);
    const years = BQ_CUTOFFS.map((c) => c.year);
    expect(years).toEqual([...years].sort((a, b) => b - a));
  });

  it("holds only non-negative buffers", () => {
    // A zero is meaningful — every qualifier who applied got in that year — but
    // a negative one would mean the standard itself moved, which this cannot say.
    expect(BQ_CUTOFFS.every((c) => c.seconds >= 0)).toBe(true);
  });

  it("records the three years that matter most for the recent picture", () => {
    const by = (year: number) => BQ_CUTOFFS.find((c) => c.year === year)?.seconds;
    expect(by(2026)).toBe(4 * 60 + 34);
    expect(by(2025)).toBe(6 * 60 + 51);
    expect(by(2024)).toBe(5 * 60 + 29);
  });
});
