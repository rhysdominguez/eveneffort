// The registry of everything this app persists in the browser: one place to
// see what is stored, for how long, and what shape it has to be to be believed.
//
// Every key is declared here rather than at its call site so the scope decision
// (does this survive closing the tab?) is made once, visibly, next to all the
// others — and so the validators live in a DOM-free module the test suite can
// exercise directly.
//
// Scope, as chosen: browsing state is `session` — filters and a map camera
// describe what someone was doing five minutes ago, not who they are, and
// greeting a returning visitor with a three-week-old filter on Sicily reads as
// a bug. Display units are `local`, because preferring °F and miles IS who they
// are, and re-picking it every visit is the annoyance.
import {
  defineKey,
  isIntegerInRange,
  isNumberInRange,
  isOneOf,
  isRecord,
  isString,
  nullableOf,
  type StateKey,
} from "@/lib/clientState";
import type { YearMonth } from "@/components/home/calendarData";
import {
  ALL_LOCATIONS,
  OTHER_CONTINENT,
  type ContinentValue,
  type LocationFilter,
} from "@/components/home/calendarFilters";
import { CONTINENT_CODES } from "@/lib/continents";
import {
  BQ_DIVISIONS,
  BQ_MIN_AGE,
  type BqDivision,
} from "@/lib/bq/standards";
import type { GoalMode, GoalTimeInput, PaceInput, Unit } from "@/types";
import type {
  HeightUnit,
  HumidityUnit,
  SpeedUnit,
  TempUnit,
  WeightUnit,
} from "@/lib/units/weather";
import type { WeatherMode } from "@/hooks/useWeather";

// --- Race calendar: location filter + the month on screen -----------------

export interface CalendarSnapshot {
  filter: LocationFilter;
  view: YearMonth;
}

const CONTINENT_VALUES = [...CONTINENT_CODES, OTHER_CONTINENT] as const;

export function reviveLocationFilter(raw: unknown): LocationFilter | null {
  if (!isRecord(raw)) return null;
  const continent = nullableOf(raw.continent, (v): v is ContinentValue =>
    isOneOf(v, CONTINENT_VALUES),
  );
  const countryCode = nullableOf(raw.countryCode, isString);
  const regionCode = nullableOf(raw.regionCode, isString);
  if (
    continent === undefined ||
    countryCode === undefined ||
    regionCode === undefined
  ) {
    return null;
  }
  // A region without its country would filter against nothing and leave the
  // region select hidden while still narrowing — an invisible filter.
  if (regionCode !== null && countryCode === null) return ALL_LOCATIONS;
  return { continent, countryCode, regionCode };
}

export function reviveYearMonth(raw: unknown): YearMonth | null {
  if (!isRecord(raw)) return null;
  // The catalogue reaches back to 2015 and editions are seeded a year or two
  // out; the bounds here only need to be loose enough to never reject a real
  // month and tight enough that a garbage year can't be rendered as a grid.
  if (!isIntegerInRange(raw.year, 1900, 2200)) return null;
  if (!isIntegerInRange(raw.month, 1, 12)) return null;
  return { year: raw.year, month: raw.month };
}

export const HOME_CALENDAR: StateKey<CalendarSnapshot> =
  defineKey<CalendarSnapshot>("home.calendar", "session", (raw) => {
    if (!isRecord(raw)) return null;
    const filter = reviveLocationFilter(raw.filter);
    const view = reviveYearMonth(raw.view);
    if (!filter || !view) return null;
    return { filter, view };
  });

// --- Race map: pan and zoom ----------------------------------------------

export interface MapCamera {
  /** [lon, lat], MapLibre's order. */
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
}

/**
 * Bounds matter more here than elsewhere: MapLibre throws on a non-finite
 * center or an out-of-range latitude, and that throw happens inside the map
 * build effect where it takes the entire band down. A corrupt camera has to be
 * caught here, not there.
 */
