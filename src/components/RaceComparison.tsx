"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { CourseId, CourseSummary, GoalTimeInput, Unit } from "@/types";
import {
  effortMultiplier,
  equivalentGoalTime,
  gapPaceFromGoalTime,
} from "@/lib/pacing/effort";
import { MILE_IN_KM } from "@/lib/pacing/segments";
import { formatHMS, formatSignedHMS, toSeconds } from "@/lib/units/time";
import { formatPace } from "@/lib/units/pace";
import { formatVsFlat } from "@/lib/units/effort";
import { formatLocation } from "@/lib/location";
import { buildResultsHref } from "@/lib/resultsParams";
import {
  buildCompareHref,
  MAX_COMPARE_SECONDS,
  type CompareSelection,
} from "@/lib/compareParams";
import { CourseSearch } from "@/components/CourseSearch";
import { DifficultyBadge } from "@/components/DifficultyBadge";
import { UnitToggle } from "@/components/UnitToggle";
import { EquivalentTimeTable } from "@/components/EquivalentTimeTable";

// ROADMAP #8. Two courses, one finish time, and the time that costs the same
// effort at the other race.
//
// No geometry and no new query: `CourseSummary.effort` has ridden on every
// catalog row since #3, so the entire page is a ratio of two numbers the
// browser was already sent.

const eyebrowClass =
  "block text-xs uppercase tracking-wider font-medium text-[var(--color-text-tertiary)]";

// Mirrors `numClass` in InputForm, which is not exported. Kept as its own copy
// rather than reaching into that component: it is the DESIGN.md numeric-input
// string, and NumericField already sets the precedent of each form owning its
// own copy of the shared field classes.
const numClass =
  "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] px-3 py-3 text-center text-xl font-tabular font-medium focus:border-[var(--color-border-focus)] focus:outline-none transition-colors";

const UNIT_OPTIONS: readonly (readonly [Unit, string])[] = [
  ["km", "km"],
  ["miles", "mi"],
];

function secondsToGoalTime(total: number): GoalTimeInput {
  const t = Math.max(0, Math.round(total));
  return {
    hours: Math.floor(t / 3600),
    minutes: Math.floor((t % 3600) / 60),
    seconds: t % 60,
  };
}

/**
 * The same bounds InputForm validates against, so a time that builds a pacing
 * chart is exactly a time that can be converted.
 */
export function goalTimeError(time: GoalTimeInput): string | null {
  const { hours, minutes, seconds } = time;
  if (!Number.isInteger(hours) || hours < 0 || hours > 9)
    return "Hours must be 0–9";
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 59)
    return "Minutes must be 0–59";
  if (!Number.isInteger(seconds) || seconds < 0 || seconds > 59)
    return "Seconds must be 0–59";
  const total = toSeconds(time);
  if (total <= 0) return "Enter a finish time";
  if (total > MAX_COMPARE_SECONDS) return "Finish time must be under 10 hours";
  return null;
}

/**
 * The grade-adjusted pace both finishes are run at, in the display unit.
 *
 * Derived from the km figure and then unit-converted, NOT recomputed against
 * the mile segmentation. That distinction is the whole reason this is a
 * function: GAP is one physical quantity — seconds per flat-equivalent
 * kilometre — and rendering it per mile is a unit conversion. Recomputing it
 * from `effort.miles` would instead re-segment the course, and since
 * `equivalentGoalTime` is defined on km, the two finishes would then print
 * *different* grade-adjusted paces while the page claims they are the same.
 */
export function sharedGapPace(
  goalTimeSeconds: number,
  effort: CourseSummary["effort"],
  unit: Unit,
): number {
  const perKm = gapPaceFromGoalTime(goalTimeSeconds, effort, "km");
  return unit === "km" ? perKm : perKm * MILE_IN_KM;
}

interface Props {
  catalog: CourseSummary[];
  initial: CompareSelection;
}

