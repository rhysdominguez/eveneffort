import type { Course, PacingInput } from "@/types";
import type { PacingResult } from "@/hooks/usePacingChart";
import { computePaceChart } from "@/lib/pacing";
import { buildSegments } from "@/lib/pacing/segments";
import bostonElev from "@/data/courses/boston.json";
import bostonProfile from "@/data/courses/boston.profile.json";
import bostonCoords from "@/data/courses/boston.coords.json";
import { applyFuelingToRows, buildFuelingPlan } from "@/lib/weather/fueling";
import { calculateHeatAdjustment } from "@/lib/weather/heat";
import { formatHMS } from "@/lib/units/time";

// The home page's feature rows show the REAL product components rather than
// screenshots, so they need a real PacingResult to render. computePaceChart is
// pure, so the whole fixture is built once at module scope — and because the
// page below the hero is a server component, that happens at build time and
// ships as static markup.
//
// Assembled the same way usePacingChart does it (rows → adjustedFinishSeconds
// from the last cumulative split → fueling cues layered on). If that hook's
// shape changes, demoResult.test.ts is the tripwire.

/** 3:30 at Boston — Boston because the Newton hills make the clearest chart. */
const DEMO_GOAL_SECONDS = 3 * 3600 + 30 * 60;

// Built from the repo JSON rather than the database on purpose: this is a
// static marketing figure baked in at build time, so making the home page wait
// on a query for geometry it will never let the user change would be pure
// latency. src/data/courses/ remains the seed's source of truth either way.
export const DEMO_COURSE: Course = {
  id: "boston",
  displayName: "Boston Marathon",
  city: "Boston",
  countryCode: "US",
  countryName: "United States",
  regionCode: "US-MA",
  regionName: "Massachusetts",
  // The home page never renders a course outline, and this figure is baked
  // into the marketing bundle, so there is no reason to ship 1 KB of polyline
  // with it. The dashboard reads the real one from the geometry endpoint.
  outline: null,
  elevations: bostonElev,
  profile: bostonProfile as [number, number][],
  coords: bostonCoords as [number, number][],
  start: {
    lat: (bostonCoords as [number, number][])[0][0],
    lon: (bostonCoords as [number, number][])[0][1],
  },
  timezone: "America/New_York",
};

const DEMO_INPUT: PacingInput = {
  goalTimeSeconds: DEMO_GOAL_SECONDS,
  courseId: "boston",
  unit: "miles",
  fueling: { carbsPerHour: 60 },
};

function buildDemoResult(): PacingResult {
  const rows = computePaceChart(DEMO_INPUT, DEMO_COURSE);
  const adjustedFinishSeconds =
    rows.length > 0 ? rows[rows.length - 1].cumulativeSplitSeconds : 0;
  const cues = buildFuelingPlan(
    adjustedFinishSeconds,
    rows,
    DEMO_INPUT.fueling?.carbsPerHour,
  );
  return {
    rows: applyFuelingToRows(rows, cues),
    input: DEMO_INPUT,
    adjustedFinishSeconds,
    weatherApplied: false,
    // The demo is elevation-only, so every weather multiplier is a flat 1 and
    // the durations are just the rows' own splits differenced.
    segmentDurations: rows.map(
      (row, i) =>
        row.cumulativeSplitSeconds -
        (i === 0 ? 0 : rows[i - 1].cumulativeSplitSeconds),
    ),
    // Same segmentation the rows came from, so the splits chart's even-pace
    // baseline lines up with them.
    segmentLengthsKm: buildSegments(DEMO_COURSE.elevations, DEMO_INPUT.unit).map(
      (seg) => seg.lengthKm,
    ),
    heatMultipliers: rows.map(() => 1),
    dryHeatMultipliers: rows.map(() => 1),
    windMultipliers: rows.map(() => 1),
    // Weather is off in the demo, so there is no hourly series.
    hourlySeries: [],
  };
}

export const demoResult: PacingResult = buildDemoResult();

// The weather feature row needs a "goal vs. what the heat actually costs you"
// pair. Rather than run the full weather pipeline (which needs coords, body
// metrics and a wind model) for a static marketing figure, apply just the heat
// multiplier — it is a pure function of temperature and humidity, and heat is
// the effect the copy in this row is about.
const DEMO_TEMP_C = 22;
const DEMO_HUMIDITY = 65;

const demoHeatMultiplier = calculateHeatAdjustment(DEMO_TEMP_C, DEMO_HUMIDITY);

export const DEMO_WEATHER = {
  tempC: DEMO_TEMP_C,
  humidity: DEMO_HUMIDITY,
  goalLabel: formatHMS(DEMO_GOAL_SECONDS),
  adjustedLabel: formatHMS(
    Math.round(DEMO_GOAL_SECONDS * demoHeatMultiplier),
  ),
  /** Whole seconds the heat adds across the marathon, for the delta readout. */
  costSeconds: Math.round(DEMO_GOAL_SECONDS * (demoHeatMultiplier - 1)),
};
