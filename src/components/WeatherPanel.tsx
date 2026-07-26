"use client";
import type { WeatherConditions } from "@/types";
import type { UseWeather } from "@/hooks/useWeather";
import { formatHMS } from "@/lib/units/time";

interface Props {
  weather: UseWeather;
  goalSeconds: number;
  adjustedFinishSeconds: number;
  weatherApplied: boolean;
  hasTiming: boolean;
}

const eyebrowClass =
  "block text-xs uppercase tracking-wider text-[var(--color-text-tertiary)] font-medium";

const fieldClass =
  "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] px-3 py-2.5 text-base font-tabular focus:border-[var(--color-border-focus)] focus:outline-none transition-colors";

function Field({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number | null;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className={`mb-2 ${eyebrowClass}`}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        value={value ?? ""}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (e.target.value !== "" && Number.isFinite(n)) onChange(n);
        }}
        className={fieldClass}
      />
    </div>
  );
}

export function WeatherPanel({
  weather,
  goalSeconds,
  adjustedFinishSeconds,
  weatherApplied,
  hasTiming,
}: Props) {
  const { conditions, source, loading, error, updateManual, refreshForecast } =
    weather;

  const set =
    (key: keyof WeatherConditions) =>
    (n: number) =>
      updateManual({ [key]: n });

  const deltaSeconds = adjustedFinishSeconds - goalSeconds;
  const showDelta = weatherApplied && deltaSeconds > 0.5;

  return (
    <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-xl tracking-tight text-[var(--color-text-primary)]">
          Weather &amp; wind
        </h3>
        <span className={eyebrowClass}>
          {loading
            ? "Loading forecast…"
            : source === "forecast" && conditions
              ? "Live forecast"
              : "Manual entry"}
        </span>
      </div>

      {!conditions && !hasTiming && (
        <p className="text-sm text-[var(--color-text-secondary)]">
          Add a race date and start time for a live forecast, or enter
          conditions manually below.
        </p>
      )}

      {error && (
        <p className="text-sm text-[var(--color-text-secondary)]">
          Forecast unavailable — enter conditions manually. ({error})
        </p>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Field
          id="w-temp"
          label="Temp (°C)"
          value={conditions?.tempC ?? null}
          onChange={set("tempC")}
        />
        <Field
          id="w-hum"
          label="Humidity (%)"
          value={conditions?.humidity ?? null}
          onChange={set("humidity")}
        />
        <Field
          id="w-wind"
          label="Wind (m/s)"
          value={conditions?.windSpeed ?? null}
          onChange={set("windSpeed")}
        />
        <Field
          id="w-wdir"
          label="Wind dir (°)"
          value={conditions?.windDirection ?? null}
          onChange={set("windDirection")}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] pt-4">
        <div>
          <span className={eyebrowClass}>Weather-adjusted finish</span>
          <span className="mt-1 block text-2xl font-tabular font-medium text-[var(--color-text-primary)]">
            {formatHMS(adjustedFinishSeconds)}
          </span>
          {showDelta ? (
            <span className="mt-1 block text-sm font-tabular text-[var(--color-red-primary)]">
              +{formatHMS(deltaSeconds)} vs goal {formatHMS(goalSeconds)}
            </span>
          ) : (
            <span className="mt-1 block text-sm text-[var(--color-text-tertiary)]">
              Ideal conditions — no slowdown applied
            </span>
          )}
        </div>
        {hasTiming && (
          <button
            type="button"
            onClick={refreshForecast}
            className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
          >
            Refresh forecast
          </button>
        )}
      </div>
    </section>
  );
}
