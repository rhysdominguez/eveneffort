"use client";
import { useEffect, useState } from "react";
import type { CourseId, GoalTimeInput, PacingInput, Unit } from "@/types";
import { DEFAULT_BODY } from "@/types";
import { COURSE_LIST } from "@/data/courses";
import { toSeconds } from "@/lib/units/time";

// Two modes:
// - Button mode (homepage): pass `onCalculate`. Owns its own state and
//   surfaces a Calculate button; behavior unchanged from before.
// - Live mode (dashboard): pass `onChange`. No button — every valid edit
//   propagates immediately so outputs recompute live. `initial` seeds the
//   starting state from the URL-parsed PacingInput.
interface Props {
  onCalculate?: (input: PacingInput) => void;
  onChange?: (input: PacingInput) => void;
  initial?: PacingInput;
  title?: string;
}

const eyebrowClass =
  "block text-xs uppercase tracking-wider text-[var(--color-text-tertiary)] font-medium";

const numClass =
  "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] px-3 py-3 text-center text-xl font-tabular font-medium focus:border-[var(--color-border-focus)] focus:outline-none transition-colors";

const fieldClass =
  "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] px-4 py-3 text-base font-tabular focus:border-[var(--color-border-focus)] focus:outline-none transition-colors";

function secondsToGoalTime(total: number): GoalTimeInput {
  const t = Math.max(0, Math.floor(total));
  return {
    hours: Math.floor(t / 3600),
    minutes: Math.floor((t % 3600) / 60),
    seconds: t % 60,
  };
}

export function InputForm({ onCalculate, onChange, initial, title }: Props) {
  const live = onChange !== undefined;

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
  const [showAdvanced, setShowAdvanced] = useState<boolean>(
    initial?.body !== undefined,
  );
  const [massKg, setMassKg] = useState<string>(
    initial?.body ? String(initial.body.massKg) : "",
  );
  const [heightCm, setHeightCm] = useState<string>(
    initial?.body ? String(initial.body.heightCm) : "",
  );

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
    const mass = Number(massKg);
    const height = Number(heightCm);
    if (
      showAdvanced &&
      massKg !== "" &&
      heightCm !== "" &&
      Number.isFinite(mass) &&
      Number.isFinite(height) &&
      mass > 0 &&
      height > 0
    ) {
      input.body = { massKg: mass, heightCm: height };
    }
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
    showAdvanced,
    massKg,
    heightCm,
  ]);

  const update = (key: keyof GoalTimeInput) => (value: string) => {
    const n = value === "" ? NaN : Number(value);
    setGoalTime((g) => ({ ...g, [key]: n }));
  };

  const handleSubmit = () => {
    if (!isValid) return;
    onCalculate?.(buildInput());
  };

  const chromeClass = live
    ? "space-y-8"
    : "rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-8 space-y-8";

  return (
    <section className={chromeClass}>
      {title && (
        <h2 className="font-display text-2xl tracking-tight text-[var(--color-text-primary)]">
          {title}
        </h2>
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
        <select
          id="course"
          value={courseId}
          onChange={(e) => setCourseId(e.target.value as CourseId)}
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] px-4 py-3 text-base focus:border-[var(--color-border-focus)] focus:outline-none transition-colors"
        >
          {COURSE_LIST.map((c) => (
            <option key={c.id} value={c.id}>
              {c.displayName}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="race-date" className={`mb-2 ${eyebrowClass}`}>
            Race date
          </label>
          <input
            id="race-date"
            type="date"
            value={raceDate}
            onChange={(e) => setRaceDate(e.target.value)}
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="race-start" className={`mb-2 ${eyebrowClass}`}>
            Start time
          </label>
          <input
            id="race-start"
            type="time"
            value={raceStartTime}
            onChange={(e) => setRaceStartTime(e.target.value)}
            className={fieldClass}
          />
        </div>
      </div>

      <div>
        <label className={`mb-2 ${eyebrowClass}`}>Units</label>
        <div className="inline-flex overflow-hidden rounded-lg border border-[var(--color-border)]">
          {(["km", "miles"] as Unit[]).map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => setUnit(u)}
              className={`px-6 py-2.5 text-sm font-medium capitalize transition-colors ${
                unit === u
                  ? "bg-[var(--color-red-primary)] text-white"
                  : "bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)]"
              }`}
            >
              {u}
            </button>
          ))}
        </div>
      </div>

      <div>
        <button
          type="button"
          onClick={() => setShowAdvanced((s) => !s)}
          className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
          aria-expanded={showAdvanced}
        >
          {showAdvanced ? "− " : "+ "}Advanced (body metrics)
        </button>
        {showAdvanced && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="mass" className={`mb-2 ${eyebrowClass}`}>
                Weight (kg)
              </label>
              <input
                id="mass"
                type="number"
                inputMode="numeric"
                min={1}
                placeholder={String(DEFAULT_BODY.massKg)}
                value={massKg}
                onChange={(e) => setMassKg(e.target.value)}
                className={numClass}
              />
            </div>
            <div>
              <label htmlFor="height" className={`mb-2 ${eyebrowClass}`}>
                Height (cm)
              </label>
              <input
                id="height"
                type="number"
                inputMode="numeric"
                min={1}
                placeholder={String(DEFAULT_BODY.heightCm)}
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                className={numClass}
              />
            </div>
          </div>
        )}
      </div>

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
