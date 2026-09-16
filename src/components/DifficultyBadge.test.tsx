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

const html = (t: CourseTerrain) =>
  render(<DifficultyBadge terrain={t} />).container.innerHTML;

describe("DifficultyBadge", () => {
  it("names the profile for each level of climbing", () => {
    expect(text(terrain(10))).toContain("Very Flat");
    expect(text(terrain(50))).toContain("Mostly Flat");
    expect(text(terrain(96))).toContain("Rolling Hills");
    expect(text(terrain(270))).toContain("Hilly");
    expect(text(terrain(2350))).toContain("Very Hilly");
  });

  it("shows the net change in feet, and hides the figure when compact", () => {
    // −40 m ≈ −131 ft.
    expect(text(terrain(96, -40))).toContain("−131 ft net");
    // A net climb reads as a plus.
    expect(text(terrain(96, 30))).toContain("+98 ft net");
    const compact = render(
      <DifficultyBadge terrain={terrain(96, -40)} compact />,
    ).container.textContent;
    expect(compact).toContain("Rolling Hills");
    expect(compact).not.toContain("net");
  });

  it("reports a near-zero net for a loop course that returns to its start", () => {
    expect(text(terrain(258, 1))).toContain("Hilly");
    expect(text(terrain(258, 1))).toContain("+3 ft net");
  });

  it("calls a flat course with a big drop Downhill, and still shows the drop", () => {
    const revel = text(terrain(8, -1541));
    expect(revel).toContain("Downhill");
    expect(revel).toContain("−5056 ft net");
  });

  it("keeps the hill label on a course that is hilly AND net downhill", () => {
    const both = text(terrain(600, -1000));
    expect(both).toContain("Very Hilly");
    expect(both).not.toContain("Downhill");
    expect(both).toContain("−3281 ft net");
  });

  // The six-stop ramp adopted with findmymarathon's taxonomy. It is a ramp,
  // which DESIGN.md forbade until 2026-09-08 — see the file header and the
  // "What NOT to do" section, which now argues the current position.
  //
  // ONE STOP PER PROFILE IS THE POINT. It shipped as three tiers that morning,
  // which gave Mostly Flat and Rolling Hills the same pill — 238 of 326 courses
  // coloured identically. A test that only checked "hilly is red" would not
  // have caught that, so this one asserts all six are DISTINCT.
  const RAMP: readonly [CourseTerrain, string][] = [
    [terrain(8, -1541), "--color-green-primary"], // Downhill
    [terrain(10), "--color-lime-primary"], //         Very Flat
    [terrain(50), "--color-gold-primary"], //         Mostly Flat
    [terrain(96), "--color-orange-primary"], //       Rolling Hills
    [terrain(270, -50), "--color-red-primary"], //    Hilly
    [terrain(2350, -50), "--color-red-deep"], //      Very Hilly
  ];

  it("gives every profile its own ramp stop, and leaves the net pill neutral", () => {
    expect(new Set(RAMP.map(([, token]) => token)).size).toBe(6);

    for (const [t, token] of RAMP) {
      const rendered = html(t);
      expect(rendered).toContain(token);
      // Exactly one colour per badge: the net pill never adds a second, and no
      // stop may leak a neighbour's token.
      // Match each token with its closing bracket — `--color-red-deep` and
      // `--color-red-primary` share a prefix, so a bare substring test would
      // report a false second colour.
      const used = RAMP.map(([, other]) => other).filter((other) =>
        rendered.includes(`${other})`),
      );
      expect(used).toEqual([token]);
    }
  });

  it("gives every profile its own icon, inheriting the pill colour", () => {
    // One per profile, and all six different — an icon shared by two profiles
    // is a copy-paste slip, not a design decision.
    const oneOfEach = [
      terrain(10),
      terrain(50),
      terrain(96),
      terrain(8, -1541),
      terrain(270),
      terrain(2350),
    ];
    const paths = new Set<string>();
    for (const t of oneOfEach) {
      const { container } = render(<DifficultyBadge terrain={t} />);
      const svg = container.querySelector("svg");
      expect(svg).not.toBeNull();
      // aria-hidden: the label beside it already carries the meaning.
      expect(svg!.getAttribute("aria-hidden")).toBe("true");
      expect(svg!.getAttribute("stroke")).toBe("currentColor");
      const d = container.querySelector("svg path")?.getAttribute("d");
      expect(d).toBeTruthy();
      paths.add(d!);
    }
    expect(paths.size).toBe(oneOfEach.length);
  });

  it("renders the real Boston profile as Downhill with its net drop", () => {
    const boston = text(courseTerrain(loadGeometry("boston").elevations));
    expect(boston).toContain("Downhill");
    expect(boston).toContain("−436 ft net");
  });

  // The altitude pill (ROADMAP #7). It is absent far more often than present,
  // so most of what matters here is that it stays quiet.
  describe("the altitude pill", () => {
    const high = { meanM: 2000, maxM: 2200, multiplier: 1.07 };
    const low = { meanM: 40, maxM: 80, multiplier: 1 };

    it("is absent when no altitude is supplied at all", () => {
      const { container } = render(<DifficultyBadge terrain={terrain(300)} />);
      expect(container.textContent).not.toMatch(/slower/);
    });

    it("is absent for a course below the threshold", () => {
      const { container } = render(
        <DifficultyBadge terrain={terrain(300)} altitude={low} />,
      );
      expect(container.textContent).not.toMatch(/slower/);
    });

    it("names the penalty and the mean height when it is real", () => {
      const { container } = render(
        <DifficultyBadge terrain={terrain(300)} altitude={high} />,
      );
      expect(container.textContent).toContain("7.0% slower");
      expect(container.textContent).toContain("6562 ft up");
    });

    it("stays out of the compact rows, which have their own column", () => {
      const { container } = render(
        <DifficultyBadge terrain={terrain(300)} altitude={high} compact />,
      );
      expect(container.textContent).not.toMatch(/slower/);
    });

    it("takes no colour of its own, leaving the profile pill the only one", () => {
      const { container } = render(
        <DifficultyBadge terrain={terrain(300)} altitude={high} />,
      );
      const pills = container.querySelectorAll("span > span");
      const altitudePill = Array.from(pills).find((p) =>
        p.textContent?.includes("slower"),
      );
      expect(altitudePill?.className).toContain("--color-text-secondary");
    });
  });

  // Rule 2: tokens only. A hex literal or a zinc-*/red-* utility here would be
  // invisible in review and would fork the palette.
  it("uses design tokens for every color", () => {
    const { container } = render(
      <DifficultyBadge
        terrain={terrain(600, -1000)}
        altitude={{ meanM: 2000, maxM: 2200, multiplier: 1.07 }}
      />,
    );
    const html = container.innerHTML;
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/);
    expect(html).not.toMatch(
      /\b(?:bg|text|border)-(?:zinc|gray|slate|neutral|red|green|orange|lime|yellow|amber)-\d/,
    );
    expect(html).not.toContain("dark:");
  });
});