export function reviveMapCamera(raw: unknown): MapCamera | null {
  if (!isRecord(raw)) return null;
  const center = raw.center;
  if (!Array.isArray(center) || center.length !== 2) return null;
  const [lon, lat] = center;
  if (!isNumberInRange(lon, -180, 180)) return null;
  if (!isNumberInRange(lat, -90, 90)) return null;
  if (!isNumberInRange(raw.zoom, 0, 22)) return null;
  if (!isNumberInRange(raw.bearing, -360, 360)) return null;
  if (!isNumberInRange(raw.pitch, 0, 85)) return null;
  return { center: [lon, lat], zoom: raw.zoom, bearing: raw.bearing, pitch: raw.pitch };
}

export const HOME_MAP_CAMERA: StateKey<MapCamera> = defineKey<MapCamera>(
  "home.map",
  "session",
  reviveMapCamera,
);

// Closed sets, declared once and shared by the revivers below.
const HUMIDITY_UNITS = ["rh", "dew"] as const;
const GOAL_MODES = ["time", "pace", "gap"] as const;

// --- Hero pacing form ----------------------------------------------------

export interface HomeFormSnapshot {
  courseId: string;
  goalTime: GoalTimeInput;
  /**
   * The pace buffer, canonical while the form is in Pace or GAP mode. Stored
   * alongside `goalTime` rather than instead of it so switching modes back and
   * forth across a navigation doesn't lose what was typed in either.
   */
  goalPace?: PaceInput;
  goalMode?: GoalMode;
  unit: Unit;
  raceDate: string;
  raceStartTime: string;
}

/**
 * Deliberately looser than InputForm's own validation: this stores what was
 * TYPED, including a half-finished goal time, and the form re-validates it on
 * render exactly as it would live keystrokes. Rejecting an invalid goal time
 * here would silently discard the snapshot of someone who navigated away
 * mid-edit — the very case this exists for.
 */
export function reviveGoalTime(raw: unknown): GoalTimeInput | null {
  if (!isRecord(raw)) return null;
  if (!isIntegerInRange(raw.hours, 0, 99)) return null;
  if (!isIntegerInRange(raw.minutes, 0, 99)) return null;
  if (!isIntegerInRange(raw.seconds, 0, 99)) return null;
  return { hours: raw.hours, minutes: raw.minutes, seconds: raw.seconds };
}

/** Same "store what was TYPED" looseness as reviveGoalTime — see above. */
export function revivePace(raw: unknown): PaceInput | null {
  if (!isRecord(raw)) return null;
  if (!isIntegerInRange(raw.minutes, 0, 99)) return null;
  if (!isIntegerInRange(raw.seconds, 0, 99)) return null;
  return { minutes: raw.minutes, seconds: raw.seconds };
}

export const HOME_FORM: StateKey<HomeFormSnapshot> =
  defineKey<HomeFormSnapshot>("home.form", "session", (raw) => {
    if (!isRecord(raw)) return null;
    const goalTime = reviveGoalTime(raw.goalTime);
    if (!goalTime) return null;
    if (!isString(raw.courseId)) return null;
    if (!isOneOf(raw.unit, ["km", "miles"] as const)) return null;
    if (!isString(raw.raceDate)) return null;
    if (!isString(raw.raceStartTime)) return null;
    // Both goal-mode fields are optional for the same reason humidityUnit is:
    // a snapshot written by the tab the runner still has open predates them,
    // and discarding it whole would lose the form they were mid-way through.
    const snapshot: HomeFormSnapshot = {
      courseId: raw.courseId,
      goalTime,
      unit: raw.unit,
      raceDate: raw.raceDate,
      raceStartTime: raw.raceStartTime,
    };
    const goalPace = revivePace(raw.goalPace);
    if (goalPace) snapshot.goalPace = goalPace;
    if (isOneOf(raw.goalMode, GOAL_MODES)) snapshot.goalMode = raw.goalMode;
    return snapshot;
  });

// --- Display units (the one preference that outlives the tab) ------------

