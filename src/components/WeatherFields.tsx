"use client";
import type { Unit } from "@/types";
import type { UseWeather } from "@/hooks/useWeather";
import { NumericField } from "@/components/NumericField";
import { formatDateDisplay } from "@/lib/units/date";
import { UnitToggle } from "@/components/UnitToggle";
import type { HumidityUnit, SpeedUnit, TempUnit } from "@/lib/units/weather";
import {
  humidityFieldLabel,
  roundForDisplay,
  tempFromDisplay,
  tempToDisplay,
  windFromDisplay,
  windToDisplay,
} from "@/lib/units/weather";
import { dewPointC, humidityAtTemp } from "@/lib/weather/progression";

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
  humidityUnit: HumidityUnit;
  onHumidityUnitChange: (unit: HumidityUnit) => void;
  hasTiming: boolean;
}

export function WeatherFields({
  weather,
  distanceUnit,
  tempUnit,
  onTempUnitChange,
  speedUnit,
  onSpeedUnitChange,
  humidityUnit,
  onHumidityUnitChange,
  hasTiming,
}: Props) {
  const {
    mode,
    setMode,
    enabled,
    conditions,
    loading,
    error,
    source,
    meta,
    updateManual,
    refreshForecast,
  } = weather;

  // Fields are only editable in "manual" mode — "forecast" is read-only (it
  // reflects the live pull) and "off" is inert.
  const editable = mode === "manual";

  const dewMode = humidityUnit === "dew";

  // Dew point (°C) implied by the conditions currently on screen. This is the
  // moisture the runner sees when the field is in dew mode.
  const dewC = conditions ? dewPointC(conditions.tempC, conditions.humidity) : null;

  /**
   * Commit a new air temperature.
   *
   * In dew-point mode the DEW POINT is what the runner is looking at, so it is
   * what has to hold: raising the temperature leaves the moisture in the air
   * alone and drops the relative humidity out from under it. RH is still the
   * value stored (nothing downstream changes), it is just no longer the thing
   * being held constant — which is the same conservation `synthesizeHourly`
   * already assumes across a warming race morning.
   *
   * In RH mode the previous behaviour is unchanged: RH holds, dew point moves.
   */
  const commitTemp = (tempC: number) => {
    if (dewMode && dewC !== null) {
      updateManual({ tempC, humidity: humidityAtTemp(tempC, dewC) });
    } else {
      updateManual({ tempC });
    }
  };

  // The auto tab always reads "Forecast" — renaming it per source was a
  // trap for the runner's eye, flipping label text they'd already read past.
  // When the answer isn't actually a live forecast (typical average, or a
  // failed fetch), the tab grays out instead so the mismatch shows without
  // changing the word.
  const autoDegraded = mode === "forecast" && (source === "typical" || (!!error && !loading));

  const toggleButton = (
    label: string,
    active: boolean,
    onClick: () => void,
    muted = false,
  ) => (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`px-4 py-1.5 text-sm font-medium transition-colors ${
        active
          ? muted
            ? "bg-[var(--color-bg-elevated)] text-[var(--color-text-tertiary)]"
            : "bg-[var(--color-red-fill)] text-white"
          : "bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)]"
      }`}
    >
      {label}
    </button>
  );

  const helperText = ((): string | null => {
    if (mode === "off") return null;
    if (mode === "forecast") {
      if (loading) return "Loading conditions…";
      if (error) return `Forecast unavailable: ${error}.`;
      if (!hasTiming) return "Add a race date and start time for live conditions.";
      if (source === "historical") {
        const when = meta?.raceDateISO
          ? ` on ${formatDateDisplay(meta.raceDateISO)}`
          : "";
        return `These are the conditions recorded at the start line${when}. Switch to Manual to try other conditions.`;
      }
      if (source === "typical") {
        const when = meta?.raceDateISO
          ? ` for ${formatDateDisplay(meta.raceDateISO)}`
          : "";
        return `Forecast unavailable, so these are typical conditions${when}.`;
      }
      // Only a resolved live forecast earns this sentence. `source` is null
      // before the first fetch resolves and after any reset, and falling
      // through to the claim there put "Showing the live forecast" over
      // fallback or stale numbers that no forecast had ever supplied.
      if (source !== "forecast") return "Loading conditions…";
      return "Showing the live forecast for your race start.";
    }
    return "Enter conditions below.";
  })();

  return (
    <div className="space-y-4">
      <div className="inline-flex overflow-hidden rounded-lg border border-[var(--color-border)]">
        {toggleButton("Forecast", mode === "forecast", () => setMode("forecast"), autoDegraded)}
        {toggleButton("Manual", mode === "manual", () => setMode("manual"))}
        {toggleButton("Off", mode === "off", () => setMode("off"))}
      </div>

      {helperText && (
        <p className="text-xs text-[var(--color-text-secondary)]">{helperText}</p>
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
              disabled={!editable}
            />
          }
          value={
            conditions
              ? roundForDisplay(tempToDisplay(conditions.tempC, tempUnit))
              : null
          }
          onCommit={(n) => commitTemp(tempFromDisplay(n, tempUnit))}
          disabled={!editable}
        />
        {/* One stored value, two ways of reading it. Dew point is what running
            science and coaches quote, and it is the more honest of the two:
            60% RH means something quite different at 5 °C than at 25 °C.
            Nothing downstream sees the difference — RH remains what is stored,
            what the URL carries and what the heat model reads. */}
        <NumericField
          id="w-hum"
          label={humidityFieldLabel(humidityUnit, tempUnit)}
          labelAction={
            <UnitToggle
              label="Humidity unit"
              value={humidityUnit}
              options={[
                ["rh", "%"],
                ["dew", "dew"],
              ]}
              onChange={onHumidityUnitChange}
              disabled={!editable}
            />
          }
          value={
            conditions
              ? roundForDisplay(
                  dewMode
                    ? tempToDisplay(dewC!, tempUnit)
                    : conditions.humidity,
                )
              : null
          }
          onCommit={(n) =>
            updateManual({
              humidity: dewMode
                ? humidityAtTemp(
                    conditions?.tempC ?? 0,
                    tempFromDisplay(n, tempUnit),
                  )
                : n,
            })
          }
          disabled={!editable}
          {...(dewMode
            ? {
                // A dew point below freezing is ordinary — NumericField strips
                // the minus key outright whenever `min` is 0 or higher, so the
                // RH bounds would make a cold race morning untypeable. The cap
                // is the air temperature itself: dew point above it is not a
                // condition that exists.
                max: conditions
                  ? roundForDisplay(tempToDisplay(conditions.tempC, tempUnit))
                  : undefined,
              }
            : { min: 0, max: 100 })}
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
              disabled={!editable}
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

      {/* Nothing to refresh once the weather is a matter of record. */}
      {mode === "forecast" && hasTiming && source !== "historical" && (
        <button
          type="button"
          onClick={refreshForecast}
          className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
        >
          {source === "typical" ? "Refresh conditions" : "Refresh forecast"}
        </button>
      )}
    </div>
  );
}
