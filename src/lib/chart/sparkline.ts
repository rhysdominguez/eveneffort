// The elevation profile as a thumbnail: one SVG path per course, for the ranking
// table's Terrain column (ROADMAP #15). Pure, so it runs on the server, where
// the 44-point array already is, and only the finished `d` string ever reaches
// the browser.
//
// A SHARED VERTICAL SCALE WITH A FLOOR, not one scale per course. Scaling each
// course to fill its own box makes every row look equally dramatic: Chicago,
// with 6 m of relief across the whole marathon, would draw as tall as Boston.
// So the band never represents less than 600 ft (`SPARKLINE_MIN_SPAN_M`), the
// same number and the same move as ElevationChart's `MIN_SPAN_FT`: every course
// under that is drawn against the same 183 m, so a flat one draws flat and a
// rolling one visibly rolls.
//
// ABOVE THE FLOOR THE COURSE IS FITTED TO THE BAND. The first draft held one
// scale for everything and let the tall courses run off the top; it looked
// right for Chicago and Boston and produced fragments for the rest. La Paz drew
// as a valley floor, St George as a tail, Pikes Peak as two stubs, none of them
// reading as the course. A thumbnail that shows part of the shape is worse than
// one that shows all of it. The cost is that the roughly one course in ten
// above the floor is no longer comparable in height with its peers; the
// Climbing column and the profile label beside the thumbnail carry that.
//
// Each course sits on its own MINIMUM, not on sea level. Where a course is
// above the sea is the Altitude column's job; this shape is about relief.
import { MARATHON_KM } from "@/lib/pacing/segments";

/** Height of the plotted band, in viewBox units. */
const PLOT_H = 25;

/** The plotted width: two units per kilometre, so the axis is to scale. */
const PLOT_W = Math.round(MARATHON_KM * 2 * 10) / 10;

/**
 * Room around the band so a stroke at the very edge is not cut in half. It is
 * applied through the viewBox origin rather than by offsetting every
 * coordinate, which keeps each point a short integer and the payload small.
 */
const PAD = 1.5;

/** The least relief the band represents, in metres: 600 ft, ElevationChart's own floor. */
export const SPARKLINE_MIN_SPAN_M = 600 * 0.3048;

/** One decimal is a tenth of a pixel, far under what a 28 px thumbnail shows. */
function fmt(n: number): string {
  return String(Math.round(n * 10) / 10);
}

/** Rendered size in px; the viewBox is 1:1 with it. */
export const SPARKLINE_WIDTH = Number(fmt(PLOT_W + PAD * 2));
export const SPARKLINE_HEIGHT = PLOT_H + PAD * 2;
export const SPARKLINE_VIEWBOX = `${-PAD} ${-PAD} ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`;

/**
 * The SVG path `d` for a course's 44 per-kilometre elevations (m).
 *
 * Point i sits at km i, except the last, which is the finish at 42.195 km. Throws
 * on anything that is not 44 finite numbers, the same contract `courseTerrain`
 * holds, so a corrupt array fails loudly instead of drawing NaN.
 */
export function elevationSparklinePath(elevations: number[]): string {
  if (elevations.length !== 44 || elevations.some((e) => !Number.isFinite(e))) {
    throw new Error("Elevations array must have exactly 44 finite entries");
  }
  const base = Math.min(...elevations);
  const span = Math.max(Math.max(...elevations) - base, SPARKLINE_MIN_SPAN_M);
  return elevations
    .map((elevation, i) => {
      const x = fmt(Math.min(i, MARATHON_KM) * 2);
      const y = fmt(PLOT_H - ((elevation - base) / span) * PLOT_H);
      return `${i === 0 ? "M" : "L"}${x} ${y}`;
    })
    .join("");
}
