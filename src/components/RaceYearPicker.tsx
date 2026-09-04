"use client";
import type { EditionOption } from "@/types";
import { isPastISO } from "@/lib/editions";
import { formatDateDisplay } from "@/lib/units/date";

// Picking a race year, not a race day.
//
// The date used to be a bare calendar picker with no bounds — every cell of
// every month back to 2019 was live, and none of them was connected to an
// actual running of the race. A runner pacing Boston had to know that Boston
// 2027 falls on April 19th, and nothing caught them if they guessed wrong or
// left last year's date sitting in the field.
//
// The years come from the edition table, so choosing one fills in the real
// date, the real start time where the organizer has published one, and the
// weather that goes with it. `Custom date…` is the escape hatch back to the
// old control for anyone pacing a route on a day we don't list.
export const CUSTOM_DATE = "__custom__";

interface Props {
  id: string;
  editions: EditionOption[];
  /** Currently selected race date, "YYYY-MM-DD", or "" when unset. */
  value: string;
  onSelectEdition: (edition: EditionOption) => void;
  onSelectCustom: () => void;
  /** Set while the custom date picker is showing, so the select reflects it. */
  custom: boolean;
  todayISO: string;
}

const selectClass =
  "w-full appearance-none rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-4 py-3 text-left text-base font-tabular text-[var(--color-text-primary)] focus:border-[var(--color-border-focus)] focus:outline-none transition-colors";

/**
 * "2027 · Apr 19th, 2027" is redundant, so the year leads and the date follows
 * in short form. A past year says so, because it changes what the weather panel
 * will show; an estimated date says so, because it is a guess from the series'
 * recurrence rule rather than a published date.
 */
export function editionLabel(
  edition: EditionOption,
  todayISO: string,
): string {
  const parts: string[] = [String(edition.year)];
  if (edition.variant) parts[0] += ` (${edition.variant})`;
  parts.push(formatDateDisplay(edition.raceDateISO).replace(`, ${edition.year}`, ""));

  const tags: string[] = [];
  if (isPastISO(edition.raceDateISO, todayISO)) tags.push("past");
  if (edition.dateConfidence !== "confirmed") tags.push("estimated");

  const label = parts.join(" · ");
  return tags.length > 0 ? `${label} — ${tags.join(", ")}` : label;
}

export function RaceYearPicker({
  id,
  editions,
  value,
  onSelectEdition,
  onSelectCustom,
  custom,
  todayISO,
}: Props) {
  // Oldest first, matching the calendar's direction of travel.
  const sorted = [...editions].sort((a, b) =>
    a.raceDateISO.localeCompare(b.raceDateISO),
  );

  // A date carried in from a shared link may not match any edition — it was
  // someone's custom pick. Show custom rather than silently snapping to a year.
  const matched = sorted.find((e) => e.raceDateISO === value);
  const selectValue = custom || (value && !matched) ? CUSTOM_DATE : (matched?.raceDateISO ?? "");

  return (
    <div className="relative">
      <select
        id={id}
        value={selectValue}
        onChange={(e) => {
          const next = e.target.value;
          if (next === CUSTOM_DATE) {
            onSelectCustom();
            return;
          }
          const edition = sorted.find((s) => s.raceDateISO === next);
          if (edition) onSelectEdition(edition);
        }}
        className={selectClass}
      >
        {selectValue === "" && (
          <option value="" disabled>
            Select a year
          </option>
        )}
        {sorted.map((e) => (
          // Keyed and valued by date, not year: a series can run twice in one
          // year (London 2027 splits elite and mass across two days), and the
          // date is the only thing unique across both rows.
          <option key={e.raceDateISO} value={e.raceDateISO}>
            {editionLabel(e, todayISO)}
          </option>
        ))}
        <option value={CUSTOM_DATE}>Custom date…</option>
      </select>
      <span
        aria-hidden
        className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]"
      >
        ▾
      </span>
    </div>
  );
}
