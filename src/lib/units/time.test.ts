import { describe, it, expect } from "vitest";
import { toSeconds, formatGap, formatHMS, formatSignedHMS } from "./time";

describe("toSeconds", () => {
  it("converts 4:00:00 to 14400", () => {
    expect(toSeconds({ hours: 4, minutes: 0, seconds: 0 })).toBe(14400);
  });
  it("converts 3:30:15 to 12615", () => {
    expect(toSeconds({ hours: 3, minutes: 30, seconds: 15 })).toBe(12615);
  });
  it("converts 0:00:00 to 0", () => {
    expect(toSeconds({ hours: 0, minutes: 0, seconds: 0 })).toBe(0);
  });
});

describe("formatHMS", () => {
  it("formats 5430 as 1:30:30", () => {
    expect(formatHMS(5430)).toBe("1:30:30");
  });
  it("zero-pads minutes and seconds", () => {
    expect(formatHMS(3605)).toBe("1:00:05");
  });
  it("rounds to the nearest second", () => {
    expect(formatHMS(59.6)).toBe("0:01:00");
  });
});

describe("formatSignedHMS", () => {
  it("signs both directions with a true minus", () => {
    expect(formatSignedHMS(322)).toBe("+5:22");
    expect(formatSignedHMS(-322)).toBe("−5:22");
    // U+2212, not a hyphen — the same character formatSignedFeet uses.
    expect(formatSignedHMS(-322).charCodeAt(0)).toBe(0x2212);
  });

  it("drops a zero hour but keeps a real one", () => {
    expect(formatSignedHMS(-62)).toBe("−1:02");
    expect(formatSignedHMS(3862)).toBe("+1:04:22");
  });

  it("zero-pads minutes only once there is an hour to separate them from", () => {
    expect(formatSignedHMS(305)).toBe("+5:05");
    expect(formatSignedHMS(3605)).toBe("+1:00:05");
  });

  it("renders an em dash rather than a signed zero", () => {
    expect(formatSignedHMS(0)).toBe("—");
    expect(formatSignedHMS(0.4)).toBe("—");
    expect(formatSignedHMS(-0.4)).toBe("—");
  });

  it("rounds to the nearest second", () => {
    expect(formatSignedHMS(59.6)).toBe("+1:00");
  });
});

describe("formatGap", () => {
  it("renders a sub-hour gap as M:SS, without a leading hour", () => {
    expect(formatGap(134)).toBe("2:14");
    expect(formatGap(59)).toBe("0:59");
    expect(formatGap(0)).toBe("0:00");
    expect(formatGap(600)).toBe("10:00");
  });

  it("falls back to H:MM:SS once the gap passes an hour", () => {
    expect(formatGap(3600)).toBe("1:00:00");
    expect(formatGap(3661)).toBe("1:01:01");
  });

  it("always reports a magnitude — the caller owns the direction", () => {
    expect(formatGap(-134)).toBe("2:14");
  });

  it("rounds to the nearest second, as formatHMS does", () => {
    expect(formatGap(134.4)).toBe("2:14");
    expect(formatGap(134.6)).toBe("2:15");
  });
});
