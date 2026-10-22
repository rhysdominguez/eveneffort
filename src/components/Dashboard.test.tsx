import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { Dashboard } from "./Dashboard";
import { FIXTURE_CATALOG, fixtureCourse } from "@/data/courses.fixture";
import type { Course, PacingInput } from "@/types";

// The dashboard used to keep the address bar in step with the form, and that
// write-back was also, quietly, how a course switch got its geometry. Both
// halves of that are what this file guards: the URL is never written, and the
// geometry arrives by fetch instead.
//
// There was no Dashboard test at all before this change, which is exactly why
// the coupling was easy to miss.

const replace = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push, prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/results",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));

const input: PacingInput = {
  courseId: "boston",
  goalTimeSeconds: 10800, // 3:00:00
  unit: "km",
};

/** A fetch that hands back a promise per course id, resolved by the test. */
function deferredFetch() {
  const pending = new Map<
    string,
    { resolve: (c: Course) => void; reject: () => void }
  >();
  const calls: string[] = [];
  const fetchMock = vi.fn((url: string) => {
    // useWeather may ask for a forecast; it is not what this file is about.
    if (!url.startsWith("/api/courses/")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      } as unknown as Response);
    }
    const slug = url.slice("/api/courses/".length);
    calls.push(slug);
    return new Promise<Response>((res) => {
      pending.set(slug, {
        resolve: (course) =>
          res({ ok: true, json: () => Promise.resolve(course) } as Response),
        reject: () => res({ ok: false, status: 500 } as Response),
      });
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { pending, calls };
}

const view = () =>
  render(
    <Dashboard
      input={input}
      course={fixtureCourse("boston")}
      catalog={FIXTURE_CATALOG}
    />,
  );

/** Drive the real combobox rather than reaching past it. */
function pickCourse(container: HTMLElement, filter: string) {
  const box = container.querySelector<HTMLInputElement>('[role="combobox"]')!;
  fireEvent.focus(box);
  fireEvent.change(box, { target: { value: filter } });
  const option = container.querySelector('[role="option"]');
  expect(option, `no course matched "${filter}"`).not.toBeNull();
  fireEvent.mouseDown(option!);
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/results?courseId=boston");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Dashboard", () => {
  it("never writes the URL, however much the form is edited", async () => {
    deferredFetch();
    const { container } = view();
    const replaceState = vi.spyOn(window.history, "replaceState");
    const pushState = vi.spyOn(window.history, "pushState");

    fireEvent.change(container.querySelector('[aria-label="hours"]')!, {
      target: { value: "4" },
    });
    fireEvent.change(container.querySelector('[aria-label="minutes"]')!, {
      target: { value: "15" },
    });

    // The old debounce was 300ms, so a timer-blind assertion would have passed
    // against it. Wait past it.
    await new Promise((r) => setTimeout(r, 400));

    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
    expect(pushState).not.toHaveBeenCalled();
    replaceState.mockRestore();
    pushState.mockRestore();
  });

  it("fetches geometry for a newly picked course and charts it", async () => {
    const { pending, calls } = deferredFetch();
    const { container } = view();
    expect(container.textContent).toContain("Boston Marathon");

    pickCourse(container, "tokyo");
    await vi.waitFor(() => expect(calls).toContain("tokyo"));

    // Until the geometry lands, the old race stays on screen rather than being
    // charted under the new name.
    expect(container.textContent).toContain("Boston Marathon");

    pending.get("tokyo")!.resolve(fixtureCourse("tokyo"));
    await vi.waitFor(() =>
      expect(container.textContent).toContain("Tokyo Marathon"),
    );
    expect(container.textContent).not.toContain("Boston Marathon");
  });

  it("serves a course it has already loaded from memory", async () => {
    const { pending, calls } = deferredFetch();
    const { container } = view();

    pickCourse(container, "tokyo");
    await vi.waitFor(() => expect(calls).toContain("tokyo"));
    pending.get("tokyo")!.resolve(fixtureCourse("tokyo"));
    await vi.waitFor(() =>
      expect(container.textContent).toContain("Tokyo Marathon"),
    );

    // Back to the course the server already sent: it was seeded into the cache,
    // so this must cost no request at all.
    pickCourse(container, "boston");
    await vi.waitFor(() =>
      expect(container.textContent).toContain("Boston Marathon"),
    );
    expect(calls).toEqual(["tokyo"]);

    // And forward again, this time from the cache the fetch populated.
    pickCourse(container, "tokyo");
    await vi.waitFor(() =>
      expect(container.textContent).toContain("Tokyo Marathon"),
    );
    expect(calls).toEqual(["tokyo"]);
  });

  it("lands on the last course picked when responses arrive out of order", async () => {
    const { pending, calls } = deferredFetch();
    const { container } = view();

    pickCourse(container, "tokyo");
    await vi.waitFor(() => expect(calls).toContain("tokyo"));
    pickCourse(container, "london");
    await vi.waitFor(() => expect(calls).toContain("london"));

    // London answers first, then the stale Tokyo request. Charting Tokyo here
    // would leave the form saying London and the profile saying Tokyo.
    pending.get("london")!.resolve(fixtureCourse("london"));
    await vi.waitFor(() =>
      expect(container.textContent).toContain("London Marathon"),
    );
    pending.get("tokyo")!.resolve(fixtureCourse("tokyo"));
    await new Promise((r) => setTimeout(r, 50));

    expect(container.textContent).toContain("London Marathon");
    expect(container.textContent).not.toContain("Tokyo Marathon");
  });

  // The hill panel is derived here rather than read off the catalog, which is
  // the whole reason an uploaded course gets it: `u-` courses are not in the
  // catalog and carry no city, but they do carry the same 44-point array, so
  // the panel has everything it needs. Nothing on this path checks the course's
  // provenance, and this is what holds that open.
  it("shows the hill panel for an uploaded course too", async () => {
    deferredFetch();
    const uploaded: Course = {
      ...fixtureCourse("boston"),
      id: "u-abc123",
      displayName: "Uploaded course",
      isUserUpload: true,
      elevationSource: "gpx",
      expiresAtISO: null,
    };
    const { container } = render(
      <Dashboard
        input={{ ...input, courseId: "u-abc123" }}
        course={uploaded}
        catalog={FIXTURE_CATALOG}
      />,
    );
    await new Promise((r) => setTimeout(r, 0));

    expect(container.textContent).toContain("Hill Segments");
    expect(container.textContent).toContain("avg pace");
  });

  // The order is the product decision: the ground first, then the ground as
  // seconds, then the few climbs worth naming, and only then the splits table.
  it("stacks the stats, the elevation profile, race splits, then hill segments", () => {
    deferredFetch();
    const { container } = view();
    const text = container.textContent ?? "";
    const at = (needle: string) => {
      const i = text.indexOf(needle);
      expect(i, `"${needle}" is missing from the results column`).toBeGreaterThan(-1);
      return i;
    };

    expect(at("Goal time")).toBeLessThan(at("Elevation Profile"));
    expect(at("Elevation Profile")).toBeLessThan(at("Race Splits"));
    expect(at("Race Splits")).toBeLessThan(at("Hill Segments"));
  });

  // jsdom lays nothing out, so this cannot watch the bug happen; it holds the
  // fix in place. A grid item will not shrink below its content by default, so
  // without min-w-0 a row of hill cards wider than the column stretched the
  // whole results column and scrolled the PAGE sideways, which only a real
  // browser showed.
  it("lets the results column shrink so a wide row of hill cards scrolls inside itself", () => {
    deferredFetch();
    const { container } = view();
    const heading = [...container.querySelectorAll("h2")].find(
      (h) => h.textContent === "Hill Segments",
    )!;
    expect(heading.closest(".space-y-10")!.className).toContain("min-w-0");
  });

  it("explains a failed load and keeps the previous race on screen", async () => {
    const { pending, calls } = deferredFetch();
    const { container } = view();

    pickCourse(container, "tokyo");
    await vi.waitFor(() => expect(calls).toContain("tokyo"));
    pending.get("tokyo")!.reject();

    await vi.waitFor(() =>
      expect(container.textContent).toContain("We could not load that course."),
    );
    // The chart the runner was reading is still there.
    expect(container.textContent).toContain("Boston Marathon");

    // Re-picking Tokyo would not change the wanted id, so the retry has to be
    // a button. Pressing it asks again.
    const retry = [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Try again"),
    )!;
    expect(retry).toBeDefined();
    fireEvent.click(retry);
    await vi.waitFor(() =>
      expect(calls.filter((c) => c === "tokyo")).toHaveLength(2),
    );
    pending.get("tokyo")!.resolve(fixtureCourse("tokyo"));
    await vi.waitFor(() =>
      expect(container.textContent).toContain("Tokyo Marathon"),
    );
  });
});
