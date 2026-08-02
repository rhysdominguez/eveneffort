"use client";
import type { Unit } from "@/types";
import type { UseWeather } from "@/hooks/useWeather";
import { NumericField } from "@/components/NumericField";
import { UnitToggle } from "@/components/UnitToggle";
import type { SpeedUnit, TempUnit } from "@/lib/units/weather";
import {
  roundForDisplay,
  tempFromDisplay,
  tempToDisplay,
  windFromDisplay,
  windToDisplay,
} from "@/lib/units/weather";

// The weather & wind INPUTS, living in the Race setup sidebar alongside every
// other setting. (The weather-adjusted finish it produces is an output and
// lives in SummaryHeader.)
//
// Conditions are stored metric-canonically; conversion happens here at the
// prop boundary — display value in, canonical value out — because
// NumericField's buffer re-syncs off the incoming `value`.
interface Props {
  weather: UseWeather;
  /** Distance unit — no longer used for wind speed (which now has independent toggle). */
  distanceUnit: Unit;
  tempUnit: TempUnit;
  onTempUnitChange: (unit: TempUnit) => void;
  speedUnit: SpeedUnit;
  onSpeedUnitChange: (unit: SpeedUnit) => void;
  hasTiming: boolean;
}

export function WeatherFields({
  weather,
  distanceUnit,
  tempUnit,
  onTempUnitChange,
  speedUnit,
  onSpeedUnitChange,
  hasTiming,
}: Props) {
  const { mode, setMode, enabled, conditions, loading, error, updateManual, refreshForecast } =
    weather;

  // Fields are only editable in "manual" mode — "forecast" is read-only (it
  // reflects the live pull) and "off" is inert.
  const editable = mode === "manual";

  const toggleButton = (
    label: string,
    active: boolean,
    onClick: () => void,
  ) => (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`px-4 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-[var(--color-red-primary)] text-white"
          : "bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)]"
      }`}
    >
      {label}
    </button>
  );

  const helperText = ((): string | null => {
    if (mode === "off") return null;
    if (mode === "forecast") {
      if (loading) return "Loading forecast…";
      if (error) return `Forecast unavailable. (${error})`;
      if (!hasTiming)
        return "Add a race date and start time for a live forecast.";
      return "Showing the live forecast for your race start.";
    }
    return "Enter conditions below.";
  })();

  return (
    <div className="space-y-4">
      <div className="inline-flex overflow-hidden rounded-lg border border-[var(--color-border)]">
        {toggleButton("Forecast", mode === "forecast", () =>
          setMode("forecast"),
        )}
        {toggleButton("Manual", mode === "manual", () => setMode("manual"))}
        {toggleButton("Off", mode === "off", () => setMode("off"))}
      </div>

      {helperText && (
        <p className="text-sm text-[var(--color-text-secondary)]">
          {helperText}
        </p>
      )}

      <div className={`grid grid-cols-2 gap-3 ${enabled ? "" : "opacity-50"}`}>
        <NumericField
          id="w-temp"
          label="Temp"
          labelAction={
            <UnitToggle
              label="Temperature unit"
              value={tempUnit}
              options={[
                ["C", "°C"],
                ["F", "°F"],
              ]}
              onChange={onTempUnitChange}
              disabled={!enabled}
            />
          }
          value={
            conditions
              ? roundForDisplay(tempToDisplay(conditions.tempC, tempUnit))
              : null
          }
          onCommit={(n) =>
            updateManual({ tempC: tempFromDisplay(n, tempUnit) })
          }
          disabled={!editable}
        />
        <NumericField
          id="w-hum"
          label="Humidity (%)"
          value={conditions ? roundForDisplay(conditions.humidity) : null}
          onCommit={(n) => updateManual({ humidity: n })}
          disabled={!editable}
          min={0}
          max={100}
        />
        <NumericField
          id="w-wind"
          label="Wind"
          labelAction={
            <UnitToggle
              label="Wind speed unit"
              value={speedUnit}
              options={[
                ["kph", "km/h"],
                ["mph", "mph"],
              ]}
              onChange={onSpeedUnitChange}
              disabled={!enabled}
            />
          }
          value={
            conditions
              ? roundForDisplay(windToDisplay(conditions.windSpeed, speedUnit))
              : null
          }
          onCommit={(n) =>
            updateManual({ windSpeed: windFromDisplay(n, speedUnit) })
          }
          disabled={!editable}
          min={0}
        />
        <NumericField
          id="w-wdir"
          label="Wind dir (°)"
          value={conditions ? roundForDisplay(conditions.windDirection) : null}
          onCommit={(n) => updateManual({ windDirection: n })}
          disabled={!editable}
          min={0}
          max={360}
        />
      </div>

      {mode === "forecast" && hasTiming && (
        <button
          type="button"
          onClick={refreshForecast}
          className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
        >
          Refresh forecast
        </button>
      )}
    </div>
  );
}
