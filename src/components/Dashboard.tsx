"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PacingInput } from "@/types";
import { usePacingChart } from "@/hooks/usePacingChart";
import { useWeather } from "@/hooks/useWeather";
import { getCourse } from "@/data/courses";
import { buildResultsHref } from "@/lib/resultsParams";
import { InputForm } from "@/components/InputForm";
import { SummaryHeader } from "@/components/SummaryHeader";
import { ElevationChart } from "@/components/ElevationChart";
import { WeatherPanel } from "@/components/WeatherPanel";
import { PaceChartTable } from "@/components/PaceChartTable";
import { PlaceholderPanel } from "@/components/PlaceholderPanel";

// Paceband-style split dashboard: config on the left, live outputs on the
// right. Reuses the locked pacing engine via usePacingChart so the math
// path is identical to the previous /results flow, and layers Phase 2
// weather + fueling on top. `input` is the server-parsed PacingInput from the
// URL and seeds the initial state.
const ROADMAP: { title: string; note: string }[] = [
  { title: "Wearable sync", note: "Garmin / Apple Health via Terra — coming soon" },
  {
    title: "Smartwatch export",
    note: ".FIT workout export + paceband preview — coming soon",
  },
];

export function Dashboard({ input }: { input: PacingInput }) {
  const router = useRouter();
  const { result, error, calculate } = usePacingChart();
  const [current, setCurrent] = useState<PacingInput>(input);

  const course = getCourse(current.courseId);
  const weather = useWeather(
    course.start,
    current.raceDateISO,
    current.raceStartTime,
  );
  const { conditions } = weather;
  const hasTiming = Boolean(current.raceDateISO && current.raceStartTime);

  // The full input fed to the pacing engine merges the form state with the
  // active weather conditions (forecast or manual).
  const merged = useMemo<PacingInput>(
    () => ({ ...current, weather: conditions ?? undefined }),
    [current, conditions],
  );

  // Recompute on every config or weather change (same elevation math path).
  useEffect(() => {
    calculate(merged);
  }, [calculate, merged]);

  // Keep the URL shareable without flooding history. Debounced so rapid
  // typing in the goal-time inputs doesn't thrash navigation.
  useEffect(() => {
    const id = setTimeout(() => {
      router.replace(buildResultsHref(merged), { scroll: false });
    }, 300);
    return () => clearTimeout(id);
  }, [router, merged]);

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-12">
      <Link
        href="/"
        className="text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
      >
        ← Back to start
      </Link>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(320px,380px)_1fr]">
        <div className="lg:sticky lg:top-12 lg:self-start">
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-8">
            <InputForm
              title="Race setup"
              initial={input}
              onChange={setCurrent}
            />
          </div>
        </div>

        <div className="space-y-10">
          {error && (
            <p className="text-sm text-[var(--color-red-primary)]">{error}</p>
          )}
          {result && (
            <>
              <SummaryHeader
                result={result}
                courseName={getCourse(result.input.courseId).displayName}
              />
              <WeatherPanel
                weather={weather}
                goalSeconds={result.input.goalTimeSeconds}
                adjustedFinishSeconds={result.adjustedFinishSeconds}
                weatherApplied={result.weatherApplied}
                hasTiming={hasTiming}
              />
              <ElevationChart
                profile={getCourse(result.input.courseId).profile}
                unit={result.input.unit}
              />
              <PaceChartTable result={result} />
            </>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {ROADMAP.map((p) => (
              <PlaceholderPanel key={p.title} title={p.title} note={p.note} />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
