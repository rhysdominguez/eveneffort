import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { BqBadge, bqVerdict } from "./BqBadge";
import { bqStatus } from "@/lib/bq/qualify";
import { M_TO_FT } from "@/lib/units/elevation";
import type { CourseTerrain } from "@/types";

const hms = (h: number, m: number, s = 0) => h * 3600 + m * 60 + s;

const dropped = (dropFt: number): CourseTerrain => ({
  gainM: 0,
  lossM: 0,
  netM: -dropFt / M_TO_FT,
});

/** A 41-year-old man's standard is 3:05:00 — the anchor for every case here. */
const statusFor = (finishSeconds: number, terrain?: CourseTerrain) =>
  bqStatus({ finishSeconds, age: 41, division: "men", terrain })!;

const text = (finishSeconds: number, terrain?: CourseTerrain) =>
  render(<BqBadge status={statusFor(finishSeconds, terrain)} />).container
    .textContent ?? "";

describe("BqBadge", () => {
  it("states the buffer when the goal clears the standard", () => {
    expect(text(hms(3, 2, 46))).toContain("Boston qualifier");
    expect(text(hms(3, 2, 46))).toContain("2:14 under");
  });

  it("states the shortfall when it does not", () => {
    expect(text(hms(3, 6, 20))).toContain("Misses Boston by 1:20");
  });

  it("treats a time exactly on the standard as a qualifier", () => {
    expect(text(hms(3, 5))).toContain("Boston qualifier");
    expect(text(hms(3, 5))).toContain("0:00 under");
  });

  it("shows the downhill index as its own pill, and only when there is one", () => {
    expect(text(hms(3, 0), dropped(2000))).toContain("+5:00 downhill index");
    expect(text(hms(3, 0), dropped(4000))).toContain("+10:00 downhill index");
    expect(text(hms(3, 0), dropped(100))).not.toContain("downhill index");
  });

  it("carries the near-threshold caveat rather than asserting the index", () => {
    // Our elevation data is not accurate to 30 ft over a marathon, so a course
    // sitting on the line must not be presented as settled.
    expect(text(hms(3, 0), dropped(1520))).toContain("confirm the index");
    expect(text(hms(3, 0), dropped(2200))).not.toContain("confirm the index");
  });

  it("says a course is ineligible rather than reporting a margin on it", () => {
    const out = text(hms(2, 30), dropped(7000));
    expect(out).toContain("Not eligible for Boston qualifying");
    expect(out).not.toContain("under");
  });

  it("drops the index pill and the caveat when compact", () => {
    const compact = render(
      <BqBadge status={statusFor(hms(3, 0), dropped(1520))} compact />,
    ).container.textContent;
    expect(compact).toContain("Boston qualifier");
    expect(compact).not.toContain("downhill index");
    expect(compact).not.toContain("confirm the index");
  });

  it("exports the verdict wording so the page and the badge cannot drift", () => {
    expect(bqVerdict(statusFor(hms(3, 0)))).toBe("Boston qualifier · 5:00 under");
    expect(bqVerdict(statusFor(hms(3, 10)))).toBe("Misses Boston by 5:00");
  });

  // Rule 2: tokens only, and the badge must not invent a colour — green and red
  // here are the same two reserved meanings SummaryHeader's "vs goal" note uses.
  it("uses design tokens for every color", () => {
    for (const status of [
      statusFor(hms(3, 0), dropped(1520)),
      statusFor(hms(3, 30)),
    ]) {
      const html = render(<BqBadge status={status} />).container.innerHTML;
      expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/);
      expect(html).not.toMatch(/\b(?:bg|text|border)-(?:zinc|gray|red|green)-\d/);
      expect(html).not.toContain("dark:");
    }
  });
});
