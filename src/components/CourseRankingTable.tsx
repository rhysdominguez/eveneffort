"use client";
import { type MouseEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CourseSummary } from "@/types";
import { DEFAULT_FUELING } from "@/types";
import { buildResultsHref } from "@/lib/resultsParams";
import { isNetDownhill } from "@/lib/pacing/terrain";
import { DifficultyBadge } from "@/components/DifficultyBadge";
import { metresToFeet } from "@/lib/units/elevation";
import {
  formatAltitudePenalty,
  formatVsFlat,
  totalEffortMultiplier,
} from "@/lib/units/effort";
import { formatFeet, formatSignedFeet } from "@/lib/chart/geometry";
import { formatLocation } from "@/lib/location";
import {
  ALL_LOCATIONS,
  type LocationFilter,
  filterByLocation,
  locationLabel,
} from "@/lib/locationFilter";
import { LocationFilterBar } from "@/components/LocationFilterBar";

// Every course we hold, rankable. The catalog already carries `effort`,
// `terrain` and `altitude` for the whole list (eight scalars per course), so
// this needs no geometry and no new query — it sorts what the picker ships.
//
// "vs flat" IS THE ALL-IN NUMBER: grade cost times altitude cost, via
// `totalEffortMultiplier`. The Altitude column beside it is one of its two
// factors shown on its own, because a runner scanning for a fast race needs to
// know whether a course is hard underfoot or just high up — those call for
// completely different preparation, and a single merged percentage hides which
// one they are looking at.
//
// Sorting and filtering are the only state here, and both stay client-side:
// the table is the whole page, the catalog is already in memory, and a round
// trip per column header would be slower than the sort itself.
//
// The location filter is the calendar's, component and cascade both, so
// "fastest course" and "next race" narrow by the same continent -> country ->
// state levels rather than each inventing their own.

/** Goal time a ranking row links into the calculator with — 4:00, the same
 *  default InputForm opens on, so the link lands on a real chart rather than
 *  an empty form. */
const DEFAULT_GOAL_SECONDS = 4 * 3600;

/**
 * Where a row goes: the race, set up and already charted.
 *
 * Built through `buildResultsHref` rather than by hand so it carries what a
 * fresh form carries — including `fueling`, whose ABSENCE from a results URL
 * is meaningful (InputForm reads it as "the runner turned fueling off"), so a
 * hand-rolled query silently landed people on a chart with the gel cues
 * missing. This is the calendar's `editionHref` minus the date: no date is
 * chosen here, and InputForm's own `resolveRaceDate` then fills in the next
 * edition and its published start time, which is exactly what picking the
 * race from the dropdown would have done.
 */
function raceHref(course: CourseSummary): string {
  return buildResultsHref({
    courseId: course.id,
    unit: "km",
    goalTimeSeconds: DEFAULT_GOAL_SECONDS,
    fueling: DEFAULT_FUELING,
  });
}

type SortKey = "speed" | "gain" | "net" | "altitude" | "name";

const COLUMNS: readonly {
  key: SortKey;
  label: string;
  /** Right-aligned for the numeric columns, matching the splits table. */
  numeric: boolean;
}[] = [
  { key: "name", label: "Race", numeric: false },
  { key: "gain", label: "Climbing", numeric: true },
  { key: "net", label: "Net change", numeric: true },
  { key: "altitude", label: "Altitude", numeric: true },
  { key: "speed", label: "vs flat", numeric: true },
];

/** The comparator for each column, in its natural first direction: fastest,
 *  flattest, biggest drop, A–Z. */
function compare(key: SortKey, a: CourseSummary, b: CourseSummary): number {
  switch (key) {
    case "speed":
      return totalEffortMultiplier(a) - totalEffortMultiplier(b);
    case "altitude":
      // By the PENALTY, not the height: they order the same way, and the
      // penalty is the column people are reading. Every low course ties at
      // exactly 1 and falls back to whatever order it arrived in, which is
      // alphabetical, so the flat block below the threshold stays readable.
      return a.altitude.multiplier - b.altitude.multiplier;
    case "gain":
      return a.terrain.gainM - b.terrain.gainM;
    case "net":
      return a.terrain.netM - b.terrain.netM;
    case "name":
      return a.displayName.localeCompare(b.displayName);
  }
}

