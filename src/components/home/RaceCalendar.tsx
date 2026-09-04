"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
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
import {
  ALL_LOCATIONS,
  type ContinentValue,
  type FilterOption,
  type LocationFilter,
  continentOptions,
  countryOptions,
  filterEditions,
  isFiltered,
  locationLabel,
  regionNouns,
  regionOptions,
  selectContinent,
  selectCountry,
  selectRegion,
  upcomingSeriesCount,
} from "@/components/home/calendarFilters";
import { WEEKDAY_LABELS, monthGrid, todayISO } from "@/lib/units/date";
import { useStoredState } from "@/hooks/useStoredState";
import { HOME_CALENDAR, type CalendarSnapshot } from "@/lib/stateKeys";

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

  // This band renders inside a page Next prerenders at build time, so
  // `serverToday` can be days stale by the time anyone reads it — and it is a
  // UTC date besides, which is the wrong day for roughly half the planet at
  // any given moment. Correct to the visitor's own date after hydration, when
  // reading the clock can no longer cause a mismatch.
  useEffect(() => {
    const local = todayISO();
    if (local !== serverToday) setToday(local);
  }, [serverToday]);

  // Filter and month are ONE stored snapshot, not two, because they are only
  // ever meaningful together: restoring "March 2027" without the Italy filter
  // that made March interesting would land the visitor on an empty grid.
  //
  // Stored value overrides the default rather than seeding state, which is what
  // lets the clock correction above stay a plain effect. `defaults` recomputes
  // from the corrected `today`, so an untouched calendar still lands on the
  // right month — while a visitor who HAS chosen one has written that choice to
  // the store, where it takes precedence and the correction can't reach it.
  const [stored, store] = useStoredState(HOME_CALENDAR);
  const defaults: CalendarSnapshot = {
    filter: ALL_LOCATIONS,
    view: initialMonth(editions, today),
  };

  // A stored filter can outlive the data it names — the catalogue is imported
  // in batches, and a country's only race can fall out of the seeded window. A
  // filter matching nothing is indistinguishable from a broken calendar, so it
  // is dropped back to everything rather than shown.
  const usable =
    stored && filterEditions(editions, stored.filter).length > 0
      ? stored
      : defaults;
  const { filter, view } = usable;

  // Everything below the filter reads `visible`, never `editions` — including
  // the month bounds, so narrowing to Japan stops the arrows at Japan's own
  // race range instead of walking months that now hold nothing.
  const visible = filterEditions(editions, filter);
  const bounds = monthBounds(visible, today);
  const byDate = groupEditionsByDate(visible);
  const cells = monthGrid(view.year, view.month);
  const monthPrefix = `${monthKey(view)}-`;
  const monthEditions = editionsInMonth(visible, view);
  const label = monthLabel(view);
  const place = locationLabel(editions, filter);

  const go = (delta: number) => {
    store({ filter, view: stepMonth(view, delta, bounds) });
  };

  /**
   * Changing the filter jumps to the next race that survives it. Staying put
   * would leave most narrowings looking like they returned nothing: pick a
   * country with two races a year and the odds are the month on screen isn't
   * one of them.
   */
  const applyFilter = (next: LocationFilter) => {
    store({
      filter: next,
      view: initialMonth(filterEditions(editions, next), today),
    });
  };

  const continents = continentOptions(editions);
  const countries = countryOptions(editions, filter.continent);
  const regions = regionOptions(editions, filter.countryCode);

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
            run. Narrow it to where you&rsquo;ll be, then choose one and
            we&rsquo;ll open a plan for it straight away — you can adjust your
            goal time from there.
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
          <>
          {/* The location filter. Deliberately native `<select>`s rather than
              the combobox CourseSearch uses: these are short, closed lists of
              known names, and a native select is the one control that is
              already keyboard-, screen-reader- and mobile-correct without a
              line of our code. */}
          <div className="flex flex-wrap items-end gap-3">
            <FilterSelect
              id="calendar-continent"
              label="Continent"
              allLabel="All continents"
              value={filter.continent}
              options={continents}
              onChange={(value) =>
                applyFilter(selectContinent(value as ContinentValue | null))
              }
            />
            <FilterSelect
              id="calendar-country"
              label="Country"
              allLabel="All countries"
              value={filter.countryCode}
              options={countries}
              onChange={(value) => applyFilter(selectCountry(filter, value))}
            />
            {/* Only rendered where a country is big enough to need it — see
                `regionOptions`. */}
            {regions && (
              <FilterSelect
                id="calendar-region"
                label={regionNouns(filter.countryCode).label}
                allLabel={regionNouns(filter.countryCode).allLabel}
                value={filter.regionCode}
                options={regions}
                onChange={(value) => applyFilter(selectRegion(filter, value))}
              />
            )}
            {isFiltered(filter) && (
              <button
                type="button"
                onClick={() => applyFilter(ALL_LOCATIONS)}
                className="h-10 rounded-[var(--radius-control)] px-3 text-sm font-medium text-[var(--color-text-secondary)] underline-offset-4 transition-colors hover:text-[var(--color-text-primary)] hover:underline"
              >
                Clear
              </button>
            )}
          </div>

          {/* The count is of RACES, not dated editions, and only of the ones
              still ahead — it answers "is there anything here for me?", which
              a total including last spring's races would answer wrongly. */}
          <p
            aria-live="polite"
            className="text-sm text-[var(--color-text-secondary)]"
          >
            {upcomingSeriesCount(visible, today)} upcoming race
            {upcomingSeriesCount(visible, today) === 1 ? "" : "s"}
            {place ? ` in ${place}` : " worldwide"}.
          </p>

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
                No races scheduled in {label}
                {place && ` in ${place}`}. Use the arrows to keep looking
                {place && ", or widen the filter"}.
              </p>
            )}
          </div>
          </>
        )}
      </div>
    </section>
  );
}

