"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { CourseSummary, GoalTimeInput } from "@/types";
import { useStoredState } from "@/hooks/useStoredState";
import { BQ_PROFILE } from "@/lib/stateKeys";
import { CourseSearch } from "@/components/CourseSearch";
import { NumericField } from "@/components/NumericField";
import { UnitToggle } from "@/components/UnitToggle";
import { BqBadge } from "@/components/BqBadge";
import { bqStatus, cutoffOutlook } from "@/lib/bq/qualify";
import { downhillIndex, isIndexed } from "@/lib/bq/downhill";
import {
  BQ_CUTOFFS,
  BQ_DIVISIONS,
  BQ_DIVISION_LABELS,
  BQ_MIN_AGE,
  BQ_RACE_DATE_LABEL,
  BQ_STANDARDS,
  BQ_YEAR,
  bandLabel,
  bqStandardBand,
  type BqDivision,
} from "@/lib/bq/standards";
import { formatGap, formatHMS, toSeconds } from "@/lib/units/time";
import { metresToFeet } from "@/lib/units/elevation";
import { formatSignedFeet } from "@/lib/chart/geometry";
import { buildResultsHref } from "@/lib/resultsParams";

// The Boston qualifier tool: your standard, whether a goal time clears it, and
// what the course you plan to run does to that time.
//
// The interactive half is small; most of this file is the reference content a
// search for "Boston qualifying times" should land on — the full table, the
// cut-off history, and the races in our own catalog that the net-downhill rule
// touches. That last table is DERIVED from the catalog rather than maintained,
// so it stays correct as races are seeded.

// "" is a real state here — no division chosen yet — and no default is
// offered, because every possible default is a guess about the runner.
type DivisionChoice = BqDivision | "";

const DIVISION_OPTIONS: readonly (readonly [DivisionChoice, string])[] =
  BQ_DIVISIONS.map((d) => [d, BQ_DIVISION_LABELS[d]] as const);

const DEFAULT_GOAL: GoalTimeInput = { hours: 3, minutes: 30, seconds: 0 };

const eyebrowClass =
  "block text-xs uppercase tracking-wider text-[var(--color-text-tertiary)] font-medium";

const numClass =
  "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] px-3 py-3 text-center text-xl font-tabular font-medium focus:border-[var(--color-border-focus)] focus:outline-none transition-colors";

const cellClass = "px-3 py-2 text-sm";