export function RaceComparison({ catalog, initial }: Props) {
  const [fromId, setFromId] = useState<CourseId | "">(initial.fromId);
  const [toId, setToId] = useState<CourseId | "">(initial.toId);
  const [unit, setUnit] = useState<Unit>(initial.unit);
  const [goalTime, setGoalTime] = useState<GoalTimeInput>(
    secondsToGoalTime(initial.goalTimeSeconds),
  );

  const error = goalTimeError(goalTime);
  const goalTimeSeconds = error ? 0 : toSeconds(goalTime);

  const from = catalog.find((c) => c.id === fromId) ?? null;
  const to = catalog.find((c) => c.id === toId) ?? null;

  // The address bar is rewritten in place rather than navigated: replaceState
  // leaves no history entry (so Back still leaves the page rather than undoing
  // one keystroke at a time), re-renders nothing, and needs no router. Skipped
  // entirely while the time is invalid — a half-typed field should not blow
  // away a URL the runner may be about to copy.
  const href = buildCompareHref({ fromId, toId, goalTimeSeconds, unit });
  useEffect(() => {
    if (error) return;
    window.history.replaceState(null, "", href);
  }, [href, error]);

  const converted =
    from && to && !error
      ? equivalentGoalTime(goalTimeSeconds, from.effort, to.effort)
      : null;
  const delta = converted === null ? 0 : converted - goalTimeSeconds;

  const swap = () => {
    setFromId(toId);
    setToId(fromId);
  };

  const update = (key: keyof GoalTimeInput) => (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    setGoalTime({ ...goalTime, [key]: digits === "" ? NaN : Number(digits) });
  };

  return (
    <div className="space-y-10">
      <div className="space-y-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-6 sm:p-8">
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <label className={eyebrowClass} htmlFor="compare-hours">
              Your finish time
            </label>
            <UnitToggle
              label="Pace unit"
              value={unit}
              options={UNIT_OPTIONS}
              onChange={setUnit}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            {(
              [
                ["hours", "HH", goalTime.hours, 9],
                ["minutes", "MM", goalTime.minutes, 59],
                ["seconds", "SS", goalTime.seconds, 59],
              ] as const
            ).map(([key, placeholder, value, max]) => (
              <div key={key}>
                <input
                  id={`compare-${key}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={max}
                  placeholder={placeholder}
                  aria-label={key}
                  value={Number.isNaN(value) ? "" : value}
                  onChange={(e) => update(key)(e.target.value)}
                  className={numClass}
                />
                <span className={`mt-2 text-center ${eyebrowClass}`}>{key}</span>
              </div>
            ))}
          </div>
          {error && (
            <p
              role="alert"
              className="mt-3 text-sm text-[var(--color-red-primary)]"
            >
              {error}
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
          <div>
            <label htmlFor="compare-from" className={`mb-2 ${eyebrowClass}`}>
              Run at this race
            </label>
            <CourseSearch
              id="compare-from"
              catalog={catalog}
              value={fromId}
              onSelect={setFromId}
              placeholder="Search races…"
            />
          </div>

          {/* Hand-drawn to match every other icon in the repo — 20×20 box,
              1.75 stroke, no icon library (Rule 5). Padding rather than a
              fixed height so it lands level with the inputs beside it. */}
          <button
            type="button"
            onClick={swap}
            aria-label="Swap the two races"
            className="justify-self-center rounded-lg border border-[var(--color-border)] px-3 py-3 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
          >
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6"
              aria-hidden="true"
            >
              <path d="M3 7h11l-3.5-3.5" />
              <path d="M17 13H6l3.5 3.5" />
            </svg>
          </button>

          <div>
            <label htmlFor="compare-to" className={`mb-2 ${eyebrowClass}`}>
              Equivalent at this one
            </label>
            <CourseSearch
              id="compare-to"
              catalog={catalog}
              value={toId}
              onSelect={setToId}
              placeholder="Search races…"
            />
          </div>
        </div>
      </div>

      {from && to && converted !== null && (
        <Result
          from={from}
          to={to}
          goalTimeSeconds={goalTimeSeconds}
          converted={converted}
          delta={delta}
          unit={unit}
        />
      )}

      {from && !error && (
        <EquivalentTimeTable
          catalog={catalog}
          from={from}
          toId={toId}
          goalTimeSeconds={goalTimeSeconds}
        />
      )}
    </div>
  );
}

function Result({
  from,
  to,
  goalTimeSeconds,
  converted,
  delta,
  unit,
}: {
  from: CourseSummary;
  to: CourseSummary;
  goalTimeSeconds: number;
  converted: number;
  delta: number;
  unit: Unit;
}) {
  // Red slower, green faster — the two meanings already in the system, not a
  // new pair. Inside the rounding noise it stays neutral, the same refusal to
  // over-claim that puts a ±0.5% dead band on formatVsFlat.
  const deltaClass =
    Math.abs(delta) < 1
      ? "text-[var(--color-text-tertiary)]"
      : delta > 0
        ? "text-[var(--color-red-primary)]"
        : "text-[var(--color-green-primary)]";

  return (
    <section className="space-y-6" aria-label="Comparison result">
      <div className="grid gap-8 border-t border-b border-[var(--color-border)] py-8 sm:grid-cols-3">
        <CourseStat course={from} value={formatHMS(goalTimeSeconds)} label="Your time at" />
        <CourseStat course={to} value={formatHMS(converted)} label="Works out to">
          <p className={`font-tabular text-sm ${deltaClass}`}>
            {formatSignedHMS(delta)}
          </p>
        </CourseStat>
        <div className="space-y-1">
          <p className={eyebrowClass}>Grade-adjusted pace</p>
          <p className="font-tabular text-2xl font-medium text-[var(--color-text-primary)]">
            {formatPace(sharedGapPace(goalTimeSeconds, from.effort, unit), unit)}
          </p>
          <p className="text-sm text-[var(--color-text-secondary)]">
            The same on both — that is what makes the two times equal effort.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Link
          href={buildResultsHref({
            courseId: to.id,
            unit,
            goalTimeSeconds: Math.round(converted),
          })}
          className="rounded-lg bg-[var(--color-red-primary)] px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-[var(--color-red-deep)]"
        >
          Build a pacing chart for {to.displayName}
        </Link>
        <p className="text-sm text-[var(--color-text-tertiary)]">
          Terrain only. Weather, altitude and race-day conditions are not in
          this number.
        </p>
      </div>
    </section>
  );
}

function CourseStat({
  course,
  value,
  label,
  children,
}: {
  course: CourseSummary;
  value: string;
  label: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className={eyebrowClass}>
        {label} {course.displayName}
      </p>
      <p className="font-tabular text-2xl font-medium text-[var(--color-text-primary)]">
        {value}
      </p>
      {children}
      <p className="text-sm text-[var(--color-text-secondary)]">
        {formatLocation(course.city, course.regionCode, course.countryName)}
      </p>
      <div className="pt-1">
        <DifficultyBadge terrain={course.terrain} compact />
      </div>
      <p className="text-sm text-[var(--color-text-tertiary)]">
        {formatVsFlat(effortMultiplier(course.effort))}
      </p>
    </div>
  );
}