/**
 * One level of the location cascade. The empty string is the "no filter"
 * option value, because a `<select>` value is always a string — null would
 * make it uncontrolled and React would warn.
 *
 * Counts are in the option text rather than beside the label so they narrow
 * with the level above: after choosing Europe, "Italy (42)" is Italy's races,
 * and the number never has to be re-read against a different scope.
 */
function FilterSelect({
  id,
  label,
  allLabel,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  allLabel: string;
  value: string | null;
  options: FilterOption[];
  onChange: (value: string | null) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]"
      >
        {label}
      </label>
      <select
        id={id}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="h-10 min-w-[10rem] rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 text-sm text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-text-tertiary)] focus:border-[var(--color-border-focus)] focus:outline-none"
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label} ({option.count})
          </option>
        ))}
      </select>
    </div>
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

  // Past races are links again. They were inert text on the reasoning that a
  // race already run is information rather than a choice — true when the
  // dashboard could only forecast. Now a past edition pairs the course with the
  // conditions actually recorded that morning, which is a destination worth
  // having. Still dimmed, so the calendar reads the same at a glance.
  return (
    <Link
      href={editionHref(edition)}
      aria-label={editionLinkLabel(edition)}
      className={`${chipClass} bg-[var(--color-bg-elevated)] focus:outline-none ${
        past
          ? "border-transparent text-[var(--color-text-tertiary)] hover:border-[var(--color-border)] hover:text-[var(--color-text-secondary)] focus:border-[var(--color-border-focus)]"
          : "border-[var(--color-border)] text-[var(--color-text-primary)] hover:border-[var(--color-border-focus)] focus:border-[var(--color-border-focus)]"
      }`}
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

  // Linked whether past or not — see EditionChip for why.
  return (
    <Link
      href={editionHref(edition)}
      aria-label={editionLinkLabel(edition)}
      className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--color-bg-elevated)] ${
        past
          ? "text-[var(--color-text-tertiary)]"
          : "text-[var(--color-text-primary)]"
      }`}
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
