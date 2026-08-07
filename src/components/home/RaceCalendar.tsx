"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { EditionSummary } from "@/types";
import {
  canStep,
  editionHref,
  editionLinkLabel,
  editionsInMonth,
  groupEditionsByDate,
  initialMonth,
  isPastDate,
  monthBounds,
  monthKey,
  monthLabel,
  stepMonth,
} from "@/components/home/calendarData";
import { WEEKDAY_LABELS, monthGrid, todayISO } from "@/lib/units/date";

/**
 * The race calendar band — the catalogue's second entry point, answering
 * "what's coming up?" where the map above answers "where is it?".
 *
 * A real month grid, Sunday-first, one cell per day, arrows stepping strictly
 * one month at a time. Most months hold no races (the seed covers seven series
 * over two years), so the empty state is the COMMON case here, not an edge —
 * it has to read as a fact about the month, not as a failure to load.
 *
 * Entries are `<Link>`s, not click handlers, so they are real URLs: openable in
 * a new tab, copyable, crawlable. Clicking one lands on /results with that race
 * selected and the form's own defaults applied — deliberately bypassing the
 * hero form, which is why this component ignores HomeSelectionProvider (that
 * context exists to bridge the MAP to the form; this band needs no such bridge).
 */
interface Props {
  editions: EditionSummary[];
  /**
   * Today, as the server saw it. Passed in rather than read from the clock so
   * the first client render matches the server's HTML exactly — a client
   * component is server-rendered too, and the server runs in UTC.
   */
  todayISO: string;
}

const navButtonClass =
  "flex h-9 w-9 items-center justify-center rounded-lg text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)] disabled:pointer-events-none disabled:text-[var(--color-text-tertiary)] disabled:opacity-40";

