"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { CourseSummary } from "@/types";
import { effortMultiplier } from "@/lib/pacing/effort";
import { isNetDownhill } from "@/lib/pacing/terrain";
import { DifficultyBadge } from "@/components/DifficultyBadge";
import { metresToFeet } from "@/lib/units/elevation";
import { formatVsFlat } from "@/lib/units/effort";
import { formatFeet, formatSignedFeet } from "@/lib/chart/geometry";
import { formatLocation } from "@/lib/location";

// Every course we hold, rankable. The catalog already carries `effort` and
// `terrain` for the whole list (two and three scalars per course), so this
// needs no geometry and no new query — it sorts what the picker already ships.
//
// Sorting is the only state here, and it stays client-side: the table is the
// whole page, the catalog is already in memory, and a round trip per column
// header would be slower than the sort itself.

/** Goal time a ranking row links into the calculator with — 4:00, the same
 *  default InputForm opens on, so the link lands on a real chart rather than
 *  an empty form. */
const DEFAULT_GOAL_SECONDS = 4 * 3600;

type SortKey = "speed" | "gain" | "net" | "name";

const COLUMNS: readonly {
  key: SortKey;
  label: string;
  /** Right-aligned for the numeric columns, matching the splits table. */
  numeric: boolean;
}[] = [
  { key: "name", label: "Race", numeric: false },
  { key: "gain", label: "Climbing", numeric: true },
  { key: "net", label: "Net change", numeric: true },
  { key: "speed", label: "vs flat", numeric: true },
];

/** The comparator for each column, in its natural first direction: fastest,
 *  flattest, biggest drop, A–Z. */
function compare(key: SortKey, a: CourseSummary, b: CourseSummary): number {
  switch (key) {
    case "speed":
      return effortMultiplier(a.effort) - effortMultiplier(b.effort);
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

  const rows = useMemo(() => {
    const sorted = [...catalog].sort((a, b) => compare(sort, a, b));
    return descending ? sorted.reverse() : sorted;
  }, [catalog, sort, descending]);

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
    <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)]">
      <table className="w-full min-w-3xl border-collapse text-sm">
        <caption className="sr-only">
          Every course, sortable by how fast it runs, how much it climbs, and
          its net elevation change.
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
          </tr>
        </thead>
        <tbody>
          {rows.map((course) => (
            <tr
              key={course.id}
              className="border-t border-[var(--color-border)] transition-colors hover:bg-[var(--color-bg-elevated)]"
            >
              <td className="px-4 py-3">
                <Link
                  href={`/results?courseId=${course.id}&unit=km&goalTimeSeconds=${DEFAULT_GOAL_SECONDS}`}
                  className="font-medium text-[var(--color-text-primary)] transition-colors hover:text-[var(--color-red-primary)]"
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
                {formatVsFlat(effortMultiplier(course.effort))}
              </td>
              <td className="px-4 py-3">
                <DifficultyBadge terrain={course.terrain} compact />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
