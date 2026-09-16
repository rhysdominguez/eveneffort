import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The course-profile ramp's numbers, enforced instead of merely claimed.
//
// DESIGN.md states that every stop clears WCAG AA as pill text and that the six
// are distinct and ordered. Those are the two things that went wrong before:
// the ramp first shipped with Mostly Flat and Rolling Hills sharing a colour,
// and findmymarathon's own hexes — the obvious thing to copy, and what a future
// "make it match their site exactly" pass would reach for — fail AA outright
// (#ff7800 is 2.65:1 on white). Prose does not stop either. This does.
//
// It reads globals.css off disk, so it needs no browser and no database.

const CSS = readFileSync(
  join(process.cwd(), "src/app/globals.css"),
  "utf8",
);

function token(name: string): string {
  const match = CSS.match(
    new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`),
  );
  if (!match) throw new Error(`--color-${name} is not defined in globals.css`);
  return match[1].toUpperCase();
}

const channels = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

const linearise = (c: number) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;

const luminance = (hex: string) => {
  const [r, g, b] = channels(hex).map(linearise);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** WCAG 2.1 contrast ratio between two opaque colours. */
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** CIELAB hue angle in degrees — how "green" or "red" a colour reads. */
const hueAngle = (hex: string) => {
  const [r, g, b] = channels(hex).map(linearise);
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  const angle =
    (Math.atan2(200 * (y - z), 500 * (x - y)) * 180) / Math.PI;
  return angle < 0 ? angle + 360 : angle;
};

// Fastest → hardest, the order `TERRAIN_ORDER` and `PROFILE_COLOR` both use.
const RAMP = [
  "green-primary", // Downhill
  "lime-primary", //  Very Flat
  "gold-primary", //  Mostly Flat
  "orange-primary", // Rolling Hills
  "red-primary", //   Hilly
  "red-deep", //      Very Hilly
] as const;

describe("course-profile colour ramp", () => {
  it("defines all six stops", () => {
    for (const name of RAMP) {
      expect(token(name)).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it("gives no two profiles the same colour", () => {
    const values = RAMP.map(token);
    expect(new Set(values).size).toBe(RAMP.length);
  });

  it("clears WCAG AA as pill text on white and on the elevated surface", () => {
    // 4.5:1 is the AA floor for text under 18pt; the pill is 12px.
    for (const name of RAMP) {
      const hex = token(name);
      expect(contrast(hex, token("bg-page"))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(hex, token("bg-elevated"))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("sweeps hue monotonically from green to red", () => {
    // This is what makes it a ramp rather than six unrelated accents: hue falls
    // at every step (147° → 124° → 70° → 47° → 35° → 32°). A new stop that
    // breaks the order would still pass every test above.
    const hues = RAMP.map((name) => hueAngle(token(name)));
    for (let i = 1; i < hues.length; i++) {
      expect(hues[i]).toBeLessThan(hues[i - 1]);
    }
  });

  it("gets darker as the course gets harder at the red end", () => {
    // Hilly and Very Hilly are one hue apart (35° and 32°), so lightness is the
    // only thing separating them — 6.5:1 against 10:1 on white.
    expect(contrast(token("red-deep"), token("bg-page"))).toBeGreaterThan(
      contrast(token("red-primary"), token("bg-page")),
    );
  });
});

describe("light mode only", () => {
  it("has no dark-mode block in globals.css", () => {
    expect(CSS).not.toContain("prefers-color-scheme: dark");
    expect(CSS).toContain("color-scheme: light");
  });
});