export function RaceCalendar({ editions, todayISO: serverToday }: Props) {
  const [today, setToday] = useState(serverToday);
  const [view, setView] = useState(() => initialMonth(editions, serverToday));
  // Once the visitor moves the calendar themselves, the clock correction below
  // must not yank them back to a different month.
  const navigated = useRef(false);

  // This band renders inside a page Next prerenders at build time, so
  // `serverToday` can be days stale by the time anyone reads it — and it is a
  // UTC date besides, which is the wrong day for roughly half the planet at
  // any given moment. Correct to the visitor's own date after hydration, when
  // reading the clock can no longer cause a mismatch.
  useEffect(() => {
    const local = todayISO();
    if (local === serverToday) return;
    setToday(local);
    if (!navigated.current) setView(initialMonth(editions, local));
  }, [editions, serverToday]);

  const bounds = monthBounds(editions, today);
  const byDate = groupEditionsByDate(editions);
  const cells = monthGrid(view.year, view.month);
  const monthPrefix = `${monthKey(view)}-`;
  const monthEditions = editionsInMonth(editions, view);
  const label = monthLabel(view);

  const go = (delta: number) => {
    navigated.current = true;
    setView((v) => stepMonth(v, delta, bounds));
  };

  return (
    <section className="w-full">
      <div className="mx-auto max-w-7xl space-y-8 px-6 py-20">
        <div className="max-w-2xl space-y-3">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">
            Race calendar
          </p>
          <h2 className="text-2xl font-display tracking-tight text-[var(--color-text-primary)] lg:text-3xl">
            Pick your race day
          </h2>
          <p className="text-base text-[var(--color-text-secondary)]">
            Every edition we hold a course profile for, on the day it&rsquo;s
            run. Choose one and we&rsquo;ll open a plan for it straight away —
            you can adjust your goal time from there.
          </p>
        </div>

        {editions.length === 0 ? (
          // The normal state with no database configured. The build and the
          // whole test suite run without one, so this is not an edge case.
          <div className="flex h-96 items-center justify-center rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg-surface)] px-6 text-center">
            <p className="text-sm text-[var(--color-text-secondary)]">
              The race calendar is loading its dates. Pick a course from the
              calculator in the meantime.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-surface)]">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
              <button
                type="button"
                aria-label="Previous month"
                disabled={!canStep(view, -1, bounds)}
                onClick={() => go(-1)}
                className={navButtonClass}
              >
                <ChevronIcon direction="left" />
              </button>
              <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
                {label}
              </h3>
              <button
                type="button"
                aria-label="Next month"
                disabled={!canStep(view, 1, bounds)}
                onClick={() => go(1)}
                className={navButtonClass}
              >
                <ChevronIcon direction="right" />
              </button>
            </div>

            {/* The month heading above is a static <h3>; this is what actually
                announces the change when an arrow moves the grid. */}
            <p aria-live="polite" className="sr-only">
              {label}: {monthEditions.length} race
              {monthEditions.length === 1 ? "" : "s"}.
            </p>

            {/* A real table, not the div grid src/components/DatePicker.tsx
                uses: these cells contain links, and column headers are what
                give each one its date context in a screen reader. */}
            <table className="hidden w-full table-fixed border-collapse sm:table">
              <caption className="sr-only">
                Marathons in {label}. Past dates are shown but cannot be
                selected.
              </caption>
              <thead>
                <tr>
                  {WEEKDAY_LABELS.map((weekday) => (
                    <th
                      key={weekday}
                      scope="col"
                      className="border-b border-[var(--color-border)] px-2 py-2 text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]"
                    >
                      {weekday}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[0, 1, 2, 3, 4, 5].map((week) => (
                  <tr key={week}>
                    {cells.slice(week * 7, week * 7 + 7).map((iso) => {
                      const inMonth = iso.startsWith(monthPrefix);
                      const isToday = iso === today;
                      return (
                        <td
                          key={iso}
                          className={`h-24 border-b border-r border-[var(--color-border)] align-top last:border-r-0 ${
                            inMonth ? "" : "bg-[var(--color-bg-elevated)]"
                          }`}
                        >
                          <div className="flex h-full flex-col gap-1 p-1.5">
                            <span
                              className={`px-1 text-xs font-tabular ${
                                isToday
                                  ? "font-semibold text-[var(--color-text-primary)]"
                                  : inMonth
                                    ? "text-[var(--color-text-secondary)]"
                                    : "text-[var(--color-text-tertiary)]"
                              }`}
                            >
                              {Number(iso.slice(8))}
                            </span>
                            {(byDate.get(iso) ?? []).map((edition) => (
                              <EditionChip
                                key={edition.editionSlug}
                                edition={edition}
                                past={isPastDate(iso, today)}
                              />
                            ))}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Seven columns cannot hold a race name at phone width, so below
                `sm` the same month is an agenda list instead of a grid. Same
                state, same arrows, same links. */}
            <ul className="divide-y divide-[var(--color-border)] sm:hidden">
              {monthEditions.map((edition) => (
                <li key={edition.editionSlug}>
                  <EditionRow
                    edition={edition}
                    past={isPastDate(edition.raceDateISO, today)}
                  />
                </li>
              ))}
            </ul>

            {monthEditions.length === 0 && (
              // With seven series seeded, most months genuinely have nothing.
              // Say so plainly rather than leaving a grid that looks unloaded.
              <p className="px-6 py-8 text-center text-sm text-[var(--color-text-secondary)] sm:py-6">
                No races scheduled in {label}. Use the arrows to keep looking.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

const chipClass =
  "block rounded-lg border px-1.5 py-1 text-left text-xs leading-tight transition-colors";

/** One race inside a day cell. A link when it's still to come, plain text once it isn't. */
function EditionChip({
  edition,
  past,
}: {
  edition: EditionSummary;
  past: boolean;
}) {
  const body = (
    <>
      <span className="block truncate font-medium">{edition.displayName}</span>
      <span className="block truncate">
        {edition.city}
        {edition.dateConfidence !== "confirmed" && " · est."}
      </span>
    </>
  );

  if (past) {
    // Not a control and not focusable: a race that has been run is information,
    // not a choice, and an unusable tab stop is worse than no tab stop.
    return (
      <span
        className={`${chipClass} border-transparent bg-[var(--color-bg-elevated)] text-[var(--color-text-tertiary)]`}
      >
        {body}
      </span>
    );
  }

  return (
    <Link
      href={editionHref(edition)}
      aria-label={editionLinkLabel(edition)}
      className={`${chipClass} border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] hover:border-[var(--color-border-focus)] focus:border-[var(--color-border-focus)] focus:outline-none`}
    >
      {body}
    </Link>
  );
}

/** The mobile agenda equivalent of a chip — date on the left, race on the right. */
function EditionRow({
  edition,
  past,
}: {
  edition: EditionSummary;
  past: boolean;
}) {
  const day = Number(edition.raceDateISO.slice(8));
  const body = (
    <>
      <span
        className={`w-8 shrink-0 text-base font-tabular ${
          past
            ? "text-[var(--color-text-tertiary)]"
            : "text-[var(--color-text-primary)]"
        }`}
      >
        {day}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">
          {edition.displayName}
        </span>
        <span className="block truncate text-xs text-[var(--color-text-secondary)]">
          {edition.city}
          {edition.dateConfidence !== "confirmed" && " · estimated date"}
        </span>
      </span>
    </>
  );

  if (past) {
    return (
      <span className="flex items-center gap-3 px-4 py-3 text-[var(--color-text-tertiary)]">
        {body}
      </span>
    );
  }

  return (
    <Link
      href={editionHref(edition)}
      aria-label={editionLinkLabel(edition)}
      className="flex items-center gap-3 px-4 py-3 text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-elevated)]"
    >
      {body}
    </Link>
  );
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
    >
      <path
        d={direction === "left" ? "M12 4l-6 6 6 6" : "M8 4l6 6-6 6"}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
