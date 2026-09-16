import { describe, it, expect } from "vitest";
import {
  formatAltitudePenalty,
  formatVsFlat,
  totalEffortMultiplier,
  FLAT_EQUIVALENT_BAND,
} from "./effort";
import { effortMultiplier } from "@/lib/pacing/effort";

// Moved here with the function when /compare became its second consumer.
describe("formatVsFlat", () => {
  it("reads as a percentage either side of flat", () => {
    expect(formatVsFlat(1.071)).toBe("7.1% harder");
    expect(formatVsFlat(0.938)).toBe("6.2% faster");
  });

  it("declines to quote a difference smaller than the data supports", () => {
    // Half a percent is inside the noise of how a course was digitized.
    expect(formatVsFlat(1.002)).toBe("flat-equivalent");
    expect(formatVsFlat(0.999)).toBe("flat-equivalent");
  });

  it("says nothing at all about a perfectly flat course", () => {
    expect(formatVsFlat(1)).toBe("flat-equivalent");
  });

  it("starts quoting a figure once clear of the band, in both directions", () => {
    // Deliberately not asserted AT the band: (1.005 - 1) * 100 is
    // 0.4999999999999449 in binary floating point, so an exact-edge test would
    // be pinning float noise rather than the rule.
    const clear = (FLAT_EQUIVALENT_BAND + 0.1) / 100;
    expect(formatVsFlat(1 + clear)).toBe("0.6% harder");
    expect(formatVsFlat(1 - clear)).toBe("0.6% faster");
  });
});

describe("totalEffortMultiplier", () => {
  const sea = { meanM: 0, maxM: 0, multiplier: 1 };

  // 41.7 flat-equivalent km against 42.195 is ~1.2% easier than flat.
  const easyGrades = { km: 41.7, miles: 25.9 };

  it("is the grade multiplier alone at sea level", () => {
    expect(
      totalEffortMultiplier({ effort: easyGrades, altitude: sea }),
    ).toBeCloseTo(effortMultiplier(easyGrades), 12);
  });

  it("multiplies the two costs together", () => {
    const high = { meanM: 2000, maxM: 2100, multiplier: 1.07 };
    expect(
      totalEffortMultiplier({ effort: easyGrades, altitude: high }),
    ).toBeCloseTo(effortMultiplier(easyGrades) * 1.07, 12);
  });

  it("can turn a course that is easy on grade into a hard one overall", () => {
    // The case that justifies the whole feature: a net-downhill course at
    // altitude reads FASTER than flat on geometry alone and slower once the
    // air is counted. Leadville and Pikes Peak are both this shape.
    const high = { meanM: 3400, maxM: 4000, multiplier: 1.18 };
    expect(effortMultiplier(easyGrades)).toBeLessThan(1);
    expect(
      totalEffortMultiplier({ effort: easyGrades, altitude: high }),
    ).toBeGreaterThan(1);
  });
});

describe("formatAltitudePenalty", () => {
  it("is null below the dead band, so low courses say nothing", () => {
    expect(formatAltitudePenalty({ meanM: 0, maxM: 0, multiplier: 1 })).toBeNull();
    expect(
      formatAltitudePenalty({ meanM: 900, maxM: 980, multiplier: 1.002 }),
    ).toBeNull();
  });

  it("words a real penalty", () => {
    expect(
      formatAltitudePenalty({ meanM: 1618, maxM: 1687, multiplier: 1.0412 }),
    ).toBe("4.1% slower");
  });
});
