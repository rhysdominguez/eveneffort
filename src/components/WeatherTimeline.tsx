"use client";
import { useMemo } from "react";
import type { PacingResult } from "@/hooks/usePacingChart";
import type { WeatherSource } from "@/hooks/useWeather";
import type { WeatherConditions } from "@/types";
import { useStoredState } from "@/hooks/useStoredState";
import { DISPLAY_UNITS } from "@/lib/stateKeys";
import { heatIndexC } from "@/lib/weather/heat";
import {
  buildWeatherTimeline,
  skyIconFor,
  type SkyIcon,
  type TimelineRow,
} from "@/lib/weather/timeline";
import {
  compassPoint,
  roundForDisplay,
  tempToDisplay,
  tempUnitLabel,
  windToDisplay,
  windUnitLabel,
} from "@/lib/units/weather";
import { formatTimeDisplay } from "@/lib/units/date";
import { MILE_IN_KM } from "@/lib/pacing/segments";

/**
 * What the conditions will be, hour by hour, and where the runner will be
 * standing when they are.
 *
 * The data is the same array the splits above and below were built from
 * (`result.hourlySeries`), not a second fetch: a panel that re-derived its own
 * weather would eventually disagree with the table beside it.
 *
 * THIS SECTION IS ABSENT, NOT EMPTY, whenever it cannot say something true,
 * and the bar for "true" is narrow on purpose: it renders ONLY for a live
 * forecast.
 *
 * The route answers with one of three sources. `historical` is what was
 * recorded on a past race day and `typical` is a ten-year average for the
 * date, and both of those are honest numbers — but this section is titled
 * "Weather Forecast", and a heading is not something a reader checks against a
 * caption underneath it. Rather than retitle per source, the section simply
 * does not exist unless there is a forecast to show. So it is absent for every
 * past race, for anything beyond the ~5 day horizon, and in Manual and Off
 * mode.
 *
 * The consequence is worth stating plainly: on most visits this section will
 * not be there, because most runners look at a race months out. That is the
 * intended trade. `rainText` and `sourceLine` used to branch across all three
 * sources; git history has them if the section is ever widened again, and
 * `skyIconFor` in timeline.ts still carries its own per-source rule because it
 * is a pure function with its own contract.
 */
interface Props {
  result: PacingResult;
  source: WeatherSource | null;
  /** The hours before the gun, from the same fetch. Empty means no pre-race row. */
  lead: WeatherConditions[];
  /** Race start wall clock at the course, "HH:MM". */
  startHHMM: string | undefined;
  /** The gun as an absolute instant, or null when the race has no date/time yet. */
  gunUtcMs: number | null;
}

