"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { HillSegment, PaceChartRow, Unit, WeatherConditions } from "@/types";
import type { Outline } from "@/lib/course/outline";
import {
  buildRouteMap,
  legendPosition,
  windVerdict,
  type RouteHover,
} from "@/lib/course/routeMap";
import { CourseOutline } from "@/components/CourseOutline";
import {
  compassPoint,
  speedUnitForDistance,
  windToDisplay,
  windUnitLabel,
} from "@/lib/units/weather";

// The interactive course map (ROADMAP #22), as a fullscreen overlay.
//
// A NOTE ON THE SHAPE, because the roadmap says something else. #22 was amended
// on 2026-09-21 to specify a drawer expanding in place, on the argument that a
// map explaining the plan should not cover the plan. That was reversed on
// 2026-09-22 in favour of the fullscreen treatment here: a marathon route at a
// zoom where street names are legible needs the whole viewport, and at drawer
// height most city courses render as an unreadable tangle. The trade the
// roadmap warned about is real and is paid: while this is open, the splits are
// not on screen. It is mitigated by carrying the split's own pace into the
// hover readout, so the map answers the question the plan would have.
//
// THE CANVAS IS A SEPARATE COMPONENT AND LOADS LATE. `next/dynamic` with
// `ssr: false` keeps maplibre-gl out of the /results bundle entirely; it is
// fetched when this overlay first opens. Until it draws, the static outline
// from ROADMAP #21 is scaled up in its place, so the wait reads as a zoom into
// a shape the runner is already looking at rather than as a spinner.

const CourseMapCanvas = dynamic(
  () => import("@/components/CourseMapCanvas").then((m) => m.CourseMapCanvas),
  { ssr: false },
);

/** Warms the chunk on hover or focus of the trigger, so the open feels instant. */
export function prefetchCourseMap(): void {
  void import("@/components/CourseMapCanvas");
}

interface Props {
  open: boolean;
  panelRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  courseName: string;
  outline: Outline;
  elevations: number[];
  unit: Unit;
  windMultipliers: number[];
  hills: HillSegment[];
  rows: PaceChartRow[];
  goalTimeSeconds: number;
  /** Start-line conditions, for the corner chip. Absent when weather is off. */
  conditions?: WeatherConditions;
}

function Chip({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[0.65rem] uppercase tracking-wider text-[var(--color-text-tertiary)]">
        {label}
      </span>
      <span className="flex items-center gap-1.5 font-tabular text-sm font-medium text-[var(--color-text-primary)]">
        {value}
      </span>
    </div>
  );
}

/**
 * An arrow pointing the way the wind is actually travelling.
 *
 * IT POINTS WHERE THE WIND IS GOING, WHICH IS NOT THE BEARING WE STORE.
 * `windDirection` is meteorological: the direction the wind blows FROM, which is
 * what the "SW" beside it means and what the drag model reads. An arrow drawn at
 * that bearing would point back up the wind, the exact opposite of what a runner
 * reads off it, so it is turned 180 degrees here. The glyph is drawn pointing
 * north at zero rotation, and the rotation is clockwise, which is how compass
 * bearings already run.
 */
function WindArrow({ fromDegrees }: { fromDegrees: number }) {
  if (!Number.isFinite(fromDegrees)) return null;
  const towards = fromDegrees + 180;
  return (
    <>
      <svg
        viewBox="0 0 20 20"
        aria-hidden="true"
        className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-secondary)]"
        style={{ transform: `rotate(${towards}deg)` }}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 17V3M10 3l-4.5 4.5M10 3l4.5 4.5" />
      </svg>
      <span className="sr-only">
        blowing towards {compassPoint(towards)}
      </span>
    </>
  );
}

/**
 * The same dot the static course outline draws next to the race name
 * (`CourseOutline`): green for start, red for finish. Repeated here rather
 * than shared as a component because that one draws inside a course-shaped
 * viewBox and this is a fixed-size glyph beside a word.
 */
