"use client";
import { useMemo } from "react";
import type { PacingResult } from "@/hooks/usePacingChart";
import { OpportunityMeter } from "./OpportunityMeter";
import { usePopover } from "@/hooks/usePopover";
import { courseCost } from "@/lib/pacing/courseCost";
import {
  computeImpact,
  weightedGeometricMean,
  type ImpactFactor,
  type ImpactLine,
} from "@/lib/pacing/impact";

// Per-factor impact breakdown (ROADMAP #16): four tiles and a total, sitting
// between the elevation profile and the race splits. The profile is the ground,
// this is what the ground and the day cost, the splits are the ground as
// seconds.
//
// THE TILES PRINT SHARES, NOT STANDALONE PERCENTAGES. `ImpactLine` carries
// both. `percent` is what a factor costs on its own and `sharePercent` is its
// slice of the combined total, and only the second set adds up to the number in
// the total row, because multipliers compose multiplicatively. At the one
// decimal place shown they are usually the same string; when they are not, the
// one that makes the panel's own arithmetic check out is the right one to
// print. The argument is in the header of src/lib/pacing/impact.ts.
//
// NOTHING IS RECOMPUTED FROM THE FORM. The heat and wind figures are collapsed
// from the per-segment multipliers the engine actually applied, carried on
// `PacingResult`, weighted by the same segment durations they were multiplied
// into. A panel that rebuilt them from the weather inputs would drift from the
// splits table the moment either side changed.
//
// ALL FOUR TILES, ALWAYS. Heat, Humidity and Wind stay on screen reading 0.0%
// when weather is off rather than the panel silently shrinking to one tile: a
// row that changes shape is harder to read than a row where three are quiet,
// and a missing tile is ambiguous between "zero" and "not measured".
//
// HEAT AND HUMIDITY ARE ONE ENGINE MULTIPLIER SHOWN AS TWO TILES. They are not
// two models. Heat is the air temperature at the dry reference, Humidity is the
// rest, and their product is the multiplier the splits were actually built
// from. The reference is named in both tooltips, because a split against an
// unnamed baseline is a number a runner cannot check.
//
// NO ALTITUDE TILE. It was here and was cut, because it read 0.0% on 294 of the
// 326 seeded courses. The consequence on the other 32 is real and is written
// down in the header of src/lib/pacing/impact.ts: this panel understates those
// courses and its total no longer reconciles with "vs flat" on /courses.
//
// NO EXPLANATORY PROSE. The panel carried a subtitle and a closing note about
// how the total related to "vs flat"; both were cut. The tiles, their labels
// and the info popovers have to carry it, and a paragraph explaining a number
// is usually a sign the number is not doing its job.
//
// COLOUR IS THE SIGN, NOT THE SIZE. Red when a factor costs time, green when it
// saves it, tertiary grey at exactly zero, matching `SummaryHeader`'s goal delta
// and `RaceSplitsChart`'s bars. No ramp: the six-stop profile ramp belongs to
// `DifficultyBadge` alone.

interface Props {
  /** The course's 44-point elevation array. */
  elevations: number[];
  /**
   * The plan as computed. Read instead of the live form state so this panel
   * and the chart above it always describe the same race.
   */
  result: PacingResult;
}

const LABEL: Record<ImpactFactor, string> = {
  elevation: "Elevation",
  heat: "Heat",
  humidity: "Humidity",
  wind: "Wind",
};

const HELP: Record<ImpactFactor, string> = {
  elevation:
    "What this course's hills cost against flat ground, using the same curve as the course rankings.",
  heat: "What dry air temperature alone costs at each point on the course, with no penalty below 13 degrees.",
  humidity:
    "What moisture adds on top of the dry-air baseline, since humid air blunts how well you shed heat.",
  wind: "Head and tail wind along the route, sized to your height and weight; a helping wind shows as negative.",
};


/**
 * One decimal place, with the sign carried by a true minus (U+2212) rather than
 * a hyphen, as SummaryHeader and RaceSplitsChart both do.
 *
 * Rounded BEFORE the sign is chosen, so a factor worth -0.04% prints a neutral
 * "0.0%" rather than a green "-0.0%", which would claim a saving too small for
 * the panel to show.
 */
function formatPercent(percent: number): string {
  const rounded = Math.round(percent * 10) / 10;
  if (rounded === 0) return "0.0%";
  const sign = rounded > 0 ? "+" : "−";
  return `${sign}${Math.abs(rounded).toFixed(1)}%`;
}

/** Red costs time, green saves it, grey is a true zero. */
function percentColor(percent: number): string {
  const rounded = Math.round(percent * 10) / 10;
  if (rounded > 0) return "var(--color-red-primary)";
  if (rounded < 0) return "var(--color-green-primary)";
  return "var(--color-text-tertiary)";
}

