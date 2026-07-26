import { describe, it, expect } from "vitest";
import { toSeconds, formatHMS } from "./time";

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
