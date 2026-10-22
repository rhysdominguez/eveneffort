"use client";
import { type MouseEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CourseSummary } from "@/types";
import { DEFAULT_FUELING } from "@/types";
import { buildResultsHref } from "@/lib/resultsParams";
import {
  TERRAIN_LABELS,
  isNetDownhill,
  terrainLabel,
} from "@/lib/pacing/terrain";
import { ProfileSparkline } from "@/components/ProfileSparkline";
import { metresToFeet } from "@/lib/units/elevation";
import { formatVsFlat, totalEffortMultiplier } from "@/lib/units/effort";
import { formatFeet, formatSignedFeet } from "@/lib/chart/geometry";
import { formatLocation } from "@/lib/location";
import {
  ALL_LOCATIONS,
  type LocationFilter,
  filterByLocation,
  locationLabel,
} from "@/lib/locationFilter";
import { LocationFilterBar } from "@/components/LocationFilterBar";

// Every course we hold, rankable. The catalog already carries `cost`,
// `effort`, `terrain` and `altitude` for the whole list (ten scalars per
// course), so this needs no geometry and no new query — it sorts what the
// picker ships.
//
// "vs flat" IS THE ALL-IN NUMBER: grade cost times altitude cost, via
// `totalEffortMultiplier`, which reads `cost` and not `effort` — the pacing
// engine's damped curve nearly cancels climbs against descents and used to
// collapse 292 of 326 courses into one "flat-equivalent" tie (ROADMAP #12). The Altitude column beside it states the height
// itself and nothing about what it costs, because a runner scanning for a fast
// race needs to know whether a course is hard underfoot or just high up, and
// those call for completely different preparation. It used to print the
// thin-air penalty as a percentage too, which meant the same cost appeared in
// two adjacent columns with no way to tell they were one claim.
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
  /** Fixed width, in the `<colgroup>`. Absent on Race, which takes the rest. */
  width?: string;
}[] = [
  { key: "name", label: "Race", numeric: false },
  { key: "gain", label: "Climbing", numeric: true, width: "w-32" },
  { key: "net", label: "Net change", numeric: true, width: "w-32" },
  { key: "altitude", label: "Altitude", numeric: true, width: "w-32" },
  // Wider than its siblings: its longest string is "flat-equivalent".
  { key: "speed", label: "vs flat", numeric: true, width: "w-36" },
];

// COLUMN WIDTHS ARE DECISIONS, NOT A SIDE EFFECT. The table used the browser's
// automatic layout, which shares spare width out in proportion to each column's
// content, so the numeric columns came out 137 to 172 px wide for no reason
// anyone chose, each two or three times wider than what it held, while the Race
// column that actually needs room was squeezed. It is `table-fixed` now: the
// three plain numeric columns are the same width so the numbers read as a grid,
// the Terrain column is the 87 px thumbnail plus its padding, and Race is the
// only column left to flex.
const TERRAIN_WIDTH = "w-32";
const CHEVRON_WIDTH = "w-10";

/** The comparator for each column, in its natural first direction: fastest,
 *  flattest, biggest drop, A–Z. */
function compare(key: SortKey, a: CourseSummary, b: CourseSummary): number {
  switch (key) {
    case "speed":
      return totalEffortMultiplier(a) - totalEffortMultiplier(b);
    case "altitude":
      // By the HEIGHT, which is what the column now prints. It shipped sorting
      // on the thin-air penalty instead, which ordered identically above the
      // threshold but tied every low course at exactly 1; the mean elevation
      // separates them, so the flat block below the threshold now sorts too.
      return a.altitude.meanM - b.altitude.meanM;
    case "gain":
      return a.terrain.gainM - b.terrain.gainM;
    case "net":
      return a.terrain.netM - b.terrain.netM;
    case "name":
      return a.displayName.localeCompare(b.displayName);
  }
}

export function CourseRankingTable({
  catalog,
  profilePaths = {},
}: {
  catalog: CourseSummary[];
  /**
   * Course id -> the SVG path of its elevation thumbnail, built server-side
   * (`getCourseProfilePaths`). Optional and per-course: a course with no entry
   * shows its profile label alone, so the table degrades rather than breaks.
   */
  profilePaths?: Record<string, string>;
}) {
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
        <table className="w-full min-w-4xl table-fixed border-collapse text-sm">
          <caption className="sr-only">
            Courses in the chosen place, sortable by how fast each one runs, how
            much it climbs, its net elevation change, and how high above sea
            level it runs.
          </caption>
          <colgroup>
            {COLUMNS.map((col) => (
              <col key={col.key} className={col.width} />
            ))}
            <col className={TERRAIN_WIDTH} />
            <col className={CHEVRON_WIDTH} />
          </colgroup>
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
                <td className="px-4 py-3 text-right font-tabular text-[var(--color-text-secondary)]">
                  {/* The height alone. This shipped as the thin-air penalty
                      ("7.0% slower") with the height as a subscript and an em
                      dash on the low majority; the penalty is already inside
                      the "vs flat" figure in the next column, so printing it
                      here charged the same cost to the reader twice. */}
                  {formatFeet(metresToFeet(course.altitude.meanM))}
                </td>
                <td className="px-4 py-3 text-right font-tabular text-[var(--color-text-secondary)]">
                  {formatVsFlat(totalEffortMultiplier(course))}
                </td>
                <td className="px-4 py-3">
                  {/* Just the line. The profile pill that used to sit beside it
                      is gone by request: the shape is the column. The label
                      survives as screen-reader text only, because the SVG is
                      aria-hidden and the cell would otherwise announce nothing. */}
                  <ProfileSparkline path={profilePaths[course.id]} />
                  <span className="sr-only">
                    {TERRAIN_LABELS[terrainLabel(course.terrain)]}
                  </span>
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
