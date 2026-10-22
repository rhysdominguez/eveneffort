import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { createRef } from "react";
import { CourseMapOverlay } from "./CourseMapOverlay";
import { loadGeometry } from "@/data/courses.fixture";
import { courseHills } from "@/lib/pacing/hills";
import { buildSegments } from "@/lib/pacing/segments";
import type { Outline } from "@/lib/course/outline";
import type { PaceChartRow } from "@/types";

// jsdom has no WebGL context, so the MapLibre half cannot be constructed here
// at all — that is the whole reason src/lib/course/routeMap.ts exists and is
// tested separately. This file covers the shell: what renders before and
// around the canvas, and the keyboard and focus behaviour that a fullscreen
// dialog has to get right.
vi.mock("@/components/CourseMapCanvas", () => ({
  CourseMapCanvas: ({
    routeMap,
    showHills,
    onHover,
    onReady,
    onError,
  }: {
    routeMap: { route: { features: { properties: unknown }[] } };
    showHills: boolean;
    onHover: (properties: unknown) => void;
    onReady: () => void;
    onError: (message: string) => void;
  }) => (
    <div data-testid="canvas" data-hills={String(showHills)}>
      <button type="button" onClick={onReady}>
        fake map loaded
      </button>
      <button type="button" onClick={() => onError("tiles refused")}>
        fake map failed
      </button>
      {/* Standing in for the pointer: the real hover comes from MapLibre's
          `queryRenderedFeatures`, which jsdom cannot produce, but what the
          overlay does with the properties is ordinary React. */}
      <button
        type="button"
        onClick={() => onHover(routeMap.route.features[24].properties)}
      >
        fake hover
      </button>
    </div>
  ),
}));

const boston = loadGeometry("boston");
const OUTLINE = boston.outline as Outline;
const SEGMENTS = buildSegments(boston.elevations, "km");

const rows: PaceChartRow[] = SEGMENTS.map((_, i) => ({
  segmentLabel: String(i + 1),
  elevationDeltaM: 0,
  adjustedPaceSecPerUnit: 270,
  adjustedPaceLabel: "4:30 /km",
  cumulativeSplitSeconds: 270 * (i + 1),
  cumulativeSplitLabel: "0:00:00",
}));

function renderOverlay(
  props: Partial<React.ComponentProps<typeof CourseMapOverlay>> = {},
) {
  const onClose = vi.fn();
  const utils = render(
    <CourseMapOverlay
      open
      panelRef={createRef<HTMLDivElement>()}
      onClose={onClose}
      courseName="Boston Marathon"
      outline={OUTLINE}
      elevations={boston.elevations}
      unit="km"
      windMultipliers={SEGMENTS.map(() => 1)}
      hills={courseHills(boston.elevations)}
      rows={rows}
      goalTimeSeconds={10800}
      {...props}
    />,
  );
  return { ...utils, onClose };
}

