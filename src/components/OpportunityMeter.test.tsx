import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { OpportunityMeter } from "./OpportunityMeter";
import fs from "node:fs";
import path from "node:path";
import { computeImpact } from "@/lib/pacing/impact";
import {
  OPPORTUNITY_BANDS,
  OPPORTUNITY_BAND_CENTERS,
  OPPORTUNITY_ORDER,
  opportunityScore,
} from "@/lib/pacing/opportunity";

// Guards what the bar SHOWS: the marker lands where the score says, the verdict
// is a word rather than a repeat of the percentage, the gradient is never the
// only carrier of the reading, and the colour is spent once.

/** A breakdown whose total is exactly `percent`, carried on the wind factor. */
const impactOf = (percent: number) =>
  computeImpact({
    cost: { km: 42.195, miles: 26.2187 },
    heatMultiplier: 1,
    humidityMultiplier: 1,
    windMultiplier: 1 + percent / 100,
    weatherApplied: true,
  });

const marker = (c: HTMLElement) =>
  c.querySelector<HTMLElement>('[data-testid="opportunity-marker"]')!;
const verdict = (c: HTMLElement) =>
  c.querySelector<HTMLElement>('[data-testid="opportunity-verdict"]')!;
const track = (c: HTMLElement) =>
  c.querySelector<HTMLElement>(".opportunity-track")!;

describe("OpportunityMeter", () => {
  it("names the band and puts the marker where the score says", () => {
    const impact = impactOf(5);
    const { container } = render(<OpportunityMeter impact={impact} />);
    expect(verdict(container).textContent).toBe("Moderate");
    const score = opportunityScore(impact.totalPercent);
    expect(marker(container).style.left).toBe(`${score}%`);
  });

  it("moves the marker left as the day gets worse", () => {
    const positions = [-8, 0, 5, 15, 30].map((p) => {
      const { container } = render(<OpportunityMeter impact={impactOf(p)} />);
      return parseFloat(marker(container).style.left);
    });
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeLessThan(positions[i - 1]);
    }
  });

  it("keeps the marker on the bar at both extremes", () => {
    for (const percent of [-80, 200]) {
      const { container } = render(<OpportunityMeter impact={impactOf(percent)} />);
      const left = parseFloat(marker(container).style.left);
      expect(left).toBeGreaterThanOrEqual(1);
      expect(left).toBeLessThanOrEqual(99);
    }
  });

  it("says the reading out loud, so the gradient is not the only carrier", () => {
    const { container } = render(<OpportunityMeter impact={impactOf(3)} />);
    const label = track(container).getAttribute("aria-label") ?? "";
    expect(label).toContain("Moderate");
    expect(label).toContain("3.0 percent");
    expect(label).toContain("cost you");
  });

  it("describes a saving as a saving rather than a cost", () => {
    const { container } = render(<OpportunityMeter impact={impactOf(-4)} />);
    const label = track(container).getAttribute("aria-label") ?? "";
    expect(label).toContain("give you back");
    expect(label).toContain("4.0 percent");
  });

  it("calls a dead-flat reading neutral rather than a zero cost", () => {
    const { container } = render(<OpportunityMeter impact={impactOf(0)} />);
    expect(track(container).getAttribute("aria-label")).toContain(
      "Conditions are neutral",
    );
  });

  it("never prints the percentage, which the row above already carries", () => {
    const { container } = render(<OpportunityMeter impact={impactOf(6.2)} />);
    expect(container.textContent).not.toContain("%");
    expect(container.textContent).not.toContain("6.2");
  });

  it("spends the colour on the bar alone", () => {
    const { container } = render(<OpportunityMeter impact={impactOf(30)} />);
    // The verdict word and the tick stay on the neutral text token, whatever
    // the reading. Tinting them too is the change this test exists to catch.
    expect(verdict(container).className).toContain(
      "text-[var(--color-text-primary)]",
    );
    expect(marker(container).className).toContain(
      "bg-[var(--color-text-primary)]",
    );
    // Position is the only thing allowed inline, and it is geometry.
    const inline = marker(container).style;
    expect(inline.length).toBe(1);
    expect(inline.item(0)).toBe("left");
  });

  it("takes its gradient from the stylesheet, not from an inline colour", () => {
    const { container } = render(<OpportunityMeter impact={impactOf(0)} />);
    const el = track(container);
    expect(el.className).toContain("opportunity-track");
    expect(el.getAttribute("style")).toBeNull();
  });

  it("labels the three ends of the scale", () => {
    const { container } = render(<OpportunityMeter impact={impactOf(0)} />);
    const text = container.textContent ?? "";
    for (const word of ["Challenging", "Moderate", "Favorable"]) {
      expect(text).toContain(word);
    }
  });

  // The three signals a reader combines -- the word, the pixel under the tick
  // and the label beneath it -- have to change hands at the same place. They
  // did not in the first cut, and on a cool day 82% of races rendered the word
  // "Favorable" over a yellow pixel sitting under the label "Moderate". These
  // two tests are what stop that coming back.

  it("hands the gradient over exactly where the verdict changes", () => {
    const css = fs.readFileSync(
      path.join(process.cwd(), "src/app/globals.css"),
      "utf8",
    );
    const rule = css.slice(css.indexOf(".opportunity-track"));
    const stop = (token: string) => {
      const m = rule.match(new RegExp(`var\\(--color-${token}\\)\\s+([\\d.]+)%`));
      return m ? Number(m[1]) : NaN;
    };
    const favorableFloor = OPPORTUNITY_BANDS[0][1];
    const moderateFloor = OPPORTUNITY_BANDS[1][1];
    // Orange sits on the challenging/moderate edge, lime on the
    // moderate/favorable edge, so the colour family turns with the word.
    expect(stop("orange-primary")).toBeCloseTo(moderateFloor, 1);
    expect(stop("lime-primary")).toBeCloseTo(favorableFloor, 1);
  });

  it("puts each axis label over the middle of its own band", () => {
    const { container } = render(<OpportunityMeter impact={impactOf(0)} />);
    const labels = Array.from(
      container.querySelectorAll<HTMLElement>("span[style*='left']"),
    ).filter((n) => n.dataset.testid !== "opportunity-marker");
    expect(labels).toHaveLength(3);
    labels.forEach((node, i) => {
      const band = OPPORTUNITY_ORDER[i];
      expect(node.textContent).toBeTruthy();
      expect(parseFloat(node.style.left)).toBeCloseTo(
        OPPORTUNITY_BAND_CENTERS[band],
        5,
      );
    });
  });
});
