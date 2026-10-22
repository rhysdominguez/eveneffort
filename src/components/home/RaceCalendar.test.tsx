import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { RaceCalendar } from "@/components/home/RaceCalendar";
import { FIXTURE_EDITIONS, FIXTURE_TODAY } from "@/data/editions.fixture";
import { HOME_CALENDAR } from "@/lib/stateKeys";
import { writeState } from "@/lib/clientState";
import { clearStoredState } from "@/test/storage";

// Every assertion is anchored to FIXTURE_TODAY (2026-08-04). The component
// corrects to the visitor's own date in an effect, so the system clock is
// pinned to FIXTURE_TODAY for this whole file — otherwise that correction
// races the real calendar date against the fixture's and the month these
// tests open on drifts as the real date moves through 2026.
const renderCalendar = (editions = FIXTURE_EDITIONS) =>
  render(<RaceCalendar editions={editions} todayISO={FIXTURE_TODAY} />);

const prevButton = (c: HTMLElement) =>
  c.querySelector<HTMLButtonElement>('button[aria-label="Previous month"]')!;
const nextButton = (c: HTMLElement) =>
  c.querySelector<HTMLButtonElement>('button[aria-label="Next month"]')!;
/** A location-filter select by id. Non-null asserted; a missing one reads as
 *  null in the assertions that check a level is hidden. */
const select = (c: HTMLElement, id: string) =>
  c.querySelector<HTMLSelectElement>(`#${id}`)!;

