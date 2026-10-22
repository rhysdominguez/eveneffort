"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Course,
  CourseId,
  CourseSummary,
  PacingInput,
  WeatherConditions,
} from "@/types";
import { usePacingChart } from "@/hooks/usePacingChart";
import { InputForm, type WeatherView } from "@/components/InputForm";
import { SummaryHeader } from "@/components/SummaryHeader";
import { ElevationChart } from "@/components/ElevationChart";
import { HillPanel } from "@/components/HillPanel";
import { ImpactPanel } from "@/components/ImpactPanel";
import { RaceSplitsChart } from "@/components/RaceSplitsChart";
import { PaceChartTable } from "@/components/PaceChartTable";
import WeatherTimeline from "@/components/WeatherTimeline";
import { PaceBand } from "@/components/PaceBand";
import { UploadedCourseNotice } from "@/components/UploadedCourseNotice";
import { formatLocation } from "@/lib/location";
import { courseTerrain } from "@/lib/pacing/terrain";
import { courseAltitude } from "@/lib/pacing/altitude";
import { courseHills } from "@/lib/pacing/hills";
import { zonedWallClockToUTC } from "@/lib/weather/timezone";

// Paceband-style split dashboard: config on the left, live outputs on the
// right. Reuses the locked pacing engine via usePacingChart so the math
// path is identical to the previous /results flow, and layers Phase 2
// weather + fueling on top. `input` is the server-parsed PacingInput from the
// URL, and it SEEDS the state rather than tracking it: the address bar is read
// on arrival and never written afterwards, so editing the form does not churn
// the URL. Sharing is the explicit Copy link button in SummaryHeader.

