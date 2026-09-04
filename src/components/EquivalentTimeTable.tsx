"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { CourseId, CourseSummary } from "@/types";
import { effortMultiplier, equivalentGoalTime } from "@/lib/pacing/effort";
import { formatHMS, formatSignedHMS } from "@/lib/units/time";
import { formatVsFlat } from "@/lib/units/effort";
import { formatLocation } from "@/lib/location";
import { buildResultsHref } from "@/lib/resultsParams";
import { filterCourses } from "@/components/CourseSearch";
import { DifficultyBadge } from "@/components/DifficultyBadge";

// The same one-line conversion the headline does, run across the whole
// catalog. This is the half no competitor can match: FindMyMarathon converts
// between the races it has hand-rated, we convert between every course we hold
// an elevation profile for, off one Minetti-derived number per course.
//
// Chrome is CourseRankingTable's, deliberately — two sortable catalog tables
// that looked different would read as two different products.

type SortKey = "time" | "name";

/** Ascending by default in both cases: fastest first, A–Z. */
function compare(key: SortKey, a: Row, b: Row): number {
  return key === "time"
    ? a.converted - b.converted
    : a.course.displayName.localeCompare(b.course.displayName);
}

interface Row {
  course: CourseSummary;
  converted: number;
}

const headerClass =
  "px-4 py-3 text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]";

const COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: "name", label: "Race", numeric: false },
  { key: "time", label: "Your equivalent time", numeric: true },
];

interface Props {
  catalog: CourseSummary[];
  /** The course the entered time was run at — its own row is the baseline. */
  from: CourseSummary;
  /** The headline's target, highlighted so it stays findable in 300+ rows. */
  toId: CourseId | "";
  goalTimeSeconds: number;
}

export function EquivalentTimeTable({
  catalog,
  from,
  toId,
  goalTimeSeconds,
}: Props) {
  const [sort, setSort] = useState<SortKey>("time");
  const [descending, setDescending] = useState(false);
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    // `filterCourses` is CourseSearch's own matcher — name, city or country —
    // reused so this box and the pickers above it agree on what "Munich"
    // matches. Filter before converting: on a narrow query that is 300-odd
    // multiplies skipped, and the conversion is pure so order is free.
    const sorted = filterCourses(catalog, query)
      .map((course) => ({
        course,
        converted: equivalentGoalTime(
          goalTimeSeconds,
          from.effort,
          course.effort,
        ),
      }))
      .sort((a, b) => compare(sort, a, b));
    return descending ? sorted.reverse() : sorted;
  }, [catalog, query, from, goalTimeSeconds, sort, descending]);

  const toggle = (key: SortKey) => {
    if (key === sort) {
      setDescending((d) => !d);
      return;
    }
    setSort(key);
    setDescending(false);
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 className="font-display text-xl tracking-tight text-[var(--color-text-primary)]">
            The same effort at every course
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            What {formatHMS(goalTimeSeconds)} at {from.displayName} is worth
            across all {catalog.length} courses we hold a profile for.
          </p>
        </div>
        <div className="w-full sm:w-72">
          <label htmlFor="compare-filter" className="sr-only">
            Filter races
          </label>
          <input
            id="compare-filter"
            type="search"
            value={query}
            placeholder="Filter races…"
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-4 py-2.5 text-sm text-[var(--color-text-primary)] transition-colors focus:border-[var(--color-border-focus)] focus:outline-none"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)]">
        <table className="w-full min-w-3xl border-collapse text-sm">
          <caption className="sr-only">
            Every course, with the finish time that costs the same effort as{" "}
            {formatHMS(goalTimeSeconds)} at {from.displayName}. Sortable by time
            and by name.
          </caption>
          <thead className="bg-[var(--color-bg-elevated)]">
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  scope="col"
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
              <th scope="col" className={`${headerClass} text-right`}>
                Difference
              </th>
              <th scope="col" className={`${headerClass} text-right`}>
                Vs flat
              </th>
              <th scope="col" className={`${headerClass} text-left`}>
                Terrain
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr className="border-t border-[var(--color-border)]">
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-[var(--color-text-tertiary)]"
                >
                  No races match “{query}”
                </td>
              </tr>
            ) : (
              rows.map(({ course, converted }) => {
                const isFrom = course.id === from.id;
                const isTo = course.id === toId;
                const delta = converted - goalTimeSeconds;
                return (
                  <tr
                    key={course.id}
                    // The two courses in the headline get the elevated fill so
                    // they stay locatable once the list is 300 rows long.
                    className={`border-t border-[var(--color-border)] transition-colors hover:bg-[var(--color-bg-elevated)] ${
                      isFrom || isTo ? "bg-[var(--color-bg-elevated)]" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={buildResultsHref({
                          courseId: course.id,
                          unit: "km",
                          goalTimeSeconds: Math.round(converted),
                        })}
                        className="font-medium text-[var(--color-text-primary)] transition-colors hover:text-[var(--color-red-primary)]"
                      >
                        {course.displayName}
                      </Link>
                      {isFrom && (
                        <span className="ml-2 text-xs text-[var(--color-text-tertiary)]">
                          your time
                        </span>
                      )}
                      <span className="mt-0.5 block text-xs text-[var(--color-text-tertiary)]">
                        {formatLocation(
                          course.city,
                          course.regionCode,
                          course.countryName,
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-tabular text-[var(--color-text-primary)]">
                      {formatHMS(converted)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-tabular ${
                        Math.abs(delta) < 1
                          ? "text-[var(--color-text-tertiary)]"
                          : delta > 0
                            ? "text-[var(--color-red-primary)]"
                            : "text-[var(--color-green-primary)]"
                      }`}
                    >
                      {formatSignedHMS(delta)}
                    </td>
                    <td className="px-4 py-3 text-right font-tabular text-[var(--color-text-secondary)]">
                      {formatVsFlat(effortMultiplier(course.effort))}
                    </td>
                    <td className="px-4 py-3">
                      <DifficultyBadge terrain={course.terrain} compact />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
