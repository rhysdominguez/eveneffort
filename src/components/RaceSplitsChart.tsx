"use client";
import { useMemo, useState } from "react";
import type { HillSegment, Unit } from "@/types";
import type { PacingResult } from "@/hooks/usePacingChart";
import { splitImpact } from "@/lib/pacing/splitImpact";
import { IMPACT_FACTORS, type ImpactFactor } from "@/lib/pacing/impact";
import { columnIndexAtX, rowRangeForDistanceRange } from "@/lib/chart/geometry";
import { UnitToggle } from "./UnitToggle";

// Race splits: one bar per split row, showing how far ahead of or behind even
// pace this runner is over that kilometre (or mile), and, on the tabs, which
// of the four factors put them there. The climbs the detector named are shaded
// behind the bars, so each numbered Hill segments card below can be found in
// the picture, and the chart and the cards are one claim and not two. It is a
// section of its own and not part of the hill panel: the chart is about the
// whole race, the cards are about the few climbs in it.
//
// ZERO IS EVEN PACE (ROADMAP #17). It was flat ground for one release, which
// was a fair question to ask and the wrong one to build tabs on: heat and wind
// have no flat-ground reading, so the four parts could never have been made to
// sum to the whole. Against even pace they do, exactly, and the bars now add up
// to the finish delta SummaryHeader prints. What the terrain costs against flat
// ground is still on screen, as the Elevation tile in the impact panel directly
// above and the "vs flat" column on /courses.
//
// WHY A DIVERGING BAR CHART AND NOT A SECOND ELEVATION LINE. The elevation
// profile above already draws the ground, and drawing it twice would say
// nothing new. What a runner cannot read off that line is what the terrain
// COSTS: a 2% climb and a 2% descent look symmetric on an elevation trace and
// are nothing like symmetric in time (see the header of courseCost.ts).
//
// THREE THINGS THAT LOOK LIKE BUGS AND ARE NOT:
//
// - The Elevation tab balances. `normalizePaces` pays for the climbs with the
//   descents, so its bars net to zero across the race by construction. The Heat
//   tab does not balance and should not.
// - Heat is never below the line; wind goes both ways. A tailwind segment
//   genuinely runs faster, and the wind model is deliberately asymmetric.
// - There are 42 bars, not 43. The final 0.195 km stub is folded into the bar
//   before it: drawn on its own it is a sliver a fifth the width of its
//   neighbours reading a fifth of their value, which looks like a runner
//   stopping at the line. The splits TABLE keeps the real 43rd row.
//
// ALL FIVE TABS, ALWAYS, AND ALL FIVE OPENABLE. A factor doing nothing on this
// course (every weather factor, until the weather panel is switched on;
// humidity on a cold day) opens onto a flat line along the zero rule.
//
// This took two goes to get right and both failures are worth recording. It
// first hid the control entirely whenever only elevation was live, on the
// argument that a tab which changes nothing is a dead click. True of the click,
// false of the screen: the first person to open the page saw a chart with no
// tabs and reasonably concluded the feature had not been built, because a
// control that is invisible until an unrelated switch is flipped does not read
// as conditional, it reads as absent. It then showed the dead tabs disabled,
// which advertises the feature but still refuses to answer the question. A flat
// line IS the answer to "what is the wind costing me?" on a still day, and a
// runner who can see it is better served than one who is told not to ask.
// ImpactPanel directly above resolves this the same way, printing 0.0% rather
// than hiding or greying its quiet tiles.
//
// ZERO BARS ARE NEUTRAL, NOT RED. A hairline is drawn on every row so no split
// goes missing from the picture, and painting a row of exactly-zero hairlines
// red would claim a cost that is not there. Exactly zero takes
// `--color-text-tertiary`, which is what ImpactPanel's tiles do with a true
// zero and what this chart's own tooltip already did.
//
// ONE Y DOMAIN FOR ALL TABS, set by the largest bar in any series. Rescaling
// per tab would draw a two-second heat bar at the same height as a thirty-second
// climb, and the first thing a reader should learn from switching tabs is how
// much smaller one factor is than another.
//
// COLOR. Red above the line, green below. Both are the reserved semantics
// DESIGN.md already assigns them and neither is decoration: this is the same
// "slower than target / faster than target" pairing SummaryHeader paints on its
// weather delta. No third colour, no ramp, no tint by factor.
//
// THE LABELS ARE HTML AND THE PLOT IS SVG, which is the one structural choice
// here worth explaining. `ElevationChart` puts its axis text inside the viewBox,
// which is fine for a chart that keeps its aspect ratio, but this one has to be
// short and wide on a phone and taller on a desktop, and scaling a viewBox to
// do that either smears the bars or shrinks 10px axis text to an unreadable
// four. So the plot stretches (`preserveAspectRatio="none"`, and it contains
// nothing but rectangles and horizontal rules, which survive a non-uniform
// scale) while every piece of type, the hover tooltip included, sits outside it
// in ordinary HTML at an ordinary size.
//
// HOVER IS BY COLUMN. A kilometre costing a second is a hairline bar, and every
// bar has a gap either side, so neither can be aimed at. The pointer resolves
// to a whole slot, which is also what the elevation chart does with its
// nearest-point lookup. Pointer events rather than mouse events so a finger
// dragged across the plot reads the same way; `touch-action: pan-y` keeps
// vertical page scrolling working.