export default function WeatherTimeline({
  result,
  source,
  lead,
  startHHMM,
  gunUtcMs,
}: Props) {
  const [storedUnits] = useStoredState(DISPLAY_UNITS);
  // The SAME fallback InputForm uses (see its `tempUnit` / `speedUnit`), so on
  // a first visit this panel and the form beside it cannot disagree about
  // whether the runner reads Celsius.
  const tempUnit =
    storedUnits?.tempUnit ?? (result.input.unit === "miles" ? "F" : "C");
  const speedUnit =
    storedUnits?.speedUnit ?? (result.input.unit === "miles" ? "mph" : "kph");

  const rows = useMemo<TimelineRow[]>(() => {
    if (!startHHMM || gunUtcMs === null) return [];
    return buildWeatherTimeline({
      startHHMM,
      gunUtcMs,
      finishSeconds: result.adjustedFinishSeconds,
      segmentLengthsKm: result.segmentLengthsKm,
      cumulativeSeconds: result.rows.map((r) => r.cumulativeSplitSeconds),
      series: result.hourlySeries,
      lead,
    });
  }, [startHHMM, gunUtcMs, lead, result]);

  // Absent, not empty.
  //
  // A source of anything but "forecast" removes the section: null covers
  // "nothing has resolved yet", "the fetch failed" and "Manual or Off" in one
  // test (useWeather clears it for all three), and "historical" / "typical"
  // are real answers that this section is simply not titled to carry. See the
  // note on the component. WeatherFields already explains a failure in the
  // sidebar; a second apology here would just be noise.
  if (source !== "forecast") return null;
  if (rows.length === 0) return null;

  const anySky = rows.some(
    (r) => r.conditions && skyIconFor(r.conditions, source) !== "unknown",
  );
  const anyRain = rows.some((r) => r.conditions?.precipProbability !== undefined);
  const held = rows.some((r) => r.beyondSeries);

  return (
    <section className="space-y-4">
      {/* Only ever one thing, because only a live forecast reaches this far:
          the guard above removed every other source. */}
      <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
        Weather Forecast
      </h2>

      <div className="overflow-hidden rounded-2xl border border-[var(--color-border)]">
        <table className="w-full table-fixed border-collapse text-sm">
          <caption className="sr-only">
            Conditions through the race, by time of day, with the distance
            reached at each point.
          </caption>
          {/* Widths are declared rather than left to the browser. An auto table
              of short strings hands its slack to the widest column, which put a
              third of the row between the time and the sky glyph and stranded
              the wind against the right edge. Normalised to 100 so the two
              optional columns cannot change the others' proportions. */}
          <colgroup>
            {columnWidths(anySky, anyRain).map((pct, i) => (
              <col key={i} style={{ width: `${pct}%` }} />
            ))}
          </colgroup>
          <tbody>
            {rows.map((row, i) => (
              <Row
                key={`${row.kind}-${row.offsetMinutes}-${i}`}
                row={row}
                source={source}
                unit={result.input.unit}
                tempUnit={tempUnit}
                speedUnit={speedUnit}
                showSky={anySky}
                showRain={anyRain}
              />
            ))}
          </tbody>
        </table>
      </div>

      {held && (
        <p className="text-xs text-[var(--color-text-tertiary)]">
          The forecast window runs out before this finish time, so the last rows
          hold the final hour we have.
        </p>
      )}
    </section>
  );
}

function Row({
  row,
  source,
  unit,
  tempUnit,
  speedUnit,
  showSky,
  showRain,
}: {
  row: TimelineRow;
  source: WeatherSource;
  unit: "km" | "miles";
  tempUnit: "C" | "F";
  speedUnit: "kph" | "mph";
  showSky: boolean;
  showRain: boolean;
}) {
  const c = row.conditions;
  const muted = row.beyondSeries ? "text-[var(--color-text-tertiary)]" : "";
  const sky = c ? skyIconFor(c, source) : "unknown";
  return (
    <tr className="border-b border-[var(--color-border)] last:border-b-0">
      <td className="px-4 py-3 align-middle">
        <span className="block font-medium whitespace-nowrap text-[var(--color-text-primary)]">
          {formatTimeDisplay(row.clockHHMM)}
        </span>
        <span className="block whitespace-nowrap text-xs text-[var(--color-text-tertiary)]">
          {rowLabel(row, unit)}
        </span>
      </td>
      {showSky && (
        <td className={`px-4 py-3 text-center align-middle ${muted}`}>
          <span className="inline-flex justify-center">
            <SkyGlyph icon={sky} />
          </span>
          <span className="sr-only">{SKY_LABELS[sky]}</span>
        </td>
      )}
      <td className={`px-4 py-3 align-middle ${muted}`}>
        {c ? (
          <>
            <span className="block whitespace-nowrap text-[var(--color-text-primary)]">
              {roundForDisplay(tempToDisplay(c.tempC, tempUnit))}
              {tempUnitLabel(tempUnit)}
            </span>
            <span className="block whitespace-nowrap text-xs text-[var(--color-text-tertiary)]">
              Feels {roundForDisplay(
                tempToDisplay(heatIndexC(c.tempC, c.humidity), tempUnit),
              )}
              {tempUnitLabel(tempUnit)}
            </span>
          </>
        ) : null}
      </td>
      {showRain && (
        <td className={`px-4 py-3 align-middle ${muted}`}>
          {c?.precipProbability !== undefined ? (
            <>
              <PrecipGlyph />
              <span className="block whitespace-nowrap text-xs text-[var(--color-text-secondary)]">
                {rainText(c)}
              </span>
            </>
          ) : null}
        </td>
      )}
      <td className={`px-4 py-3 align-middle ${muted}`}>
        {c ? (
          <span className="flex items-center gap-2">
            <WindArrow degrees={c.windDirection} />
            <span className="block whitespace-nowrap text-[var(--color-text-primary)]">
              {roundForDisplay(windToDisplay(c.windSpeed, speedUnit))}{" "}
              {windUnitLabel(speedUnit)}
            </span>
            <span className="sr-only">from {compassPoint(c.windDirection)}</span>
          </span>
        ) : null}
      </td>
    </tr>
  );
}

