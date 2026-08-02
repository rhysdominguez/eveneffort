"use client";
import { useEffect, useState } from "react";
import type {
  CourseId,
  GoalTimeInput,
  PacingInput,
  Unit,
  WeatherConditions,
} from "@/types";
import { DEFAULT_BODY, DEFAULT_FUELING } from "@/types";
import { COURSE_LIST, getCourse } from "@/data/courses";
import { toSeconds } from "@/lib/units/time";
import { DatePicker } from "@/components/DatePicker";
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
  SpeedUnit,
  TempUnit,
  WeightUnit,
} from "@/lib/units/weather";
import {
  massFromDisplay,
  massToDisplay,
  roundForDisplay,
} from "@/lib/units/weather";

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
  initial?: PacingInput;
  title?: string;
  /** Supporting line under the title. Hero only — the dashboard omits it. */
  subtitle?: string;
}

const eyebrowBase = "block text-xs uppercase tracking-wider font-medium";

const numClass =
  "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] px-3 py-3 text-center text-xl font-tabular font-medium focus:border-[var(--color-border-focus)] focus:outline-none transition-colors";

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
  initial,
  title,
  subtitle,
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

  const [goalTime, setGoalTime] = useState<GoalTimeInput>(
    initial
      ? secondsToGoalTime(initial.goalTimeSeconds)
      : { hours: 4, minutes: 0, seconds: 0 },
  );
  const [courseId, setCourseId] = useState<CourseId>(
    initial?.courseId ?? "berlin",
  );
  const [unit, setUnit] = useState<Unit>(initial?.unit ?? "km");
  const [raceDate, setRaceDate] = useState<string>(initial?.raceDateISO ?? "");
  const [raceStartTime, setRaceStartTime] = useState<string>(
    initial?.raceStartTime ?? "",
  );
  // One disclosure for weather + body metrics — the body feeds the wind drag
  // model, so the two are one setting, not two. Expanded from the start when
  // a shared URL already carried either.
  const [showWeatherWind, setShowWeatherWind] = useState<boolean>(
    initial?.weather !== undefined || initial?.body !== undefined,
  );
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
  // is meaningful (the runner turned it off), so it's honoured. The disclosure
  // starts closed either way; the collapsed header shows the rate.
  const [showFueling, setShowFueling] = useState<boolean>(false);
  const [fuelingEnabled, setFuelingEnabled] = useState<boolean>(
    initial ? initial.fueling !== undefined : true,
  );
  const [carbsPerHour, setCarbsPerHour] = useState<number>(
    initial?.fueling?.carbsPerHour ?? DEFAULT_FUELING.carbsPerHour,
  );

  // Per-field display units. Seeded once from the distance unit so an imperial
  // user gets sensible defaults; independent from it thereafter.
  const [tempUnit, setTempUnit] = useState<TempUnit>(
    initial?.unit === "miles" ? "F" : "C",
  );
  const [speedUnit, setSpeedUnit] = useState<SpeedUnit>(
    initial?.unit === "miles" ? "mph" : "kph",
  );
  const [weightUnit, setWeightUnit] = useState<WeightUnit>(
    initial?.unit === "miles" ? "lb" : "kg",
  );
  const [heightUnit, setHeightUnit] = useState<HeightUnit>(
    initial?.unit === "miles" ? "ftin" : "cm",
  );

  // Owned locally so weather renders the same on the homepage and the
  // dashboard. `raceDate`/`raceStartTime` are passed as `undefined` rather
  // than "" so the hook's `hasTiming`-style guard (`if (!dateISO || !startTime)`)
  // behaves the same as it would from a PacingInput's optional fields.
  const weather = useWeather(
    {
      ...getCourse(courseId).start,
      timezone: getCourse(courseId).timezone,
    },
    raceDate || undefined,
    raceStartTime || undefined,
    initial?.weather,
  );

  useEffect(() => {
    onHourlyChange?.(weather.hourly);
  }, [onHourlyChange, weather.hourly]);

  const { hours, minutes, seconds } = goalTime;

  const validationMessage = ((): string | null => {
    if (!Number.isInteger(hours) || hours < 0 || hours > 9)
      return "Hours must be 0–9";
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 59)
      return "Minutes must be 0–59";
    if (!Number.isInteger(seconds) || seconds < 0 || seconds > 59)
      return "Seconds must be 0–59";
    if (toSeconds(goalTime) <= 0) return "Goal time must be greater than 0";
    return null;
  })();
  const isValid = validationMessage === null;

  const buildInput = (): PacingInput => {
    const input: PacingInput = {
      goalTimeSeconds: toSeconds(goalTime),
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
    hours,
    minutes,
    seconds,
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
  ]);

  const update = (key: keyof GoalTimeInput) => (value: string) => {
    // Integers only — strip anything but digits.
    const digits = value.replace(/\D/g, "");
    const n = digits === "" ? NaN : Number(digits);
    setGoalTime((g) => ({ ...g, [key]: n }));
  };

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
      <div>
        <label className={`mb-2 ${eyebrowClass}`}>Goal finish time</label>
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
      </div>

      <div>
        <label htmlFor="course" className={`mb-2 ${eyebrowClass}`}>
          Course
        </label>
        {/* appearance-none + our own chevron: the native arrow sits hard
            against the edge and can't be inset with CSS. This also matches
            the icon position in the date/time pickers. */}
        <div className="relative">
          <select
            id="course"
            value={courseId}
            onChange={(e) => setCourseId(e.target.value as CourseId)}
            className="w-full appearance-none rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] px-4 py-3 pr-11 text-base focus:border-[var(--color-border-focus)] focus:outline-none transition-colors"
          >
            {COURSE_LIST.map((c) => (
              <option key={c.id} value={c.id}>
                {c.displayName}
              </option>
            ))}
          </select>
          <svg
            viewBox="0 0 20 20"
            aria-hidden="true"
            className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
          >
            <path d="M5 7.5l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      {/* Stacked full-width: the dashboard sidebar is too narrow to show a
          full date in a half-width field. */}
      <div className="space-y-6">
        <div>
          <label htmlFor="race-date" className={`mb-2 ${eyebrowClass}`}>
            Race date
          </label>
          {/* Homepage only: these two sit low in the hero band, so opening
              downward ran the panels off the bottom of the photo. The
              dashboard sidebar has room below and keeps the default. */}
          <DatePicker
            id="race-date"
            value={raceDate}
            onChange={setRaceDate}
            placeholder="Select a date"
            placement={live ? "bottom" : "top"}
          />
        </div>
        <div>
          <label htmlFor="race-start" className={`mb-2 ${eyebrowClass}`}>
            Start time
          </label>
          <TimePicker
            id="race-start"
            value={raceStartTime}
            onChange={setRaceStartTime}
            placeholder="Select a time"
            placement={live ? "bottom" : "top"}
          />
        </div>
      </div>

      {/* Distance also sets the wind-speed unit (km ⇒ km/h, mi ⇒ mph). */}
      <div className="flex items-center justify-between gap-2">
        <label className={eyebrowClass}>Distance</label>
        <UnitToggle
          label="Distance unit"
          value={unit}
          options={[
            ["km", "km"],
            ["miles", "mi"],
          ]}
          onChange={(value) => setUnit(value as Unit)}
          variant="prominent"
        />
      </div>

      {/* Weather/wind and fueling are dashboard-only: the homepage is just
          the core race setup + Calculate, per the product decision to keep
          the hero form minimal. Both sections read/write state that only
          matters once `live`, so hiding them here leaves the built input
          (weather off, fueling at its default rate) unaffected. */}
      {live && (
        <div>
          <button
            type="button"
            onClick={() => setShowWeatherWind((s) => !s)}
            className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
            aria-expanded={showWeatherWind}
          >
            <svg
              viewBox="0 0 20 20"
              aria-hidden="true"
              className={`h-3.5 w-3.5 shrink-0 transition-transform duration-150 ${
                showWeatherWind ? "rotate-90" : ""
              }`}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M7.5 4.5 13 10l-5.5 5.5" />
            </svg>
            Weather &amp; Wind
            {weather.enabled && !showWeatherWind ? " (on)" : ""}
          </button>
          {showWeatherWind && (
            <div className="mt-3 space-y-4">
              <WeatherFields
                weather={weather}
                distanceUnit={unit}
                tempUnit={tempUnit}
                onTempUnitChange={setTempUnit}
                speedUnit={speedUnit}
                onSpeedUnitChange={setSpeedUnit}
                hasTiming={Boolean(raceDate && raceStartTime)}
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
                        onChange={setWeightUnit}
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
                    onUnitChange={setHeightUnit}
                    disabled={!weather.enabled}
                  />
                </div>
                <p className="text-xs text-[var(--color-text-tertiary)]">
                  Your weight and height determine how much the wind slows you
                  down or speeds you up. The lower your body weight, the less
                  the wind affects your pace.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {live && (
        <div>
          <button
            type="button"
            onClick={() => setShowFueling((s) => !s)}
            className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
            aria-expanded={showFueling}
          >
            <svg
              viewBox="0 0 20 20"
              aria-hidden="true"
              className={`h-3.5 w-3.5 shrink-0 transition-transform duration-150 ${
                showFueling ? "rotate-90" : ""
              }`}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M7.5 4.5 13 10l-5.5 5.5" />
            </svg>
            Fueling Strategy
          </button>
          {showFueling && (
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
          )}
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
