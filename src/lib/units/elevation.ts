// Elevation display. One convention, set by the elevation chart and followed
// everywhere: elevation is shown in FEET regardless of the pace unit, because
// the chart's vertical axis has always read that way and a course's gain
// switching units with the pace column would only invite comparing two
// different numbers for the same hill.
//
// Metres remain the stored and computed unit throughout (`CourseTerrain`, the
// 44-point arrays, `Segment.elevationDeltaM`); this is a display conversion at
// the very edge, like the temperature and weight toggles.
//
// Only the conversion lives here. The formatting of a value already in feet is
// `formatFeet` / `formatSignedFeet` in src/lib/chart/geometry.ts, which the
// elevation chart's readouts already use — one house style for "1234 ft",
// not two.

export const M_TO_FT = 3.28084;

/** Metres → feet. */
export function metresToFeet(metres: number): number {
  return metres * M_TO_FT;
}