/**
 * Column widths as percentages, in render order, always summing to 100.
 *
 * The sky column is a narrow icon gutter, not a data column: at 10% the glyph
 * sits in a tight band just after the time rather than stranded in the middle
 * of a wide cell, which is why it is the one column whose content is centred.
 * Everything else is left-aligned on a common edge, the way a table of numbers
 * should be.
 *
 * Time takes the most because it carries the longest pair of strings ("10:00 AM"
 * over "36.3 km"); the three remaining data columns split what is left evenly,
 * since none of them is reliably wider than the others once units flip to
 * Fahrenheit and miles.
 */
function columnWidths(hasSky: boolean, hasRain: boolean): number[] {
  const raw = [
    26, // time + label
    ...(hasSky ? [10] : []), // sky glyph
    22, // temperature + apparent
    ...(hasRain ? [21] : []), // rain glyph + chance
    21, // wind arrow + speed
  ];
  const total = raw.reduce((a, b) => a + b, 0);
  return raw.map((w) => (w / total) * 100);
}

function rowLabel(row: TimelineRow, unit: "km" | "miles"): string {
  if (row.kind === "pre") return "Pre-race";
  if (row.kind === "start") return "Start";
  if (row.kind === "finish") return "Finished";
  if (row.distanceKm === null) return "";
  // Same formatting as the hill panel: one decimal, in whichever unit the
  // chart is already using.
  const value = unit === "km" ? row.distanceKm : row.distanceKm / MILE_IN_KM;
  return `${value.toFixed(1)} ${unit === "km" ? "km" : "mi"}`;
}

/**
 * The chance of rain, as a live forecast states it.
 *
 * No source branch, because only a forecast renders (see the component note).
 * `precipProbability` DOES mean three different things depending on which
 * source produced it, and if this section is ever widened past a forecast this
 * function is the first thing that has to grow back: printing a recorded
 * morning's 100 as "100% chance" would read as certainty about a race that has
 * not happened.
 */
function rainText(c: WeatherConditions | null): string {
  const p = c?.precipProbability;
  if (p === undefined) return "";
  return `${roundForDisplay(p)}% chance`;
}

// --- Icons ---------------------------------------------------------------
//
// Inline SVG on the same 20x20 grid and in the same shape as ImpactPanel's
// factor icons: a path-string map plus one generic renderer. No icon library
// (Rule 5).
//
// The SKY glyphs are monochrome, drawn in `currentColor` off a text token. The
// precipitation glyph is the one exception and is deliberate: see PrecipGlyph.

const SKY_PATHS: Record<Exclude<SkyIcon, "unknown">, string> = {
  // A sun: disc plus four rays.
  clear:
    "M10 6.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7zM10 2v1.5M10 16.5V18M2 10h1.5M16.5 10H18",
  // A small sun behind a cloud.
  partly:
    "M7 6.2a2.6 2.6 0 013.9 1.4M13 3.5v1.2M16.5 7h-1.2M6.5 16h7a2.75 2.75 0 000-5.5 3.75 3.75 0 00-7.3.8A2.35 2.35 0 006.5 16z",
  // A cloud.
  cloudy: "M6.5 15.5h7a3 3 0 000-6 4 4 0 00-7.7.9A2.55 2.55 0 006.5 15.5z",
  // A cloud with two falling strokes.
  rain: "M6.5 13h7a3 3 0 000-6 4 4 0 00-7.7.9A2.55 2.55 0 006.5 13zM8 15.5l-.8 2M12 15.5l-.8 2",
};