function EndpointDot({ kind }: { kind: "start" | "finish" }) {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true" className="h-3 w-3 shrink-0">
      <circle
        cx="6"
        cy="6"
        r="5"
        fill={
          kind === "start"
            ? "var(--color-green-primary)"
            : "var(--color-red-primary)"
        }
      />
    </svg>
  );
}

export function CourseMapOverlay({
  open,
  panelRef,
  onClose,
  courseName,
  outline,
  elevations,
  unit,
  windMultipliers,
  hills,
  rows,
  goalTimeSeconds,
  conditions,
}: Props) {
  const [showHills, setShowHills] = useState(false);
  const [hovered, setHovered] = useState<RouteHover>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const routeMap = useMemo(
    () =>
      open
        ? buildRouteMap({
            outline,
            elevations,
            unit,
            windMultipliers,
            hills,
            rows,
            goalTimeSeconds,
          })
        : null,
    [open, outline, elevations, unit, windMultipliers, hills, rows, goalTimeSeconds],
  );

  // Reset per opening: a stale hover readout or a map marked ready from last
  // time would both show for a frame before the new canvas drew.
  useEffect(() => {
    if (open) return;
    setHovered(null);
    setMapReady(false);
    setMapError(null);
  }, [open]);

  // The page behind must not scroll under a fullscreen layer: on touch, a drag
  // that misses the canvas would otherwise move the results page invisibly.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Focus starts on the close button, so the first Tab lands inside the dialog
  // and the first Enter does the obvious thing.
  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  // A focus trap, which the two small modals on this page deliberately do
  // without. They cover a corner of the page; this covers all of it, so tabbing
  // into content nobody can see is a real way to get stranded here.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, panelRef]);

  if (!open) return null;

  const speedUnit = speedUnitForDistance(unit);
  // Temperature follows the distance unit, the way wind speed already does in
  // src/lib/units/weather.ts. There is no lifted temperature preference to read
  // here, and showing Celsius beside a mile split would be the odder guess.
  const showFahrenheit = unit === "miles";

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Course map for ${courseName}`}
      className="fixed inset-0 z-50 flex flex-col bg-[var(--color-bg-surface)] print:hidden"
    >
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--color-border)] px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-display tracking-tight text-[var(--color-text-primary)]">
            {courseName}
          </h2>
          <p className="text-xs text-[var(--color-text-secondary)]">
            {routeMap?.hasWind
              ? "Course Map"
              : "Route shown in full. Turn weather on to shade it by wind."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {hills.length > 0 && (
            <button
              type="button"
              onClick={() => setShowHills((v) => !v)}
              aria-pressed={showHills}
              className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                showHills
                  ? "border-[var(--color-text-primary)] bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)]"
                  : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)]"
              }`}
            >
              Climbs
            </button>
          )}
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
          >
            <svg
              viewBox="0 0 20 20"
              aria-hidden="true"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
            <span className="sr-only">Close map</span>
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        {/* The loading state, and the thing the map zooms out of. Hidden from
            assistive tech once the canvas is up, so the course is not
            described twice. */}
        {!mapReady && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-10">
            <CourseOutline
              outline={outline}
              courseName={courseName}
              className="min-h-0 w-full max-w-2xl flex-1 opacity-40"
            />
            <p
              aria-live="polite"
              className="text-sm text-[var(--color-text-secondary)]"
            >
              {mapError
                ? "We could not load the map just now. The course shape is above."
                : "Loading the map..."}
            </p>
          </div>
        )}

        {routeMap ? (
          // NEVER GATE THIS ON `mapReady`, however tempting it looks. An
          // earlier cut held the canvas at opacity-0 until the map reported
          // itself loaded, to fade it in over the outline. A WebGL canvas
          // inside a fully transparent subtree is never painted by the
          // browser, so MapLibre's first render never completes, `load` never
          // fires, `mapReady` never flips, and the map stays invisible
          // forever: a deadlock where the condition for showing the map is the
          // thing that hiding it prevents.
          //
          // It is also unnecessary. A freshly created WebGL canvas is
          // transparent until something is drawn into it, so the outline below
          // shows straight through it and is covered only once the basemap
          // actually paints. That is the zoom-out-of-the-silhouette effect
          // this was reaching for, for free and without a gate.
          <div className="absolute inset-0">
            <CourseMapCanvas
              routeMap={routeMap}
              showHills={showHills}
              onHover={setHovered}
              onReady={() => setMapReady(true)}
              onError={setMapError}
            />
          </div>
        ) : (
          <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-[var(--color-text-secondary)]">
            We do not have a mappable route for this course.
          </p>
        )}

        {/* Start-line conditions. Sits top-left because MapLibre's zoom
            controls own the top-right corner. */}
        {conditions && (
          <div className="pointer-events-auto absolute left-3 top-3 flex cursor-default gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)]/90 px-3 py-2 shadow-sm backdrop-blur">
            <Chip
              label="Wind"
              value={
                <>
                  {`${Math.round(windToDisplay(conditions.windSpeed, speedUnit))} ${windUnitLabel(speedUnit)} ${compassPoint(conditions.windDirection)}`}
                  <WindArrow fromDegrees={conditions.windDirection} />
                </>
              }
            />
            <Chip
              label="Temp"
              value={
                showFahrenheit
                  ? `${Math.round((conditions.tempC * 9) / 5 + 32)}°F`
                  : `${Math.round(conditions.tempC)}°C`
              }
            />
            <Chip label="Humidity" value={`${Math.round(conditions.humidity)}%`} />
          </div>
        )}

        {/* Hover readout. Reserved height, so the legend below it does not
            jump as the pointer crosses the route. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex flex-col items-center gap-2 px-3">
          <div
            aria-live="polite"
            className="min-h-[2.75rem] rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)]/95 px-4 py-2 text-center shadow-sm backdrop-blur"
          >
            {hovered && "kind" in hovered ? (
              <p className="flex items-center justify-center gap-1.5 font-tabular text-sm font-medium text-[var(--color-text-primary)]">
                <EndpointDot kind={hovered.kind} />
                {hovered.kind === "start" ? "Start" : "Finish"}
              </p>
            ) : hovered ? (
              <>
                <p className="font-tabular text-sm font-medium text-[var(--color-text-primary)]">
                  {hovered.distanceLabel} · {hovered.paceLabel}
                </p>
                <p className="text-xs text-[var(--color-text-secondary)]">
                  {windVerdict(hovered)}
                  {hovered.hillIndex ? ` · Climb ${hovered.hillIndex}` : ""}
                </p>
              </>
            ) : (
              <p className="text-xs text-[var(--color-text-secondary)]">
                Hover over the route to read a split.
              </p>
            )}
          </div>

          {/* The legend. The bar is the same ramp the line uses: density is
              strength, and the middle is the band where the wind cannot move a
              printed split by a second. */}
          <div className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)]/95 px-4 py-2 shadow-sm backdrop-blur">
            <span className="text-xs text-[var(--color-green-primary)]">
              Tailwind
            </span>
            <span
              aria-hidden="true"
              className="relative block h-2 w-32 rounded-full sm:w-48"
              style={{
                backgroundImage:
                  "linear-gradient(to right, var(--color-green-primary), color-mix(in srgb, var(--color-green-primary) 30%, transparent), var(--color-text-secondary), color-mix(in srgb, var(--color-red-primary) 30%, transparent), var(--color-red-primary))",
              }}
            >
              {/* Where the hovered split sits on that ramp. It is a needle
                  rather than a coloured dot: the thing under it is already the
                  colour, and a mark that carried its own would be read as a
                  third value. The ring is the surface colour, so it separates
                  from every part of the gradient including the end it is
                  standing on. Aria-hidden because the sentence above states the
                  same thing in words, and because a marker inside a legend
                  nobody can see is nothing to announce. */}
              {hovered && !("kind" in hovered) && (
                <span
                  data-testid="wind-marker"
                  className="absolute top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--color-text-primary)] ring-2 ring-[var(--color-bg-surface)] transition-[left] duration-150 motion-reduce:transition-none"
                  style={{ left: `${legendPosition(hovered) * 100}%` }}
                />
              )}
            </span>
            <span className="text-xs text-[var(--color-red-primary)]">
              Headwind
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