export function CourseRankingTable({ catalog }: { catalog: CourseSummary[] }) {
  const [sort, setSort] = useState<SortKey>("speed");
  const [descending, setDescending] = useState(false);
  const [filter, setFilter] = useState<LocationFilter>(ALL_LOCATIONS);
  const router = useRouter();

  const rows = useMemo(() => {
    // Copied before sorting: filterByLocation hands back the SAME array when
    // nothing is narrowed, and sorting in place would reorder the prop.
    const sorted = [...filterByLocation(catalog, filter)].sort((a, b) =>
      compare(sort, a, b),
    );
    return descending ? sorted.reverse() : sorted;
  }, [catalog, filter, sort, descending]);

  // Read off the whole catalog, not `rows`: with a region chosen that is
  // narrowed to one place, and the sentence still has to name the country.
  const place = locationLabel(catalog, filter);

  /**
   * The whole row opens the race, not just the name.
   *
   * The name stays a real `<a>`, which is what makes this reachable by
   * keyboard, crawlable and right-clickable; this handler only widens the
   * target for a mouse. So it gets out of the way when the click already
   * landed on that link, and it honours a modified click by opening a tab,
   * because a row that swallowed cmd-click would be worse than no row click.
   */
  const openRace = (
    event: MouseEvent<HTMLTableRowElement>,
    course: CourseSummary,
  ) => {
    if ((event.target as HTMLElement).closest("a")) return;
    const href = raceHref(course);
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      window.open(href, "_blank", "noopener");
      return;
    }
    router.push(href);
  };

  const toggle = (key: SortKey) => {
    if (key === sort) {
      setDescending((d) => !d);
      return;
    }
    setSort(key);
    setDescending(false);
  };

  const headerClass =
    "px-4 py-3 text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]";

  return (
    <div className="space-y-4">
      <LocationFilterBar
        idPrefix="rankings"
        rows={catalog}
        filter={filter}
        onChange={setFilter}
      />

      <p
        aria-live="polite"
        className="text-sm text-[var(--color-text-secondary)]"
      >
        {rows.length} course{rows.length === 1 ? "" : "s"}
        {place ? ` in ${place}` : " worldwide"}.
      </p>

      <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)]">
        <table className="w-full min-w-3xl border-collapse text-sm">
          <caption className="sr-only">
            Courses in the chosen place, sortable by how fast each one runs, how
            much it climbs, its net elevation change, and what its altitude
            costs.
          </caption>
          <thead className="bg-[var(--color-bg-elevated)]">
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  // aria-sort is what tells a screen-reader user which column is
                  // ordering the table and which way — without it the button
                  // labels are the only clue, and they don't change.
                  aria-sort={
                    sort === col.key
                      ? descending
                        ? "descending"
                        : "ascending"
                      : "none"
                  }
                  className={`${headerClass} ${col.numeric ? "text-right" : "text-left"}`}
                >
                  <button
                    type="button"
                    onClick={() => toggle(col.key)}
                    className="inline-flex items-center gap-1 uppercase tracking-wider transition-colors hover:text-[var(--color-text-primary)]"
                  >
                    {col.label}
                    <span aria-hidden className="text-[10px]">
                      {sort === col.key ? (descending ? "▼" : "▲") : "↕"}
                    </span>
                  </button>
                </th>
              ))}
              <th scope="col" className={`${headerClass} text-left`}>
                Terrain
              </th>
              {/* Holds the row-click chevron. Empty on purpose, and not a
                  sortable column. */}
              <th scope="col" className={headerClass}>
                <span className="sr-only">Open this race</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((course) => (
              <tr
                key={course.id}
                onClick={(event) => openRace(event, course)}
                className="group cursor-pointer border-t border-[var(--color-border)] transition-colors hover:bg-[var(--color-bg-elevated)]"
              >
                <td className="px-4 py-3">
                  <Link
                    href={raceHref(course)}
                    className="font-medium text-[var(--color-text-primary)] transition-colors group-hover:text-[var(--color-red-primary)]"
                  >
                    {course.displayName}
                  </Link>
                  <span className="mt-0.5 block text-xs text-[var(--color-text-tertiary)]">
                    {formatLocation(
                      course.city,
                      course.regionCode,
                      course.countryName,
                    )}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-tabular text-[var(--color-text-secondary)]">
                  {formatFeet(metresToFeet(course.terrain.gainM))}
                </td>
                <td
                  className={`px-4 py-3 text-right font-tabular ${
                    isNetDownhill(course.terrain)
                      ? "text-[var(--color-green-primary)]"
                      : "text-[var(--color-text-secondary)]"
                  }`}
                >
                  {formatSignedFeet(metresToFeet(course.terrain.netM))}
                </td>
                <td className="px-4 py-3 text-right font-tabular text-[var(--color-text-tertiary)]">
                  {/* An em dash standing in for "nothing to report" — most of
                      the catalog is below the threshold, and three hundred rows
                      reading "0.0% slower" would bury the dozen that matter. */}
                  {formatAltitudePenalty(course.altitude) ?? (
                    <>
                      <span aria-hidden>&mdash;</span>
                      <span className="sr-only">No altitude penalty</span>
                    </>
                  )}
                  {formatAltitudePenalty(course.altitude) && (
                    <span className="mt-0.5 block text-xs text-[var(--color-text-tertiary)]">
                      {formatFeet(metresToFeet(course.altitude.meanM))} avg
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-tabular text-[var(--color-text-secondary)]">
                  {formatVsFlat(totalEffortMultiplier(course))}
                </td>
                <td className="px-4 py-3">
                  <DifficultyBadge terrain={course.terrain} compact />
                </td>
                {/* The affordance for the row click. Decorative only: the race
                    name beside it is the real link, and announcing this arrow
                    would just read the same destination twice. */}
                <td
                  aria-hidden
                  className="px-4 py-3 text-right text-[var(--color-text-tertiary)] transition-colors group-hover:text-[var(--color-red-primary)]"
                >
                  &rsaquo;
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