interface Props {
  /** The named climbs, for the shaded bands. Always km-resolution. */
  hills: HillSegment[];
  /**
   * The plan as computed. Read instead of the live form state so this chart,
   * the impact panel above it and the splits table below always describe the
   * same race.
   */
  result: PacingResult;
}

/** Which series is on screen. "total" is the four of them added up. */
type Tab = ImpactFactor | "total";

/** Plot-space width and height. Arbitrary: the plot is stretched to its box. */
const VB_W = 1000;
const VB_H = 100;

/**
 * The smallest half-domain the axis will show, in seconds.
 *
 * A flat course's bars are dust: without a floor the axis would zoom in on a
 * two-second wobble and draw Chicago as though it were Big Sur. 10 s is about
 * the point where a per-kilometre difference is worth noticing.
 */
const MIN_HALF_DOMAIN_S = 10;

/**
 * Half the tooltip's widest plausible width, in px, used to keep it inside the
 * plot at both ends. An estimate, because HTML text cannot be measured before
 * layout; it errs wide so the pill never overhangs the chart's edge.
 */
const TOOLTIP_HALF_W = 96;

const TAB_LABEL: Record<Tab, string> = {
  total: "Total",
  elevation: "Elevation",
  heat: "Heat",
  humidity: "Humidity",
  wind: "Wind",
};

/**
 * What each tab claims, for the chart's accessible name. The Elevation line
 * names the strategy carry on purpose: with a negative split selected these
 * bars are terrain AND shaping, and there is no way to separate them once the
 * durations are normalized (see the header of splitImpact.ts).
 */
function tabDescription(tab: Tab, unitWord: string): string {
  switch (tab) {
    case "total":
      return `How far ahead of or behind even pace each ${unitWord} runs, in seconds.`;
    case "elevation":
      return `What the terrain, and any split strategy, move each ${unitWord} by, in seconds.`;
    case "heat":
      return `What the air temperature alone costs each ${unitWord}, in seconds.`;
    case "humidity":
      return `What the moisture adds to each ${unitWord}, in seconds.`;
    case "wind":
      return `What head and tail wind move each ${unitWord} by, in seconds.`;
  }
}

/**
 * Red costs time, green gives it back, neutral grey is a true zero.
 *
 * Exactly zero, not "rounds to zero": a kilometre worth four tenths of a second
 * is still a kilometre that cost something, and the only series made of real
 * zeros is a factor that is not acting on this course at all.
 */
function barColor(seconds: number): string {
  if (seconds > 0) return "var(--color-red-primary)";
  if (seconds < 0) return "var(--color-green-primary)";
  return "var(--color-text-tertiary)";
}

/** "+16s" / "0s" / "-16s", with a true minus to match the other readouts. */
function secondsLabel(seconds: number): string {
  const v = Math.round(seconds);
  if (v === 0) return "0s";
  return v > 0 ? `+${v}s` : `−${Math.abs(v)}s`;
}

/**
 * The name of a row. The last bar carries the stub, so it ends at the finish
 * and is named for it: "42.2" / "26.2", exactly as the splits table's final row.
 */
function rowLabel(index: number, count: number, unit: Unit): string {
  const word = unit === "km" ? "Km" : "Mile";
  return index === count - 1
    ? `${word} ${unit === "km" ? 42 : 26}.2`
    : `${word} ${index + 1}`;
}

