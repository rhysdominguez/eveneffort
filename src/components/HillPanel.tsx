"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { HillSegment, PaceChartRow, Unit } from "@/types";
import { MILE_IN_KM } from "@/lib/pacing/segments";
import {
  averagePaceOverRows,
  formatChartDistance,
  formatFeet,
  rowRangeForDistanceRange,
} from "@/lib/chart/geometry";
import { metresToFeet } from "@/lib/units/elevation";
import { formatPace } from "@/lib/units/pace";

// Hill segments: the few climbs on this course worth planning around, named the
// way a runner would name them, as a row of narrow cards to flip through. The
// per-kilometre chart is its own section (`RaceSplitsChart`, "Race splits"):
// that chart is about the whole race and this is about the climbs in it.
//
// THE SECTION RENDERS NOTHING ON A FLAT COURSE. 140 of the 326 seeded courses
// have no climb that clears the detector's floors; for those, `HillPanel`
// returns null rather than a heading over an empty sentence. Race splits sits
// directly above and shows the bars lying on the zero line, which is already
// the evidence that the course is flat.
//
// A ROW, NOT A GRID. Cards are a fixed narrow width and scroll sideways with
// snapping, so a course with one climb shows one card rather than a full-width
// slab, and a course with six shows as many as fit and lets the runner flip
// through the rest. A finger swipes it natively; previous/next buttons appear
// only when there is somewhere to go, since two cards on a wide screen fit and a
// pair of dead arrows would be noise. The scroller is focusable so the arrow keys
// work from the keyboard too.
//
// NO EXPLANATORY COPY. The section used to carry a summary strip (low, high,
// gain, loss, climbs), a note explaining "costs vs flat" and that climbs are
// measured a kilometre at a time, and a "vs flat" line on every card. All of it
// was removed on purpose, so the cards have to stand on their own words. The
// kilometre-resolution caveat survives only in Race splits' "Per kilometre"
// subtitle.
//
// "GAIN" IS THE NET FIGURE. The card prints top minus foot, which is what the
// detector filters on, so a climb with a small dip inside it reads slightly under
// the sum of its own uphill kilometres. It is labelled "elevation gain" because
// that is the phrase a runner uses; the field is still `riseM` in the data.
//
// THE PACE IS AN AVERAGE, AND IT IS THE PLAN'S OWN. It is the time the plan
// spends on the climb's rows over the distance they cover, taken from the same
// `cumulativeSplitSeconds` the splits table prints (`averagePaceOverRows`), and
// worded by the same `formatPace` that words every row. Nothing is re-derived
// from the pacing model, so it cannot disagree with the table below it. It used
// to be a "fastest to slowest" span, replaced by decision on 2026-09-21: one
// figure a runner can hold in their head beats two.
//
// NUMBERED IN COURSE ORDER. The badge is the climb's place in the race (1 is the
// first one you meet), so a runner can say "the second hill" and mean the same
// card. It is not a rank and not a difficulty: it carries no colour and nothing
// about how hard the climb is, and cards are deliberately not sorted by it.
//
// THE CLIMBS DO NOT MOVE WITH THE UNIT TOGGLE. `courseHills` runs on kilometre
// segments and takes no unit argument, so flipping km/mi changes the ranges
// printed here and nothing else. A section that grew or lost a card because
// someone changed their display unit would be telling them the course had
// changed.
//
// NO NAMES, NO RANK. "Newton" and "Hurricane Point" cannot be derived from
// geometry, and inventing a name for a climb is the one thing here that would be
// a lie rather than an approximation. For the same reason the cards carry no
// difficulty badge: there is no per-climb score on a scale a runner could read,
// and a number invented to fill the slot would be worse than an empty one. Cards
// are identified by where they are. Real names would need a hand-maintained
// column, which is its own project.

interface Props {
  hills: HillSegment[];
  /** The splits the plan already prescribes. The only source of pace here. */
  rows: PaceChartRow[];
  unit: Unit;
}

/** Space between cards, in px. Also the distance one button press adds. */
const GAP = 12;

/**
 * "Km 27.0 to 34.0" / "Mile 16.8 to 21.1". A place on the course, not a distance.
 *
 * Always one decimal, whole numbers included: "Km 27" reads as a marker painted
 * on the road, and these are measured positions. The finish reads "42.2".
 */
function rangeLabel(hill: HillSegment, unit: Unit): string {
  const show = (km: number) =>
    (unit === "km" ? km : km / MILE_IN_KM).toFixed(1);
  const word = unit === "km" ? "Km" : "Mile";
  return `${word} ${show(hill.startDistanceKm)} to ${show(hill.endDistanceKm)}`;
}

/**
 * The plan's average pace over a climb, worded like every row in the splits
 * table. Null (so the line is left off) if the climb maps to no rows.
 */
