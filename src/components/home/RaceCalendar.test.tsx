import { describe, it, expect } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { RaceCalendar } from "@/components/home/RaceCalendar";
import { FIXTURE_EDITIONS, FIXTURE_TODAY } from "@/data/editions.fixture";

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

describe("RaceCalendar", () => {
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

  it("degrades to a placeholder with no editions, and offers no arrows", () => {
    // The normal no-DATABASE_URL path: the build and this whole suite run on it.
    const { container } = renderCalendar([]);
    expect(container.textContent).toContain("The race calendar is loading");
    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelector("button")).toBeNull();
  });
});
