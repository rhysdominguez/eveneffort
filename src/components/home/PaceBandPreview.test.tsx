import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { PaceBandPreview } from "./PaceBandPreview";
import { PaceBand } from "@/components/PaceBand";
import { demoResult } from "./demoResult";

// The point of the preview is that it is the PRINTED band, enlarged — not a
// separate component that resembles it. These assertions pin that: both render
// the same paceband-* structure, so a change to the printed strip cannot leave
// the marketing preview showing a band we no longer produce.
describe("PaceBandPreview", () => {
  it("renders the same strip structure as the printed band", () => {
    const { container: preview } = render(<PaceBandPreview />);
    const { container: printed } = render(
      <PaceBand result={demoResult} courseName="Boston Marathon" />,
    );

    for (const cls of [
      ".paceband-strip",
      ".paceband-bar",
      ".paceband-course",
      ".paceband-head",
      ".paceband-row",
      ".paceband-gelcell",
    ]) {
      expect(preview.querySelector(cls), `preview ${cls}`).not.toBeNull();
      expect(printed.querySelector(cls), `printed ${cls}`).not.toBeNull();
    }
  });

  it("is scoped so the screen geometry applies and print never sees it", () => {
    const { container } = render(<PaceBandPreview />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("paceband-preview");
    expect(root.className).toContain("print:hidden");
  });

  it("shows a partial strip and says so", () => {
    const { container } = render(<PaceBandPreview />);
    // Fewer rows than the full race, so the note is load-bearing rather than
    // decorative — without it the strip reads as a band that stops early.
    const rows = container.querySelectorAll(".paceband-row");
    expect(rows.length).toBeLessThan(demoResult.rows.length);
    expect(container.querySelector(".paceband-note")?.textContent).toContain(
      "26.2",
    );
  });

  it("keeps the gel droplet, so the fueling column reads as it prints", () => {
    const { container } = render(<PaceBandPreview />);
    expect(container.querySelector(".paceband-gel")).not.toBeNull();
    expect(container.textContent).toContain("Take gel");
  });
});