describe("RaceCalendar", () => {
  // The calendar now persists its filter and month to sessionStorage, and jsdom
  // shares one store across every test in a file — so without this, changing a
  // filter in one test silently sets up the next one.
  beforeEach(() => {
    clearStoredState();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${FIXTURE_TODAY}T12:00:00`));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens on the month holding the next upcoming race", () => {
    const { container } = renderCalendar();
    // Sydney 2026-08-30 is the soonest race after FIXTURE_TODAY.
    expect(container.querySelector("h3")?.textContent).toBe("August 2026");
    expect(container.textContent).toContain("Sydney Marathon");
  });

  it("lays out a real six-week month, Sunday first", () => {
    const { container } = renderCalendar();
    const headers = Array.from(container.querySelectorAll("thead th")).map(
      (th) => th.textContent,
    );
    expect(headers).toEqual(["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]);
    // monthGrid is always 42 cells, so the band never changes height as the
    // months change under it.
    expect(container.querySelectorAll("tbody td")).toHaveLength(42);
    expect(container.querySelectorAll("tbody tr")).toHaveLength(6);
  });

  it("links an upcoming race straight to its results page", () => {
    const { container } = renderCalendar();
    const link = container.querySelector<HTMLAnchorElement>(
      'a[href*="courseId=sydney"]',
    );
    expect(link).not.toBeNull();
    expect(link!.getAttribute("href")).toContain("goalTimeSeconds=14400");
    expect(link!.getAttribute("href")).toContain("unit=km");
    expect(link!.getAttribute("href")).toContain("date=2026-08-30");
  });

  it("links a race that has already been run, dimmed but reachable", () => {
    // These used to be inert text, on the reasoning that a race already run is
    // information rather than a choice. That held while the dashboard could
    // only forecast; a past edition now pairs the course with the conditions
    // actually recorded that morning, which is worth navigating to.
    const { container } = renderCalendar();
    // Back to April 2026, where Boston sits four months before FIXTURE_TODAY.
    for (let i = 0; i < 4; i++) fireEvent.click(prevButton(container));
    expect(container.querySelector("h3")?.textContent).toBe("April 2026");
    const link = container.querySelector('a[href*="courseId=boston"]');
    expect(link).not.toBeNull();
    expect(link!.getAttribute("href")).toContain("date=2026-04-20");
    // Still visually dimmed, so the calendar reads the same at a glance.
    expect(link!.className).toContain("--color-text-tertiary");
  });

  it("puts two races sharing a date in the same cell", () => {
    const { container } = renderCalendar();
    for (let i = 0; i < 2; i++) fireEvent.click(nextButton(container));
    expect(container.querySelector("h3")?.textContent).toBe("October 2026");
    expect(container.querySelector('a[href*="courseId=chicago"]')).not.toBeNull();
    expect(container.querySelector('a[href*="courseId=london"]')).not.toBeNull();
  });

  it("marks a date that was inferred rather than announced", () => {
    const { container } = renderCalendar();
    for (let i = 0; i < 2; i++) fireEvent.click(nextButton(container));
    // Chicago's fixture date is `estimated`; presenting it as fact would be
    // the one thing the confidence flag exists to prevent.
    expect(container.textContent).toContain("est.");
  });

  it("says plainly when a month has no races", () => {
    const { container } = renderCalendar();
    // August → September → October → November → December, which is empty.
    for (let i = 0; i < 4; i++) fireEvent.click(nextButton(container));
    expect(container.querySelector("h3")?.textContent).toBe("December 2026");
    expect(container.textContent).toContain("No races scheduled in December 2026");
    // Strictly one month at a time: the empty month is landed on, not skipped.
    expect(container.querySelectorAll("tbody td")).toHaveLength(42);
  });

  it("clamps the arrows to the range it actually has races for", () => {
    const { container } = renderCalendar();
    for (let i = 0; i < 4; i++) fireEvent.click(prevButton(container));
    expect(container.querySelector("h3")?.textContent).toBe("April 2026");
    expect(prevButton(container).disabled).toBe(true);

    // Forward to March 2027, the far end of the fixture.
    for (let i = 0; i < 11; i++) fireEvent.click(nextButton(container));
    expect(container.querySelector("h3")?.textContent).toBe("March 2027");
    expect(nextButton(container).disabled).toBe(true);
  });

  it("jumps to the next race that survives a location filter", () => {
    const { container } = renderCalendar();
    // Opens on August 2026 (Sydney). Narrowing to Europe has to land on
    // Berlin's month, not sit on an August that now holds nothing.
    fireEvent.change(select(container, "calendar-continent"), {
      target: { value: "EU" },
    });
    expect(container.querySelector("h3")?.textContent).toBe("September 2026");
    expect(container.textContent).toContain("Berlin Marathon");
    expect(container.textContent).not.toContain("Sydney Marathon");
  });

  it("bounds the arrows to the filtered range", () => {
    const { container } = renderCalendar();
    fireEvent.change(select(container, "calendar-country"), {
      target: { value: "JP" },
    });
    // Tokyo 2027-03-07 is Japan's only fixture race, so there is nowhere
    // forward to go even though the unfiltered list ends in the same month.
    expect(container.querySelector("h3")?.textContent).toBe("March 2027");
    expect(nextButton(container).disabled).toBe(true);
  });

  it("shows a state filter only for a country with more than one", () => {
    const { container } = renderCalendar();
    expect(select(container, "calendar-region")).toBeNull();

    fireEvent.change(select(container, "calendar-country"), {
      target: { value: "US" },
    });
    expect(select(container, "calendar-region")).not.toBeNull();

    fireEvent.change(select(container, "calendar-country"), {
      target: { value: "AU" },
    });
    expect(select(container, "calendar-region")).toBeNull();
  });

  it("reports how many races are still ahead in the chosen place", () => {
    const { container } = renderCalendar();
    fireEvent.change(select(container, "calendar-country"), {
      target: { value: "GB" },
    });
    expect(container.textContent).toContain(
      "1 upcoming race in United Kingdom",
    );
  });

  it("puts everything back when the filter is cleared", () => {
    const { container } = renderCalendar();
    fireEvent.change(select(container, "calendar-continent"), {
      target: { value: "EU" },
    });
    const clear = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Clear",
    );
    fireEvent.click(clear!);
    expect(select(container, "calendar-continent").value).toBe("");
    expect(container.querySelector("h3")?.textContent).toBe("August 2026");
    expect(container.textContent).toContain("Sydney Marathon");
  });

  it("degrades to a placeholder with no editions, and offers no arrows", () => {
    // The normal no-DATABASE_URL path: the build and this whole suite run on it.
    const { container } = renderCalendar([]);
    expect(container.textContent).toContain("The race calendar is loading");
    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelector("button")).toBeNull();
  });

  // Someone narrows the calendar, opens a race, then comes back. Everything
  // below is about them finding the calendar as they left it.
  describe("remembering where the visitor was", () => {
    it("comes back to the filter and month it was left on", () => {
      const { container, unmount } = renderCalendar();
      fireEvent.change(select(container, "calendar-country"), {
        target: { value: "JP" },
      });
      expect(container.querySelector("h3")?.textContent).toBe("March 2027");
      unmount();

      // A fresh mount is what a navigation back to the home page produces.
      const second = renderCalendar().container;
      expect(select(second, "calendar-country").value).toBe("JP");
      expect(second.querySelector("h3")?.textContent).toBe("March 2027");
      expect(second.textContent).toContain("Tokyo Marathon");
    });

    it("remembers a month stepped to by hand, with no filter", () => {
      const { container, unmount } = renderCalendar();
      fireEvent.click(nextButton(container));
      fireEvent.click(nextButton(container));
      const reached = container.querySelector("h3")?.textContent;
      unmount();

      expect(renderCalendar().container.querySelector("h3")?.textContent).toBe(
        reached,
      );
    });

    it("pins the continent alongside a restored country", () => {
      // selectCountry sets both levels, so the two selects can never come back
      // contradicting each other.
      const { container, unmount } = renderCalendar();
      fireEvent.change(select(container, "calendar-country"), {
        target: { value: "JP" },
      });
      unmount();

      const second = renderCalendar().container;
      expect(select(second, "calendar-continent").value).toBe("AS");
    });

    it("opens fresh once the filter is cleared again", () => {
      const { container, unmount } = renderCalendar();
      fireEvent.change(select(container, "calendar-continent"), {
        target: { value: "EU" },
      });
      const clear = Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Clear",
      );
      fireEvent.click(clear!);
      unmount();

      const second = renderCalendar().container;
      expect(select(second, "calendar-continent").value).toBe("");
      expect(second.querySelector("h3")?.textContent).toBe("August 2026");
    });

    it("drops a stored filter that no longer matches any race", () => {
      // The catalogue is imported in batches and a country's only race can fall
      // out of the seeded window between two visits. A filter matching nothing
      // is indistinguishable from a broken calendar, so it must not be shown.
      writeState(HOME_CALENDAR, {
        filter: { continent: "SA", countryCode: "BR", regionCode: null },
        view: { year: 2027, month: 5 },
      });
      const { container } = renderCalendar();
      expect(select(container, "calendar-continent").value).toBe("");
      expect(container.querySelector("h3")?.textContent).toBe("August 2026");
      expect(container.textContent).toContain("Sydney Marathon");
    });

    it("ignores a stored snapshot that no longer parses", () => {
      window.sessionStorage.setItem(HOME_CALENDAR.key, '{"filter":"europe"}');
      const { container } = renderCalendar();
      expect(container.querySelector("h3")?.textContent).toBe("August 2026");
    });
  });

  describe("busy days", () => {
    // Four races on one day, so the grid cell overflows its two-chip cap.
    const crowdedDay = "2026-08-16";
    const CROWDED = [0, 1, 2, 3].map((i) => ({
      editionSlug: `synthetic-${i}-2026`,
      seriesSlug: `synthetic-${i}`,
      displayName: `Synthetic Marathon ${i}`,
      courseId: `synthetic-${i}`,
      city: "Nowhere",
      countryCode: "US",
      countryName: "United States",
      regionCode: "US-CA",
      regionName: "California",
      raceDateISO: crowdedDay,
      startTimeLocal: "08:00",
      dateConfidence: "confirmed" as const,
    }));

    it("caps a day at two chips and collapses the rest behind a button", () => {
      const { container } = renderCalendar(CROWDED);
      const cell = Array.from(container.querySelectorAll("tbody td")).find((td) =>
        td.textContent?.includes("Synthetic Marathon"),
      )!;
      const chipLinks = cell.querySelectorAll('a[href*="courseId"]');
      expect(chipLinks).toHaveLength(2);
      const more = Array.from(cell.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("more"),
      )!;
      expect(more.textContent).toBe("See 2 more");
    });

    it("reveals every race for the day when the button is clicked", () => {
      const { container } = renderCalendar(CROWDED);
      const cell = Array.from(container.querySelectorAll("tbody td")).find((td) =>
        td.textContent?.includes("Synthetic Marathon"),
      )!;
      const more = Array.from(cell.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("more"),
      )!;
      fireEvent.click(more);
      expect(more.getAttribute("aria-expanded")).toBe("true");
      expect(cell.querySelectorAll('a[href*="courseId"]')).toHaveLength(4 + 2);
    });

    it("caps the popover height and lets it scroll rather than overflow", () => {
      const { container } = renderCalendar(CROWDED);
      const cell = Array.from(container.querySelectorAll("tbody td")).find((td) =>
        td.textContent?.includes("Synthetic Marathon"),
      )!;
      fireEvent.click(
        Array.from(cell.querySelectorAll("button")).find((b) =>
          b.textContent?.includes("more"),
        )!,
      );
      // Aug 16 2026 falls in the fourth grid row, so the popover anchors to the
      // cell's bottom and grows upward — away from the calendar's clipped edge.
      const popover = cell.querySelector<HTMLElement>("div.absolute")!;
      expect(popover.className).toContain("bottom-1");
      expect(popover.className).toContain("overflow-y-auto");
      expect(popover.className).toMatch(/\bmax-h-\d+\b/);
    });

    it("keeps every week row the same fixed height", () => {
      const { container } = renderCalendar(CROWDED);
      const heights = new Set(
        Array.from(container.querySelectorAll("tbody td")).map(
          (td) => td.className.match(/\bh-\d+\b/)?.[0],
        ),
      );
      expect(heights).toEqual(new Set(["h-36"]));
    });
  });
  // ROADMAP #19 — the green edge marking races whose day is close enough for a
  // real forecast. FIXTURE_TODAY is 2026-08-04 and FORECAST_HORIZON_DAYS is 5,
  // so the window is 2026-08-04 .. 2026-08-09 inclusive.
  describe("forecast-available highlight", () => {
    const base = {
      seriesSlug: "synthetic",
      courseId: "synthetic",
      city: "Nowhere",
      countryCode: "US",
      countryName: "United States",
      regionCode: "US-CA",
      regionName: "California",
      startTimeLocal: "08:00",
    };
    const edition = (
      slug: string,
      raceDateISO: string,
      dateConfidence: "confirmed" | "estimated" = "confirmed",
    ) => ({
      ...base,
      editionSlug: slug,
      displayName: `Race ${slug}`,
      raceDateISO,
      dateConfidence,
    });

    const MARK = "bg-[var(--color-green-fill)]";
    const chipFor = (container: HTMLElement, name: string) =>
      Array.from(container.querySelectorAll<HTMLAnchorElement>("a")).find((a) =>
        a.textContent?.includes(name),
      )!;

    it("marks a race inside the horizon and leaves one outside unmarked", () => {
      const { container } = renderCalendar([
        edition("near", "2026-08-06"),
        edition("far", "2026-08-20"),
      ]);
      expect(chipFor(container, "Race near").className).toContain(MARK);
      expect(chipFor(container, "Race far").className).not.toContain(MARK);
    });

    // The boundary is a decision, not an accident: day 5 is in, day 6 is out.
    it("decides the boundary day explicitly", () => {
      const { container } = renderCalendar([
        edition("last", "2026-08-09"),
        edition("past-edge", "2026-08-10"),
      ]);
      expect(chipFor(container, "Race last").className).toContain(MARK);
      expect(chipFor(container, "Race past-edge").className).not.toContain(MARK);
    });

    // `estimated` is the seed's default, so excluding it left the mark on
    // almost nothing. A future date gets a real forecast whatever its
    // confidence, and the chip still carries its own "est." qualifier.
    it("marks a future race whose date is only estimated", () => {
      const { container } = renderCalendar([
        edition("guessed", "2026-08-06", "estimated"),
      ]);
      const chip = chipFor(container, "Race guessed");
      expect(chip.className).toContain(MARK);
      expect(chip.textContent).toContain("est.");
    });

    it("does not mark a race that has already been run", () => {
      const { container } = renderCalendar([edition("done", "2026-08-01")]);
      expect(chipFor(container, "Race done").className).not.toContain(MARK);
    });

    // Colour cannot carry the meaning on its own, in either layout.
    // The tint is the whole treatment. A green OUTLINE was tried and made the
    // chip read as selected rather than annotated, so the marked chip keeps the
    // same neutral border every other chip has and the race name stays neutral
    // too — the name is the content, the colour is the annotation.
    it("tints the chip without restyling its border or its text", () => {
      const { container } = renderCalendar([edition("near", "2026-08-06")]);
      const chip = chipFor(container, "Race near");
      expect(chip.className).toContain("bg-[var(--color-green-fill)]");
      expect(chip.className).toContain("border-[var(--color-border)]");
      expect(chip.className).toContain("text-[var(--color-text-primary)]");
      expect(chip.className).not.toContain("green-primary");
    });

    it("names the meaning in the accessible name and the tooltip", () => {
      const { container } = renderCalendar([edition("near", "2026-08-06")]);
      const chip = chipFor(container, "Race near");
      expect(chip.getAttribute("aria-label")).toContain(
        "Race-day forecast available",
      );
      expect(chip.getAttribute("title")).toContain(
        "Race-day forecast available",
      );
    });

    it("shows the legend only when something on screen carries the mark", () => {
      const withMark = renderCalendar([edition("near", "2026-08-06")]);
      expect(withMark.container.textContent).toContain(
        "Race-day forecast available",
      );
      withMark.unmount();
      clearStoredState();
      const without = renderCalendar([edition("far", "2026-08-20")]);
      expect(without.container.textContent).not.toContain(
        "Race-day forecast available",
      );
    });

    // The grid renders hundreds of editions; one fetch per race would be a
    // fan-out the homepage cannot afford. The flag is arithmetic on the date.
    it("issues no weather request while rendering", () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      renderCalendar([edition("near", "2026-08-06")]);
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    // Both layouts ship the state: the desktop grid is a <td> chip, the sub-sm
    // agenda is a list row, and a marker in only one of them is half a feature.
    it("marks the race in the mobile agenda list as well as the grid", () => {
      const { container } = renderCalendar([edition("near", "2026-08-06")]);
      const marked = Array.from(
        container.querySelectorAll<HTMLAnchorElement>("a"),
      ).filter((a) => a.className.includes(MARK));
      expect(marked).toHaveLength(2);
      expect(container.querySelector("ul.sm\\:hidden a")!.className).toContain(
        MARK,
      );
    });
  });
});
