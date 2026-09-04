"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CourseId,
  CourseSummary,
  GoalMode,
  GoalTimeInput,
  PaceInput,
  PacingInput,
  SplitStrategy,
  StartStrategy,
  Unit,
  WeatherConditions,
} from "@/types";
import {
  DEFAULT_BODY,
  DEFAULT_FUELING,
  DEFAULT_SPLIT,
  DEFAULT_START,
} from "@/types";
import { SPLIT_OPTIONS, START_OPTIONS } from "@/lib/pacing/strategy";
import { formatHMS, toSeconds } from "@/lib/units/time";
import { formatPace } from "@/lib/units/pace";
import {
  avgPaceFromGoalTime,
  gapPaceFromGoalTime,
  goalTimeFromAvgPace,
  goalTimeFromGapPace,
} from "@/lib/pacing/effort";
import { CourseSearch } from "@/components/CourseSearch";
import { DatePicker } from "@/components/DatePicker";
import { RaceYearPicker } from "@/components/RaceYearPicker";
import { TimePicker } from "@/components/TimePicker";
import { WeatherFields } from "@/components/WeatherFields";
import { NumericField } from "@/components/NumericField";
import { RangeField } from "@/components/RangeField";
import { UnitToggle } from "@/components/UnitToggle";
import {
  CARBS_PER_HOUR_MAX,
  CARBS_PER_HOUR_MIN,
  CARBS_PER_HOUR_STEP,
  gelIntervalSeconds,
} from "@/lib/weather/fueling";
import { useWeather } from "@/hooks/useWeather";
import { HeightField } from "@/components/HeightField";
import type {
  HeightUnit,
  HumidityUnit,
  SpeedUnit,
  TempUnit,
  WeightUnit,
} from "@/lib/units/weather";
import {
  massFromDisplay,
  massToDisplay,
  roundForDisplay,
} from "@/lib/units/weather";
import { useStoredState } from "@/hooks/useStoredState";
import { DISPLAY_UNITS, GOAL_MODE, HOME_FORM } from "@/lib/stateKeys";
import {
  defaultStartTime,
  editionForDate,
  editionForYear,
  nextEdition,
  resolveRaceDate,
  startTimeIsAssumed,
  weatherSourceFor,
} from "@/lib/editions";
import { todayISO } from "@/lib/units/date";

// Two modes:
// - Button mode (homepage): pass `onCalculate`. Owns its own state and
//   surfaces a Calculate button; behavior unchanged from before.
// - Live mode (dashboard): pass `onChange`. No button — every valid edit
//   propagates immediately so outputs recompute live. `initial` seeds the
//   starting state from the URL-parsed PacingInput.
//
// Weather is owned here (not passed in) so it renders identically in both
// modes, including the homepage. `onHourlyChange` lets the dashboard capture
// the live forecast series for per-segment sampling in the pacing engine —
// the homepage has no use for it and simply omits the prop.
interface Props {
  onCalculate?: (input: PacingInput) => void;
  onChange?: (input: PacingInput) => void;
  onHourlyChange?: (hourly: WeatherConditions[] | null) => void;
  /**
   * Every selectable course, fetched server-side and passed down. Light
   * metadata only — the elevation geometry is loaded on /results for the one
   * course being charted, so this stays small at hundreds of courses.
   */
  catalog: CourseSummary[];
  /**
   * A course chosen somewhere else on the page — currently only the home map,
   * whose pins sit in a band the form can't see. Applied exactly as if it had
   * been picked from the dropdown, date prefill and all. Omitted on the
   * dashboard, where the form is the only thing that picks a course.
   */
  requestedCourseId?: CourseId | null;
  initial?: PacingInput;
  title?: string;
  /** Supporting line under the title. Hero only — the dashboard omits it. */
  subtitle?: string;
  /**
   * Remember what was typed here across a navigation away and back.
   *
   * Hero only. The dashboard deliberately does NOT set this: there, `initial`
   * comes from the query string, and a session snapshot quietly overriding a
   * link someone was sent would make shared URLs mean different things to
   * different people. Display units are the exception and persist in both
   * modes — see below.
   */
  persist?: boolean;
}

const eyebrowBase = "block text-xs uppercase tracking-wider font-medium";

const numClass =
  "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] px-3 py-3 text-center text-xl font-tabular font-medium focus:border-[var(--color-border-focus)] focus:outline-none transition-colors";

// Matches RaceYearPicker's select, the only other one in the form.
const selectClass =
  "w-full appearance-none rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-4 py-3 pr-10 text-left text-base text-[var(--color-text-primary)] focus:border-[var(--color-border-focus)] focus:outline-none transition-colors";

const DEFAULT_GOAL_TIME: GoalTimeInput = { hours: 4, minutes: 0, seconds: 0 };

/**
 * "GAP" rather than a spelled-out label: it is the term Strava and Garmin have
 * already taught runners, and the methodology page names the same model.
 */
const GOAL_MODE_OPTIONS: readonly (readonly [GoalMode, string])[] = [
  ["time", "Time"],
  ["pace", "Pace"],
  ["gap", "GAP"],
];

