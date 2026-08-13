import { describe, it, expect, beforeEach } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { RaceCalendar } from "@/components/home/RaceCalendar";
import { FIXTURE_EDITIONS, FIXTURE_TODAY } from "@/data/editions.fixture";
import { HOME_CALENDAR } from "@/lib/stateKeys";
import { writeState } from "@/lib/clientState";
import { clearStoredState } from "@/test/storage";

// Every assertion is anchored to FIXTURE_TODAY (2026-08-04), never the real
// clock. The component corrects to the visitor's own date in an effect, but in
// jsdom that effect sees a real date far from the fixture's — so these tests
// deliberately assert only on facts the correction cannot change (which races
// exist, where the grid starts, whether the arrows clamp), and cover the
// past/future split through the month it opens on.
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
  beforeEach(clearStoredState);

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

  it("shows a race that has already been run, but not as a link", () => {
    const { container } = renderCalendar();
    // Back to April 2026, where Boston sits four months before FIXTURE_TODAY.
    for (let i = 0; i < 4; i++) fireEvent.click(prevButton(container));
    expect(container.querySelector("h3")?.textContent).toBe("April 2026");
    expect(container.textContent).toContain("Boston Marathon");
    expect(container.querySelector('a[href*="courseId=boston"]')).toBeNull();
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
});
