import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { DifficultyBadge } from "./DifficultyBadge";
import { courseTerrain } from "@/lib/pacing/terrain";
import { loadGeometry } from "@/data/courses.fixture";
import type { CourseTerrain } from "@/types";

const terrain = (gainM: number, netM = 0): CourseTerrain => ({
  gainM,
  lossM: gainM - netM,
  netM,
});

const text = (t: CourseTerrain) =>
  render(<DifficultyBadge terrain={t} />).container.textContent ?? "";

describe("DifficultyBadge", () => {
  it("names the band for each level of climbing", () => {
    expect(text(terrain(20))).toContain("Flat");
    expect(text(terrain(96))).toContain("Rolling");
    expect(text(terrain(270))).toContain("Hilly");
    expect(text(terrain(2350))).toContain("Mountainous");
  });

  it("shows the climbing in feet, and hides it when compact", () => {
    // 96 m ≈ 315 ft.
    expect(text(terrain(96))).toContain("315 ft up");
    const compact = render(
      <DifficultyBadge terrain={terrain(96)} compact />,
    ).container.textContent;
    expect(compact).toContain("Rolling");
    expect(compact).not.toContain("ft up");
  });

  it("adds the net-drop pill only for a course that finishes materially lower", () => {
    expect(text(terrain(50, -5))).not.toContain("net");
    expect(text(terrain(50, -99))).not.toContain("net");
    // 133 m ≈ 436 ft.
    expect(text(terrain(96, -133))).toContain("−436 ft net");
    // A net CLIMB is never dressed up as a drop.
    expect(text(terrain(400, 300))).not.toContain("net");
  });

  it("shows both pills for a course that is hilly AND net downhill", () => {
    const both = text(terrain(600, -1000));
    expect(both).toContain("Mountainous");
    expect(both).toContain("net");
  });

  it("renders the real Boston profile as rolling with its net drop", () => {
    const boston = text(courseTerrain(loadGeometry("boston").elevations));
    expect(boston).toContain("Rolling");
    expect(boston).toContain("315 ft up");
    expect(boston).toContain("−436 ft net");
  });

  // Rule 2: tokens only. A hex literal or a zinc-*/red-* utility here would be
  // invisible in review and would fork the palette.
  it("uses design tokens for every color", () => {
    const { container } = render(<DifficultyBadge terrain={terrain(600, -1000)} />);
    const html = container.innerHTML;
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/);
    expect(html).not.toMatch(/\b(?:bg|text|border)-(?:zinc|gray|red|green)-\d/);
    expect(html).not.toContain("dark:");
  });
});