export function RaceSplitsChart({ hills, result }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("total");
  const unit = result.input.unit;

  // One decomposition per computed plan, not one per render: the splits table
  // beside this re-renders on every keystroke in the goal field.
  const series = useMemo(
    () =>
      splitImpact({
        goalTimeSeconds: result.input.goalTimeSeconds,
        segmentLengthsKm: result.segmentLengthsKm,
        segmentDurations: result.segmentDurations,
        heatMultipliers: result.heatMultipliers,
        dryHeatMultipliers: result.dryHeatMultipliers,
        windMultipliers: result.windMultipliers,
      }),
    [
      result.input.goalTimeSeconds,
      result.segmentLengthsKm,
      result.segmentDurations,
      result.heatMultipliers,
      result.dryHeatMultipliers,
      result.windMultipliers,
    ],
  );

  // Every factor, always, and every one of them openable. A factor doing
  // nothing on this course draws a flat line on the zero rule, which is the
  // true answer to "what is the wind costing me?" on a still day.
  const tabs: Tab[] = ["total", ...IMPACT_FACTORS];

  const { bars, bands, ticksX, half, slotW } = useMemo(() => {
    const seconds =
      tab === "total" ? series.total : series.byFactor[tab];

    // The domain spans every series the reader can switch to, so the axis does
    // not move under them and the tabs stay comparable.
    const peak = Math.max(
      0,
      ...series.total.map(Math.abs),
      ...series.active.flatMap((factor) =>
        series.byFactor[factor].map(Math.abs),
      ),
    );
    // Symmetric about zero on purpose: a bar's length is comparable whichever
    // side of the line it is on, which is the claim the chart is making.
    const half = Math.max(peak, MIN_HALF_DOMAIN_S);
    const slotW = VB_W / seconds.length;
    const barW = slotW * 0.72;
    const y = (s: number) => VB_H / 2 - (s / half) * (VB_H / 2);

    const bars = seconds.map((s, i) => {
      const top = y(Math.max(s, 0));
      const bottom = y(Math.min(s, 0));
      return {
        index: i,
        seconds: s,
        x: i * slotW + (slotW - barW) / 2,
        width: barW,
        y: top,
        // A segment costing nothing still gets a hairline, so no row is
        // silently missing from a chart that has one bar per row.
        height: Math.max(bottom - top, 0.8),
      };
    });

    // The named climbs, mapped onto the rows actually being drawn. In miles
    // mode that is the same mapping the cards' pace spans use, so a band and
    // its card always cover the same bars.
    //
    // Only where the terrain is what is being drawn: a climb shaded behind the
    // heat series would assert a relationship that is not there.
    const bands =
      tab === "total" || tab === "elevation"
        ? hills
            .map((hill) => {
              const range = rowRangeForDistanceRange(
                hill.startDistanceKm,
                hill.endDistanceKm,
                unit,
                seconds.length,
              );
              if (!range) return null;
              return {
                key: hill.startSegmentIndex,
                x: range[0] * slotW,
                width: (range[1] - range[0] + 1) * slotW,
              };
            })
            .filter(
              (b): b is { key: number; x: number; width: number } => b !== null,
            )
        : [];

    // Every sixth row, the way the elevation chart's own axis spaces its ticks.
    // Positioned as a percentage of the plot's width, since the plot stretches.
    const ticksX = seconds
      .map((_, i) => i)
      .filter((i) => i > 0 && (i + 1) % 6 === 0)
      .map((i) => ({
        label: String(i + 1),
        left: ((i * slotW + slotW / 2) / VB_W) * 100,
      }));

    return { bars, bands, ticksX, half, slotW };
  }, [series, tab, hills, unit]);

  const unitWord = unit === "km" ? "kilometre" : "mile";
  const active = hover !== null && hover < bars.length ? bars[hover] : null;
  const activeRounded = active ? Math.round(active.seconds) : 0;

  const track = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setHover(columnIndexAtX(event.clientX, rect.left, rect.width, bars.length));
  };

  return (
    <figure className="space-y-3">
      <figcaption className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
          Race Splits
        </h2>
        <UnitToggle<Tab>
          label="Split adjustment factor"
          value={tab}
          options={tabs.map((t) => [t, TAB_LABEL[t]] as const)}
          onChange={setTab}
          variant="tab"
        />
      </figcaption>

      <div className="rounded-xl border border-[var(--color-border)] p-4">
        {/* Left gutter for the value axis, bottom gutter for the distance axis.
            Both hold real text at a real size, at any viewport width. */}
        <div className="relative pb-5 pl-11">
          {/* The gutter matches the PLOT's height, not the padded box: with
              `h-full` the bottom label lands under the distance ticks instead
              of on the plot's bottom edge. Keep these two height classes in
              step with the svg's. */}
          <div className="pointer-events-none absolute left-0 top-0 h-36 w-10 sm:h-44">
            {[
              { value: half, style: { top: 0 } },
              { value: 0, style: { top: "50%" } },
              { value: -half, style: { top: "100%" } },
            ].map(({ value, style }) => (
              <span
                key={value}
                style={style}
                className="absolute right-0 -translate-y-1/2 font-tabular text-[10px] text-[var(--color-text-tertiary)]"
              >
                {secondsLabel(value)}
              </span>
            ))}
          </div>

          <div
            className="relative"
            style={{ touchAction: "pan-y" }}
            onPointerMove={track}
            onPointerDown={track}
            onPointerLeave={() => setHover(null)}
            onPointerCancel={() => setHover(null)}
          >
            <svg
              viewBox={`0 0 ${VB_W} ${VB_H}`}
              preserveAspectRatio="none"
              className="h-36 w-full sm:h-44"
              role="img"
              aria-label={`${tabDescription(tab, unitWord)} Bars above the line cost time, bars below it give time back.`}
            >
              {/* The climbs, behind everything, so a card's range is findable
                  in the picture without reading a single number. Filled AND
                  outlined: the elevated fill alone is one step off the page
                  background and all but invisible on a white surface. */}
              {bands.map((band) => (
                <rect
                  key={`band${band.key}`}
                  data-band=""
                  x={band.x}
                  y={0}
                  width={band.width}
                  height={VB_H}
                  style={{
                    fill: "var(--color-bg-elevated)",
                    stroke: "var(--color-border)",
                  }}
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              ))}

              {/* The hovered column, drawn over the bands and under the bars
                  so the bar itself is never tinted. */}
              {active && (
                <rect
                  data-hover=""
                  x={active.index * slotW}
                  y={0}
                  width={slotW}
                  height={VB_H}
                  style={{ fill: "var(--color-border)" }}
                  opacity={0.6}
                />
              )}

              {[0, VB_H / 2, VB_H].map((y) => (
                <line
                  key={y}
                  x1={0}
                  x2={VB_W}
                  y1={y}
                  y2={y}
                  style={{
                    stroke:
                      y === VB_H / 2
                        ? "var(--color-text-tertiary)"
                        : "var(--color-border)",
                  }}
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              ))}

              {bars.map((bar) => (
                <rect
                  key={bar.index}
                  data-bar=""
                  x={bar.x}
                  y={bar.y}
                  width={bar.width}
                  height={bar.height}
                  style={{ fill: barColor(bar.seconds) }}
                />
              ))}
            </svg>

            {/* The readout. Sits in the half of the plot the hovered bar does
                NOT occupy, so the tallest bar on the course is never the one
                the tooltip covers while a runner is trying to read it. */}
            {active && (
              <div
                // Not a live region: it would be re-announced on every pointer
                // move. The numbers it shows are in the splits table already.
                aria-hidden="true"
                className={`pointer-events-none absolute z-10 flex items-baseline gap-2 whitespace-nowrap rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-2 py-1 font-tabular text-[11px] ${
                  active.seconds >= 0 ? "bottom-1" : "top-1"
                }`}
                style={{
                  left: `clamp(${TOOLTIP_HALF_W}px, ${((active.index * slotW + slotW / 2) / VB_W) * 100}%, calc(100% - ${TOOLTIP_HALF_W}px))`,
                  transform: "translateX(-50%)",
                }}
              >
                <span
                  className="font-semibold"
                  style={{
                    color:
                      activeRounded > 0
                        ? "var(--color-red-primary)"
                        : activeRounded < 0
                          ? "var(--color-green-primary)"
                          : "var(--color-text-secondary)",
                  }}
                >
                  {secondsLabel(active.seconds)}
                </span>
                <span className="text-[var(--color-text-secondary)]">
                  {tab === "total" ? "vs even" : TAB_LABEL[tab]}
                </span>
                <span className="text-[var(--color-text-tertiary)]">
                  {rowLabel(active.index, bars.length, unit)}
                </span>
              </div>
            )}
          </div>

          <div className="relative h-4">
            {ticksX.map((tick) => (
              <span
                key={tick.label}
                style={{ left: `${tick.left}%` }}
                className="absolute top-1 -translate-x-1/2 font-tabular text-[10px] text-[var(--color-text-tertiary)]"
              >
                {tick.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </figure>
  );
}