export function BostonQualifier({ catalog }: { catalog: CourseSummary[] }) {
  // `edit ?? stored ?? default`, never useState(from storage): this page is
  // prerendered, so a render-time storage read is a hydration mismatch. Same
  // layering as InputForm.
  const [storedProfile, storeProfile] = useStoredState(BQ_PROFILE);
  const [ageEdit, setAgeEdit] = useState<number | null>(null);
  const [divisionEdit, setDivisionEdit] = useState<DivisionChoice | null>(null);

  const age = ageEdit ?? storedProfile?.age ?? null;
  const division: DivisionChoice = divisionEdit ?? storedProfile?.division ?? "";

  const [goal, setGoal] = useState<GoalTimeInput>(DEFAULT_GOAL);
  const [courseId, setCourseId] = useState("");

  // Written in the handler rather than a write-through effect, matching how
  // InputForm persists the goal mode: the profile only becomes meaningful when
  // both halves are set, so there is nothing to save until then.
  const remember = (nextAge: number | null, nextDivision: DivisionChoice) => {
    if (nextAge !== null && nextDivision !== "" && nextAge >= BQ_MIN_AGE) {
      storeProfile({ age: nextAge, division: nextDivision });
    }
  };

  const course = catalog.find((c) => c.id === courseId) ?? null;
  const goalSeconds = toSeconds(goal);

  const status =
    age !== null && division !== ""
      ? bqStatus({
          finishSeconds: goalSeconds,
          age,
          division,
          terrain: course?.terrain,
        })
      : null;

  const outlook = status?.clears ? cutoffOutlook(status.marginSeconds) : null;
  const activeBand = age !== null ? bqStandardBand(age) : null;

  // Every course the net-downhill rule touches, plus the ones close enough to
  // a threshold that we cannot say. Derived, so seeding a new downhill race
  // adds it here with no edit.
  const indexedCourses = useMemo(
    () =>
      catalog
        .map((c) => ({ course: c, index: downhillIndex(c.terrain) }))
        .filter(({ index }) => isIndexed(index) || index.nearThreshold)
        .sort((a, b) => b.index.dropFt - a.index.dropFt),
    [catalog],
  );

  const setGoalPart = (key: keyof GoalTimeInput, raw: string) => {
    const n = Number(raw);
    setGoal({ ...goal, [key]: Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0 });
  };

  return (
    <div className="space-y-16">
      <section className="grid gap-10 lg:grid-cols-[minmax(320px,380px)_1fr]">
        <div className="space-y-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-8 lg:self-start">
          <NumericField
            id="bq-age"
            label={`Age on ${BQ_RACE_DATE_LABEL}`}
            value={age}
            min={BQ_MIN_AGE}
            max={120}
            placeholder="—"
            onCommit={(next) => {
              setAgeEdit(next);
              remember(next, division);
            }}
          />
          <p className="-mt-4 text-xs text-[var(--color-text-tertiary)]">
            Boston judges you on your age on <em>race day</em>, not on the day
            you ran the qualifier.
          </p>

          <div>
            <span className={`${eyebrowClass} mb-2`}>Division</span>
            <UnitToggle<DivisionChoice>
              label="Division"
              value={division}
              options={DIVISION_OPTIONS}
              onChange={(next) => {
                setDivisionEdit(next);
                remember(age, next);
              }}
            />
          </div>

          <div>
            <span className={`${eyebrowClass} mb-2`}>Goal finish time</span>
            <div className="grid grid-cols-3 gap-2">
              {(["hours", "minutes", "seconds"] as const).map((key) => (
                <input
                  key={key}
                  type="number"
                  min={0}
                  aria-label={key}
                  className={numClass}
                  value={goal[key]}
                  onChange={(e) => setGoalPart(key, e.target.value)}
                />
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className={eyebrowClass}>Qualifying race (optional)</span>
              {course && (
                <button
                  type="button"
                  onClick={() => setCourseId("")}
                  className="text-xs text-[var(--color-text-tertiary)] underline transition-colors hover:text-[var(--color-text-secondary)]"
                >
                  Clear
                </button>
              )}
            </div>
            <CourseSearch
              id="bq-course"
              catalog={catalog}
              value={courseId}
              onSelect={setCourseId}
              placeholder="Search races…"
            />
            <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">
              Only needed if you are running a steeply downhill course — see the
              net-downhill rule below.
            </p>
          </div>
        </div>

        <div className="space-y-6">
          {status === null ? (
            <div className="flex h-48 items-center justify-center rounded-2xl border border-dashed border-[var(--color-border)] px-6 text-center">
              <p className="text-sm text-[var(--color-text-secondary)]">
                Enter your age and division to see your {BQ_YEAR} Boston
                standard.
              </p>
            </div>
          ) : (
            <div className="space-y-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-8">
              <BqBadge status={status} />

              <div className="grid grid-cols-2 gap-6 border-t border-b border-[var(--color-border)] py-6 sm:grid-cols-3">
                <div>
                  <span className={eyebrowClass}>Your standard</span>
                  <span className="mt-1 block text-2xl font-tabular font-medium text-[var(--color-text-primary)]">
                    {formatHMS(status.standardSeconds)}
                  </span>
                </div>
                <div>
                  <span className={eyebrowClass}>Your goal</span>
                  <span className="mt-1 block text-2xl font-tabular font-medium text-[var(--color-text-primary)]">
                    {formatHMS(goalSeconds)}
                  </span>
                </div>
                {status.indexSeconds > 0 && (
                  <div>
                    <span className={eyebrowClass}>Counts as</span>
                    <span className="mt-1 block text-2xl font-tabular font-medium text-[var(--color-text-primary)]">
                      {formatHMS(status.adjustedSeconds)}
                    </span>
                    <span className="mt-1 block text-sm text-[var(--color-text-tertiary)]">
                      after the downhill index
                    </span>
                  </div>
                )}
              </div>

              {outlook && (
                <div className="space-y-2">
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    A {formatGap(status.marginSeconds)} buffer would have been
                    enough in{" "}
                    <strong className="text-[var(--color-text-primary)]">
                      {outlook.clearedCount} of the last{" "}
                      {outlook.considered.length} years
                    </strong>
                    . The toughest of them, {outlook.toughest.year}, needed{" "}
                    {formatGap(outlook.toughest.seconds)} under the standard.
                  </p>
                  {!outlook.clearsToughest && (
                    <p className="text-sm text-[var(--color-text-tertiary)]">
                      Clearing the standard earns the right to apply, not a
                      place. Boston turned away 8,887 qualified applicants for
                      the 2026 race.
                    </p>
                  )}
                </div>
              )}

              {!status.clears && status.eligible && (
                <p className="text-sm text-[var(--color-text-secondary)]">
                  You would need {formatHMS(status.standardSeconds - status.indexSeconds)}{" "}
                  on this course to meet the standard — and faster still to be
                  accepted, given recent cut-offs.
                </p>
              )}

              {course && (
                <Link
                  href={buildResultsHref({
                    goalTimeSeconds: goalSeconds,
                    courseId: course.id,
                    unit: "km",
                  })}
                  className="inline-block text-sm font-medium text-[var(--color-text-secondary)] underline transition-colors hover:text-[var(--color-text-primary)]"
                >
                  Build a pacing plan for {course.displayName} →
                </Link>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-2xl tracking-tight text-[var(--color-text-primary)]">
          {BQ_YEAR} Boston Marathon qualifying standards
        </h2>
        <p className="max-w-2xl text-sm text-[var(--color-text-secondary)]">
          Your age group is the one you fall into on race day,{" "}
          {BQ_RACE_DATE_LABEL}. A time equal to the standard qualifies — it does
          not have to be faster.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className={`${cellClass} font-medium`}>Age group</th>
                {BQ_DIVISIONS.map((d) => (
                  <th key={d} className={`${cellClass} font-medium`}>
                    {BQ_DIVISION_LABELS[d]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {BQ_STANDARDS.map((band) => {
                const active = activeBand?.minAge === band.minAge;
                return (
                  <tr
                    key={band.minAge}
                    aria-current={active ? "true" : undefined}
                    className={`border-b border-[var(--color-border)] ${
                      active
                        ? "bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)]"
                        : "text-[var(--color-text-secondary)]"
                    }`}
                  >
                    <td className={`${cellClass} font-tabular`}>
                      {bandLabel(band)}
                    </td>
                    {BQ_DIVISIONS.map((d) => (
                      <td key={d} className={`${cellClass} font-tabular`}>
                        {formatHMS(band[d])}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-2xl tracking-tight text-[var(--color-text-primary)]">
          What acceptance actually cost
        </h2>
        <p className="max-w-2xl text-sm text-[var(--color-text-secondary)]">
          More runners qualify than Boston has places, so the B.A.A. fills its
          field with whoever ran furthest under their standard. This is the
          buffer that was really required, by year — a zero means every
          qualifier who applied got in.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[24rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className={`${cellClass} font-medium`}>Race year</th>
                <th className={`${cellClass} font-medium`}>Cut-off</th>
              </tr>
            </thead>
            <tbody>
              {BQ_CUTOFFS.map((c) => (
                <tr
                  key={c.year}
                  className="border-b border-[var(--color-border)] text-[var(--color-text-secondary)]"
                >
                  <td className={`${cellClass} font-tabular`}>{c.year}</td>
                  <td className={`${cellClass} font-tabular`}>
                    {c.seconds === 0
                      ? "No cut-off"
                      : `${formatGap(c.seconds)} under`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-2xl tracking-tight text-[var(--color-text-primary)]">
          The net-downhill rule
        </h2>
        <p className="max-w-2xl text-sm text-[var(--color-text-secondary)]">
          New for {BQ_YEAR}: a qualifying time run on a course that finishes far
          below where it started has time <strong>added to it</strong> before it
          is compared against the standard — +5:00 from 1,500 ft of net drop,
          +10:00 from 3,000 ft, and no qualifying at all from 6,000 ft.
        </p>
        {indexedCourses.length > 0 && (
          <>
            <p className="max-w-2xl text-sm text-[var(--color-text-tertiary)]">
              These are the races in our catalog the rule reaches, measured from
              each course&rsquo;s own elevation profile. That is{" "}
              <strong>our estimate, not the B.A.A.&rsquo;s determination</strong>
              : a digitized route is not accurate to a few tens of feet over a
              marathon, so a course sitting near a threshold is flagged rather
              than called. Confirm anything marginal with the B.A.A. and the race
              organizer.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] border-collapse text-left">
                <thead>
                  <tr className="border-b border-[var(--color-border)]">
                    <th className={`${cellClass} font-medium`}>Race</th>
                    <th className={`${cellClass} font-medium`}>Net change</th>
                    <th className={`${cellClass} font-medium`}>Index</th>
                  </tr>
                </thead>
                <tbody>
                  {indexedCourses.map(({ course: c, index }) => (
                    <tr
                      key={c.id}
                      className="border-b border-[var(--color-border)] text-[var(--color-text-secondary)]"
                    >
                      <td className={cellClass}>{c.displayName}</td>
                      <td className={`${cellClass} font-tabular`}>
                        {formatSignedFeet(metresToFeet(c.terrain.netM))}
                      </td>
                      <td className={`${cellClass} font-tabular`}>
                        {!index.eligible
                          ? "Not eligible"
                          : index.indexSeconds > 0
                            ? `+${formatGap(index.indexSeconds)}`
                            : "None"}
                        {index.nearThreshold && (
                          <span className="ml-2 font-sans text-xs text-[var(--color-text-tertiary)]">
                            near the threshold
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