const ICON_PATHS: Record<ImpactFactor, string> = {
  // A rising profile.
  elevation: "M2 15l5-6 4 4 3-4 4 6",
  // A thermometer.
  heat: "M10 3v8M10 3a1.5 1.5 0 013 0v8a3 3 0 11-3 0z",
  // A droplet.
  humidity: "M10 3s5 5.5 5 8.5a5 5 0 01-10 0C5 8.5 10 3 10 3z",
  // Two gusts.
  wind: "M3 7h9a2 2 0 100-4M3 12h12a2 2 0 110 4M3 17h6",
};

function FactorIcon({ factor }: { factor: ImpactFactor }) {
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
    >
      <path d={ICON_PATHS[factor]} />
    </svg>
  );
}

/**
 * The circled "i" and its popover. One `usePopover` per trigger, which already
 * handles clicking away and Escape-with-focus-return; opening a second tip
 * closes the first, because that click lands outside the first one's container.
 */
function InfoTip({ label, text }: { label: string; text: string }) {
  const { open, setOpen, containerRef, triggerRef } = usePopover();
  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`What ${label} means`}
        onClick={() => setOpen(!open)}
        className="flex h-4 w-4 items-center justify-center rounded-full text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-focus)]"
      >
        <svg
          viewBox="0 0 20 20"
          aria-hidden="true"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <circle cx="10" cy="10" r="7.25" />
          <path d="M10 9v4.5" />
          <path d="M10 6.5v.5" />
        </svg>
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={label}
          className="absolute left-0 top-6 z-20 w-56 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 py-2 text-xs leading-relaxed text-[var(--color-text-secondary)] shadow-lg"
        >
          {text}
        </div>
      )}
    </div>
  );
}

function Tile({ line }: { line: ImpactLine }) {
  const label = LABEL[line.factor];
  return (
    <div className="space-y-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
      <div className="flex items-center gap-2">
        <FactorIcon factor={line.factor} />
        <span className="text-sm font-medium text-[var(--color-text-primary)]">
          {label}
        </span>
        <InfoTip label={label} text={HELP[line.factor]} />
      </div>
      <p
        className="font-tabular text-2xl font-medium"
        style={{ color: percentColor(line.sharePercent) }}
      >
        {formatPercent(line.sharePercent)}
      </p>
    </div>
  );
}

export function ImpactPanel({ elevations, result }: Props) {
  const impact = useMemo(() => {
    const combinedHeat = weightedGeometricMean(
      result.heatMultipliers,
      result.segmentDurations,
    );
    const dryHeat = weightedGeometricMean(
      result.dryHeatMultipliers,
      result.segmentDurations,
    );
    return computeImpact({
      cost: courseCost(elevations),
      // Duration-weighted, because duration is what the engine multiplied
      // these into. See `weightedGeometricMean`.
      //
      // The weighted geometric mean is multiplicative, so GM(combined) is
      // GM(dry) x GM(humidity marginal) over the same weights. That lets the
      // humidity line be read off as a RATIO of the two means rather than
      // averaged separately, and it makes Heat x Humidity reproduce the
      // combined factor the splits were built from exactly.
      heatMultiplier: dryHeat,
      humidityMultiplier: combinedHeat / dryHeat,
      windMultiplier: weightedGeometricMean(
        result.windMultipliers,
        result.segmentDurations,
      ),
      weatherApplied: result.weatherApplied,
    });
  }, [
    elevations,
    result.heatMultipliers,
    result.dryHeatMultipliers,
    result.windMultipliers,
    result.segmentDurations,
    result.weatherApplied,
  ]);

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
        Impact Breakdown
      </h2>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {impact.lines.map((line) => (
          <Tile key={line.factor} line={line} />
        ))}
      </div>

      {/* The total is the panel's conclusion, so its label is set at the
          heading's size rather than a tile label's: it answers the four tiles
          above it rather than being a fifth one. No info popover, because a
          sum of the row directly above needs no explaining. */}
      <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
        <span className="text-lg font-semibold text-[var(--color-text-primary)]">
          Total Impact
        </span>
        <span
          className="font-tabular text-2xl font-medium"
          style={{ color: percentColor(impact.totalPercent) }}
        >
          {formatPercent(impact.totalPercent)}
        </span>
      </div>

      {/* The same total, read as a word. It stays inside this section rather
          than becoming one of its own: it is the conclusion of these four
          tiles and means nothing apart from them. It is also fed the breakdown
          this panel already computed, never its own figure, so the bar can
          never disagree with the row above it. */}
      <OpportunityMeter impact={impact} />
    </section>
  );
}