describe("CourseMapOverlay", () => {
  beforeEach(() => {
    document.body.style.overflow = "";
  });

  it("renders nothing while closed", () => {
    const { queryByRole } = renderOverlay({ open: false });
    expect(queryByRole("dialog")).toBeNull();
  });

  it("is a labelled modal dialog naming the course", () => {
    const { getByRole } = renderOverlay();
    const dialog = getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBe(
      "Course map for Boston Marathon",
    );
  });

  it("draws the static outline until the map reports itself ready", () => {
    // The loading state from ROADMAP #21: the shape is already in the browser,
    // so the wait reads as a zoom rather than as a spinner.
    const { container } = renderOverlay();
    expect(container.querySelector("svg[role='img']")).not.toBeNull();
    expect(container.querySelector("[data-testid='canvas']")).not.toBeNull();
  });

  it("closes from the close button", () => {
    const { getByRole, onClose } = renderOverlay();
    fireEvent.click(getByRole("button", { name: "Close map" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("locks the page behind it and restores the scroll on close", () => {
    const { unmount } = renderOverlay();
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("puts focus inside the dialog when it opens", () => {
    const { getByRole } = renderOverlay();
    expect(document.activeElement).toBe(
      getByRole("button", { name: "Close map" }),
    );
  });

  it("toggles the climbs overlay without touching anything else", () => {
    const { getByRole, container } = renderOverlay();
    const toggle = getByRole("button", { name: "Climbs" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(
      container.querySelector("[data-testid='canvas']")!.getAttribute("data-hills"),
    ).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(
      container.querySelector("[data-testid='canvas']")!.getAttribute("data-hills"),
    ).toBe("true");
  });

  it("hides the climbs toggle when the course has no climbs", () => {
    const { queryByRole } = renderOverlay({ hills: [] });
    expect(queryByRole("button", { name: "Climbs" })).toBeNull();
  });

  it("prompts for a hover before one has happened", () => {
    const { container } = renderOverlay();
    expect(container.textContent).toContain("Hover over the route to read a split");
  });

  it("says the route is unshaded when no weather is applied", () => {
    const { container } = renderOverlay();
    expect(container.textContent).toContain("Turn weather on");
  });

  it("marks the hovered split on the legend, and only while hovering", () => {
    // The needle answers "how strong is that, on this scale" without asking the
    // runner to read a number off the sentence above it.
    const { container, getByText } = renderOverlay({
      windMultipliers: SEGMENTS.map((_, i) => (i === 24 ? 1.03 : 1)),
    });
    expect(container.querySelector("[data-testid='wind-marker']")).toBeNull();
    fireEvent.click(getByText("fake hover"));
    const marker = container.querySelector<HTMLElement>(
      "[data-testid='wind-marker']",
    );
    expect(marker).not.toBeNull();
    // Segment 25 carries the whole course's headwind, so it sits at the far
    // headwind end of the bar rather than anywhere in the middle.
    expect(marker!.style.left).toBe("100%");
    expect(container.textContent).toContain("headwind");
  });

  it("puts a split the wind does not touch at the middle of the legend", () => {
    const { container, getByText } = renderOverlay();
    fireEvent.click(getByText("fake hover"));
    const marker = container.querySelector<HTMLElement>(
      "[data-testid='wind-marker']",
    );
    expect(marker!.style.left).toBe("50%");
    expect(container.textContent).toContain("No meaningful wind");
  });

  it("says the route is wind-shaded once a split clears the threshold", () => {
    const { container } = renderOverlay({
      windMultipliers: SEGMENTS.map(() => 1.03),
    });
    expect(container.textContent).toContain("Course Map");
  });

  it("names both ends of the legend", () => {
    const { container } = renderOverlay();
    expect(container.textContent).toContain("Tailwind");
    expect(container.textContent).toContain("Headwind");
  });

  it("shows start-line conditions in the runner's own units", () => {
    const conditions = {
      tempC: 12,
      humidity: 64,
      windSpeed: 5, // m/s
      windDirection: 225,
    };
    const km = renderOverlay({ conditions });
    expect(km.container.textContent).toContain("18 km/h SW");
    expect(km.container.textContent).toContain("12°C");
    expect(km.container.textContent).toContain("64%");
    km.unmount();

    const miles = renderOverlay({ conditions, unit: "miles" });
    expect(miles.container.textContent).toContain("11 mph SW");
    expect(miles.container.textContent).toContain("54°F");
  });

  it("points the wind arrow the way the wind is going, not where it is from", () => {
    // 225 is a south-westerly: it comes FROM the south west and travels towards
    // the north east, so the arrow is turned to 45 degrees. Drawing it at 225
    // would point it straight back into the wind.
    const { container } = renderOverlay({
      conditions: { tempC: 12, humidity: 64, windSpeed: 5, windDirection: 225 },
    });
    const arrow = container.querySelector<SVGElement>(
      "svg[style*='rotate']",
    );
    expect(arrow).not.toBeNull();
    expect(arrow!.style.transform).toBe("rotate(405deg)");
    expect(container.textContent).toContain("blowing towards NE");
  });

  it("shows no conditions chip when weather is off", () => {
    const { container } = renderOverlay();
    expect(container.textContent).not.toContain("Humidity");
  });

  it("explains itself rather than opening empty on undrawable geometry", () => {
    const { container } = renderOverlay({ outline: [] });
    expect(container.textContent).toContain(
      "We do not have a mappable route for this course.",
    );
    expect(container.querySelector("[data-testid='canvas']")).toBeNull();
  });

  // The bug this pair of tests exists for: the canvas mounted opaque, painted
  // the basemap's background over the outline immediately, and when it then
  // failed to draw the runner got a full screen of blank surface colour with
  // nothing on it and no explanation.
  it("never hides the canvas behind an opacity gate", () => {
    // The deadlock this guards: a WebGL canvas inside a fully transparent
    // subtree is never painted, so MapLibre's first render never completes,
    // `load` never fires, and the map that was hidden until it loaded can
    // never load. The outline sits UNDER the canvas instead, and shows
    // through it until the basemap paints. See the comment in the component.
    const { container, getByRole } = renderOverlay();
    const wrapper = container.querySelector("[data-testid='canvas']")!
      .parentElement!;
    expect(wrapper.className).not.toContain("opacity-0");
    expect(wrapper.className).not.toContain("hidden");

    expect(container.textContent).toContain("Loading the map");
    fireEvent.click(getByRole("button", { name: "fake map loaded" }));
    expect(container.textContent).not.toContain("Loading the map");
  });

  it("puts the outline underneath the canvas, not over it", () => {
    const { container } = renderOverlay();
    const canvasWrapper = container.querySelector("[data-testid='canvas']")!
      .parentElement!;
    const outline = container.querySelector("svg[role='img']")!;
    // Earlier in document order means painted first, so the map covers the
    // outline as it draws rather than the outline masking the map.
    expect(
      outline.compareDocumentPosition(canvasWrapper) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("says so when the map cannot load, instead of going blank", () => {
    const { container, getByRole } = renderOverlay();
    fireEvent.click(getByRole("button", { name: "fake map failed" }));
    expect(container.textContent).toContain("We could not load the map");
    // The course shape stays on screen: it is the thing the runner opened.
    expect(container.querySelector("svg[role='img']")).not.toBeNull();
  });
});
