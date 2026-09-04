// The disclosure band on an uploaded course's results page. Both facts it
// carries are ones a runner can be materially misled without: whether the
// elevation was measured or modelled, and when their only link stops working.
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

import { UploadedCourseNotice } from "./UploadedCourseNotice";

describe("UploadedCourseNotice", () => {
  it("discloses modelled elevation, naming the dataset", () => {
    const { container } = render(
      <UploadedCourseNotice elevationSource="dem:srtm30m" expiresAtISO={null} />,
    );
    expect(container.textContent).toContain("terrain model");
    expect(container.textContent).toContain("srtm30m");
    // The distinction that matters: it reads the ground, not the road.
    expect(container.textContent).toMatch(/bridges/i);
  });

  it("says nothing about terrain models when the file carried real elevation", () => {
    const { container } = render(
      <UploadedCourseNotice elevationSource="gpx" expiresAtISO={null} />,
    );
    expect(container.textContent).not.toContain("terrain model");
  });

  it("gives the expiry date and how to keep the course", () => {
    const { container } = render(
      <UploadedCourseNotice elevationSource="gpx" expiresAtISO="2026-12-03T00:00:00Z" />,
    );
    expect(container.textContent).toContain("2026");
    expect(container.textContent).toMatch(/paceband/i);
  });

  it("says a paid course is permanent rather than showing a date", () => {
    const { container } = render(
      <UploadedCourseNotice elevationSource="gpx" expiresAtISO={null} />,
    );
    expect(container.textContent).toMatch(/saved permanently/i);
  });

  it("never prints on the paceband", () => {
    const { container } = render(
      <UploadedCourseNotice elevationSource="gpx" expiresAtISO={null} />,
    );
    expect(container.querySelector("aside")?.className).toContain("print:hidden");
  });
});