const DEFAULT_GOAL_PACE: PaceInput = { minutes: 5, seconds: 0 };

function paceToSeconds(pace: PaceInput): number {
  return pace.minutes * 60 + pace.seconds;
}

function secondsToPace(total: number): PaceInput {
  const t = Math.max(0, Math.round(total));
  return { minutes: Math.floor(t / 60), seconds: t % 60 };
}

function secondsToGoalTime(total: number): GoalTimeInput {
  const t = Math.max(0, Math.floor(total));
  return {
    hours: Math.floor(t / 3600),
    minutes: Math.floor((t % 3600) / 60),
    seconds: t % 60,
  };
}

export function InputForm({
  onCalculate,
  onChange,
  onHourlyChange,
  catalog,
  requestedCourseId,
  initial,
  title,
  subtitle,
  persist = false,
}: Props) {
  const live = onChange !== undefined;

  // Button mode is the homepage hero, where the form sits directly on the
  // photograph with no card behind it (the Macmillan reference). Tertiary
  // grey labels vanish against an image, so they step up to primary there;
  // the dashboard sidebar keeps the quieter grey on its white card.
  const eyebrowClass = `${eyebrowBase} ${
    live
      ? "text-[var(--color-text-tertiary)]"
      : "text-[var(--color-text-secondary)]"
  }`;

  // The hero form remembers what was typed into it across a navigation away
  // and back; the dashboard's copy never does, because `initial` there comes
  // from the query string and a session snapshot silently overriding a link
  // someone was SENT would make shared URLs mean different things to different
  // people.
  //
  // The stored snapshot sits BETWEEN the props and local edits rather than
  // seeding state: `edit ?? stored ?? prop default`. Written that way because
  // the home page is statically prerendered — `useStoredState` reports null on
  // the server and through hydration, so the first client render matches the
  // HTML exactly, then React swaps in the stored values before paint. Seeding a
  // `useState` initialiser from storage instead would be a hydration mismatch.
  const [storedForm, storeForm] = useStoredState(HOME_FORM);
  const restored = persist ? storedForm : null;

  const [goalTimeEdit, setGoalTimeEdit] = useState<GoalTimeInput | null>(null);
  // Memoized because it feeds the write-through effect's dependency list: a
  // fresh object every render would re-run the effect every render.
  const propGoalTime = useMemo(
    () =>
      initial ? secondsToGoalTime(initial.goalTimeSeconds) : DEFAULT_GOAL_TIME,
    [initial],
  );
  const goalTime = goalTimeEdit ?? restored?.goalTime ?? propGoalTime;

  // How the goal is being STATED. All three modes collapse to the same
  // `goalTimeSeconds` at `buildInput`, so the engine, the URL and every shared
  // link are unaffected by which one is on screen.
  //
  // The mode's own value is what the form holds canonically, and that is the
  // point rather than an implementation detail: in GAP mode the runner has
  // said "I want to run this at 5:00/km grade-adjusted", so switching to a
  // hillier course has to move the FINISH TIME and leave the pace alone. Were
  // the finish time canonical, the answer would run the wrong way round.
  const [goalModeEdit, setGoalModeEdit] = useState<GoalMode | null>(null);
  const [storedGoalMode, storeGoalMode] = useStoredState(GOAL_MODE);
  const [goalPaceEdit, setGoalPaceEdit] = useState<PaceInput | null>(null);

  const initialCourseId = initial?.courseId ?? catalog[0]?.id ?? "";
  const [courseIdEdit, setCourseIdEdit] = useState<CourseId | null>(null);
  // A restored slug is only honoured while the course is still selectable —
  // courses are database rows, and one can leave the seed between two visits.
  const restoredCourseId =
    restored && catalog.some((c) => c.id === restored.courseId)
      ? restored.courseId
      : null;
  const courseId = courseIdEdit ?? restoredCourseId ?? initialCourseId;

  const [unitEdit, setUnitEdit] = useState<Unit | null>(null);
  const unit = unitEdit ?? restored?.unit ?? initial?.unit ?? "km";

  // The chosen course's flat-equivalent distance, which is what turns a
  // grade-adjusted pace into a finish time. It rides on the catalog precisely
  // so this works on the homepage too, where no geometry is loaded.
  //
  // Absent only when the catalog itself is empty — the no-database degradation
  // Rule 9 requires — and in that case GAP is disabled rather than answered
  // with a wrong number.
  const courseEffort = catalog.find((c) => c.id === courseId)?.effort ?? null;
  const gapAvailable = courseEffort !== null;

  const goalMode: GoalMode = ((): GoalMode => {
    const chosen = goalModeEdit ?? restored?.goalMode ?? storedGoalMode ?? "time";
    // A stored preference for GAP must not strand the runner on a form whose
    // goal field cannot be evaluated.
    return chosen === "gap" && !gapAvailable ? "time" : chosen;
  })();

  // Seeded FROM the incoming goal time, not from a constant. A runner whose
  // stored preference is Pace or GAP still has to see the goal the link they
  // opened actually carries — the query string is authoritative for everything
  // it can express, and a default pace here would silently overwrite it the
  // moment the form emitted.
  const propGoalPace = ((): PaceInput => {
    if (!initial) return DEFAULT_GOAL_PACE;
    if (goalMode === "pace")
      return secondsToPace(avgPaceFromGoalTime(initial.goalTimeSeconds, unit));
    if (goalMode === "gap" && courseEffort)
      return secondsToPace(
        gapPaceFromGoalTime(initial.goalTimeSeconds, courseEffort, unit),
      );
    return DEFAULT_GOAL_PACE;
  })();

  const goalPace = goalPaceEdit ?? restored?.goalPace ?? propGoalPace;
  const goalPaceSeconds = paceToSeconds(goalPace);

  /**
   * A pace field seeded from a shared link that nothing has touched yet.
   *
   * It matters because the field holds WHOLE SECONDS: a 3:00:00 goal is
   * 4:17.4/km grade-adjusted at Boston, which displays as 4:17 and multiplies
   * back to 2:59:42. Eighteen seconds is small, but a shared link has to
   * reproduce the chart it was sent for, exactly — so until the runner edits
   * the pace, switches course or changes unit, the link's own number is what
   * leaves here and the rounded pace is only what's displayed.
   *
   * The moment any of those three moves, the pace becomes canonical, which is
   * what makes a course switch in GAP mode hold the pace and move the finish.
   */
  const paceIsPristine =
    initial !== undefined &&
    goalPaceEdit === null &&
    restored?.goalPace === undefined &&
    courseIdEdit === null &&
    unitEdit === null;

  // The one number that leaves this component. Every mode is a multiply.
  const goalTimeSeconds = ((): number => {
    if (goalMode === "time") return toSeconds(goalTime);
    if (paceIsPristine) return initial.goalTimeSeconds;
    if (goalMode === "pace") return goalTimeFromAvgPace(goalPaceSeconds, unit);
    return courseEffort
      ? goalTimeFromGapPace(goalPaceSeconds, courseEffort, unit)
      : 0;
  })();

  // The form renders on the server too, and the server runs in UTC — reading
  // the clock during render would make the first client paint disagree with the
  // server's HTML. Start from UTC and correct to the visitor's own date after
  // hydration, the same way RaceCalendar does. This matters here because
  // "today" is what decides whether a stale date gets rolled forward.
  const [today, setToday] = useState(() => new Date().toISOString().slice(0, 10));
  // Same shape as RaceCalendar's correction, and setState-in-effect is the
  // point rather than an oversight: the whole job is to re-render once the
  // visitor's real date is known, and reading the clock during render is the
  // thing that would cause the mismatch. Runs once — a session spanning
  // midnight is not worth watching for.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const local = todayISO();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (local !== today) setToday(local);
  }, []);

  // Seeded from the chosen course's next scheduled edition — the first thing
  // the edition table buys the user.
  //
  // `resolveRaceDate` owns the precedence, and the rule that matters is that a
  // date from a shared URL always wins while a date left in session storage
  // only wins until it is past. That is the "the date updates itself" case: a
  // snapshot from an earlier visit rolls forward to the next edition rather
  // than pacing a race that has since been run.
  const [raceDateEdit, setRaceDateEdit] = useState<string | null>(null);
  const [customDate, setCustomDate] = useState(false);
  const selectedEditions =
    catalog.find((c) => c.id === courseId)?.editions ?? [];
  const raceDate =
    raceDateEdit ??
    resolveRaceDate({
      editions: selectedEditions,
      urlDate: initial?.raceDateISO,
      restoredDate: restored?.raceDate,
      todayISO: today,
    });

  // The edition behind the currently-shown date, if any. Null for a custom
  // date the runner picked themselves.
  const currentEdition = editionForDate(selectedEditions, raceDate);

  const [raceStartTimeEdit, setRaceStartTimeEdit] = useState<string | null>(
    null,
  );
  // Falls back to an assumed 7:30 local start rather than staying empty. The
  // seed still refuses to guess an hour (a wrong one keys the weather to the
  // wrong conditions), but an empty field left the weather panel dark for most
  // races — so the guess is made here, where the UI can label it as one.
  const raceStartTime =
    raceStartTimeEdit ??
    restored?.raceStartTime ??
    initial?.raceStartTime ??
    defaultStartTime(currentEdition);
  // Weather + body metrics are one section, not two — the body feeds the wind
  // drag model, so they're a single setting. It's always open: on the
  // dashboard these are the controls people came to adjust, and hiding them
  // behind a disclosure only cost a click.
  //
  // Body metrics are stored canonically (kg / cm); the toggles convert only
  // for display, matching how weather conditions are handled.
  const [massKg, setMassKg] = useState<number | null>(
    initial?.body?.massKg ?? null,
  );
  const [heightCm, setHeightCm] = useState<number | null>(
    initial?.body?.heightCm ?? null,
  );

  // Fueling defaults ON for a fresh form — the app has always shown gel cues,
  // and most marathoners fuel. When seeded from a URL, absence of `fueling`
  // is meaningful (the runner turned it off), so it's honoured.
  const [fuelingEnabled, setFuelingEnabled] = useState<boolean>(
    initial ? initial.fueling !== undefined : true,
  );
  const [carbsPerHour, setCarbsPerHour] = useState<number>(
    initial?.fueling?.carbsPerHour ?? DEFAULT_FUELING.carbsPerHour,
  );

  // Strategy is dashboard-only, so the hero always builds the defaults — which
  // is why it is not part of the persisted HOME_FORM snapshot either.
  const [split, setSplit] = useState<SplitStrategy>(
    initial?.split ?? DEFAULT_SPLIT,
  );
  const [startStrategy, setStartStrategy] = useState<StartStrategy>(
    initial?.start ?? DEFAULT_START,
  );

  // Per-field display units. Seeded once from the distance unit so an imperial
  // user gets sensible defaults; independent from it thereafter.
  //
  // These persist on BOTH pages, and in localStorage rather than session
  // storage: preferring °F and pounds is a fact about the runner, not about
  // this visit, and re-picking it every time is the actual annoyance. A stored
  // preference outranks the `unit === "miles"` guess, which stays as the
  // first-visit default.
  const [storedUnits, storeUnits] = useStoredState(DISPLAY_UNITS);
  const [tempUnitEdit, setTempUnitEdit] = useState<TempUnit | null>(null);
  const tempUnit =
    tempUnitEdit ?? storedUnits?.tempUnit ?? (initial?.unit === "miles" ? "F" : "C");
  const [speedUnitEdit, setSpeedUnitEdit] = useState<SpeedUnit | null>(null);
  const speedUnit =
    speedUnitEdit ??
    storedUnits?.speedUnit ??
    (initial?.unit === "miles" ? "mph" : "kph");
  const [weightUnitEdit, setWeightUnitEdit] = useState<WeightUnit | null>(null);
  const weightUnit =
    weightUnitEdit ??
    storedUnits?.weightUnit ??
    (initial?.unit === "miles" ? "lb" : "kg");
  const [heightUnitEdit, setHeightUnitEdit] = useState<HeightUnit | null>(null);
  const heightUnit =
    heightUnitEdit ??
    storedUnits?.heightUnit ??
    (initial?.unit === "miles" ? "ftin" : "cm");
  // Unlike the four above, this has no imperial/metric tell to guess from —
  // dew point is a preference about how you think about humidity, not about
  // where you live — so it starts at RH for everyone.
  const [humidityUnitEdit, setHumidityUnitEdit] =
    useState<HumidityUnit | null>(null);
  const humidityUnit = humidityUnitEdit ?? storedUnits?.humidityUnit ?? "rh";

  // Write-through. An effect rather than a write inside each setter, because
  // several fields move together — picking a course also moves the race date —
  // and per-setter writes would each persist a snapshot built from the OTHER
  // fields' pre-update values, so the last one to run would undo the first.
  //
  // Gated on "the runner has actually touched this form", so simply mounting
  // never writes defaults over a snapshot that is about to be read back. No
  // write loop is possible: an identical write leaves the stored string
  // unchanged, and `getStateSnapshot` hands back the same cached reference for
  // an unchanged string, so nothing re-renders.
  const formTouched =
    goalTimeEdit !== null ||
    goalPaceEdit !== null ||
    goalModeEdit !== null ||
    courseIdEdit !== null ||
    unitEdit !== null ||
    raceDateEdit !== null ||
    raceStartTimeEdit !== null;
  useEffect(() => {
    if (!persist || !formTouched) return;
    storeForm({
      courseId,
      goalTime,
      goalPace,
      goalMode,
      unit,
      raceDate,
      raceStartTime,
    });
  }, [
    persist,
    formTouched,
    storeForm,
    courseId,
    goalTime,
    goalPace,
    goalMode,
    unit,
    raceDate,
    raceStartTime,
  ]);

  const unitsTouched =
    tempUnitEdit !== null ||
    speedUnitEdit !== null ||
    weightUnitEdit !== null ||
    heightUnitEdit !== null ||
    humidityUnitEdit !== null;
  useEffect(() => {
    if (!unitsTouched) return;
    storeUnits({ tempUnit, speedUnit, weightUnit, heightUnit, humidityUnit });
  }, [
    unitsTouched,
    storeUnits,
    tempUnit,
    speedUnit,
    weightUnit,
    heightUnit,
    humidityUnit,
  ]);

  const selected = catalog.find((c) => c.id === courseId) ?? catalog[0];

  // Owned locally so weather renders the same on the homepage and the
  // dashboard. `raceDate`/`raceStartTime` are passed as `undefined` rather
  // than "" so the hook's `hasTiming`-style guard (`if (!dateISO || !startTime)`)
  // behaves the same as it would from a PacingInput's optional fields.
  //
  // Note this uses the START LINE, not the city centre: the city coordinate
  // exists for the map, but a forecast should be keyed to where the runner
  // actually stands at the gun.
  const weather = useWeather(
    selected
      ? { ...selected.start, timezone: selected.timezone }
      : { lat: 0, lon: 0, timezone: "UTC" },
    raceDate || undefined,
    raceStartTime || undefined,
    initial?.weather,
    // A past date we only ESTIMATED (derived from the series' recurrence rule
    // rather than recorded) may be the wrong day by a week, so it is answered
    // with a climate average and described as typical — not passed off as the
    // conditions on a day we aren't sure of.
    weatherSourceFor(currentEdition, raceDate, today) === "typical",
    // Live mode only. The hero hides the whole weather section, so there is no
    // mode to remember there — and restoring "forecast" would fire a forecast
    // request on the home page for a race nobody has committed to yet.
    live,
  );

  useEffect(() => {
    onHourlyChange?.(weather.hourly);
  }, [onHourlyChange, weather.hourly]);

  // Switching course carries the YEAR across where the new race has one, and
  // otherwise moves to its next edition. Carrying the year is what makes the
  // picker feel like a year picker: someone comparing Boston 2026 against
  // Chicago 2026 shouldn't be bounced to 2027 by the switch.
  //
  // Done in the handler rather than an effect so there is no cascading render.
  // A custom date the runner picked themselves is never overwritten.
  function selectCourse(nextId: CourseId) {
    setCourseIdEdit(nextId);
    if (customDate) return;
    // A date that matches none of this course's editions is one the runner
    // chose themselves — from a shared link or the custom picker — and is
    // never overwritten by a course switch.
    if (raceDate !== "" && !currentEdition) return;

    const nextEditions = catalog.find((c) => c.id === nextId)?.editions ?? [];
    const keepYear = currentEdition
      ? editionForYear(nextEditions, currentEdition.year)
      : null;
    const target = keepYear ?? nextEdition(nextEditions, today);
    if (!target) return;

    setRaceDateEdit(target.raceDateISO);
    // Follow the new edition's published start time. Left alone, the previous
    // race's 9:00 would silently key this one's weather to the wrong hour.
    if (raceStartTimeEdit === null || raceStartTimeEdit === defaultStartTime(currentEdition)) {
      setRaceStartTimeEdit(defaultStartTime(target));
    }
  }

  // A pin on the home map routes through the same handler as the dropdown, so
  // a map pick prefills the race date identically. The effect fires only when
  // the requested id actually changes, so it can't fight a runner who then
  // picks something else from the dropdown, and the ref keeps `selectCourse`
  // (redeclared every render) out of the dependency list.
  const selectCourseRef = useRef(selectCourse);
  useEffect(() => {
    selectCourseRef.current = selectCourse;
  });
  useEffect(() => {
    if (requestedCourseId) selectCourseRef.current(requestedCourseId);
  }, [requestedCourseId]);

  const { hours, minutes, seconds } = goalTime;

  /**
   * Switch how the goal is stated, carrying the CURRENT goal across so the
   * number on screen never jumps: 4:00:00 at Boston becomes 5:41/km, which
   * becomes 5:43/km grade-adjusted. The runner is changing their units, not
   * their goal.
   */
  function selectGoalMode(next: GoalMode) {
    if (next === goalMode) return;
    if (!isValid) {
      // Mid-edit and unparseable — switch the view without inventing a
      // conversion from a half-typed number.
      setGoalModeEdit(next);
      storeGoalMode(next);
      return;
    }
    if (next === "time") {
      setGoalTimeEdit(secondsToGoalTime(goalTimeSeconds));
    } else if (next === "pace") {
      setGoalPaceEdit(secondsToPace(avgPaceFromGoalTime(goalTimeSeconds, unit)));
    } else if (courseEffort) {
      setGoalPaceEdit(
        secondsToPace(gapPaceFromGoalTime(goalTimeSeconds, courseEffort, unit)),
      );
    }
    setGoalModeEdit(next);
    storeGoalMode(next);
  }

  // Keep the PHYSICAL pace when the distance unit changes: 5:00/km is 8:03/mi,
  // not 5:00/mi. In time mode there is nothing to convert.
  function selectUnit(next: Unit) {
    if (next !== unit && goalMode !== "time" && isValid) {
      setGoalPaceEdit(
        secondsToPace(
          goalMode === "pace"
            ? avgPaceFromGoalTime(goalTimeSeconds, next)
            : courseEffort
              ? gapPaceFromGoalTime(goalTimeSeconds, courseEffort, next)
              : goalPaceSeconds,
        ),
      );
    }
    setUnitEdit(next);
  }

  const validationMessage = ((): string | null => {
    if (goalMode === "time") {
      if (!Number.isInteger(hours) || hours < 0 || hours > 9)
        return "Hours must be 0–9";
      if (!Number.isInteger(minutes) || minutes < 0 || minutes > 59)
        return "Minutes must be 0–59";
      if (!Number.isInteger(seconds) || seconds < 0 || seconds > 59)
        return "Seconds must be 0–59";
      if (toSeconds(goalTime) <= 0) return "Goal time must be greater than 0";
      return null;
    }
    if (!Number.isInteger(goalPace.minutes) || goalPace.minutes < 0 || goalPace.minutes > 59)
      return "Pace minutes must be 0–59";
    if (!Number.isInteger(goalPace.seconds) || goalPace.seconds < 0 || goalPace.seconds > 59)
      return "Pace seconds must be 0–59";
    if (goalPaceSeconds <= 0) return "Pace must be greater than 0";
    // The engine takes a finish time, and every downstream consumer assumes a
    // real one. A 0:01/km pace is arithmetically fine and physically absurd.
    if (goalTimeSeconds <= 0 || goalTimeSeconds > 10 * 3600)
      return "That pace is outside the range this calculator covers";
    return null;
  })();
  const isValid = validationMessage === null;

  const buildInput = (): PacingInput => {
    const input: PacingInput = {
      goalTimeSeconds,
      courseId,
      unit,
    };
    if (raceDate) input.raceDateISO = raceDate;
    if (raceStartTime) input.raceStartTime = raceStartTime;
    if (weather.enabled && weather.conditions) {
      input.weather = weather.conditions;
    }
    // Body metrics only feed the wind drag model, which only runs when
    // weather is on — so with weather off they'd be dead data in the URL.
    if (
      weather.enabled &&
      massKg !== null &&
      heightCm !== null &&
      massKg > 0 &&
      heightCm > 0
    ) {
      input.body = { massKg, heightCm };
    }
    // Presence is the on/off signal — see PacingInput.fueling.
    if (fuelingEnabled) input.fueling = { carbsPerHour };
    // Set only when off-default, so a default chart's URL is unchanged.
    if (split !== DEFAULT_SPLIT) input.split = split;
    if (startStrategy !== DEFAULT_START) input.start = startStrategy;
    return input;
  };

  // Live mode: propagate every valid change so the dashboard recomputes.
  // While invalid, hold (don't emit) — inputs stay editable locally.
  useEffect(() => {
    if (!live || !isValid) return;
    onChange?.(buildInput());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    live,
    isValid,
    // The derived seconds cover every mode's inputs at once — including a
    // course switch in GAP mode, where the pace holds and the finish moves.
    goalTimeSeconds,
    courseId,
    unit,
    raceDate,
    raceStartTime,
    massKg,
    heightCm,
    weather.enabled,
    weather.conditions,
    fuelingEnabled,
    carbsPerHour,
    split,
    startStrategy,
  ]);

  const update = (key: keyof GoalTimeInput) => (value: string) => {
    // Integers only — strip anything but digits.
    const digits = value.replace(/\D/g, "");
    const n = digits === "" ? NaN : Number(digits);
    setGoalTimeEdit({ ...goalTime, [key]: n });
  };

  const updatePace = (key: keyof PaceInput) => (value: string) => {
    const digits = value.replace(/\D/g, "");
    const n = digits === "" ? NaN : Number(digits);
    setGoalPaceEdit({ ...goalPace, [key]: n });
  };

  const goalFieldLabel =
    goalMode === "time"
      ? "Goal finish time"
      : goalMode === "pace"
        ? "Goal average pace"
        : "Goal grade-adjusted pace";

  // Both the finish time and the average pace, because in GAP mode they are
  // two different answers and the runner wants each: the finish is what they
  // will be told at the line, the average is what their watch will show.
  const goalSummary = `${formatHMS(goalTimeSeconds)} finish · ${formatPace(
    avgPaceFromGoalTime(goalTimeSeconds, unit),
    unit,
  )} average`;

  const handleSubmit = () => {
    if (!isValid) return;
    onCalculate?.(buildInput());
  };

  // No card in either mode: the dashboard supplies its own bordered panel,
  // and the hero deliberately has none so the form reads as part of the
  // photograph rather than a box dropped on top of it.
  return (
    <section className="space-y-8">
      {title && (
        <div className="space-y-2">
          <h2
            className={`font-display tracking-tight text-[var(--color-text-primary)] ${
              live ? "text-2xl" : "text-3xl sm:text-4xl"
            }`}
          >
            {title}
          </h2>
          {subtitle && (
            <p className="text-base text-[var(--color-text-secondary)]">
              {subtitle}
            </p>
          )}
        </div>
      )}
      {/* Three ways to say the same thing. The engine only ever receives a
          finish time, so the mode is a view over one value — which is why a
          shared link never has to carry it. */}
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <label className={eyebrowClass}>{goalFieldLabel}</label>
          <UnitToggle
            label="Goal input mode"
            value={goalMode}
            options={GOAL_MODE_OPTIONS}
            onChange={selectGoalMode}
            disabledValues={gapAvailable ? undefined : ["gap"]}
          />
        </div>
        {goalMode === "time" ? (
          <div className="grid grid-cols-3 gap-3">
            {(
              [
                ["hours", "HH", hours, 9],
                ["minutes", "MM", minutes, 59],
                ["seconds", "SS", seconds, 59],
              ] as const
            ).map(([key, ph, val, max]) => (
              <div key={key}>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={max}
                  placeholder={ph}
                  aria-label={key}
                  value={Number.isNaN(val) ? "" : val}
                  onChange={(e) => update(key)(e.target.value)}
                  className={numClass}
                />
                <span className={`mt-2 text-center ${eyebrowClass}`}>{key}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-[1fr_1fr_auto] items-start gap-3">
            {(
              [
                ["minutes", "MM", goalPace.minutes],
                ["seconds", "SS", goalPace.seconds],
              ] as const
            ).map(([key, ph, val]) => (
              <div key={key}>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={59}
                  placeholder={ph}
                  aria-label={`pace ${key}`}
                  value={Number.isNaN(val) ? "" : val}
                  onChange={(e) => updatePace(key)(e.target.value)}
                  className={numClass}
                />
                <span className={`mt-2 text-center ${eyebrowClass}`}>{key}</span>
              </div>
            ))}
            <span
              className={`py-3 text-xl font-tabular ${
                live
                  ? "text-[var(--color-text-tertiary)]"
                  : "text-[var(--color-text-secondary)]"
              }`}
            >
              {unit === "km" ? "/km" : "/mi"}
            </span>
          </div>
        )}
        {/* What the entered pace actually works out to. In GAP mode this is
            where the course's own difficulty first becomes visible — the same
            grade-adjusted pace is a different finish time at every race. */}
        {goalMode !== "time" && isValid && (
          <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
            {goalSummary}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="course" className={`mb-2 ${eyebrowClass}`}>
          Course
        </label>
        <CourseSearch
          id="course"
          catalog={catalog}
          value={courseId}
          onSelect={selectCourse}
        />
      </div>

      {/* Stacked full-width: the dashboard sidebar is too narrow to show a
          full date in a half-width field. */}
      <div className="space-y-6">
        <div>
          <label htmlFor="race-year" className={`mb-2 ${eyebrowClass}`}>
            Race year
          </label>
          {/* The year is the control; the date comes with it. Picking a day the
              race isn't run on was never useful, and a stale date was the whole
              bug this replaces. */}
          <RaceYearPicker
            id="race-year"
            editions={selectedEditions}
            value={raceDate}
            custom={customDate}
            todayISO={today}
            onSelectEdition={(e) => {
              setCustomDate(false);
              setRaceDateEdit(e.raceDateISO);
              // A published start time for the chosen year replaces whatever
              // the previous year assumed.
              if (
                raceStartTimeEdit === null ||
                raceStartTimeEdit === defaultStartTime(currentEdition)
              ) {
                setRaceStartTimeEdit(defaultStartTime(e));
              }
            }}
            onSelectCustom={() => setCustomDate(true)}
          />
          {customDate && (
            <div className="mt-3">
              {/* Homepage only: these sit low in the hero band, so opening
                  downward ran the panels off the bottom of the photo. The
                  dashboard sidebar has room below and keeps the default. */}
              <DatePicker
                id="race-date"
                value={raceDate}
                onChange={setRaceDateEdit}
                placeholder="Select a date"
                placement={live ? "bottom" : "top"}
              />
            </div>
          )}
        </div>
        <div>
          <label htmlFor="race-start" className={`mb-2 ${eyebrowClass}`}>
            Start time
          </label>
          <TimePicker
            id="race-start"
            value={raceStartTime}
            onChange={setRaceStartTimeEdit}
            placeholder="Select a time"
            placement={live ? "bottom" : "top"}
          />
        </div>
      </div>

      {/* Unit also sets the wind-speed unit (km ⇒ km/h, mi ⇒ mph). */}
      <div className="flex items-center justify-between gap-2">
        <label className={eyebrowClass}>Unit of measurement</label>
        <UnitToggle
          label="Distance unit"
          value={unit}
          options={[
            ["km", "km"],
            ["miles", "mi"],
          ]}
          onChange={(value) => selectUnit(value as Unit)}
          variant="prominent"
        />
      </div>

      {/* Weather/wind and fueling are dashboard-only: the homepage is just
          the core race setup + Calculate, per the product decision to keep
          the hero form minimal. Both sections read/write state that only
          matters once `live`, so hiding them here leaves the built input
          (weather off, fueling at its default rate) unaffected. */}
      {live && (
        <div className="border-t border-[var(--color-border)] pt-6">
          <h3 className={eyebrowClass}>Weather &amp; Wind</h3>
          <div className="mt-3 space-y-4">
            <WeatherFields
              weather={weather}
              distanceUnit={unit}
              tempUnit={tempUnit}
              onTempUnitChange={setTempUnitEdit}
              speedUnit={speedUnit}
              onSpeedUnitChange={setSpeedUnitEdit}
              humidityUnit={humidityUnit}
              onHumidityUnitChange={setHumidityUnitEdit}
              hasTiming={Boolean(raceDate && raceStartTime)}
              startTimeAssumed={startTimeIsAssumed(currentEdition, raceStartTime)}
            />
            {/* Body metrics feed the wind drag model, so they live in this
                section rather than a separate "Advanced" disclosure — and they
                dim with it, since they have no effect when weather is off.
                The note says why they're asked for: absent it, a pacing tool
                asking your weight reads as calorie tracking. */}
            <div
              className={`space-y-3 border-t border-[var(--color-border)] pt-4 ${
                weather.enabled ? "" : "opacity-50"
              }`}
            >
              <div className="grid grid-cols-2 gap-3">
                <NumericField
                  id="mass"
                  label="Weight"
                  labelAction={
                    <UnitToggle
                      label="Weight unit"
                      value={weightUnit}
                      options={[
                        ["kg", "kg"],
                        ["lb", "lb"],
                      ]}
                      onChange={setWeightUnitEdit}
                      disabled={!weather.enabled}
                    />
                  }
                  value={
                    massKg === null
                      ? null
                      : roundForDisplay(massToDisplay(massKg, weightUnit))
                  }
                  onCommit={(n) => setMassKg(massFromDisplay(n, weightUnit))}
                  disabled={!weather.enabled}
                  placeholder={String(
                    roundForDisplay(
                      massToDisplay(DEFAULT_BODY.massKg, weightUnit),
                    ),
                  )}
                  min={0}
                />
                <HeightField
                  value={heightCm}
                  onChange={setHeightCm}
                  unit={heightUnit}
                  onUnitChange={setHeightUnitEdit}
                  disabled={!weather.enabled}
                />
              </div>
              <p className="text-xs text-[var(--color-text-tertiary)]">
                Your weight and height determine how much the wind slows you
                down or speeds you up. The lower your body weight, the less the
                wind affects your pace.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Dashboard-only, like Weather and Fueling: the hero is core race setup
          plus Calculate, and both controls default to the behaviour the app
          has always had — so hiding them here changes nothing about what the
          homepage produces. */}
      {live && (
        <div className="border-t border-[var(--color-border)] pt-6">
          <h3 className={eyebrowClass}>Race Strategy</h3>
          <div className="mt-3 space-y-4">
            <div>
              <label htmlFor="split-strategy" className={`mb-2 ${eyebrowClass}`}>
                Split strategy
              </label>
              <div className="relative">
                <select
                  id="split-strategy"
                  value={split}
                  onChange={(e) => setSplit(e.target.value as SplitStrategy)}
                  className={selectClass}
                >
                  {SPLIT_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <span
                  aria-hidden
                  className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]"
                >
                  ▾
                </span>
              </div>
            </div>
            <div>
              <label htmlFor="start-strategy" className={`mb-2 ${eyebrowClass}`}>
                Start
              </label>
              <div className="relative">
                <select
                  id="start-strategy"
                  value={startStrategy}
                  onChange={(e) =>
                    setStartStrategy(e.target.value as StartStrategy)
                  }
                  className={selectClass}
                >
                  {START_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <span
                  aria-hidden
                  className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]"
                >
                  ▾
                </span>
              </div>
            </div>
            <p className="text-xs text-[var(--color-text-tertiary)]">
              Whatever you choose here, the splits still add up to your goal
              finish time — holding back early is paid back later in the race.
            </p>
          </div>
        </div>
      )}

      {live && (
        <div className="border-t border-[var(--color-border)] pt-6">
          <h3 className={eyebrowClass}>Fueling Strategy</h3>
          <div className="mt-3 space-y-4">
            <div className="inline-flex overflow-hidden rounded-lg border border-[var(--color-border)]">
              {([true, false] as const).map((on) => (
                <button
                  key={String(on)}
                  type="button"
                  aria-pressed={fuelingEnabled === on}
                  onClick={() => setFuelingEnabled(on)}
                  className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                    fuelingEnabled === on
                      ? "bg-[var(--color-red-primary)] text-white"
                      : "bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)]"
                  }`}
                >
                  {on ? "On" : "Off"}
                </button>
              ))}
            </div>
            <div className={fuelingEnabled ? "" : "opacity-50"}>
              <RangeField
                id="carbs-per-hour"
                label="Carbs per hour"
                value={carbsPerHour}
                min={CARBS_PER_HOUR_MIN}
                max={CARBS_PER_HOUR_MAX}
                step={CARBS_PER_HOUR_STEP}
                onChange={setCarbsPerHour}
                disabled={!fuelingEnabled}
                valueLabel={`${carbsPerHour} g/hr`}
                hint={`About one gel every ${Math.round(
                  gelIntervalSeconds(carbsPerHour) / 60,
                )} min`}
              />
            </div>
          </div>
        </div>
      )}

      {!live && (
        <div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isValid}
            className="w-full rounded-lg bg-[var(--color-red-primary)] py-4 text-base font-semibold text-white transition-colors hover:bg-[var(--color-red-deep)] disabled:bg-[var(--color-border)] disabled:text-[var(--color-text-tertiary)]"
          >
            Calculate
          </button>
          {!isValid && (
            <p className="mt-3 text-sm text-[var(--color-red-primary)]">
              {validationMessage}
            </p>
          )}
        </div>
      )}

      {live && !isValid && (
        <p className="text-sm text-[var(--color-red-primary)]">
          {validationMessage}
        </p>
      )}
    </section>
  );
}
