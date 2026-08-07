"use client";
import { useEffect, useState } from "react";
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
          {result && (
            <>
              <SummaryHeader
                result={result}
                courseName={course.displayName}
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