export interface DisplayUnits {
  tempUnit: TempUnit;
  speedUnit: SpeedUnit;
  weightUnit: WeightUnit;
  heightUnit: HeightUnit;
  humidityUnit: HumidityUnit;
}

export const DISPLAY_UNITS: StateKey<DisplayUnits> = defineKey<DisplayUnits>(
  "prefs.displayUnits",
  "local",
  (raw) => {
    if (!isRecord(raw)) return null;
    if (!isOneOf(raw.tempUnit, ["C", "F"] as const)) return null;
    if (!isOneOf(raw.speedUnit, ["kph", "mph"] as const)) return null;
    if (!isOneOf(raw.weightUnit, ["kg", "lb"] as const)) return null;
    if (!isOneOf(raw.heightUnit, ["cm", "ftin"] as const)) return null;
    // `humidityUnit` arrived after this key shipped, so ABSENT has to mean
    // "the default", not "reject". Rejecting would throw away the °F/lb/ft
    // preference of everyone who set one before dew point existed — the exact
    // annoyance this key was created to prevent. A present-but-invalid value
    // is still rejected: that is corruption, not an older shape.
    if (raw.humidityUnit !== undefined && !isOneOf(raw.humidityUnit, HUMIDITY_UNITS))
      return null;
    return {
      tempUnit: raw.tempUnit,
      speedUnit: raw.speedUnit,
      weightUnit: raw.weightUnit,
      heightUnit: raw.heightUnit,
      humidityUnit: raw.humidityUnit ?? "rh",
    };
  },
);


// --- Goal input mode (Time / Pace / GAP) ---------------------------------

/**
 * How the runner states their goal. `local`, not `session`: whether someone
 * thinks in finish times or in pace is a fact about the runner, the same
 * reasoning that puts °F here rather than in the tab.
 *
 * Kept out of DisplayUnits because it is not a unit — it changes which number
 * the form treats as canonical, not how one number is rendered.
 */
export const GOAL_MODE: StateKey<GoalMode> = defineKey<GoalMode>(
  "prefs.goalMode",
  "local",
  (raw) => (isOneOf(raw, GOAL_MODES) ? raw : null),
);


// --- Boston qualifier profile --------------------------------------------

export interface BqProfile {
  /** Age on Boston race day — see the header of src/lib/bq/standards.ts. */
  age: number;
  division: BqDivision;
}

/**
 * Who the runner is, for the BQ standard. `local` for the same reason as
 * `prefs.goalMode` and °F: age and division are facts about the runner, not
 * about this visit, and re-entering them every time is the annoyance this
 * scope exists to prevent.
 *
 * Deliberately NOT a URL param. Roadmap #3 set that precedent — a shared link
 * stays a finish time, so every existing link and printed paceband keeps
 * resolving — and age and division in a query string someone pastes into a
 * group chat is a privacy smell besides. `src/lib/resultsParams.ts` is
 * untouched by the BQ feature.
 *
 * The upper age bound is a sanity check on storage, not a claim about runners:
 * it only has to reject a corrupt entry, and the top standards band is open at
 * 80+ so anything past it resolves identically.
 */
export const BQ_PROFILE: StateKey<BqProfile> = defineKey<BqProfile>(
  "prefs.bqProfile",
  "local",
  (raw) => {
    if (!isRecord(raw)) return null;
    if (!isIntegerInRange(raw.age, BQ_MIN_AGE, 120)) return null;
    if (!isOneOf(raw.division, BQ_DIVISIONS)) return null;
    return { age: raw.age, division: raw.division };
  },
);


// --- Weather mode --------------------------------------------------------

/**
 * Session-scoped, and read back narrowly — see the restore rule in useWeather.
 * Only "forecast" is ever restored, because it is the only one of the three the
 * URL cannot express; restoring the other two would let stale session state
 * contradict a shared link.
 */
export const WEATHER_MODE: StateKey<WeatherMode> = defineKey<WeatherMode>(
  "results.weatherMode",
  "session",
  (raw) => (isOneOf(raw, ["forecast", "manual", "off"] as const) ? raw : null),
);
