"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Course, CourseSummary, PacingInput, WeatherConditions } from "@/types";
import { usePacingChart } from "@/hooks/usePacingChart";
import { buildResultsHref } from "@/lib/resultsParams";
import { InputForm } from "@/components/InputForm";
import { SummaryHeader } from "@/components/SummaryHeader";
import { ElevationChart } from "@/components/ElevationChart";
import { PaceChartTable } from "@/components/PaceChartTable";
import { PaceBand } from "@/components/PaceBand";
import { UploadedCourseNotice } from "@/components/UploadedCourseNotice";
import { formatLocation } from "@/lib/location";
import { courseEffort, effortMultiplier } from "@/lib/pacing/effort";
import { courseTerrain } from "@/lib/pacing/terrain";
import { bqStatus } from "@/lib/bq/qualify";
import { useStoredState } from "@/hooks/useStoredState";
import { BQ_PROFILE } from "@/lib/stateKeys";

// Paceband-style split dashboard: config on the left, live outputs on the
// right. Reuses the locked pacing engine via usePacingChart so the math
// path is identical to the previous /results flow, and layers Phase 2
// weather + fueling on top. `input` is the server-parsed PacingInput from the
// URL and seeds the initial state.

export function Dashboard({
  input,
  course,
  catalog,
}: {
  input: PacingInput;
  course: Course;
  catalog: CourseSummary[];
}) {
  const router = useRouter();
  const { result, error, calculate } = usePacingChart();
  const [current, setCurrent] = useState<PacingInput>(input);
  // Captured from InputForm's own weather hook via onHourlyChange — the live
  // forecast series (or null in manual mode) driving per-segment sampling.
  const [hourly, setHourly] = useState<WeatherConditions[] | null>(null);

  // Switching course in the form changes `current` immediately, but the new
  // geometry only arrives after the URL round-trips to the server. Charting
  // Berlin's elevations under Boston's name for those few hundred ms would be
  // silently wrong, so hold off until the two agree.
  const courseIsCurrent = course.id === current.courseId;

  // Both are reductions over the same 44 points, and `effortMultiplier` runs
  // Minetti across every segment in both segmentations — cheap once, wasteful
  // on every keystroke in a form that recomputes live.
  const terrain = useMemo(() => courseTerrain(course.elevations), [course]);
  const effort = useMemo(
    () => effortMultiplier(courseEffort(course.elevations)),
    [course],
  );

  // Judged on the GOAL time, not the weather-adjusted finish: the standard is
  // a fact about the plan the runner is building here, and pairing it with a
  // conditions-dependent number would make the verdict move with the forecast.
  // Null until someone has set a profile on /boston-qualifier.
  const [bqProfile] = useStoredState(BQ_PROFILE);
  const bq = useMemo(
    () =>
      bqProfile
        ? bqStatus({
            finishSeconds: current.goalTimeSeconds,
            age: bqProfile.age,
            division: bqProfile.division,
            terrain,
          })
        : null,
    [bqProfile, current.goalTimeSeconds, terrain],
  );

  // `current` already carries `weather` when InputForm's toggle is on (built
  // the same way `body` is) — no separate merge needed here.
  useEffect(() => {
    if (!courseIsCurrent) return;
    calculate(current, course, hourly);
  }, [calculate, current, course, courseIsCurrent, hourly]);

  // Keep the URL shareable without flooding history. Debounced so rapid
  // typing in the goal-time inputs doesn't thrash navigation.
  useEffect(() => {
    const id = setTimeout(() => {
      router.replace(buildResultsHref(current), { scroll: false });
    }, 300);
    return () => clearTimeout(id);
  }, [router, current]);

  return (
    // Ordinary document flow: the page is the only scroller. Wherever the
    // pointer sits — setup panel, chart, splits table — the wheel scrolls the
    // whole page, because no section is an overflow container.
    // print:p-0 — the screen padding otherwise pushes the paceband + fold
    // guide past one printed page.
    <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-12 print:p-0">
      <Link
        href="/"
        className="text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)] print:hidden"
      >
        ← Back to start
      </Link>

      {/* print:hidden on the whole grid so the paceband below is the only
          content the printer sees. */}
      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(320px,380px)_1fr] print:hidden">
        {/* self-start keeps the card at its content height — grid items
            stretch by default, which would otherwise pull this bordered box
            down to match the much taller results column. */}
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-8 lg:self-start">
          <InputForm
            title="Race setup"
            initial={input}
            catalog={catalog}
            onChange={setCurrent}
            onHourlyChange={setHourly}
          />
        </div>

        <div className="space-y-10">
          {error && (
            <p className="text-sm text-[var(--color-red-primary)]">{error}</p>
          )}
          {course.isUserUpload && (
            <UploadedCourseNotice
              elevationSource={course.elevationSource}
              expiresAtISO={course.expiresAtISO ?? null}
            />
          )}
          {result && (
            <>
              <SummaryHeader
                result={result}
                courseName={course.displayName}
                // An uploaded course has no city or country to format —
                // nobody told us where it is — so it names what it is rather
                // than rendering an empty ", ".
                location={
                  course.isUserUpload
                    ? "Uploaded course"
                    : formatLocation(
                        course.city,
                        course.regionCode,
                        course.countryName,
                      )
                }
                // Both derived from the 44 points already in the browser for
                // this one course — no catalog lookup, nothing new fetched.
                terrain={terrain}
                effortMultiplier={effort}
                bq={bq}
              />
              <ElevationChart
                profile={course.profile}
                unit={result.input.unit}
                rows={result.rows}
              />
              <PaceChartTable result={result} />
            </>
          )}
        </div>
      </div>

      {result && (
        <PaceBand
          result={result}
          courseName={course.displayName}
        />
      )}
    </main>
  );
}