const SKY_LABELS: Record<SkyIcon, string> = {
  clear: "Clear",
  partly: "Partly cloudy",
  cloudy: "Cloudy",
  rain: "Rain",
  unknown: "Sky not reported",
};

function SkyGlyph({ icon }: { icon: SkyIcon }) {
  if (icon === "unknown") return null;
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="h-7 w-7 shrink-0 text-[var(--color-text-secondary)]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={SKY_PATHS[icon]} />
    </svg>
  );
}

/** The cloud of the precipitation glyph, matching the `cloudy` sky path above. */
const PRECIP_CLOUD = "M6.5 13h7a3 3 0 000-6 4 4 0 00-7.7.9A2.55 2.55 0 006.5 13z";

/**
 * Three strokes of falling rain, slanted as wind-driven rain falls. Diagonal
 * rather than vertical because vertical strokes under a cloud read as a bar
 * chart or an ellipsis at this size; the slant is what makes them rain.
 *
 * GEOMETRY, because it is fiddly and was wrong once. Sampling the cloud path
 * above gives x 3.58 to 16.50, so its centre is 10.04 and its underside is
 * y 13.02 — note the centre is NOT the midpoint of the visible lobes, because
 * the left shoulder arc bulges further than it looks. Each stroke falls 3.6 and
 * drifts 1.4 left, putting the ink's own bounding box at x 6.95 to 13.15,
 * centre 10.05: centred on the cloud rather than hanging off its right side,
 * which is what the first cut did by eyeballing the centre at 10.25. They start
 * at y 13.8, just under the cloud, so they read as coming OUT of it; the
 * earlier 15 left a two-unit gap that read as rain falling beside a cloud.
 */
const PRECIP_FALL = "M8.35 13.8L6.95 17.4M10.75 13.8L9.35 17.4M13.15 13.8L11.75 17.4";

/**
 * The precipitation column's icon. Decorative, and the same glyph whatever the
 * amount: the percentage or the word beneath it is what carries the claim (see
 * `rainText`), which is also why the icon can afford to be the loud part.
 *
 * THE RAIN IS BLUE, and it is the only colour on this site outside the red,
 * the semantic green and the course-profile ramp. Rain is the one quantity
 * here that a reader already holds a colour for, and a grey glyph in a column
 * headed "Rain chance" reads as a second cloud rather than as falling water.
 * The cloud itself stays neutral, so the colour lands on the one part that is
 * actually about rain and the glyph does not become a logo. See
 * --color-blue-primary in globals.css and DESIGN.md.
 */
function PrecipGlyph() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="h-7 w-7 shrink-0 text-[var(--color-text-secondary)]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={PRECIP_CLOUD} />
      <path
        d={PRECIP_FALL}
        strokeWidth="1.7"
        style={{ stroke: "var(--color-blue-primary)" }}
      />
    </svg>
  );
}

/**
 * An arrow pointing where the wind is GOING.
 *
 * `windDirection` is meteorological: the bearing the wind blows FROM. Drawing
 * the arrow at that bearing points it backwards, which is the classic version
 * of this bug and reads as a tailwind on a headwind day. Hence the 180. The
 * compass point beside it is spelled "from SW" for the same reason: the arrow
 * is decoration, and the text is what actually carries the claim.
 */
function WindArrow({ degrees }: { degrees: number }) {
  const rotation = (degrees + 180) % 360;
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="h-4 w-4 shrink-0 text-[var(--color-text-tertiary)]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: `rotate(${rotation}deg)` }}
    >
      {/* Points up at 0deg, i.e. due north. */}
      <path d="M10 16V4M10 4L6.5 7.5M10 4l3.5 3.5" />
    </svg>
  );
}