function averagePace(
  hill: HillSegment,
  rows: PaceChartRow[],
  unit: Unit,
): string | null {
  const range = rowRangeForDistanceRange(
    hill.startDistanceKm,
    hill.endDistanceKm,
    unit,
    rows.length,
  );
  if (!range) return null;
  const pace = averagePaceOverRows(rows, range, unit);
  return pace === null ? null : formatPace(pace, unit);
}

/** One line of a card: the figure in full colour, its word beside it quieter. */
function Line({ value, label }: { value: string; label: string }) {
  return (
    <p className="text-sm">
      <span className="font-tabular font-medium text-[var(--color-text-primary)]">
        {value}
      </span>{" "}
      <span className="text-[var(--color-text-secondary)]">{label}</span>
    </p>
  );
}

const arrowButtonClass =
  "flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)] disabled:pointer-events-none disabled:opacity-40";

function Arrow({ direction }: { direction: "previous" | "next" }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
    >
      <path
        d={direction === "previous" ? "M12 4l-6 6 6 6" : "M8 4l6 6-6 6"}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function HillPanel({ hills, rows, unit }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ canPrevious: false, canNext: false });

  // Read the scroller's position rather than counting cards: how many fit
  // depends on the viewport, and only the DOM knows.
  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const canPrevious = el.scrollLeft > 1;
    const canNext = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setEdges((prev) =>
      prev.canPrevious === canPrevious && prev.canNext === canNext
        ? prev
        : { canPrevious, canNext },
    );
  }, []);

  useEffect(() => {
    measure();
    const el = scroller.current;
    // jsdom has no ResizeObserver, and a page that is resized re-measures on
    // the next scroll anyway, so this is a nicety and not a dependency.
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure, hills, unit]);

  const flip = (direction: -1 | 1) => {
    const el = scroller.current;
    if (!el) return;
    const card = el.firstElementChild as HTMLElement | null;
    const step = ((card?.offsetWidth ?? 0) || 240) + GAP;
    // No `behavior` on purpose: it defers to the CSS `scroll-behavior`, which is
    // `scroll-smooth` here and `motion-reduce:scroll-auto` for anyone who has
    // asked for less motion. Deciding that in JS would mean a matchMedia call,
    // which theme.guard.test.ts bans for anything starting "(prefers".
    el.scrollBy({ left: direction * step });
  };

  if (hills.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
          Hill Segments
        </h2>
        {(edges.canPrevious || edges.canNext) && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Previous climb"
              disabled={!edges.canPrevious}
              onClick={() => flip(-1)}
              className={arrowButtonClass}
            >
              <Arrow direction="previous" />
            </button>
            <button
              type="button"
              aria-label="Next climb"
              disabled={!edges.canNext}
              onClick={() => flip(1)}
              className={arrowButtonClass}
            >
              <Arrow direction="next" />
            </button>
          </div>
        )}
      </div>

      <div
        // A fresh row per course. React would otherwise reuse this node when
        // the runner switches from one course with climbs to another, and the
        // new course would open scrolled to wherever the last one was left
        // (measured: Lisbon at its last card, then Kansas City opened on its
        // fourth of five). Keyed on the climbs themselves and not on the
        // array's identity, so flipping km/mi or typing a goal time, which
        // change neither, keep the runner where they were.
        key={hills.map((h) => `${h.startSegmentIndex}-${h.endSegmentIndex}`).join("|")}
        ref={scroller}
        onScroll={measure}
        role="region"
        aria-label="Climbs on this course"
        tabIndex={0}
        style={{ gap: GAP }}
        className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth motion-reduce:scroll-auto pb-1 [scrollbar-width:none] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-focus)] [&::-webkit-scrollbar]:hidden"
      >
        {hills.map((hill, index) => {
          const pace = averagePace(hill, rows, unit);
          return (
            <div
              key={hill.startSegmentIndex}
              className="w-60 shrink-0 snap-start space-y-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4"
            >
              <div className="mb-2 flex items-center gap-2.5">
                {/* The climb's place in the race. Filled in the text colour
                    and not in any accent: it names a card, it does not grade
                    it. The word is for a screen reader, which would otherwise
                    hear a bare digit. */}
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-text-primary)] font-tabular text-xs font-medium text-[var(--color-bg-surface)]">
                  <span className="sr-only">Climb </span>
                  {index + 1}
                </span>
                <h3 className="text-sm font-medium text-[var(--color-text-primary)]">
                  {rangeLabel(hill, unit)}
                </h3>
              </div>
              <Line
                value={formatChartDistance(hill.lengthKm, unit)}
                label="length"
              />
              <Line
                value={formatFeet(metresToFeet(hill.riseM))}
                label="elevation gain"
              />
              <Line
                value={`${(hill.gradient * 100).toFixed(1)}%`}
                label="avg grade"
              />
              {pace && <Line value={pace} label="avg pace" />}
            </div>
          );
        })}
      </div>
    </section>
  );
}
