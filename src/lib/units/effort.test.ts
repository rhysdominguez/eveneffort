import { describe, it, expect } from "vitest";
import { formatVsFlat, FLAT_EQUIVALENT_BAND } from "./effort";

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