export function Dashboard({
  input,
  course,
  catalog,
}: {
  input: PacingInput;
  course: Course;
  catalog: CourseSummary[];
}) {
  const { result, error, calculate } = usePacingChart();
  const [current, setCurrent] = useState<PacingInput>(input);
  // Captured from InputForm's own weather hook via onWeatherChange: the live
  // forecast series (or null in manual mode) driving per-segment sampling,
  // plus what the weather timeline needs to say where those numbers came from.
  const [weatherView, setWeatherView] = useState<WeatherView | null>(null);
  const hourly = weatherView?.hours ?? null;

  // Switching course in the form changes `current` immediately, but the new
  // geometry is a fetch away. Charting Berlin's elevations under Boston's name
  // for those few hundred ms would be silently wrong, so hold off until the
  // two agree.
  //
  // This used to arrive as fresh server props: the form wrote the course into
  // the URL, and the replace re-ran results/page.tsx. That write is gone, so
  // the dashboard now asks for the geometry itself. One course at a time, for
  // the same reason results/page.tsx fetches one: the dense profile is far too
  // big to ship for every race just to chart one.
  const [geometry, setGeometry] = useState<Course>(course);
  const [geometryError, setGeometryError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  // Every course this dashboard has already loaded. Flipping back and forth
  // between two races costs one request each, not one per switch.
  const cache = useRef<Map<CourseId, Course>>(new Map([[course.id, course]]));

  const wantedId = current.courseId;
  const loadedId = geometry.id;
  useEffect(() => {
    if (wantedId === loadedId) return;

    const cached = cache.current.get(wantedId);
    if (cached) {
      setGeometry(cached);
      setGeometryError(null);
      return;
    }

    // Responses can land out of order when someone arrows through the picker.
    // The cleanup disowns this request, so only the latest selection is ever
    // allowed to reach state.
    let ignore = false;
    setGeometryError(null);
    fetch(`/api/courses/${encodeURIComponent(wantedId)}`)
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json() as Promise<Course>;
      })
      .then((next) => {
        if (ignore) return;
        cache.current.set(next.id, next);
        setGeometry(next);
      })
      .catch(() => {
        if (ignore) return;
        setGeometryError("We could not load that course.");
      });

    return () => {
      ignore = true;
    };
  }, [wantedId, loadedId, retry]);

  const courseIsCurrent = loadedId === wantedId;

  // Both are reductions over the same 44 points — cheap once, wasteful on every
  // keystroke in a form that recomputes live.
  const terrain = useMemo(() => courseTerrain(geometry.elevations), [geometry]);
  // Derived here rather than read off the catalog because an UPLOADED course
  // is never in the catalog, and a runner who uploads a mountain race should
  // see its altitude cost like anyone else.
  const altitude = useMemo(() => courseAltitude(geometry.elevations), [geometry]);
  // The third reduction over the same 44 points. Always kilometre segments, so
  // it does not have to be recomputed when the unit toggle moves.
  const hills = useMemo(() => courseHills(geometry.elevations), [geometry]);

  // The gun as an absolute instant. The runner enters a wall clock at the
  // course and the weather window is indexed by instants — the same resolution
  // InputForm does before it fetches, so the timeline's hour grid and the
  // fetched hours are keyed to the same moment.
  const gunUtcMs = useMemo(() => {
    if (!result?.input.raceDateISO || !result.input.raceStartTime) return null;
    const iso = zonedWallClockToUTC(
      result.input.raceDateISO,
      result.input.raceStartTime,
      geometry.timezone,
    );
    const ms = iso ? new Date(iso).getTime() : Number.NaN;
    return Number.isFinite(ms) ? ms : null;
  }, [result?.input.raceDateISO, result?.input.raceStartTime, geometry.timezone]);

  // Weather OUTLIVES the request that asked for it: useWeather clears `hourly`
  // only on a mode change, so between switching course and the next fetch
  // resolving it still holds the previous race's window. The pacing engine has
  // always had that lag, and changing it would move published splits, so it is
  // left alone here. A panel that PRINTS "11:00 AM, 12 C" cannot afford it:
  // that is a claim about this course, not a stale number. So the timeline
  // renders only when the data was fetched for the race being charted.
  const weatherIsCurrent =
    gunUtcMs !== null &&
    weatherView?.key != null &&
    weatherView.key ===
      `${geometry.start.lat},${geometry.start.lon},${new Date(gunUtcMs).toISOString()}`;

  // A Boston verdict rode along here until 2026-09-20, read from the profile
  // /boston-qualifier stores and rendered as a strip under the header. It is
  // gone from this page, not from the product: /boston-qualifier still answers
  // the question, and `bqStatus` is untouched. The results header is a pacing
  // plan for one race, and a second judgement of the runner sitting inside it
  // was the one row that had nothing to do with the chart below it.

  // `current` already carries `weather` when InputForm's toggle is on (built
  // the same way `body` is) — no separate merge needed here.
  useEffect(() => {
    if (!courseIsCurrent) return;
    calculate(current, geometry, hourly);
  }, [calculate, current, geometry, courseIsCurrent, hourly]);

  return (
    // Ordinary document flow: the page is the only scroller. Wherever the
    // pointer sits — setup panel, chart, splits table — the wheel scrolls the
    // whole page, because no section is an overflow container.
    // print:p-0 — the screen padding otherwise pushes the paceband + fold
    // guide past one printed page.
    <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-12 print:p-0">
      {/* print:hidden on the whole grid so the paceband below is the only
          content the printer sees. */}
      <div className="grid gap-10 lg:grid-cols-[minmax(320px,380px)_1fr] print:hidden">
        {/* self-start keeps the card at its content height — grid items
            stretch by default, which would otherwise pull this bordered box
            down to match the much taller results column. */}
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-8 lg:self-start">
          <InputForm
            title="Race setup"
            initial={input}
            catalog={catalog}
            onChange={setCurrent}
            onWeatherChange={setWeatherView}
          />
        </div>

        {/* min-w-0: a grid item will not shrink below its content's width by
            default, so without it a row of hill cards wider than the column
            stretches the whole results column, and the page, sideways instead
            of scrolling inside its own row. */}
        <div className="min-w-0 space-y-10">
          {error && (
            <p className="text-sm text-[var(--color-red-primary)]">{error}</p>
          )}
          {/* A failed fetch leaves the previous race on screen rather than
              blanking the page, so the retry has to be something the runner can
              press: re-picking the same course would not change `wantedId` and
              so would not re-run the effect. */}
          {geometryError && (
            <p className="flex flex-wrap items-center gap-3 text-sm text-[var(--color-red-primary)]">
              {geometryError}
              <button
                type="button"
                onClick={() => setRetry((n) => n + 1)}
                className="rounded-lg border border-[var(--color-border)] px-3 py-1 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
              >
                Try again
              </button>
            </p>
          )}
          {geometry.isUserUpload && (
            <UploadedCourseNotice
              elevationSource={geometry.elevationSource}
              expiresAtISO={geometry.expiresAtISO ?? null}
            />
          )}
          {result && (
            <>
              <SummaryHeader
                result={result}
                courseName={geometry.displayName}
                // An uploaded course has no city or country to format —
                // nobody told us where it is — so it names what it is rather
                // than rendering an empty ", ".
                location={
                  geometry.isUserUpload
                    ? "Uploaded course"
                    : formatLocation(
                        geometry.city,
                        geometry.regionCode,
                        geometry.countryName,
                      )
                }
                // Both derived from the 44 points already in the browser for
                // this one course — no catalog lookup, nothing new fetched.
                terrain={terrain}
                altitude={altitude}
                // The course silhouette rides in the header's own whitespace,
                // beside the name rather than beside the elevation chart: it
                // is the course's signature, not a second chart.
                outline={geometry.outline}
                // The interactive map (ROADMAP #22) reads the same two
                // reductions the panels below already use, rather than
                // fetching or deriving geometry of its own.
                elevations={geometry.elevations}
                hills={hills}
              />
              <ElevationChart
                profile={geometry.profile}
                unit={result.input.unit}
                rows={result.rows}
              />
              {/* Elevation profile first, then the weather that will be on top
                  of it, then what the whole day costs, then the same four
                  factors per split, then the climbs worth naming: the ground,
                  the air over the ground, the price of both, where that price
                  falls, the few places it matters. All of these read `result`
                  rather than the live form state, so in the tick where someone
                  has changed a goal but the engine has not recomputed, they and
                  the chart above still describe the same plan.

                  The weather section removes itself whenever it cannot say
                  something true (no forecast, manual entry, a course switch
                  still in flight), so the two charts close back up around it
                  rather than framing a gap. */}
              {weatherIsCurrent && (
                <WeatherTimeline
                  result={result}
                  source={weatherView?.source ?? null}
                  lead={weatherView?.lead ?? []}
                  startHHMM={result.input.raceStartTime}
                  gunUtcMs={gunUtcMs}
                />
              )}
              <ImpactPanel
                elevations={geometry.elevations}
                result={result}
              />
              <RaceSplitsChart hills={hills} result={result} />
              <HillPanel
                hills={hills}
                rows={result.rows}
                unit={result.input.unit}
              />
              <PaceChartTable result={result} />
            </>
          )}
        </div>
      </div>

      {result && (
        <PaceBand
          result={result}
          courseName={geometry.displayName}
        />
      )}
    </main>
  );
}
